import {
	getAgentDir,
	SettingsManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type PackageSource,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Returns the package source string for either settings entry form. */
function sourceOf(entry: PackageSource): string {
	return typeof entry === "string" ? entry : entry.source;
}

/**
 * True when the entry is switched off: autoload disabled and no explicit
 * resource patterns, so pi loads nothing from the package.
 */
function isOff(entry: PackageSource): boolean {
	if (typeof entry === "string" || entry.autoload !== false) return false;
	const patterns = [entry.extensions, entry.skills, entry.prompts, entry.themes];
	return patterns.every((list) => !list || list.length === 0);
}

/** Stash file holding original entries of switched-off packages, per scope. */
function stashPath(scope: Scope, cwd: string): string {
	return scope === "global"
		? join(getAgentDir(), "package-toggle-stash.json")
		: join(cwd, ".pi", "package-toggle-stash.json");
}

function readStash(path: string): Record<string, PackageSource> {
	try {
		if (!existsSync(path)) return {};
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return {};
	}
}

function writeStash(path: string, stash: Record<string, PackageSource>): void {
	if (Object.keys(stash).length === 0) {
		try {
			unlinkSync(path);
		} catch {}
		return;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(stash, null, 2)}\n`);
}

/**
 * Returns the flipped entry. Switching off stashes an object entry so its
 * resource filters survive the round trip; switching on restores the stash
 * or falls back to the plain source string.
 */
function toggled(entry: PackageSource, scope: Scope, cwd: string): PackageSource {
	const source = sourceOf(entry);
	const path = stashPath(scope, cwd);
	const stash = readStash(path);

	if (isOff(entry)) {
		const restored = stash[source] ?? source;
		delete stash[source];
		writeStash(path, stash);
		return restored;
	}

	if (typeof entry !== "string") {
		stash[source] = entry;
		writeStash(path, stash);
	}
	return { source, autoload: false, extensions: [], skills: [], prompts: [], themes: [] };
}

function openSettings(ctx: ExtensionCommandContext): SettingsManager {
	return SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
}

function listRows(settings: SettingsManager): Row[] {
	const scopes = [
		["global", settings.getGlobalSettings().packages ?? []],
		["project", settings.getProjectSettings().packages ?? []],
	] as const;

	const rows: Row[] = [];
	for (const [scope, list] of scopes) {
		list.forEach((entry, index) => {
			rows.push({ scope, index, entry, source: sourceOf(entry), off: isOff(entry) });
		});
	}
	return rows;
}

async function applyToggle(settings: SettingsManager, row: Row, cwd: string): Promise<void> {
	const scoped = row.scope === "global" ? settings.getGlobalSettings() : settings.getProjectSettings();
	const list = [...(scoped.packages ?? [])];
	list[row.index] = toggled(row.entry, row.scope, cwd);
	if (row.scope === "global") settings.setPackages(list);
	else settings.setProjectPackages(list);
	await settings.flush();
}

function renderList(rows: Row[]): string {
	if (rows.length === 0) return "No pi packages in settings. Install one with `pi install <source>`.";
	const lines = rows.map((row) => `${row.off ? "off" : "on "} · ${row.scope} · ${row.source}`);
	return lines.join("\n");
}

async function offerReload(ctx: ExtensionCommandContext): Promise<void> {
	if (ctx.hasUI && (await ctx.ui.confirm("Reload", "Reload now so package changes take effect?"))) {
		await ctx.reload();
		return;
	}
	ctx.ui.notify("Package changes apply after /reload or restart.", "info");
}

async function interactive(settings: SettingsManager, ctx: ExtensionCommandContext): Promise<void> {
	let changed = false;
	while (true) {
		const rows = listRows(settings);
		if (rows.length === 0) {
			ctx.ui.notify(renderList(rows), "info");
			break;
		}
		const labels = rows.map((row) => `${row.off ? "○ off" : "● on "} · ${row.scope} · ${row.source}`);
		const choice = await ctx.ui.select("Toggle pi packages (Esc when done)", labels);
		if (choice === undefined) break;
		const row = rows[labels.indexOf(choice)];
		if (!row) break;
		await applyToggle(settings, row, ctx.cwd);
		changed = true;
		ctx.ui.notify(`${row.source} switched ${row.off ? "on" : "off"} (${row.scope})`, "info");
	}
	if (changed) await offerReload(ctx);
}

async function setState(
	settings: SettingsManager,
	ctx: ExtensionCommandContext,
	source: string,
	off: boolean,
): Promise<void> {
	const rows = listRows(settings).filter((row) => row.source === source);
	if (rows.length === 0) {
		ctx.ui.notify(`No package with source ${source}. Run /packages list to see sources.`, "error");
		return;
	}

	let changed = false;
	for (const row of rows) {
		if (row.off === off) continue;
		await applyToggle(settings, row, ctx.cwd);
		changed = true;
		ctx.ui.notify(`${row.source} switched ${off ? "off" : "on"} (${row.scope})`, "info");
	}

	if (changed) await offerReload(ctx);
	else ctx.ui.notify(`${source} is already ${off ? "off" : "on"}.`, "info");
}

/**
 * Registers `/packages`, which lists installed pi packages from global and
 * project settings and toggles them on or off in place, without uninstalling.
 * @param pi Extension API supplied by Pi.
 */
export default function packageToggleExtension(pi: ExtensionAPI): void {
	pi.registerCommand("packages", {
		description: "Toggle installed pi packages on or off",
		getArgumentCompletions: (argumentPrefix) => {
			const items = [
				{ value: "list", label: "list", description: "Show packages and their state" },
				{ value: "on ", label: "on", description: "Switch a package on" },
				{ value: "off ", label: "off", description: "Switch a package off" },
			].filter((item) => item.value.startsWith(argumentPrefix.trimStart()));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			try {
				const settings = openSettings(ctx);
				const words = args.trim().split(/\s+/).filter(Boolean);

				if (words.length === 0 && ctx.hasUI) {
					await interactive(settings, ctx);
					return;
				}
				if (words.length === 0 || (words[0] === "list" && words.length === 1)) {
					ctx.ui.notify(renderList(listRows(settings)), "info");
					return;
				}
				if ((words[0] === "on" || words[0] === "off") && words.length === 2) {
					await setState(settings, ctx, words[1], words[0] === "off");
					return;
				}
				ctx.ui.notify("Usage: /packages [list | on <source> | off <source>]", "error");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}

/** One package entry row from a settings scope. */
type Scope = "global" | "project";
type Row = { scope: Scope; index: number; entry: PackageSource; source: string; off: boolean };
