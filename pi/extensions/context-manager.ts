import { execFileSync } from "node:child_process";
import {
	existsSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { matchesGlob, relative, resolve, sep } from "node:path";

import {
	formatSkillsForPrompt,
	getAgentDir,
	getSettingsListTheme,
	parseFrontmatter,
	type BuildSystemPromptOptions,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type Skill,
} from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Text } from "@earendil-works/pi-tui";

/** Directory containing rule files published by this repository. */
const RULES_DIRECTORY = resolve(getAgentDir(), "rules");

/** Persistent user choices for rules and skill visibility. */
const CONFIG_PATH = resolve(getAgentDir(), "context-manager.json");

/** Directories excluded when a project is not a Git repository. */
const IGNORED_DIRECTORIES = new Set([
	".git",
	".next",
	".turbo",
	".yarn",
	"coverage",
	"dist",
	"node_modules",
	"target",
]);

/** Frontmatter fields understood for a rule. */
interface RuleFrontmatter extends Record<string, object | string | string[] | undefined> {
	/** Human-readable purpose shown in the rules view. */
	description?: string;
	/** Project-relative globs that activate the rule. */
	paths?: string[];
}

/** A loaded conditional rule. */
interface Rule {
	/** Rule body without frontmatter. */
	body: string;
	/** Human-readable purpose. */
	description: string;
	/** Absolute source path. */
	filePath: string;
	/** Project-relative activation globs. */
	paths: string[];
	/** Path relative to the managed rules directory. */
	relativePath: string;
}

/** Skill visibility exposed by the settings view. */
type SkillMode = "agent" | "user only";

/** Persisted context-manager choices. */
interface ContextManagerConfig {
	/** Explicit rule enablement overrides keyed by relative path. */
	rules: Record<string, boolean>;
	/** Explicit skill visibility overrides keyed by skill name. */
	skills: Record<string, SkillMode>;
}

/** Returns a new default configuration. */
function defaultConfig(): ContextManagerConfig {
	return { rules: {}, skills: {} };
}

/** Converts an absolute path to a portable relative path. */
function portableRelativePath(root: string, filePath: string): string {
	return relative(root, filePath).split(sep).join("/");
}

/** Recursively finds Markdown files below a directory. */
function findMarkdownFiles(directory: string): string[] {
	if (!existsSync(directory)) return [];

	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...findMarkdownFiles(entryPath));
		} else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(".md")) {
			files.push(entryPath);
		}
	}
	return files;
}

/** Loads all managed Pi rules. */
function loadRules(): Rule[] {
	return findMarkdownFiles(RULES_DIRECTORY)
		.map((filePath) => {
			const { body, frontmatter } = parseFrontmatter<RuleFrontmatter>(readFileSync(filePath, "utf8"));
			const relativePath = portableRelativePath(RULES_DIRECTORY, filePath);
			return {
				body,
				description: frontmatter.description ?? relativePath,
				filePath,
				paths: Array.isArray(frontmatter.paths) ? frontmatter.paths : [],
				relativePath,
			};
		})
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

/** Loads persisted choices, falling back to defaults for malformed files. */
function loadConfig(): ContextManagerConfig {
	if (!existsSync(CONFIG_PATH)) return defaultConfig();

	try {
		const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<ContextManagerConfig>;
		return {
			rules: parsed.rules ?? {},
			skills: parsed.skills ?? {},
		};
	} catch (error) {
		console.error(`Failed to load ${CONFIG_PATH}`, error);
		return defaultConfig();
	}
}

/** Atomically persists user choices. */
function saveConfig(config: ContextManagerConfig): void {
	const temporaryPath = `${CONFIG_PATH}.tmp`;
	writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	renameSync(temporaryPath, CONFIG_PATH);
}

/** Finds the Git root containing a working directory. */
function findProjectRoot(cwd: string): string {
	try {
		return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return cwd;
	}
}

/** Lists tracked and untracked, non-ignored project files. */
function listGitFiles(projectRoot: string): string[] | undefined {
	try {
		const output = execFileSync(
			"git",
			["-C", projectRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
			{ encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
		);
		return output.split("\0").filter(Boolean);
	} catch {
		return undefined;
	}
}

/** Recursively lists project files when Git discovery is unavailable. */
function listDirectoryFiles(projectRoot: string, directory = projectRoot): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...listDirectoryFiles(projectRoot, entryPath));
		} else if (entry.isFile()) {
			files.push(portableRelativePath(projectRoot, entryPath));
		}
	}
	return files;
}

/** Lists project-relative files used to evaluate rule globs. */
function listProjectFiles(cwd: string): string[] {
	const projectRoot = findProjectRoot(cwd);
	return listGitFiles(projectRoot) ?? listDirectoryFiles(projectRoot);
}

/** Returns whether a path matches a rule glob, logging invalid patterns. */
function pathMatchesGlob(filePath: string, pattern: string): boolean {
	try {
		return matchesGlob(filePath, pattern);
	} catch (error) {
		console.error(`Invalid rule path glob "${pattern}"`, error);
		return false;
	}
}

/** Returns whether a rule applies to the current project. */
function ruleMatchesProject(rule: Rule, projectFiles: string[]): boolean {
	if (rule.paths.length === 0) return true;
	return rule.paths.some((pattern) => projectFiles.some((filePath) => pathMatchesGlob(filePath, pattern)));
}

