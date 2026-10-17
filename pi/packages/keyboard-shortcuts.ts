import { keyHint, keyText, rawKeyHint, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** Built-in keybinding ids shown below the status lines. */
const BINDING_SHORTCUTS = [
	["app.model.select", "models"],
	["app.thinking.cycle", "effort"],
] as const;

/** Extension shortcuts registered in `personas.ts` and `modes.ts`. */
const RAW_SHORTCUTS = [
	["ctrl+n", "persona"],
	["ctrl+q", "mode"],
] as const;

/** Status keys placed on the split status lines (`modes.ts`, `personas.ts`). */
const SPLIT_STATUS_KEYS = new Set(["mode", "persona"]);

/** Formats a token count for the compact footer. */
function formatTokens(count: number): string {
	if (count < 1_000) return count.toString();
	if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
	if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
	return `${(count / 1_000_000).toFixed(1)}M`;
}

/** Colors a thinking level with the matching theme token. */
function formatThinkingLevel(theme: Theme, level: string): string {
	switch (level) {
		case "minimal":
			return theme.fg("thinkingMinimal", level);
		case "low":
			return theme.fg("thinkingLow", level);
		case "medium":
			return theme.fg("thinkingMedium", level);
		case "high":
			return theme.fg("thinkingHigh", level);
		case "xhigh":
			return theme.fg("thinkingXhigh", level);
		case "max":
			return theme.fg("thinkingMax", level);
		default:
			return theme.fg("thinkingOff", level);
	}
}

/** Colors context usage by how full the window is. */
function formatContextUsage(theme: Theme, percent: number | null | undefined, windowSize: number): string {
	const tokens = formatTokens(windowSize);
	const display = percent === null || percent === undefined ? `?/${tokens}` : `${percent.toFixed(1)}%/${tokens}`;
	if (percent === null || percent === undefined) return theme.fg("dim", display);
	if (percent > 90) return theme.fg("error", display);
	if (percent > 70) return theme.fg("warning", display);
	return theme.fg("text", display);
}

/** Left-aligns `left` and right-aligns `right` on one footer row. */
function splitLine(left: string, right: string, width: number, theme: Theme): string {
	if (!right) return truncateToWidth(left, width, theme.fg("dim", "..."));
	if (!left) {
		const padding = " ".repeat(Math.max(0, width - visibleWidth(right)));
		return truncateToWidth(`${padding}${right}`, width, "");
	}

	const availableLeft = Math.max(0, width - visibleWidth(right) - 2);
	const visibleLeft = truncateToWidth(left, availableLeft, theme.fg("dim", "..."));
	if (!visibleLeft) {
		const padding = " ".repeat(Math.max(0, width - visibleWidth(right)));
		return truncateToWidth(`${padding}${right}`, width, "");
	}

	const padding = " ".repeat(Math.max(1, width - visibleWidth(visibleLeft) - visibleWidth(right)));
	return truncateToWidth(`${visibleLeft}${padding}${right}`, width, "");
}

/** Packs shortcut hints onto one line when they fit; otherwise two per line. */
function wrapHintPairs(items: string[], separator: string, width: number): string[] {
	if (width <= 0 || items.length === 0) return [];

	const joined = items.join(separator);
	if (visibleWidth(joined) <= width) return [joined];

	const lines: string[] = [];
	for (let i = 0; i < items.length; i += 2) {
		const pair = items.slice(i, i + 2);
		const combined = pair.join(separator);
		if (pair.length === 1 || visibleWidth(combined) <= width) {
			lines.push(truncateToWidth(combined, width, ""));
			continue;
		}

		for (const item of pair) {
			lines.push(truncateToWidth(item, width, ""));
		}
	}
	return lines;
}

/** Adds split status lines and a wrapping shortcut guide to pi's footer. */
export default function keyboardShortcutsExtension(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((_tui, theme, footerData) => {
			return {
				invalidate() {},
				render(width: number): string[] {
					const model = ctx.model?.id ?? "no-model";
					const topLeft = ctx.model?.reasoning
						? `${theme.fg("accent", model)}:${formatThinkingLevel(theme, ctx.thinkingLevel ?? "off")}`
						: theme.fg("accent", model);

					const context = ctx.getContextUsage();
					const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const bottomLeft = formatContextUsage(theme, context?.percent, contextWindow);

					const statuses = footerData.getExtensionStatuses();
					const extraStatusLines = [...statuses]
						.filter(([key]) => !SPLIT_STATUS_KEYS.has(key))
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
						splitLine(topLeft, statuses.get("mode") ?? "", width, theme),
						splitLine(bottomLeft, statuses.get("persona") ?? "", width, theme),
						...extraStatusLines,
						separator,
						...wrapHintPairs(hints, hintSeparator, width),
					];
				},
			};
		});
	});
}
