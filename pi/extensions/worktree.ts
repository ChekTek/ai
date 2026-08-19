import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const git = promisify(execFile);

/** Name alphabet without ambiguous characters. */
const NAME_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

/** Short random worktree name, e.g. "k3xt"; collisions are checked at creation. */
function randomName(): string {
	const bytes = randomBytes(4);
	let name = "";
	for (let i = 0; i < 4; i++) name += NAME_CHARS[bytes[i] % NAME_CHARS.length];
	return name;
}

/** Quotes a value for sh -c. */
function shq(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

interface Worktree {
	name: string;
	branch: string;
	path: string;
}

async function createWorktree(
	root: string,
	custom: string | undefined,
	notify: (message: string, kind: "info" | "error") => void,
): Promise<Worktree | undefined> {
	const parent = dirname(root);
	const repo = basename(root);
	for (let attempt = 0; attempt < 8; attempt++) {
		const name = custom ?? randomName();
		const dir = join(parent, `${repo}--${name}`);
		const branch = `wt-${name}`;
		if (await refExists(root, branch)) {
			if (custom) {
				notify(`Branch ${branch} already exists.`, "error");
				return undefined;
			}
			continue;
		}
		if (existsSync(dir) || existsSync(`${dir}.git`)) {
			if (custom) {
				notify(`Directory already in use: ${dir}`, "error");
				return undefined;
			}
			continue;
		}
		try {
			await git("git", ["worktree", "add", dir, "-b", branch, "HEAD"], { cwd: root });
			return { name, branch, path: dir };
		} catch (error) {
			if (!custom && isWorktreeCollision(error, branch, dir)) continue;
			notify(commandError(error, "git worktree add failed"), "error");
			return undefined;
		}
	}
	notify("Could not create a worktree with a free name.", "error");
	return undefined;
}

async function refExists(cwd: string, branch: string): Promise<boolean> {
	try {
		await git("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd });
		return true;
	} catch {
		return false;
	}
}

function commandStderr(error: unknown): string {
	if (!error || typeof error !== "object" || !("stderr" in error)) return "";
	return typeof error.stderr === "string" ? error.stderr : "";
}

function commandError(error: unknown, fallback: string): string {
	const stderr = commandStderr(error).trim();
	if (stderr) return stderr;
	return error instanceof Error ? error.message : fallback;
}

function isWorktreeCollision(error: unknown, branch: string, dir: string): boolean {
	const stderr = commandStderr(error);
	const ref = `refs/heads/${branch}`;
	const paths = [dir, dir.replaceAll("\\", "/")];
	return (
		stderr.includes(`a branch named '${branch}' already exists`) ||
		(stderr.includes(`cannot lock ref '${ref}'`) && stderr.includes("reference already exists")) ||
		(stderr.includes("already exists") && paths.some((path) => stderr.includes(path)))
	);
}

function piLaunch(): string {
	return process.argv[1] ? `${shq(process.execPath)} ${shq(process.argv[1])}` : "pi";
}

interface LaunchOptions {
	launch: string;
	sessionFile: string | undefined;
	passContext: boolean;
}

function launchLine(dir: string, options: LaunchOptions): string {
	const args = options.passContext && options.sessionFile ? ["--fork", options.sessionFile] : [];
	return `cd ${shq(dir)} && exec ${options.launch} ${args.map(shq).join(" ")}`.replace(/\s+$/, "");
}

async function herdr<T>(args: string[]): Promise<T> {
	const { stdout } = await git("herdr", args);
	return JSON.parse(stdout) as T;
}

function herdrPaneId(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record.pane_id === "string") return record.pane_id;
		if (typeof record.id === "string") return record.id;
	}
	return undefined;
}

function herdrAgentName(name: string): string {
	const suffix = createHash("sha256").update(name).digest("hex").slice(0, 8);
	const prefix = name.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32 - suffix.length - 1);
	return `${prefix}-${suffix}`;
}

async function openHerdrTab(dir: string, name: string, options: LaunchOptions): Promise<void> {
	const created = await herdr<{ result?: { tab?: unknown; root_pane?: unknown } }>([
		"tab",
		"create",
		"--cwd",
		dir,
		"--label",
		name,
	]);
	const pane = herdrPaneId(created.result?.root_pane) ?? herdrPaneId(created.result?.tab);
	if (!pane) throw new Error("herdr tab create did not return a pane ID");
	const args = ["agent", "start", herdrAgentName(name), "--kind", "pi", "--pane", pane];
	if (options.passContext && options.sessionFile) args.push("--", "--fork", options.sessionFile);
	await herdr(args);
}

