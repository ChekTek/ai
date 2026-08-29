import {
	DefaultPackageManager,
	getAgentDir,
	SettingsManager,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type PackageSource,
} from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

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

function openManager(ctx: ExtensionCommandContext, settings: SettingsManager): DefaultPackageManager {
	return new DefaultPackageManager({ cwd: ctx.cwd, agentDir: getAgentDir(), settingsManager: settings });
}

function toPosix(path: string): string {
	return path.replaceAll("\\", "/");
}

function listPackageRows(settings: SettingsManager): PackageRow[] {
	const scopes = [
		["global", settings.getGlobalSettings().packages ?? []],
		["project", settings.getProjectSettings().packages ?? []],
	] as const;

	const rows: PackageRow[] = [];
	for (const [scope, list] of scopes) {
		list.forEach((entry, index) => {
			rows.push({ kind: "package", scope, index, entry, label: sourceOf(entry), off: isOff(entry) });
		});
	}
	return rows;
}

/** Lists auto-discovered extensions from the agent dir and project .pi dir. */
async function listExtensionRows(manager: DefaultPackageManager): Promise<ExtensionRow[]> {
	const resolved = await manager.resolve(async () => "skip");
	const rows: ExtensionRow[] = [];
	for (const resource of resolved.extensions) {
		const { metadata } = resource;
		if (metadata.origin !== "top-level" || metadata.source !== "auto") continue;
		if (metadata.scope === "temporary" || !metadata.baseDir) continue;
		rows.push({
			kind: "extension",
			scope: metadata.scope === "user" ? "global" : "project",
			rel: toPosix(relative(metadata.baseDir, resource.path)),
			baseDir: metadata.baseDir,
			label: toPosix(relative(metadata.baseDir, resource.path)),
			off: !resource.enabled,
		});
	}
	return rows;
}

async function listRows(settings: SettingsManager, manager: DefaultPackageManager): Promise<Row[]> {
	return [...listPackageRows(settings), ...(await listExtensionRows(manager))];
}

async function applyPackageToggle(settings: SettingsManager, row: PackageRow, cwd: string): Promise<void> {
	const scoped = row.scope === "global" ? settings.getGlobalSettings() : settings.getProjectSettings();
	const list = [...(scoped.packages ?? [])];
	list[row.index] = toggled(row.entry, row.scope, cwd);
	if (row.scope === "global") settings.setPackages(list);
	else settings.setProjectPackages(list);
	await settings.flush();
}

