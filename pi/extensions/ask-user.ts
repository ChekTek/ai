import { DynamicBorder, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, isKeyRelease, matchesKey, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

/** Sentinel value for the UI-appended custom-answer row. */
const OTHER_VALUE = "__other__";

/** Label shown for the custom-answer row. Models must not author this. */
const OTHER_LABEL = "Type something.";

/** Description shown under the custom-answer row. */
const OTHER_DESCRIPTION = "Write a custom answer";

/** Canonical reserved names after punctuation is stripped. The UI appends the custom row. */
const RESERVED_LABELS = new Set(["other", "type something"]);

/** Labels the model is instructed to use when checking a custom-answer paraphrase. */
const CONFIRM_NORMALIZED = new Set(["confirm", "confirm recommended"]);
const REVISE_NORMALIZED = new Set(["revise"]);

/** Digit keys that jump the highlight to a numbered option. At most 4 options plus Type something. */
const OPTION_DIGITS = ["1", "2", "3", "4", "5"] as const;

const OptionSchema = Type.Object({
	label: Type.String({ description: "Short option label (1-5 words)" }),
	description: Type.String({ description: "What this choice means or its trade-off" }),
});

const AskUserParams = Type.Object({
	question: Type.String({ description: "The question to ask the user" }),
	context: Type.Optional(
		Type.String({
			description: "Short preamble shown above the question when the trade-off is not obvious",
		}),
	),
	options: Type.Array(OptionSchema, {
		minItems: 2,
		maxItems: 4,
		description: "2-4 mutually exclusive options. Do not include Other; the UI adds Type something except on Confirm/Revise understanding checks.",
	}),
});

/** Lowercases a label and strips punctuation so "Other." matches the reserved name. */
function normalizeLabel(label: string): string {
	return label
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Returns whether a model-authored option label collides with the custom row. */
function isReservedLabel(label: string): boolean {
	return RESERVED_LABELS.has(normalizeLabel(label));
}

/** Returns whether a selected label is the understanding-check Confirm or Revise option. */
function confirmationChoice(label: string): "confirm" | "revise" | undefined {
	const normalized = normalizeLabel(label);
	if (CONFIRM_NORMALIZED.has(normalized)) return "confirm";
	if (REVISE_NORMALIZED.has(normalized)) return "revise";
	return undefined;
}

/** True when the model is checking a paraphrase with Confirm and Revise only. */
function isUnderstandingCheck(options: AskUserOption[]): boolean {
	if (options.length !== 2) return false;
	const kinds = new Set(options.map((option) => confirmationChoice(option.label)));
	return kinds.has("confirm") && kinds.has("revise");
}

/** Returns a repeated option label, comparing trimmed text so the returned answer is unambiguous. */
function findDuplicateLabel(options: AskUserOption[]): string | undefined {
	const seen = new Set<string>();
	for (const option of options) {
		const label = option.label.trim();
		if (seen.has(label)) return option.label;
		seen.add(label);
	}
	return undefined;
}

/** Prefixes a 1-based index onto a visible option label. */
function numberedLabel(index: number, label: string): string {
	return `${index + 1}. ${label}`;
}

/** Returns the option index for a digit key, or undefined if the key is not a valid choice. */
function optionIndexFromKey(data: string, count: number): number | undefined {
	if (isKeyRelease(data)) return undefined;
	for (let index = 0; index < count; index++) {
		const digit = OPTION_DIGITS[index];
		if (digit && matchesKey(data, digit)) return index;
	}
	return undefined;
}

/** Builds the tool result returned to the model and stored on the session. */
function askUserResult(
	question: string,
	context: string | undefined,
	answer: string | null,
	wasCustom: boolean,
	cancelled: boolean,
	text: string,
): { content: [{ type: "text"; text: string }]; details: AskUserDetails } {
	const details: AskUserDetails = { question, answer, wasCustom, cancelled };
	if (context) details.context = context;
	return { content: [{ type: "text", text }], details };
}

/** Shows the TUI option list. `undefined` means custom UI is unavailable. */
function selectInTui(
	question: string,
	context: string | undefined,
	items: SelectItem[],
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
): Promise<string | null | undefined> {
	return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
		let settled = false;
		function finish(value: string | null) {
			if (settled) return;
			settled = true;
			signal?.removeEventListener("abort", onAbort);
			done(value);
		}
		function onAbort() {
			finish(null);
		}

		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		if (context) {
			container.addChild(new Text(theme.fg("muted", context), 1, 0));
		}
		container.addChild(new Text(theme.fg("accent", theme.bold(question)), 1, 0));

		const selectList = new SelectList(items, items.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		selectList.onSelect = (item) => finish(item.value);
		selectList.onCancel = () => finish(null);
		container.addChild(selectList);
		container.addChild(
			new Text(theme.fg("dim", `↑↓ or 1-${items.length} highlight • enter select • esc cancel`), 1, 0),
		);
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		signal?.addEventListener("abort", onAbort, { once: true });

		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				const index = optionIndexFromKey(data, items.length);
				if (index !== undefined) {
					selectList.setSelectedIndex(index);
					tui.requestRender();
					return;
				}
				selectList.handleInput(data);
				tui.requestRender();
			},
			dispose: () => signal?.removeEventListener("abort", onAbort),
		};
	});
}

