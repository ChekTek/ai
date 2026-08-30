import { parseArgs, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Same sequence Pi's TUI uses on a full redraw: clear screen, home, then scrollback. */
const CLEAR_SCREEN = "\x1b[2J\x1b[H\x1b[3J";

/** True after this process has already cleared the startup screen. */
let cleared = false;

/**
 * True when this process is an interactive TTY session that will print Pi's
 * startup header. Help, model listing, print, and RPC/JSON modes are skipped
 * because those load extensions but never start the TUI.
 */
function isInteractiveStartup(): boolean {
	if (!process.stdin.isTTY || !process.stdout.isTTY) return false;

	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.help || parsed.print || parsed.listModels !== undefined) return false;
	if (parsed.mode !== undefined) return false;
	return true;
}

/**
 * Clears leftover terminal output once, before Pi's TUI first render.
 * Pi's first frame assumes a clean screen and does not clear itself.
 */
function clearStartupScreen(): void {
	if (cleared || !isInteractiveStartup()) return;
	cleared = true;
	process.stdout.write(CLEAR_SCREEN);
}

/** Clears the terminal before Pi prints its startup header. */
export default function clearStartupExtension(_pi: ExtensionAPI): void {
	clearStartupScreen();
}
