import { sep } from "node:path";

import type { Usage } from "@earendil-works/pi-ai";
import { keyHint, keyText, rawKeyHint, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Built-in keybinding ids shown below pi's usage, model, and effort footer line. */
const BINDING_SHORTCUTS = [
	["app.model.select", "models"],
	["app.model.cycleForward", "cycle"],
	["app.thinking.cycle", "effort"],
] as const;

/** Extension shortcuts registered in `personas.ts` and `modes.ts`. */
const RAW_SHORTCUTS = [
	["ctrl+n", "persona"],
	["ctrl+q", "mode"],
] as const;

/** Status keys shown on the cwd line above the model (`modes.ts`, `personas.ts`). */
const CWD_STATUS_KEYS = ["mode", "persona"] as const;
const CWD_STATUS_KEY_SET = new Set<string>(CWD_STATUS_KEYS);
/** Extension statuses that should not occupy their own footer line. */
const HIDDEN_STATUS_KEYS = new Set(["cursor"]);

/** Formats a token count for the compact footer. */
function formatTokens(count: number): string {
	if (count < 1_000) return count.toString();
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

/** Replaces the current user's home directory with a tilde. */
function formatWorkingDirectory(cwd: string): string {
	const home = process.env.HOME ?? process.env.USERPROFILE;
	if (!home) return cwd;
	if (cwd === home) return "~";
	return cwd.startsWith(`${home}${sep}`) ? `~${cwd.slice(home.length)}` : cwd;
}

/** Adds one usage record to the cumulative footer totals. */
function addUsage(totals: UsageTotals, usage: Usage): void {
	totals.input += usage.input;
	totals.output += usage.output;
	totals.cacheRead += usage.cacheRead;
	totals.cacheWrite += usage.cacheWrite;
	totals.cost += usage.cost.total;
}

/** Packs complete shortcut hints onto as many lines as the terminal requires. */
function wrapHints(hints: string[], separator: string, width: number): string[] {
	if (width <= 0) return [];

	const lines: string[] = [];
	let line = "";

	for (const hint of hints) {
		const candidate = line ? `${line}${separator}${hint}` : hint;
		if (visibleWidth(candidate) <= width) {
			line = candidate;
			continue;
		}

		if (line) lines.push(line);
		line = truncateToWidth(hint, width, "");
	}

	if (line) lines.push(line);
	return lines;
}

/** Adds a wrapping, keybinding-aware shortcut section to pi's footer. */
export default function keyboardShortcutsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							addUsage(totals, entry.message.usage);
						} else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
							addUsage(totals, entry.message.usage);
						} else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
							addUsage(totals, entry.usage);
						}
					}

					let workingDirectory = formatWorkingDirectory(ctx.cwd);
					const branch = footerData.getGitBranch();
					if (branch) workingDirectory += ` (${branch})`;
					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) workingDirectory += ` • ${sessionName}`;

					const stats = [];
					if (totals.input) stats.push(`↑${formatTokens(totals.input)}`);
					if (totals.output) stats.push(`↓${formatTokens(totals.output)}`);
					if (totals.cacheRead) stats.push(`R${formatTokens(totals.cacheRead)}`);
					if (totals.cacheWrite) stats.push(`W${formatTokens(totals.cacheWrite)}`);
					if (totals.cost) stats.push(`$${totals.cost.toFixed(3)}`);

					const context = ctx.getContextUsage();
					const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextUsage = context?.percent === null || context?.percent === undefined
						? `?/${formatTokens(contextWindow)}`
						: `${context.percent.toFixed(1)}%/${formatTokens(contextWindow)}`;
					stats.push(`${contextUsage} (auto)`);

					const modelName = ctx.model?.id ?? "no-model";
					const modelWithEffort = ctx.model?.reasoning ? `${modelName} • ${ctx.thinkingLevel}` : modelName;
					const model = footerData.getAvailableProviderCount() > 1 && ctx.model
						? `(${ctx.model.provider}) ${modelWithEffort}`
						: modelWithEffort;
					const statsText = stats.join(" ");
					const availableModelWidth = Math.max(0, width - visibleWidth(statsText) - 2);
					const visibleModel = truncateToWidth(model, availableModelWidth, "");
					const padding = " ".repeat(Math.max(1, width - visibleWidth(statsText) - visibleWidth(visibleModel)));
					const usageLine = truncateToWidth(`${statsText}${padding}${visibleModel}`, width, "");

					const statuses = footerData.getExtensionStatuses();
					const cwdStatus = CWD_STATUS_KEYS.map((key) => statuses.get(key))
						.filter((status): status is string => Boolean(status))
						.join("  ");
					const cwdText = theme.fg("dim", workingDirectory);
					let cwdLine = truncateToWidth(cwdText, width, theme.fg("dim", "..."));
					if (cwdStatus) {
						const availableCwdWidth = Math.max(0, width - visibleWidth(cwdStatus) - 2);
						const visibleCwd = truncateToWidth(cwdText, availableCwdWidth, theme.fg("dim", "..."));
						const cwdPadding = " ".repeat(
							Math.max(1, width - visibleWidth(visibleCwd) - visibleWidth(cwdStatus)),
						);
						cwdLine = truncateToWidth(`${visibleCwd}${cwdPadding}${cwdStatus}`, width, "");
					}

					const statusLines = [...statuses]
						.filter(([key]) => !CWD_STATUS_KEY_SET.has(key) && !HIDDEN_STATUS_KEYS.has(key))
						.map(([, status]) => truncateToWidth(status, width, theme.fg("dim", "...")));
					const separator = theme.fg("borderMuted", "─".repeat(Math.max(0, width)));
					const hintSeparator = theme.fg("dim", " · ");
					const hints = [
						...BINDING_SHORTCUTS.flatMap(([keybinding, description]) =>
							keyText(keybinding) ? [keyHint(keybinding, description)] : [],
						),
						...RAW_SHORTCUTS.map(([key, description]) => rawKeyHint(key, description)),
					];

					return [
						cwdLine,
						theme.fg("dim", usageLine),
						...statusLines,
						separator,
						...wrapHints(hints, hintSeparator, width),
					];
				},
			};
		});
	});
}

/** Cumulative usage values displayed by the footer. */
type UsageTotals = Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite"> & { cost: number };
