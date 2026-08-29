import { BorderedLoader, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { matchesKey, Text, wrapTextWithAnsi } from "@earendil-works/pi-tui";

const DEFAULT_OUTPUT_TOKENS = 512;
const MAX_OUTPUT_TOKENS = 2_048;
const BENCHMARK_SYSTEM_PROMPT =
	"Follow the user's output instructions exactly. Do not call tools or explain your response.";

/** Runs a reproducible streaming benchmark against the active Pi model. */
export default function benchmarkModelExtension(pi: ExtensionAPI): void {
	pi.registerEntryRenderer("benchmark-model", (entry, { expanded }, theme) => {
		const result = entry.data as BenchmarkResult;
		return new Text(formatBenchmarkResult(result, theme, expanded).join("\n"), 0, 0);
	});

	pi.registerCommand("benchmark-model", {
		description: "Benchmark the active model's response latency and generation speed with reasoning disabled",
		handler: async (args, ctx) => {
			if (!ctx.model) {
				ctx.ui.notify("No model selected", "error");
				return;
			}

			const outputTokens = parseOutputTokens(args, ctx.model.maxTokens);
			if (outputTokens === undefined) {
				ctx.ui.notify(
					`Usage: /benchmark-model [1-${Math.min(MAX_OUTPUT_TOKENS, ctx.model.maxTokens)} output tokens]`,
					"error",
				);
				return;
			}

			if (!ctx.modelRegistry.hasConfiguredAuth(ctx.model)) {
				ctx.ui.notify(`No authentication configured for ${ctx.model.provider}/${ctx.model.id}`, "error");
				return;
			}

			let result: BenchmarkResult | undefined;
			try {
				result = ctx.mode === "tui" ? await runWithLoader(ctx, outputTokens) : await runBenchmark(ctx, outputTokens);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Benchmark failed";
				ctx.ui.notify(`Benchmark failed: ${message}`, "error");
				return;
			}

			if (!result) {
				ctx.ui.notify("Benchmark cancelled", "info");
				return;
			}

			pi.appendEntry("benchmark-model", result);
			if (ctx.mode === "tui") {
				await showBenchmarkResult(result, ctx);
				return;
			}

			ctx.ui.notify(compactSummary(result), "info");
		},
	});
}

/** Displays a cancellable loader while the request is in flight. */
async function runWithLoader(ctx: ExtensionCommandContext, outputTokens: number): Promise<BenchmarkResult | undefined> {
	return ctx.ui.custom<BenchmarkResult | undefined>((tui, theme, _keybindings, done) => {
		const loader = new BorderedLoader(
			tui,
			theme,
			`Benchmarking ${ctx.model!.provider}/${ctx.model!.id} (${outputTokens} output-token budget)...`,
		);
		loader.onAbort = () => done(undefined);

		runBenchmark(ctx, outputTokens, loader.signal)
			.then(done)
			.catch((error) => {
				console.error("Model benchmark failed", error);
				done(undefined);
			});

		return loader;
	});
}

/** Runs one fresh, cache-disabled request and records streaming milestones. */
async function runBenchmark(
	ctx: ExtensionCommandContext,
	outputTokens: number,
	signal?: AbortSignal,
): Promise<BenchmarkResult> {
	const model = ctx.model;
	if (!model) throw new Error("No model selected");

	const provider = ctx.modelRegistry.getProvider(model.provider);
	if (!provider) throw new Error(`Provider ${model.provider} is unavailable`);

	const setupStartedAt = performance.now();
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	const setupMs = performance.now() - setupStartedAt;
	if (auth.ok === false) throw new Error(auth.error);

	// A long sequence reliably fills the budget; repeated words can prematurely stop MTP decoders.
	const message: UserMessage = {
		role: "user",
		content: [
			{
				type: "text",
				text: "Write the integers from 1 through 1000000 in order, separated by single spaces. Output only those integers.",
			},
		],
		timestamp: Date.now(),
	};

	let responseAt: number | undefined;
	let firstEventAt: number | undefined;
	let firstThinkingAt: number | undefined;
	let firstTextAt: number | undefined;
	let lastTextAt: number | undefined;
	let textCharacters = 0;
	let textChunks = 0;
	let response: AssistantMessage | undefined;
	const requestStartedAt = performance.now();
	let requestModel: typeof model = auth.baseUrl ? { ...model, baseUrl: auth.baseUrl } : model;
	// Ollama expects max_tokens, and reasoning-capable Qwen models require an explicit off value.
	if (model.provider === "ollama" && model.api === "openai-completions") {
		requestModel = {
			...requestModel,
			thinkingLevelMap: { ...requestModel.thinkingLevelMap, off: "none" },
			compat: {
				...requestModel.compat,
				maxTokensField: "max_tokens",
				supportsDeveloperRole: false,
			},
		};
	}
	const stream = provider.streamSimple(
		requestModel,
		{ systemPrompt: BENCHMARK_SYSTEM_PROMPT, messages: [message] },
		{
			apiKey: auth.apiKey,
			env: auth.env,
			headers: auth.headers,
			maxTokens: outputTokens,
			cacheRetention: "none",
			signal,
			onResponse: () => {
				responseAt ??= performance.now();
			},
		},
	);

	for await (const event of stream) {
		const now = performance.now();
		firstEventAt ??= now;
		switch (event.type) {
			case "thinking_delta":
				firstThinkingAt ??= now;
				break;
			case "text_delta":
				firstTextAt ??= now;
				lastTextAt = now;
				textChunks++;
				textCharacters += event.delta.length;
				break;
			case "done":
				response = event.message;
				break;
			case "error":
				throw new Error(event.error.errorMessage ?? "Provider returned an error response");
			default:
				break;
		}
	}

	response ??= await stream.result();
	const completedAt = performance.now();
	if (response.stopReason === "aborted") throw new Error("Benchmark cancelled");
	if (response.stopReason === "error") throw new Error(response.errorMessage ?? "Provider returned an error response");

	return {
		model: `${model.provider}/${model.id}`,
		thinkingLevel: "off (benchmark)",
		requestedOutputTokens: outputTokens,
		setupMs,
		responseMs: elapsed(responseAt, requestStartedAt),
		firstEventMs: elapsed(firstEventAt, requestStartedAt),
		firstThinkingMs: elapsed(firstThinkingAt, requestStartedAt),
		firstTextMs: elapsed(firstTextAt, requestStartedAt),
		generationMs: elapsed(lastTextAt, firstTextAt),
		completedMs: completedAt - requestStartedAt,
		textCharacters,
		textChunks,
		stopReason: response.stopReason,
		usage: response.usage,
	};
}

/** Shows the complete report until Enter, Space, or Escape is pressed. */
async function showBenchmarkResult(result: BenchmarkResult, ctx: ExtensionCommandContext): Promise<void> {
	await ctx.ui.custom<void>((tui, theme, _keybindings, done) => ({
		render: (width) => formatBenchmarkResult(result, theme, true).flatMap((line) => wrapTextWithAnsi(line, width)),
		invalidate: () => {},
		handleInput: (data) => {
			if (matchesKey(data, "enter") || matchesKey(data, "escape") || data === " ") done();
			tui.requestRender();
		},
	}));
}

/** Formats a compact notification for non-TUI modes. */
function compactSummary(result: BenchmarkResult): string {
	return `${result.model}: TTFT ${formatDuration(result.firstTextMs)}, ${formatRate(result.usage.output, result.generationMs)} output, ${formatDuration(result.completedMs)} total`;
}

/** Formats a persisted benchmark entry or full-screen report. */
function formatBenchmarkResult(
	result: BenchmarkResult,
	theme: ExtensionCommandContext["ui"]["theme"],
	expanded: boolean,
): string[] {
	const outputRate = formatRate(result.usage.output, result.generationMs);
	const totalRate = formatRate(result.usage.output, result.completedMs);
	const title = theme.fg("accent", theme.bold(`Model benchmark · ${result.model}`));
	const summary = `${formatDuration(result.firstTextMs)} TTFT · ${outputRate} output · ${formatDuration(result.completedMs)} total`;
	if (!expanded) return [title, theme.fg("muted", summary)];

	const cacheTokens = result.usage.cacheRead + result.usage.cacheWrite;
	const lines = [
		title,
		theme.fg(
			"muted",
			`Requested budget: ${result.requestedOutputTokens.toLocaleString()} output tokens · thinking: ${result.thinkingLevel}`,
		),
		"",
		theme.bold("Latency"),
		`  Auth and request setup  ${formatDuration(result.setupMs)}`,
		`  HTTP response headers   ${formatDuration(result.responseMs)}`,
		`  First stream event      ${formatDuration(result.firstEventMs)}`,
		`  First reasoning token   ${formatDuration(result.firstThinkingMs)}`,
		`  First text token (TTFT) ${formatDuration(result.firstTextMs)}`,
		`  Text generation span    ${formatDuration(result.generationMs)}`,
		`  Response complete       ${formatDuration(result.completedMs)}`,
		"",
		theme.bold("Throughput"),
		`  Output rate after TTFT  ${outputRate}`,
		`  Output rate overall     ${totalRate}`,
		`  Text stream             ${result.textChunks.toLocaleString()} chunks · ${result.textCharacters.toLocaleString()} characters`,
		"",
		theme.bold("Usage"),
		`  Input ${result.usage.input.toLocaleString()} · output ${result.usage.output.toLocaleString()} · reasoning ${formatOptionalNumber(result.usage.reasoning)}`,
		`  Cache read ${result.usage.cacheRead.toLocaleString()} · cache write ${result.usage.cacheWrite.toLocaleString()} · cache total ${cacheTokens.toLocaleString()}`,
		`  Cost ${formatCost(result.usage.cost.total)} · stop reason ${result.stopReason}`,
		theme.fg(
			"dim",
			"Reasoning is disabled for this controlled decode benchmark. Provider-managed model loading is not observable.",
		),
		theme.fg("dim", "Enter, Space, or Escape closes this report."),
	];
	return lines;
}

/** Parses the optional output-token budget. */
function parseOutputTokens(args: string, modelMaxTokens: number): number | undefined {
	const value = args.trim();
	if (!value) return Math.min(DEFAULT_OUTPUT_TOKENS, modelMaxTokens);
	if (!/^\d+$/.test(value)) return undefined;

	const tokens = Number(value);
	const maximum = Math.min(MAX_OUTPUT_TOKENS, modelMaxTokens);
	return Number.isSafeInteger(tokens) && tokens >= 1 && tokens <= maximum ? tokens : undefined;
}

/** Returns a duration relative to a start time, or undefined when the event never arrived. */
function elapsed(at: number | undefined, startedAt: number | undefined): number | undefined {
	return at === undefined || startedAt === undefined ? undefined : at - startedAt;
}

/** Formats a duration without claiming a missing event took zero time. */
function formatDuration(milliseconds: number | undefined): string {
	if (milliseconds === undefined) return "not observed";
	if (milliseconds < 1_000) return `${milliseconds.toFixed(0)} ms`;
	return `${(milliseconds / 1_000).toFixed(2)} s`;
}

/** Formats a token rate when a generation interval was observed. */
function formatRate(tokens: number, milliseconds: number | undefined): string {
	if (milliseconds === undefined || milliseconds <= 0) return "not observed";
	return `${(tokens / (milliseconds / 1_000)).toFixed(1)} tok/s`;
}

/** Formats provider-reported cost, including free and unavailable cost catalogs. */
function formatCost(cost: number): string {
	return cost === 0 ? "$0.00" : `$${cost.toFixed(6)}`;
}

/** Formats a usage field that some providers do not report. */
function formatOptionalNumber(value: number | undefined): string {
	return value === undefined ? "not reported" : value.toLocaleString();
}

type BenchmarkResult = {
	model: string;
	thinkingLevel: string;
	requestedOutputTokens: number;
	setupMs: number;
	responseMs: number | undefined;
	firstEventMs: number | undefined;
	firstThinkingMs: number | undefined;
	firstTextMs: number | undefined;
	generationMs: number | undefined;
	completedMs: number;
	textCharacters: number;
	textChunks: number;
	stopReason: AssistantMessage["stopReason"];
	usage: AssistantMessage["usage"];
};
