import {
	DynamicBorder,
	getDocsPath,
	getExamplesPath,
	getReadmePath,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, Key, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

/** Slash command that restores Pi documentation for the rest of the session. */
const BUILD_FOR_PI_COMMAND = "/skill:build-for-pi";

/**
 * Matches Pi's built-in documentation section: the heading through the final
 * "Always read pi .md files completely..." bullet. Paths in the middle vary by
 * install, so only the stable start and end text are anchored.
 */
const PI_DOCS_BLOCK =
	/\n\nPi documentation \(read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI\):[\s\S]*?Always read pi \.md files completely and follow links to related docs \(e\.g\., tui\.md for TUI API details\)/;

/** Session-only personas and the first identity sentence each injects. */
const PERSONAS = {
	developer: {
		description: "Pi's default coding-assistant identity",
		/** Default first identity sentence from Pi's built-in system prompt. */
		identity: "You are an expert coding assistant operating inside pi, a coding agent harness.",
		prompt: "The active persona is developer. Earlier designer or general persona instructions no longer apply.",
	},
	designer: {
		description: "Layouts, visual systems, copy, and design specifications",
		identity: "You are an expert designer operating inside pi, a coding agent harness.",
		prompt: "The active persona is designer. Earlier developer or general persona instructions no longer apply.",
	},
	general: {
		description: "Helpful assistant for research and general work",
		identity: "You are a helpful assistant operating inside pi, a coding agent harness.",
		prompt: "The active persona is general. Earlier developer or designer persona instructions no longer apply.",
	},
} as const;

/** Persona names accepted by `/persona`. */
const PERSONA_NAMES = Object.keys(PERSONAS) as Persona[];

/** Identity sentences this extension may have injected on an earlier turn. */
const PERSONA_IDENTITIES = PERSONA_NAMES.map((name) => PERSONAS[name].identity);

/** Prompt blocks owned by this extension and replaced with the active persona. */
const PERSONA_PROMPT_BLOCKS = PERSONA_NAMES.map((name) => PERSONAS[name].prompt);

/** Returns the next persona in cycle order. */
function nextPersona(current: Persona): Persona {
	const index = PERSONA_NAMES.indexOf(current);
	return PERSONA_NAMES[(index + 1) % PERSONA_NAMES.length] ?? current;
}

/** Returns whether a command argument is a known persona. */
function isPersona(value: string): value is Persona {
	return Object.hasOwn(PERSONAS, value);
}

/** Builds Pi's documentation block with paths from this install. */
function formatPiDocumentation(): string {
	return `Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: ${getReadmePath()}
- Additional docs: ${getDocsPath()}
- Examples: ${getExamplesPath()} (extensions, custom tools, SDK)
- When reading pi docs or examples, resolve docs/... under Additional docs and examples/... under Examples, not the current working directory
- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md), skills (docs/skills.md), prompt templates (docs/prompt-templates.md), TUI components (docs/tui.md), keybindings (docs/keybindings.md), SDK integrations (docs/sdk.md), custom providers (docs/custom-provider.md), adding models (docs/models.md), pi packages (docs/packages.md), environment variables (docs/environment-variables.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)`;
}

/** Returns the first managed identity sentence in prompt order. */
function findPersonaIdentity(systemPrompt: string): string | undefined {
	let firstIdentity: string | undefined;
	let firstIndex = systemPrompt.length;
	for (const identity of PERSONA_IDENTITIES) {
		const index = systemPrompt.indexOf(identity);
		if (index < 0 || index >= firstIndex) continue;
		firstIdentity = identity;
		firstIndex = index;
	}
	return firstIdentity;
}

/**
 * Replaces the active managed identity and optionally restores Pi docs. Only
 * the first identity sentence is swapped so plan/chat modes can rewrite the
 * following "You help users by …" line. Custom `--system-prompt` / `SYSTEM.md`
 * text is returned unchanged unless it contains a managed identity sentence.
 * The explicit persona block retires earlier persona instructions so changes
 * remain unambiguous in an existing conversation.
 */
function applyPersonaPrompt(systemPrompt: string, persona: Persona, restorePiDocs: boolean): string {
	const currentIdentity = findPersonaIdentity(systemPrompt);
	if (!currentIdentity) return systemPrompt;

	const selected = PERSONAS[persona];
	let prompt = systemPrompt.replace(currentIdentity, selected.identity);
	for (const previousBlock of PERSONA_PROMPT_BLOCKS) {
		prompt = prompt.replaceAll(`\n\n${previousBlock}`, "");
	}
	prompt += `\n\n${selected.prompt}`;

	prompt = prompt.replace(PI_DOCS_BLOCK, "");
	const hasPiDocs = prompt.includes("Pi documentation (read only when the user asks about pi itself");
	if (restorePiDocs && !hasPiDocs) {
		prompt += `\n\n${formatPiDocumentation()}`;
	}
	return prompt;
}

/** Updates the footer status for the active persona. */
function setPersonaStatus(ctx: ExtensionContext, persona: Persona): void {
	ctx.ui.setStatus("persona", ctx.ui.theme.fg("accent", `persona:${persona}`));
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
 * Asks whether to compact after a mid-session persona change. The new identity
 * already busts the prompt-cache prefix, so summarizing old turns avoids paying
 * that miss again on later requests.
 */
async function offerCompactionAfterPersonaChange(
	ctx: ExtensionContext & { waitForIdle?: () => Promise<void> },
	previous: Persona,
	next: Persona,
): Promise<void> {
	if (previous === next || !sessionHasChat(ctx) || !ctx.hasUI) return;

	const confirmed = await ctx.ui.confirm(
		"Compact conversation?",
		`Switching from ${previous} to ${next} changes the system prompt and busts the prompt cache. Compact now so later turns use a summary plus recent messages instead of the full history?`,
	);
	if (!confirmed) return;

	await ctx.waitForIdle?.();
	ctx.compact({
		customInstructions:
			`The user switched from the ${previous} persona to the ${next} persona. Summarize the prior conversation so work can continue under the new identity.`,
		onComplete: () => {
			ctx.ui.notify("Compacted after persona change", "info");
		},
		onError: (error) => {
			if (isSkippableCompactionError(error)) return;
			ctx.ui.notify(`Compaction failed: ${error.message}`, "error");
		},
	});
}

/** Shows a TUI picker for the session persona. */
async function showPersonaPicker(ctx: ExtensionCommandContext, persona: Persona): Promise<Persona | undefined> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("/persona requires TUI mode or a name: /persona developer|designer|general", "error");
		return undefined;
	}

	const items: SelectItem[] = PERSONA_NAMES.map((name) => ({
		value: name,
		label: name === persona ? `${name} (active)` : name,
		description: PERSONAS[name].description,
	}));

	const result = await ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		container.addChild(new Text(theme.fg("accent", theme.bold("Persona"))));

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

	if (!result || !isPersona(result)) return undefined;
	return result;
}

