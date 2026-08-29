import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Zed's terminal tab label ignores OSC titles, so a working marker lands in the
 * breadcrumb toolbar (`terminal.toolbar.breadcrumbs`). Done and waiting only
 * ring `BEL`, which Zed turns into the activity dot.
 */
type Status = "working" | "waiting" | "done";

/** Tools that block until a human answers. */
const INTERACTIVE_TOOLS = new Set(["ask_user"]);

/**
 * Sent on stderr because pi's TUI reroutes `process.stdout` during a session.
 * Both land on the same pty, so Zed sees the bell either way.
 */
const BELL = "\x07";

/** Session name and cwd, without pi's `π` prefix. */
function restTitle(pi: ExtensionAPI, ctx: ExtensionContext): string {
	const cwd = basename(ctx.cwd);
	const sessionName = pi.getSessionName();
	return sessionName ? `${sessionName} - ${cwd}` : cwd;
}

/** Working marker: `❖ <session name> - <cwd>`. Idle states omit the marker. */
function titleFor(status: Status, pi: ExtensionAPI, ctx: ExtensionContext): string {
	const rest = restTitle(pi, ctx);
	return status === "working" ? `❖ ${rest}` : rest;
}

/** Shows a working title, and rings the bell when pi finishes or blocks on the user. */
export default function zedStatusExtension(pi: ExtensionAPI): void {
	let status: Status = "done";
	let interactiveTools = 0;

	const apply = (ctx: ExtensionContext, next: Status, ring: boolean): void => {
		if (ctx.mode !== "tui") return;

		const changed = next !== status;
		status = next;
		ctx.ui.setTitle(titleFor(status, pi, ctx));

		if (ring && changed && status !== "working") process.stderr.write(BELL);
	};

	// Startup, /new, /resume, /fork, and /name all reset pi's own title.
	pi.on("session_start", (_event, ctx) => apply(ctx, "done", false));
	pi.on("session_info_changed", (_event, ctx) => apply(ctx, status, false));

	pi.on("agent_start", (_event, ctx) => apply(ctx, "working", false));

	pi.on("tool_execution_start", (event, ctx) => {
		if (!INTERACTIVE_TOOLS.has(event.toolName)) return;
		interactiveTools += 1;
		apply(ctx, "waiting", true);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		if (!INTERACTIVE_TOOLS.has(event.toolName)) return;
		interactiveTools = Math.max(0, interactiveTools - 1);
		if (interactiveTools === 0) apply(ctx, "working", false);
	});

	// agent_settled, not agent_end: pi may still auto-retry, compact, or drain
	// queued follow-ups after a run ends.
	pi.on("agent_settled", (_event, ctx) => {
		interactiveTools = 0;
		apply(ctx, "done", true);
	});
}
