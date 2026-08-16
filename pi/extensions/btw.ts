import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
	type AgentSession,
	type AgentSessionEvent,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
	type Focusable,
	type TUI,
} from "@earendil-works/pi-tui";

/** Extra system text so the overlay session does not continue the main chat. */
const ASIDE_PROMPT =
	"You are in a side conversation overlay. The user's main Pi session is separate and may still be working. Answer only the overlay question.";

/** Overlay chrome rows outside the transcript viewport. */
const CHROME_LINES = 6;

/** Collects text parts from a user or assistant message. */
function extractText(message: { content?: Array<{ type: string; text?: string }> }): string {
	if (!message.content) return "";
	const chunks = [];
	for (const part of message.content) {
		if (part.type === "text" && part.text) chunks.push(part.text);
	}
	return chunks.join("");
}

/** Shows a notification when the current Pi session has a UI. */
function notify(ctx: ExtensionCommandContext, message: string, type: "info" | "error"): void {
	if (!ctx.hasUI) return;
	ctx.ui.notify(message, type);
}

/** Popup overlay with a transcript, single-line composer, and Escape to dismiss. */
class BtwOverlay implements Component, Focusable {
	private _focused = false;
	private readonly input = new Input();
	private readonly tui: TUI;
	private readonly theme: OverlayTheme;
	private readonly readEntries: () => TranscriptEntry[];
	private readonly getBusy: () => boolean;
	private readonly onDismiss: () => void;
	private transcriptScrollOffset = 0;
	private transcriptViewportHeight = 8;
	private followTranscript = true;
	private mouseEnabled = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(options: BtwOverlayConfig) {
		this.tui = options.tui;
		this.theme = options.theme;
		this.readEntries = options.readEntries;
		this.getBusy = options.getBusy;
		this.onDismiss = options.onDismiss;
		this.input.onSubmit = (value) => {
			const question = value.trim();
			if (!question) return;
			this.followTranscript = true;
			this.input.setValue("");
			options.onSubmit(question);
		};
		this.tui.terminal.write("\x1b[?1000h\x1b[?1006h");
		this.mouseEnabled = true;
	}

	/** Tears down mouse reporting started for transcript scrolling. */
	dispose(): void {
		if (!this.mouseEnabled) return;
		this.tui.terminal.write("\x1b[?1000l\x1b[?1006l");
		this.mouseEnabled = false;
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.onDismiss();
			return;
		}

		const mouseScroll = mouseScrollDelta(data);
		if (mouseScroll !== null) {
			this.scrollTranscript(mouseScroll);
			return;
		}

		if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.up)) {
			this.scrollTranscript(matchesKey(data, Key.pageUp) ? -Math.max(1, this.transcriptViewportHeight - 1) : -1);
			return;
		}

		if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.down)) {
			this.scrollTranscript(matchesKey(data, Key.pageDown) ? Math.max(1, this.transcriptViewportHeight - 1) : 1);
			return;
		}

		this.input.handleInput(data);
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const dialogWidth = Math.max(24, width);
		const innerWidth = Math.max(22, dialogWidth - 2);
		const wrapped = wrapTranscript(this.readEntries(), this.theme, innerWidth);
		const dialogHeight = overlayHeight();
		this.transcriptViewportHeight = Math.max(6, dialogHeight - CHROME_LINES);

		const maxScroll = Math.max(0, wrapped.length - this.transcriptViewportHeight);
		if (this.followTranscript) {
			this.transcriptScrollOffset = maxScroll;
		} else {
			this.transcriptScrollOffset = Math.min(maxScroll, Math.max(0, this.transcriptScrollOffset));
			if (this.transcriptScrollOffset >= maxScroll) this.followTranscript = true;
		}

		const visible = wrapped.slice(
			this.transcriptScrollOffset,
			this.transcriptScrollOffset + this.transcriptViewportHeight,
		);
		const pad = Math.max(0, this.transcriptViewportHeight - visible.length);
		const title = this.getBusy() ? "BTW · streaming" : "BTW · idle";
		const lines = [
			this.border(innerWidth, "top"),
			this.frame(this.theme.fg("accent", this.theme.bold(title)), innerWidth),
			this.rule(innerWidth),
			...visible.map((line) => this.frame(line, innerWidth)),
			...Array.from({ length: pad }, () => this.frame("", innerWidth)),
			this.rule(innerWidth),
			this.inputLine(innerWidth),
			this.frame(this.theme.fg("dim", "Enter submit · Escape dismiss · PgUp/PgDn scroll"), innerWidth),
			this.border(innerWidth, "bottom"),
		];
		return lines.map((line) => (visibleWidth(line) > width ? truncateToWidth(line, width, "") : line));
	}

	/** Asks the overlay to redraw after transcript or status changes. */
	refresh(): void {
		this.tui.requestRender();
	}

	private scrollTranscript(delta: number): void {
		if (delta < 0) this.followTranscript = false;
		this.transcriptScrollOffset = Math.max(0, this.transcriptScrollOffset + delta);
		this.tui.requestRender();
	}

	private border(innerWidth: number, edge: "top" | "bottom"): string {
		const left = edge === "top" ? "┌" : "└";
		const right = edge === "top" ? "┐" : "┘";
		return this.theme.fg("border", `${left}${"─".repeat(innerWidth)}${right}`);
	}

	private rule(innerWidth: number): string {
		return this.theme.fg("border", `├${"─".repeat(innerWidth)}┤`);
	}

	private frame(content: string, innerWidth: number): string {
		const truncated = truncateToWidth(content, innerWidth, "");
		const padding = Math.max(0, innerWidth - visibleWidth(truncated));
		return `${this.theme.fg("border", "│")}${truncated}${" ".repeat(padding)}${this.theme.fg("border", "│")}`;
	}

	private inputLine(innerWidth: number): string {
		const previousFocused = this.input.focused;
		this.input.focused = false;
		try {
			const rendered = this.input.render(innerWidth)[0] ?? "";
			return this.frame(truncateToWidth(rendered, innerWidth, ""), innerWidth);
		} finally {
			this.input.focused = previousFocused;
		}
	}
}