/** RPC/ACP fallback using host dialogs. Descriptions are inlined into the labels. */
async function selectInDialogs(
	question: string,
	context: string | undefined,
	options: AskUserOption[],
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
	allowCustom: boolean,
): Promise<string | null> {
	const dialogOpts = signal ? { signal } : undefined;
	const title = context ? `${context} — ${question}` : question;
	const displays = options.map((option, index) => `${numberedLabel(index, option.label)} — ${option.description}`);
	if (allowCustom) {
		displays.push(`${numberedLabel(options.length, OTHER_LABEL)} — ${OTHER_DESCRIPTION}`);
	}

	const selected = await ctx.ui.select(title, displays, dialogOpts);
	if (!selected) return null;

	const index = displays.indexOf(selected);
	if (allowCustom && index === options.length) return OTHER_VALUE;
	const option = options[index];
	if (!option) return null;
	return option.label;
}

/** Collects a preset choice or a custom typed answer. */
async function collectAnswer(
	question: string,
	context: string | undefined,
	options: AskUserOption[],
	ctx: ExtensionContext,
	signal: AbortSignal | undefined,
	allowCustom: boolean,
): Promise<{ answer: string; wasCustom: boolean } | null> {
	const items: SelectItem[] = options.map((option, index) => ({
		value: option.label,
		label: numberedLabel(index, option.label),
		description: option.description,
	}));
	if (allowCustom) {
		items.push({
			value: OTHER_VALUE,
			label: numberedLabel(options.length, OTHER_LABEL),
			description: OTHER_DESCRIPTION,
		});
	}

	let selected: string | null | undefined;
	if (ctx.mode === "tui") {
		selected = await selectInTui(question, context, items, ctx, signal);
	}
	if (selected === undefined) {
		selected = await selectInDialogs(question, context, options, ctx, signal, allowCustom);
	}
	if (selected === null) return null;

	if (selected !== OTHER_VALUE) return { answer: selected, wasCustom: false };

	const typed = await ctx.ui.input("Your answer:", undefined, signal ? { signal } : undefined);
	const trimmed = typed?.trim();
	if (!trimmed) return null;
	return { answer: trimmed, wasCustom: true };
}

/** Builds the model-facing result text for a completed choice. */
function choiceResultText(choice: { answer: string; wasCustom: boolean }): string {
	if (choice.wasCustom) {
		return [
			`User wrote custom feedback: ${JSON.stringify(choice.answer)}`,
			"This was custom feedback. Immediately call ask_user again with your paraphrase of that feedback as the question and exactly two options: Confirm (Recommended) — proceed with this understanding; Revise — ask the original decision again with updated options.",
			"Do not wait for a chat reply. If they select Revise or write more custom text, keep calling ask_user until they select Confirm or a preset option.",
		].join("\n");
	}

	const confirmation = confirmationChoice(choice.answer);
	if (confirmation === "confirm") {
		return `User selected: ${choice.answer}\nThe user confirmed your understanding. Proceed with that interpretation. Do not call ask_user again for this decision.`;
	}
	if (confirmation === "revise") {
		return `User selected: ${choice.answer}\nThe user wants to revise. Call ask_user again for the original decision with updated options that incorporate the custom feedback.`;
	}

	return `User selected: ${choice.answer}`;
}