/** Swaps the managed identity, announces it once outbound, and gates Pi documentation. */
export default function personasExtension(pi: ExtensionAPI): void {
	let persona: Persona = "developer";
	let personaRevision = 0;
	let announcedPersonaRevision = -1;
	let managesPersona = false;
	let restorePiDocs = false;

	/** Applies a persona for the rest of this session and updates the footer. */
	const selectPersona = (next: Persona, ctx: ExtensionContext): void => {
		persona = next;
		personaRevision += 1;
		setPersonaStatus(ctx, next);
		ctx.ui.notify(`Persona: ${next}`, "info");
	};

	pi.registerCommand("persona", {
		description: "Choose developer, designer, or general identity for this session",
		getArgumentCompletions: (prefix) => {
			const items = PERSONA_NAMES.map((name) => ({
				value: name,
				label: `${name} — ${PERSONAS[name].description}`,
			}));
			const matches = items.filter((item) => item.value.startsWith(prefix));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			const name = args.trim().split(" ")[0];
			const previous = persona;
			if (!name) {
				const next = await showPersonaPicker(ctx, persona);
				if (!next) return;
				selectPersona(next, ctx);
				await offerCompactionAfterPersonaChange(ctx, previous, next);
				return;
			}

			if (!isPersona(name)) {
				ctx.ui.notify(`Unknown persona "${name}". Available: ${PERSONA_NAMES.join(", ")}`, "error");
				return;
			}

			selectPersona(name, ctx);
			await offerCompactionAfterPersonaChange(ctx, previous, persona);
		},
	});

	pi.registerShortcut(Key.ctrl("n"), {
		description: "Cycle session persona",
		handler: async (ctx) => {
			const previous = persona;
			const next = nextPersona(persona);
			selectPersona(next, ctx);
			await offerCompactionAfterPersonaChange(ctx, previous, next);
		},
	});

	pi.on("session_start", (_event, ctx) => {
		persona = "developer";
		personaRevision += 1;
		restorePiDocs = false;
		setPersonaStatus(ctx, persona);
	});

	pi.on("input", (event) => {
		const text = event.text.trim();
		if (text === BUILD_FOR_PI_COMMAND || text.startsWith(`${BUILD_FOR_PI_COMMAND} `)) {
			restorePiDocs = true;
		}
	});

	pi.on("before_agent_start", (event) => {
		managesPersona = findPersonaIdentity(event.systemPrompt) !== undefined;
		return { systemPrompt: applyPersonaPrompt(event.systemPrompt, persona, restorePiDocs) };
	});

	// Add one transition marker to the provider request without persisting it in session history.
	pi.on("context", (event) => {
		if (!managesPersona || announcedPersonaRevision === personaRevision) return;

		announcedPersonaRevision = personaRevision;
		return {
			messages: [
				...event.messages,
				{
					role: "custom",
					customType: "agent-persona-context",
					content: `[CURRENT PERSONA: ${persona.toUpperCase()} — supersedes earlier persona statements]`,
					display: false,
					timestamp: Date.now(),
				},
			],
		};
	});
}

/** Named session identity that rewrites Pi's default first identity sentence. */
type Persona = keyof typeof PERSONAS;
