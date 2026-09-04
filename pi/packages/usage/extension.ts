import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { codexHeaders, consumeReset, fetchResets, fetchUsage, type UsageReport } from "./providers.ts";

/** Registers on-demand account usage and explicitly confirmed Codex banked resets. */
export default function usageExtension(pi: ExtensionAPI) {
	let pending: AbortController | undefined;
	let requestModel: string | undefined;
	const rateHeaders = new Map<string, { lines: string[]; at: number }>();

	pi.on("before_provider_headers", (_event, ctx) => { requestModel = modelKey(ctx); });
	pi.on("after_provider_response", (event) => {
		if (!requestModel) return;
		const lines: string[] = [];
		for (const resource of ["requests", "tokens"]) {
			const remaining = numericHeader(event.headers[`x-ratelimit-remaining-${resource}`]);
			const limit = numericHeader(event.headers[`x-ratelimit-limit-${resource}`]);
			const reset = event.headers[`x-ratelimit-reset-${resource}`];
			if (remaining === undefined) continue;
			const percent = limit !== undefined && limit > 0 ? ` (${(100 * remaining / limit).toFixed(1)}%)` : "";
			lines.push(`${resource}: ${remaining}${limit === undefined ? "" : ` / ${limit}`} remaining${percent}${reset ? ` · reset: ${clean(reset)}` : ""}`);
		}
		if (lines.length) rateHeaders.set(requestModel, { lines, at: Date.now() });
	});
	pi.on("model_select", () => { rateHeaders.clear(); });
	pi.on("session_shutdown", () => {
		pending?.abort();
		rateHeaders.clear();
	});
	pi.registerEntryRenderer<UsageEntry>("provider-usage", (entry, _options, theme) => {
		const data = entry.data;
		if (!data) return new Text("Usage unavailable", 0, 0);
		return new Text([
			theme.fg("accent", theme.bold(clean(data.title))),
			...data.lines.map(clean),
			theme.fg("dim", `Checked ${new Date(data.at).toLocaleString()}`),
		].join("\n"), 0, 0);
	});

	const publish = (report: UsageReport, ctx: ExtensionCommandContext) => {
		const lines = formatReport(report);
		const observed = rateHeaders.get(modelKey(ctx) ?? "");
		if (observed) {
			lines.push("", `Last response rate limits (${new Date(observed.at).toLocaleString()}; not live account quota):`, ...observed.lines);
		}
		const entry = { title: report.title, lines, at: Date.now() };
		pi.appendEntry("provider-usage", entry);
		if (ctx.hasUI && ctx.mode !== "tui") ctx.ui.notify([entry.title, ...lines].map(clean).join("\n"), "info");
	};

	pi.registerCommand("usage", {
		description: "Show active provider quotas and resets; /usage reset redeems a banked Codex reset after confirmation",
		getArgumentCompletions: (prefix) => [{ value: "reset", label: "reset", description: "Review and redeem a banked Codex reset" }].filter((item) => item.value.startsWith(prefix)),
		handler: async (args, ctx) => {
			const action = args.trim();
			if (action && action !== "reset") {
				if (ctx.hasUI) ctx.ui.notify("Usage: /usage [reset]", "warning");
				return;
			}
			if (!ctx.model) {
				if (ctx.hasUI) ctx.ui.notify("No model selected.", "warning");
				return;
			}
			if (pending) {
				if (ctx.hasUI) ctx.ui.notify("A usage request is already running.", "info");
				return;
			}
			const controller = new AbortController();
			pending = controller;
			try {
				if (action === "reset") {
					await redeemReset(ctx, controller.signal, (report) => publish(report, ctx));
				} else {
					if (ctx.hasUI) ctx.ui.notify(`Checking ${ctx.model.provider} usage…`, "info");
					const report = await fetchUsage(ctx, controller.signal);
					if (!controller.signal.aborted) publish(report, ctx);
				}
			} catch (error) {
				if (!controller.signal.aborted) {
					publish({ title: "Provider usage unavailable", rows: [], notes: [error instanceof Error ? clean(error.message) : "Usage request failed."] }, ctx);
				}
			} finally {
				pending = undefined;
			}
		},
	});
}

