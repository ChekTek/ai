import {
	DynamicBorder,
	isToolCallEventType,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, Key, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

/** Session-only agent modes and the footer/prompt copy each uses. */
const MODES = {
	build: {
		description: "Usual coding agent: read, bash, edit, and write",
	},
	plan: {
		description: "Read-only exploration; write a markdown plan, do not implement",
		helpUsers: "You help users by reading files and researching, then writing a markdown plan. Do not implement.",
		prompt:
			"You are in plan mode. Explore with read-only tools, then write a markdown plan in your reply. Do not implement or edit files. If a decision would change the plan, ask with ask_user.",
	},
	chat: {
		description: "Read-only conversation; no edits or commands",
		helpUsers: "You help users by reading files and answering in conversation. You cannot edit files or run commands.",
		prompt:
			"You are in chat mode. Answer in conversation. You may read files. Do not edit files or run commands.",
	},
} as const;

/** Mode names accepted by `/mode`. */
const MODE_NAMES = Object.keys(MODES) as AgentMode[];

/** Returns the next mode in cycle order. */
function nextMode(current: AgentMode): AgentMode {
	const index = MODE_NAMES.indexOf(current);
	return MODE_NAMES[(index + 1) % MODE_NAMES.length] ?? current;
}

/** Built-in mutators removed in plan and chat. */
const MUTATING_TOOLS = new Set(["edit", "write"]);

/** Tools kept in chat mode; everything else from the build snapshot is dropped. */
const CHAT_TOOLS = new Set(["read", "grep", "find", "ls", "web_fetch", "web_search", "ask_user"]);

/** Matches Pi's default "You help users by …" identity sentence. */
const HELP_USERS_SENTENCE = /You help users by [^.]+?\./;

/**
 * Bash forms that mutate the workspace. Plan mode blocks these and otherwise
 * allows the command through.
 */
const DESTRUCTIVE_BASH = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
];

/** Returns whether a command argument is a known mode. */
function isAgentMode(value: string): value is AgentMode {
	return Object.hasOwn(MODES, value);
}

/** Returns whether a bash command looks like a workspace mutation. */
function isDestructiveCommand(command: string): boolean {
	return DESTRUCTIVE_BASH.some((pattern) => pattern.test(command));
}

/**
 * Applies plan/chat prompt tweaks. Custom `--system-prompt` / `SYSTEM.md` text
 * still gets the short appended block; the help-users rewrite only runs when
 * that default sentence is present.
 */
function applyModePrompt(systemPrompt: string, mode: AgentMode): string {
	if (mode === "build") return systemPrompt;

	const { helpUsers, prompt: block } = MODES[mode];
	let prompt = systemPrompt;
	if (HELP_USERS_SENTENCE.test(prompt)) {
		prompt = prompt.replace(HELP_USERS_SENTENCE, helpUsers);
	}

	if (block && !prompt.includes(block)) {
		prompt += `\n\n${block}`;
	}
	return prompt;
}

/** Footer color for the active mode. */
function modeStatusColor(mode: AgentMode): "accent" | "warning" | "muted" {
	switch (mode) {
		case "plan":
			return "warning";
		case "chat":
			return "muted";
		default:
			return "accent";
	}
}

/** Updates the footer status for the active mode. */
function setModeStatus(ctx: ExtensionContext, mode: AgentMode): void {
	ctx.ui.setStatus("mode", ctx.ui.theme.fg(modeStatusColor(mode), `mode:${mode}`));
}

/** Returns whether the session already has model-visible chat messages. */
function sessionHasChat(ctx: ExtensionContext): boolean {
	return ctx.sessionManager.getEntries().some((entry) => entry.type === "message");
}

/** Returns whether a compaction error is expected for a small or just-compacted session. */
function isSkippableCompactionError(error: Error): boolean {
	return error.message === "Nothing to compact (session too small)" || error.message === "Already compacted";
}

/**
 * Asks whether to compact after a mid-session mode change. Tools and the
 * system prompt already bust the prompt-cache prefix.
 */
async function offerCompactionAfterModeChange(
	ctx: ExtensionContext & { waitForIdle?: () => Promise<void> },
	previous: AgentMode,
	next: AgentMode,
): Promise<void> {
	if (previous === next || !sessionHasChat(ctx) || !ctx.hasUI) return;

	const confirmed = await ctx.ui.confirm(
		"Compact conversation?",
		`Switching from ${previous} to ${next} changes tools and the system prompt and busts the prompt cache. Compact now so later turns use a summary plus recent messages instead of the full history?`,
	);
	if (!confirmed) return;

	await ctx.waitForIdle?.();
	ctx.compact({
		customInstructions:
			`The user switched from ${previous} mode to ${next} mode. Summarize the prior conversation so work can continue under the new mode.`,
		onComplete: () => {
			ctx.ui.notify("Compacted after mode change", "info");
		},
		onError: (error) => {
			if (isSkippableCompactionError(error)) return;
			ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
		},
	});
}