async function openTerminalWindow(dir: string, line: string): Promise<void> {
	const script = JSON.stringify(line);
	const term = process.env.TERM_PROGRAM ?? "";
	if (term === "iTerm.app") {
		await git("osascript", [
			"-e",
			`tell application "iTerm"
activate
tell current window to create tab with default profile
tell current session of current window to write text ${script}
end tell`,
		]);
		return;
	}
	if (term === "ghostty") {
		await git("open", ["-na", "Ghostty.app", "--args", "--command=shell:" + line]);
		return;
	}
	if (term === "Apple_Terminal" || process.platform === "darwin") {
		await git("osascript", [
			"-e",
			`tell application "Terminal"
activate
do script ${script}
end tell`,
		]);
		return;
	}
	throw new Error("no supported terminal detected for a new window");
}

function relaunchInPlace(dir: string, line: string, shutdown: () => void): void {
	const script = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.2; done; sleep 0.8; stty sane 2>/dev/null; ${line}`;
	const child = spawn("sh", ["-c", script], {
		detached: true,
		stdio: ["ignore", "inherit", "inherit"],
	});
	child.unref();
	shutdown();
}

/**
 * Registers `/worktree [name]`, which adds a git worktree at
 * `../<repo>--<name>` on branch `wt-<name>` where `<name>` is a 4-character
 * random string (or the explicit argument) and then offers to open it in a
 * new Pi process. A new process can carry the current conversation by
 * forking the session file into the worktree's project.
 */
export default function worktreeExtension(pi: ExtensionAPI): void {
	pi.registerCommand("worktree", {
		description: "Create a new git worktree with a random name and open it in a fresh Pi",
		handler: async (args, ctx) => {
			const notify = (message: string, kind: "info" | "error"): void => {
				ctx.ui.notify(message, kind);
			};

			const custom = (args ?? "").trim().replace(/\s+/g, "-") || undefined;
			if (custom && !/^[\w][\w.-]{0,62}$/.test(custom)) {
				notify("Worktree name must start with a word character and use word/._- only.", "error");
				return;
			}

			let root: string | undefined;
			try {
				const { stdout } = await git("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd });
				root = stdout.trim();
			} catch {
				root = undefined;
			}
			if (!root) {
				notify(`Not a git repository: ${ctx.cwd}`, "error");
				return;
			}
			if (custom) {
				const branch = `wt-${custom}`;
				try {
					await git("git", ["check-ref-format", "--branch", branch], { cwd: root });
				} catch {
					notify(`${branch} is not a valid Git branch name.`, "error");
					return;
				}
			}

			const worktree = await createWorktree(root, custom, notify);
			if (!worktree) return;
			notify(`Created ${worktree.branch} at ${worktree.path}`, "info");

			const sessionFile = ctx.sessionManager.getSessionFile();
			const options: LaunchOptions = {
				launch: piLaunch(),
				sessionFile,
				passContext: false,
			};
			if (!ctx.hasUI) {
				notify(
					`Worktree at ${worktree.path} (branch ${worktree.branch}). Open that directory and run Pi.`,
					"info",
				);
				return;
			}

			if (sessionFile) {
				options.passContext =
					(await ctx.ui.confirm(
						"Pass the current conversation along?",
						`The new Pi session will fork ${sessionFile}.`,
					)) === true;
			}

			interface Choice {
				label: string;
				run: () => void | Promise<void>;
			}
			const choices: Choice[] = [];
			if (ctx.mode === "tui" && process.platform !== "win32") {
				choices.push({
					label: "1. Relaunch Pi in this terminal",
					run: () => relaunchInPlace(worktree.path, launchLine(worktree.path, options), () => ctx.shutdown()),
				});
			}
			if (process.env.HERDR_ENV === "1") {
				choices.push({
					label: "2. Open a new Herdr tab",
					run: () => openHerdrTab(worktree.path, `pi-${worktree.name}`, options),
				});
			}
			if (process.platform === "darwin") {
				choices.push({
					label: "3. Open a new terminal window",
					run: () => openTerminalWindow(worktree.path, launchLine(worktree.path, options)),
				});
			}
			choices.push({
				label: "4. Do nothing, keep this window",
				run: () => notify(`${worktree.path} — open this directory and run Pi.`, "info"),
			});

			let chosen: Choice | undefined;
			if (choices.length === 1) {
				chosen = choices[0];
			} else {
				const label = await ctx.ui.select("How should the worktree be opened?", choices.map((c) => c.label));
				chosen = choices.find((c) => c.label === label);
				if (!chosen) {
					notify(`Kept the worktree at ${worktree.path}.`, "info");
					return;
				}
			}

			try {
				await chosen.run();
			} catch (error) {
				notify(error instanceof Error ? error.message : "Failed to open the worktree.", "error");
			}
		},
	});
}