/**
 * Registers `/btw`, which opens a popup overlay running a separate in-memory Pi
 * session. Escape closes the overlay; the main chat is left alone.
 * @param pi Extension API supplied by Pi.
 */
export default function btwExtension(pi: ExtensionAPI): void {
	let session: AgentSession | undefined;
	let unsubscribe: (() => void) | undefined;
	let overlay: BtwOverlay | undefined;
	let entries: TranscriptEntry[] = [];

	const disposeSession = (): void => {
		unsubscribe?.();
		unsubscribe = undefined;
		session?.dispose();
		session = undefined;
		entries = [];
	};

	pi.on("session_shutdown", () => {
		overlay?.dispose();
		overlay = undefined;
		disposeSession();
	});

	pi.registerCommand("btw", {
		description: "Open a side Pi overlay on top of this conversation",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				notify(ctx, "/btw needs interactive mode", "error");
				return;
			}
			if (!ctx.model) {
				notify(ctx, "No model selected", "error");
				return;
			}

			let activeSession = session;
			try {
				activeSession ??= await createSideSession(ctx);
				session = activeSession;
			} catch (error) {
				notify(ctx, error instanceof Error ? error.message : "Could not start BTW", "error");
				return;
			}

			if (!activeSession) return;

			unsubscribe ??= activeSession.subscribe((event) => {
				applyEvent(entries, event);
				overlay?.refresh();
			});

			const question = args.trim();
			const closed = ctx.ui.custom<void>(
				(tui, theme, _keybindings, done) => {
					overlay = new BtwOverlay({
						tui,
						theme,
						readEntries: () => entries,
						getBusy: () => activeSession.isStreaming,
						onSubmit: (text) => {
							promptSide(activeSession, text, entries, () => overlay?.refresh());
						},
						onDismiss: () => {
							if (activeSession.isStreaming) activeSession.abort();
							overlay?.dispose();
							overlay = undefined;
							done();
						},
					});
					return overlay;
				},
				{
					overlay: true,
					overlayOptions: {
						width: "78%",
						minWidth: 48,
						maxHeight: "78%",
						anchor: "center",
						margin: 1,
					},
					onHandle: (handle) => {
						handle.focus();
					},
				},
			);

			if (question) promptSide(activeSession, question, entries, () => overlay?.refresh());
			await closed;
		},
	});
}

/** Creates an in-memory Pi session that does not load extensions (avoids recursion). */
async function createSideSession(ctx: ExtensionCommandContext): Promise<AgentSession> {
	const loader = new DefaultResourceLoader({
		cwd: ctx.cwd,
		agentDir: getAgentDir(),
		noExtensions: true,
		appendSystemPrompt: [ASIDE_PROMPT],
	});
	await loader.reload();
	const { session } = await createAgentSession({
		cwd: ctx.cwd,
		model: ctx.model,
		thinkingLevel: ctx.thinkingLevel,
		tools: ["read", "bash", "edit", "write"],
		resourceLoader: loader,
		sessionManager: SessionManager.inMemory(ctx.cwd),
	});
	return session;
}