/** True when an override pattern (+path or -path) targets this extension row. */
function overrideTargetsRow(pattern: string, row: ExtensionRow): boolean {
	if (!pattern.startsWith("+") && !pattern.startsWith("-")) return false;
	const body = toPosix(pattern.slice(1)).replace(/^\.\//, "");
	return body === row.rel || body === `${toPosix(row.baseDir)}/${row.rel}`;
}

async function saveExtensionPatterns(settings: SettingsManager, scope: Scope, patterns: string[]): Promise<void> {
	if (scope === "global") settings.setExtensionPaths(patterns);
	else settings.setProjectExtensionPaths(patterns);
	await settings.flush();
}

/**
 * Toggles one auto-discovered extension by managing `+path`/`-path` override
 * patterns in the owning settings' `extensions` array, the same mechanism
 * `pi config` uses. Enabling falls back to a `+path` force-include when a
 * glob exclusion still hides the file.
 */
async function applyExtensionToggle(
	settings: SettingsManager,
	manager: DefaultPackageManager,
	row: ExtensionRow,
): Promise<void> {
	const scoped = row.scope === "global" ? settings.getGlobalSettings() : settings.getProjectSettings();
	const kept = (scoped.extensions ?? []).filter((pattern) => !overrideTargetsRow(pattern, row));

	if (!row.off) {
		await saveExtensionPatterns(settings, row.scope, [...kept, `-${row.rel}`]);
		return;
	}

	await saveExtensionPatterns(settings, row.scope, kept);
	const rows = await listExtensionRows(manager);
	const current = rows.find((r) => r.scope === row.scope && r.rel === row.rel);
	if (current?.off) {
		await saveExtensionPatterns(settings, row.scope, [...kept, `+${row.rel}`]);
	}
}

async function applyToggle(
	settings: SettingsManager,
	manager: DefaultPackageManager,
	row: Row,
	cwd: string,
): Promise<void> {
	if (row.kind === "package") await applyPackageToggle(settings, row, cwd);
	else await applyExtensionToggle(settings, manager, row);
}

function rowText(row: Row): string {
	const kind = row.kind === "package" ? "pkg" : "ext";
	return `${row.off ? "off" : "on "} · ${row.scope} · ${kind} · ${row.label}`;
}

function renderList(rows: Row[]): string {
	if (rows.length === 0) return "No pi packages or local extensions found.";
	return rows.map(rowText).join("\n");
}

/** True when a CLI argument names this row (source, path, or bare file name). */
function rowMatches(row: Row, word: string): boolean {
	if (row.label === word) return true;
	if (row.kind !== "extension") return false;
	const name = basename(row.rel);
	return name === word || name.replace(/\.(ts|js)$/, "") === word;
}

async function offerReload(ctx: ExtensionCommandContext): Promise<void> {
	if (ctx.hasUI && (await ctx.ui.confirm("Reload", "Reload now so the changes take effect?"))) {
		await ctx.reload();
		return;
	}
	ctx.ui.notify("Changes apply after /reload or restart.", "info");
}

async function interactive(
	settings: SettingsManager,
	manager: DefaultPackageManager,
	ctx: ExtensionCommandContext,
): Promise<void> {
	let changed = false;
	while (true) {
		const rows = await listRows(settings, manager);
		if (rows.length === 0) {
			ctx.ui.notify(renderList(rows), "info");
			break;
		}
		const labels = rows.map((row) => `${row.off ? "○" : "●"} ${rowText(row)}`);
		const choice = await ctx.ui.select("Toggle pi packages (Esc when done)", labels);
		if (choice === undefined) break;
		const row = rows[labels.indexOf(choice)];
		if (!row) break;
		await applyToggle(settings, manager, row, ctx.cwd);
		changed = true;
		ctx.ui.notify(`${row.label} switched ${row.off ? "on" : "off"} (${row.scope})`, "info");
	}
	if (changed) await offerReload(ctx);
}

async function setState(
	settings: SettingsManager,
	manager: DefaultPackageManager,
	ctx: ExtensionCommandContext,
	word: string,
	off: boolean,
): Promise<void> {
	const rows = (await listRows(settings, manager)).filter((row) => rowMatches(row, word));
	if (rows.length === 0) {
		ctx.ui.notify(`Nothing matches ${word}. Run /packages list to see names.`, "error");
		return;
	}

	let changed = false;
	for (const row of rows) {
		if (row.off === off) continue;
		await applyToggle(settings, manager, row, ctx.cwd);
		changed = true;
		ctx.ui.notify(`${row.label} switched ${off ? "off" : "on"} (${row.scope})`, "info");
	}

	if (changed) await offerReload(ctx);
	else ctx.ui.notify(`${word} is already ${off ? "off" : "on"}.`, "info");
}

/**
 * Registers `/packages`, which lists installed pi packages from global and
 * project settings plus auto-discovered local extensions, and toggles them
 * on or off in place, without uninstalling.
 * @param pi Extension API supplied by Pi.
 */
export default function packageToggleExtension(pi: ExtensionAPI): void {
	pi.registerCommand("packages", {
		description: "Toggle pi packages and local extensions on or off",
		getArgumentCompletions: (argumentPrefix) => {
			const items = [
				{ value: "list", label: "list", description: "Show packages and extensions with their state" },
				{ value: "on ", label: "on", description: "Switch a package or extension on" },
				{ value: "off ", label: "off", description: "Switch a package or extension off" },
			].filter((item) => item.value.startsWith(argumentPrefix.trimStart()));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			try {
				const settings = openSettings(ctx);
				const manager = openManager(ctx, settings);
				const words = args.trim().split(/\s+/).filter(Boolean);

				if (words.length === 0 && ctx.hasUI) {
					await interactive(settings, manager, ctx);
					return;
				}
				if (words.length === 0 || (words[0] === "list" && words.length === 1)) {
					ctx.ui.notify(renderList(await listRows(settings, manager)), "info");
					return;
				}
				if ((words[0] === "on" || words[0] === "off") && words.length === 2) {
					await setState(settings, manager, ctx, words[1], words[0] === "off");
					return;
				}
				ctx.ui.notify("Usage: /packages [list | on <name> | off <name>]", "error");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}

/** Listing rows: a settings package entry or an auto-discovered extension. */
type Scope = "global" | "project";
type PackageRow = {
	kind: "package";
	scope: Scope;
	index: number;
	entry: PackageSource;
	label: string;
	off: boolean;
};
type ExtensionRow = {
	kind: "extension";
	scope: Scope;
	rel: string;
	baseDir: string;
	label: string;
	off: boolean;
};
type Row = PackageRow | ExtensionRow;