/** Returns whether a rule is enabled by the user. */
function isRuleEnabled(rule: Rule, config: ContextManagerConfig): boolean {
	return config.rules[rule.relativePath] ?? true;
}

/** Formats active rules for injection into the system prompt. */
function formatRules(rules: Rule[]): string {
	if (rules.length === 0) return "";

	const sections = rules.map(
		(rule) => `<rule path="${rule.filePath}">\n${rule.body}\n</rule>`,
	);
	return `\n\n<conditional_rules>\n${sections.join("\n\n")}\n</conditional_rules>`;
}

/** Resolves a skill's effective visibility. */
function skillMode(skill: Skill, config: ContextManagerConfig): SkillMode {
	return config.skills[skill.name] ?? (skill.disableModelInvocation ? "user only" : "agent");
}

/** Replaces Pi's available-skills block with the user's selected visibility. */
function applySkillVisibility(
	systemPrompt: string,
	options: BuildSystemPromptOptions,
	config: ContextManagerConfig,
): string {
	const skills = options.skills ?? [];
	const originalBlock = formatSkillsForPrompt(skills);
	const selectedSkills = skills.map((skill) => ({
		...skill,
		disableModelInvocation: skillMode(skill, config) === "user only",
	}));
	const selectedBlock = formatSkillsForPrompt(selectedSkills);

	if (originalBlock) return systemPrompt.replace(originalBlock, selectedBlock);

	const hasRead = !options.selectedTools || options.selectedTools.includes("read");
	if (!selectedBlock || !hasRead) return systemPrompt;

	const cwdMarker = "\nCurrent working directory:";
	return systemPrompt.includes(cwdMarker)
		? systemPrompt.replace(cwdMarker, `${selectedBlock}${cwdMarker}`)
		: `${systemPrompt}${selectedBlock}`;
}

/** Persists a config update and reports failures in the TUI. */
function persistConfig(config: ContextManagerConfig, ctx: ExtensionCommandContext): boolean {
	try {
		saveConfig(config);
		return true;
	} catch (error) {
		console.error(`Failed to save ${CONFIG_PATH}`, error);
		ctx.ui.notify(`Failed to save ${CONFIG_PATH}`, "error");
		return false;
	}
}

/** Displays a searchable settings list. */
async function showSettings(
	title: string,
	items: SettingItem[],
	onChange: (id: string, value: string) => void,
	ctx: ExtensionCommandContext,
): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify(`/${title.toLowerCase()} requires TUI mode`, "error");
		return;
	}

	await ctx.ui.custom((tui, theme, _keybindings, done) => {
		const container = new Container();
		container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 1));

		const settings = new SettingsList(
			items,
			Math.min(items.length + 2, 18),
			getSettingsListTheme(),
			onChange,
			() => done(undefined),
			{ enableSearch: true },
		);
		container.addChild(settings);

		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				settings.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

/** Adds conditional rules and context visibility controls to Pi. */
export default function contextManagerExtension(pi: ExtensionAPI): void {
	let config = loadConfig();
	let rules = loadRules();

	pi.registerCommand("rules", {
		description: "Enable or disable conditional rule files",
		handler: async (_args, ctx) => {
			rules = loadRules();
			const projectFiles = listProjectFiles(ctx.cwd);
			const items: SettingItem[] = rules.map((rule) => {
				const matches = ruleMatchesProject(rule, projectFiles);
				const matchDescription = matches ? "active in this project" : "no matching project paths";
				const patterns = rule.paths.length > 0 ? ` • ${rule.paths.join(", ")}` : " • all projects";
				return {
					id: rule.relativePath,
					label: rule.relativePath,
					description: `${rule.description} • ${matchDescription}${patterns}`,
					currentValue: isRuleEnabled(rule, config) ? "enabled" : "disabled",
					values: ["enabled", "disabled"],
				};
			});

			await showSettings(
				"Rules",
				items,
				(id, value) => {
					config.rules[id] = value === "enabled";
					persistConfig(config, ctx);
				},
				ctx,
			);
		},
	});

	pi.registerCommand("skills", {
		description: "Choose whether skills are agent-enabled or user-only",
		handler: async (_args, ctx) => {
			const skills = ctx.getSystemPromptOptions().skills ?? [];
			if (skills.length === 0) {
				ctx.ui.notify("No skills are loaded", "warning");
				return;
			}

			const items: SettingItem[] = skills.map((skill) => ({
				id: skill.name,
				label: skill.name,
				description: skill.description,
				currentValue: skillMode(skill, config),
				values: ["agent", "user only"],
			}));

			await showSettings(
				"Skills",
				items,
				(id, value) => {
					config.skills[id] = value === "agent" ? "agent" : "user only";
					persistConfig(config, ctx);
				},
				ctx,
			);
		},
	});

	pi.on("session_start", () => {
		config = loadConfig();
		rules = loadRules();
	});

	pi.on("before_agent_start", (event, ctx) => {
		const projectFiles = listProjectFiles(ctx.cwd);
		const activeRules = rules.filter(
			(rule) => isRuleEnabled(rule, config) && ruleMatchesProject(rule, projectFiles),
		);
		const promptWithSelectedSkills = applySkillVisibility(event.systemPrompt, event.systemPromptOptions, config);
		return { systemPrompt: `${promptWithSelectedSkills}${formatRules(activeRules)}` };
	});
}