/** Registers the `ask_user` tool for one structured question with a custom-answer row. */
export default function askUserExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user one structured question with 2-4 options. Use when you cannot proceed without a user decision. The UI always adds a Type something. row for custom answers — do not include Other or Type something in options. If you recommend an option, put it first and append (Recommended) to the label. After a custom answer, follow up with Confirm (Recommended) and Revise instead of asking in chat.",
		promptSnippet: "Ask the user one structured question with 2-4 options when a decision cannot be inferred",
		promptGuidelines: [
			"Use ask_user for genuine forks that cannot be resolved from the repo or a sensible default. Do not use ask_user for trivial formatting.",
			"Call ask_user with one question at a time and 2-4 mutually exclusive options, each with a label and a tradeoff description. Put a recommendation first and suffix (Recommended).",
			"Include context on ask_user when the tradeoff is not obvious from the question. Do not author an Other option; the UI adds Type something except on Confirm/Revise understanding checks.",
			"After a custom ask_user answer, immediately call ask_user again with your paraphrase as the question and exactly two options: Confirm (Recommended) and Revise. Do not wait for a chat reply.",
			"If the user selects Confirm on that check, proceed with that understanding. If they select Revise or write more custom text, call ask_user again on the original decision with updated options. Repeat until they select Confirm or a preset option. Do not re-ask a decision already confirmed or answered with a preset option in this session.",
		],
		parameters: AskUserParams,
		executionMode: "sequential",

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const { question } = params;
			const context = params.context?.trim() || undefined;
			const reserved = params.options.find((option) => isReservedLabel(option.label));
			if (reserved) {
				return askUserResult(
					question,
					context,
					null,
					false,
					false,
					`Error: option label "${reserved.label}" is reserved. Do not author Other or Type something; the UI adds that row.`,
				);
			}

			const duplicate = findDuplicateLabel(params.options);
			if (duplicate) {
				return askUserResult(
					question,
					context,
					null,
					false,
					false,
					`Error: duplicate option label "${duplicate}". Each option must have a unique label.`,
				);
			}

			if (signal?.aborted) {
				return askUserResult(question, context, null, false, true, "User cancelled the question");
			}

			if (!ctx.hasUI) {
				return askUserResult(
					question,
					context,
					null,
					false,
					false,
					"Error: UI is not available (non-interactive mode). The user never saw the question — do NOT treat this as a decline. Ask in chat instead.",
				);
			}

			const choice = await collectAnswer(
				question,
				context,
				params.options,
				ctx,
				signal,
				!isUnderstandingCheck(params.options),
			);
			if (!choice) {
				return askUserResult(question, context, null, false, true, "User cancelled the question");
			}

			return askUserResult(question, context, choice.answer, choice.wasCustom, false, choiceResultText(choice));
		},

		renderCall(args, theme) {
			const question = typeof args.question === "string" ? args.question : "";
			return new Text(theme.fg("toolTitle", theme.bold("ask_user ")) + theme.fg("muted", question), 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details;
			if (!details || details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}
			if (details.answer === null) {
				const message = result.content?.[0]?.text?.split("\n")[0] || "Error";
				return new Text(theme.fg("error", `✗ ${message}`), 0, 0);
			}
			if (details.wasCustom) {
				return new Text(
					theme.fg("success", "✓ ") + theme.fg("muted", "(wrote) ") + theme.fg("accent", details.answer),
					0,
					0,
				);
			}
			return new Text(theme.fg("success", "✓ ") + theme.fg("accent", details.answer), 0, 0);
		},
	});
}

/** One model-authored choice shown in the picker. */
interface AskUserOption {
	label: string;
	description: string;
}

/** Structured ask_user result stored on the session for rendering. */
interface AskUserDetails {
	question: string;
	context?: string;
	answer: string | null;
	wasCustom: boolean;
	cancelled: boolean;
}