async function redeemReset(ctx: ExtensionCommandContext, signal: AbortSignal, publish: (report: UsageReport) => void) {
	if (!ctx.hasUI) throw new Error("Reset redemption requires an interactive confirmation.");
	if (ctx.model?.provider !== "openai-codex") {
		throw new Error("Only OpenAI Codex supports banked resets here. Switching sessions or refreshing tokens does not reset provider quotas.");
	}
	if (!ctx.isIdle()) throw new Error("Wait for the current agent turn to finish before redeeming a reset.");
	const headers = await codexHeaders(ctx);
	const { report, available, credits } = await fetchResets(headers, signal);
	if (signal.aborted) return;
	publish(report);
	if (available === undefined || available <= 0 || !credits.length) {
		ctx.ui.notify("No confirmed, unexpired banked resets available for redemption.", "info");
		return;
	}
	const labels = credits.map((credit, index) => `${index + 1}. ${clean(credit.title)} · expires ${new Date(credit.expiresAt).toLocaleString()}`);
	const selected = await ctx.ui.select(`${available} banked reset(s) available — choose one`, ["Cancel", ...labels], { signal });
	const index = labels.indexOf(selected ?? "");
	if (index < 0 || signal.aborted) return;
	const credit = credits[index];
	const confirmed = await ctx.ui.select(
		`Spend this reset permanently?\n${labels[index]}\n${formatReport(report).map(clean).join("\n")}\nThis consumes one banked reset on Codex account ${clean(headers.get("ChatGPT-Account-ID") ?? "unavailable")}.`,
		["Cancel", "Redeem this reset"],
		{ signal },
	);
	if (confirmed !== "Redeem this reset" || signal.aborted) return;
	if (credit.expiresAt <= Date.now()) throw new Error("That reset expired. Run /usage reset again.");
	// Keep the same account and one request ID across this mutation. No automatic retries.
	try {
		const message = await consumeReset(headers, credit.id, randomUUID(), signal);
		if (!signal.aborted) ctx.ui.notify(message, "info");
	} catch {
		throw new Error("Reset outcome could not be confirmed. It may have been redeemed; check /usage and the Codex dashboard before trying again. No retry was sent.");
	}
	if (!signal.aborted) {
		// Refresh using the pinned auth, not a possibly changed active account/model.
		const refreshed = await fetchResets(headers, signal);
		if (!signal.aborted) publish(refreshed.report);
	}
}

function formatReport(report: UsageReport) {
	const lines = report.rows.map((row) => {
		const value = row.remaining;
		let allowance = row.detail === "Unlimited" ? "Unlimited" : "remaining not reported";
		if (value !== undefined) {
			const percent = Math.max(0, Math.min(100, value));
			const filled = Math.round(percent / 10);
			allowance = `[${"█".repeat(filled)}${"░".repeat(10 - filled)}] ${percent.toFixed(1)}% remaining`;
		}
		const detail = row.detail && row.detail !== "Unlimited" ? ` · ${row.detail}` : "";
		return `${row.label}: ${allowance}${detail}\n  Reset: ${formatReset(row.resetAt)}`;
	});
	if (!lines.length) lines.push("No account quota percentages reported.");
	return [...lines, ...report.notes];
}

function formatReset(at: number | undefined) {
	if (at === undefined) return "not reported";
	const minutes = Math.ceil((at - Date.now()) / 60_000);
	if (minutes <= 0) return `${new Date(at).toLocaleString()} (passed; run /usage to refresh)`;
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	return `${new Date(at).toLocaleString()} (in ${days ? `${days}d ` : ""}${hours}h ${minutes % 60}m)`;
}

function modelKey(ctx: Pick<ExtensionCommandContext, "model">) {
	return ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
}
function numericHeader(value: string | undefined) {
	if (!value?.trim()) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
function clean(value: string) {
	// Strip terminal control characters from external labels and errors, retaining report newlines.
	return value.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, "").slice(0, 4000);
}

type UsageEntry = { title: string; lines: string[]; at: number };
