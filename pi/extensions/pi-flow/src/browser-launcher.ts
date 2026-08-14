import { spawn } from "node:child_process";
import { platform } from "node:process";

/**
 * Open a URL in the user's default browser.
 *
 * Browsers focus an existing tab when the same URL is opened again, which is how
 * `/flow` refocuses an already running canvas.
 * @param url URL to open.
 * @returns True when the platform launcher was started.
 */
export function openInBrowser(url: string): boolean {
	const launcher = resolveLauncher(url);
	if (!launcher) {
		return false;
	}

	try {
		const child = spawn(launcher.command, launcher.args, { detached: true, stdio: "ignore" });
		child.on("error", () => undefined);
		child.unref();
		return true;
	} catch {
		return false;
	}
}

/**
 * Pick the platform command that opens a URL.
 * @param url URL to open.
 * @returns Command and arguments, or undefined on unsupported platforms.
 */
function resolveLauncher(url: string): { command: string; args: string[] } | undefined {
	switch (platform) {
		case "darwin":
			return { command: "open", args: [url] };
		case "win32":
			return { command: "cmd", args: ["/c", "start", "", url] };
		default:
			return { command: "xdg-open", args: [url] };
	}
}