/** Shows a TUI picker for the session mode. */
async function showModePicker(ctx: ExtensionCommandContext, mode: AgentMode): Promise<AgentMode | undefined> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/mode requires TUI mode or a name: /mode build|plan|chat", "error");
		return undefined;
	}

	const items: SelectItem[] = MODE_NAMES.map((name) => ({
		value: name,
		label: name === mode ? `${name} (active)` : name,
		description: MODES[name].description,
	}));

	const result = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Mode"))));

		const selectList = new SelectList(items, items.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);
		container.addChild(selectList);
		container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel")));
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	});

	if (!result || !isAgentMode(result)) return undefined;
	return result;
}

/** Switches Build, Plan, and Chat for this session by swapping tools and a short prompt. */
export default function modesExtension(pi: ExtensionAPI): void {
	let mode: AgentMode = "build";
	let toolsBeforeMode: string[] | undefined;

	/** Restores the snapshot taken when leaving Build. */
	const restoreBuildTools = (): void => {
		if (toolsBeforeMode) pi.setActiveTools(toolsBeforeMode);
		toolsBeforeMode = undefined;
	};

	/** Applies the active mode's tool set from the Build snapshot. */
	const applyModeTools = (next: AgentMode): void => {
		if (next === "build") {
			restoreBuildTools();
			return;
		}

		const snapshot = toolsBeforeMode ?? pi.getActiveTools();
		toolsBeforeMode = snapshot;
		if (next === "plan") {
			pi.setActiveTools(snapshot.filter((name) => !MUTATING_TOOLS.has(name)));
			return;
		}

		pi.setActiveTools(snapshot.filter((name) => CHAT_TOOLS.has(name)));
	};

	/** Applies a mode for the rest of this session and updates the footer. */
	const selectMode = (next: AgentMode, ctx: ExtensionContext): void => {
		mode = next;
		applyModeTools(next);
		setModeStatus(ctx, next);
		ctx.ui.notify(`Mode: ${next}`, "info");
	};

	pi.registerCommand("mode", {
		description: "Choose build, plan, or chat for this session",
		getArgumentCompletions: (prefix) => {
			const items = MODE_NAMES.map((name) => ({
				value: name,
				label: `${name} — ${MODES[name].description}`,
			}));
			const matches = items.filter((item) => item.value.startsWith(prefix));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			const name = args.trim().split(" ")[0];
			const previous = mode;
			if (!name) {
				const next = await showModePicker(ctx, mode);
				if (!next) return;
				selectMode(next, ctx);
				await offerCompactionAfterModeChange(ctx, previous, next);
				return;
			}

			if (!isAgentMode(name)) {
				ctx.ui.notify(`Unknown mode "${name}". Available: ${MODE_NAMES.join(", ")}`, "error");
				return;
			}

			selectMode(name, ctx);
			await offerCompactionAfterModeChange(ctx, previous, mode);
		},
	});

	pi.registerShortcut(Key.ctrl("q"), {
		description: "Cycle session mode",
		handler: async (ctx) => {
			const previous = mode;
			const next = nextMode(mode);
			selectMode(next, ctx);
			await offerCompactionAfterModeChange(ctx, previous, next);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		mode = "build";
		restoreBuildTools();
		setModeStatus(ctx, mode);
	});

	pi.on("tool_call", (event) => {
		if (mode === "build") return;

		if (MUTATING_TOOLS.has(event.toolName)) {
			return { block: true, reason: `${mode} mode: ${event.toolName} is disabled` };
		}

		if (mode === "chat" && event.toolName === "bash") {
			return { block: true, reason: "chat mode: bash is disabled" };
		}

		if (mode === "plan" && isToolCallEventType("bash", event) && isDestructiveCommand(event.input.command)) {
			return {
				block: true,
				reason: `plan mode: command blocked (not read-only).\nCommand: ${event.input.command}`,
			};
		}
	});

	pi.on("before_agent_start", (event) => {
		return { systemPrompt: applyModePrompt(event.systemPrompt, mode) };
	});
}

/** Named session mode that swaps tools and a short system-prompt block. */
type AgentMode = keyof typeof MODES;