/** Sends a prompt to the overlay session without blocking the overlay UI. */
function promptSide(
	session: AgentSession | undefined,
	text: string,
	entries: TranscriptEntry[],
	refresh: () => void,
): void {
	if (!session) return;
	runPrompt(session, text, entries, refresh);
}

/** Awaits the overlay session turn and records failures in the transcript. */
async function runPrompt(
	session: AgentSession,
	text: string,
	entries: TranscriptEntry[],
	refresh: () => void,
): Promise<void> {
	try {
		if (session.isStreaming) {
			await session.steer(text);
			return;
		}
		await session.prompt(text);
	} catch (error) {
		entries.push({
			type: "assistant",
			text: error instanceof Error ? error.message : "BTW request failed",
			streaming: false,
		});
		refresh();
	}
}

/** Applies a sub-session event to the overlay transcript. */
function applyEvent(entries: TranscriptEntry[], event: AgentSessionEvent): void {
	switch (event.type) {
		case "message_start": {
			if (event.message.role === "user") {
				const text = extractText(event.message);
				if (text) entries.push({ type: "user", text });
				return;
			}
			if (event.message.role === "assistant") {
				upsertAssistant(entries, extractText(event.message), true);
			}
			return;
		}
		case "message_update":
		case "message_end": {
			if (event.message.role === "assistant") {
				upsertAssistant(entries, extractText(event.message), event.type === "message_update");
			}
			return;
		}
		case "tool_execution_start": {
			entries.push({ type: "tool", text: event.toolName });
			return;
		}
		case "tool_execution_end": {
			entries.push({ type: "tool", text: event.isError ? `${event.toolName} failed` : `${event.toolName} done` });
			return;
		}
		default:
			return;
	}
}

/** Updates or appends the current assistant transcript entry. */
function upsertAssistant(entries: TranscriptEntry[], text: string, streaming: boolean): void {
	if (!text) return;
	const last = entries.at(-1);
	if (last?.type === "assistant") {
		last.text = text;
		last.streaming = streaming;
		return;
	}
	entries.push({ type: "assistant", text, streaming });
}

/** Turns transcript entries into wrapped overlay lines. */
function wrapTranscript(entries: TranscriptEntry[], theme: OverlayTheme, innerWidth: number): string[] {
	if (entries.length === 0) {
		return wrapTextWithAnsi(theme.fg("dim", "Ask a side question."), innerWidth);
	}

	const lines: string[] = [];
	for (const entry of entries) {
		if (lines.length > 0) lines.push("");
		let header = theme.fg("accent", "You");
		const body = entry.text;
		switch (entry.type) {
			case "assistant":
				header = entry.streaming ? theme.fg("warning", "Assistant ▍") : theme.fg("success", "Assistant");
				break;
			case "tool":
				header = theme.fg("warning", "Tool");
				break;
			case "user":
				break;
		}
		const wrapped = wrapTextWithAnsi(`${header}  ${body}`, innerWidth);
		lines.push(...wrapped);
	}
	return lines;
}

/** Picks an overlay height that leaves the main conversation visible around it. */
function overlayHeight(): number {
	const rows = process.stdout.rows ?? 30;
	return Math.max(16, Math.min(28, Math.floor(rows * 0.72)));
}

/** Reads a wheel delta from an SGR mouse event, or null if this is not a scroll. */
function mouseScrollDelta(data: string): number | null {
	const match = data.match(/^\x1b\[<(\d+);\d+;\d+[Mm]$/);
	if (!match) return null;
	const button = Number(match[1]);
	if ((button & 64) !== 64) return null;
	return (button & 1) === 0 ? -3 : 3;
}

/** Theme used to paint the overlay chrome and transcript. */
type OverlayTheme = ExtensionCommandContext["ui"]["theme"];

/** One display block in the overlay transcript. */
type TranscriptEntry =
	| { type: "user"; text: string }
	| { type: "assistant"; text: string; streaming: boolean }
	| { type: "tool"; text: string };

/** Constructor inputs for the BTW overlay. */
type BtwOverlayConfig = {
	tui: TUI;
	theme: OverlayTheme;
	readEntries: () => TranscriptEntry[];
	getBusy: () => boolean;
	onSubmit: (value: string) => void;
	onDismiss: () => void;
};
