import { execFile as execFileCallback } from "node:child_process";
import {
	existsSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { matchesGlob, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
	estimateTokens,
	formatSkillsForPrompt,
	getAgentDir,
	getSettingsListTheme,
	parseFrontmatter,
	sessionEntryToContextMessages,
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

const execFile = promisify(execFileCallback);

/** Finds the Git root containing a working directory without blocking the event loop. */
async function findProjectRoot(cwd: string): Promise<string> {
	try {
		const { stdout } = await execFile("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
		});
		return stdout.trim();
	} catch {
		return cwd;
	}
}

/** Lists tracked and untracked, non-ignored project files. */
async function listGitFiles(projectRoot: string): Promise<string[] | undefined> {
	try {
		const { stdout } = await execFile(
			"git",
			["-C", projectRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
			{ encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
		);
		return stdout.split("\0").filter(Boolean);
	} catch {
		return undefined;
	}
}

/** Recursively lists project files when Git discovery is unavailable. */
async function listDirectoryFiles(
	projectRoot: string,
	directory = projectRoot,
	files: string[] = [],
): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return files;
	}
	for (const entry of entries) {
		// Symlinks and Windows junctions can cycle back into ancestors.
		if (entry.isSymbolicLink()) continue;

		const entryPath = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			if (IGNORED_DIRECTORIES.has(entry.name)) continue;
			await listDirectoryFiles(projectRoot, entryPath, files);
		} else if (entry.isFile()) {
			files.push(portableRelativePath(projectRoot, entryPath));
		}
	}
	return files;
}

/** Lists project-relative files used to evaluate rule globs. */
async function listProjectFiles(cwd: string): Promise<string[]> {
	const projectRoot = await findProjectRoot(cwd);
	const gitFiles = await listGitFiles(projectRoot);
	return gitFiles ?? await listDirectoryFiles(projectRoot);
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

/** Returns the project files matched by a rule's path globs. */
function matchingProjectFiles(rule: Rule, projectFiles: string[]): string[] {
	if (rule.paths.length === 0) return [];
	return projectFiles.filter((filePath) => rule.paths.some((pattern) => pathMatchesGlob(filePath, pattern)));
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

/** Builds table rows describing all context visible to the model. */
async function buildContextItems(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	config: ContextManagerConfig,
	rules: Rule[],
	getProjectFiles: (cwd: string) => Promise<string[]>,
): Promise<SettingItem[]> {
	const projectFiles = await getProjectFiles(ctx.cwd);
	const options = ctx.getSystemPromptOptions();
	const activeRules: Rule[] = [];
	const ruleItems: SettingItem[] = [];

	for (const rule of rules) {
		if (!isRuleEnabled(rule, config)) {
			ruleItems.push({
				id: `rule:${rule.relativePath}`,
				label: `rule • ${rule.relativePath}`,
				description: "Not added to context because this rule is disabled.",
				currentValue: "disabled",
			});
			continue;
		}

		if (rule.paths.length === 0) {
			activeRules.push(rule);
			ruleItems.push({
				id: `rule:${rule.relativePath}`,
				label: `rule • ${rule.relativePath}`,
				description: "Added to context because this rule applies to all projects.",
				currentValue: "injected",
			});
			continue;
		}

		const matches = matchingProjectFiles(rule, projectFiles);
		if (matches.length === 0) {
			ruleItems.push({
				id: `rule:${rule.relativePath}`,
				label: `rule • ${rule.relativePath}`,
				description: `Not added to context. No project files match ${rule.paths.join(", ")}.`,
				currentValue: "not matched",
			});
			continue;
		}

		const examples = matches.slice(0, 3).join(", ");
		const remaining = matches.length > 3 ? `, and ${matches.length - 3} more` : "";
		activeRules.push(rule);
		ruleItems.push({
			id: `rule:${rule.relativePath}`,
			label: `rule • ${rule.relativePath}`,
			description: `Added to context. Matched ${matches.length} project file${matches.length === 1 ? "" : "s"}: ${examples}${remaining}.`,
			currentValue: "injected",
		});
	}

	const items: SettingItem[] = [];
	const systemPrompt = ctx.getSystemPrompt();
	const systemPromptTokens = Math.ceil(systemPrompt.length / 4);
	const conversationMessages = ctx.sessionManager
		.buildContextEntries()
		.flatMap(sessionEntryToContextMessages);
	const conversationTokens = conversationMessages.reduce(
		(total, message) => total + estimateTokens(message),
		0,
	);
	const activeToolNames = new Set(pi.getActiveTools());
	const activeTools = pi.getAllTools().filter((tool) => activeToolNames.has(tool.name));
	const serializedTools = JSON.stringify(
		activeTools.map(({ name, description, parameters }) => ({ name, description, parameters })),
	);
	const toolTokens = Math.ceil(serializedTools.length / 4);
	const estimatedRequestTokens = systemPromptTokens + conversationTokens + toolTokens;
	const contextUsage = ctx.getContextUsage();
	const contextTokens = contextUsage?.tokens;
	const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow;
	const estimatedPercent = contextWindow && contextWindow > 0
		? (estimatedRequestTokens / contextWindow) * 100
		: undefined;
	const contextPercent = contextUsage?.percent;
	const contextValue = contextTokens === null || contextTokens === undefined
		? "unknown"
		: `${contextTokens.toLocaleString()} / ${contextWindow?.toLocaleString() ?? "?"}`;
	const contextDescription = contextPercent === null || contextPercent === undefined
		? "The percentage is not currently available."
		: `${contextPercent.toFixed(1)}% of the model's context window is in use.`;

	items.push({
		id: "estimated-request-size",
		label: "estimated request",
		description: `Approximate Pi-visible input from the system prompt, active tool definitions, and conversation. ${estimatedPercent?.toFixed(1) ?? "?"}% of the model's context window. Provider serialization and provider-side additions can change the actual count.`,
		currentValue: `~${estimatedRequestTokens.toLocaleString()} / ${contextWindow?.toLocaleString() ?? "?"}`,
	});
	items.push({
		id: "pi-context-usage",
		label: "Pi context usage",
		description: `Pi's usage derived from the latest assistant response plus trailing messages. It can be zero before the first model response or unknown immediately after compaction and should not be added to the component rows. ${contextDescription}`,
		currentValue: contextValue,
	});
	items.push({
		id: "system-prompt-size",
		label: "system prompt",
		description: `${systemPrompt.length.toLocaleString()} characters in Pi's current effective system prompt, including base instructions, context files, visible skills, and extension changes from the latest turn.`,
		currentValue: `~${systemPromptTokens.toLocaleString()} tokens`,
	});
	items.push({
		id: "conversation-size",
		label: "conversation",
		description: `Approximate size of ${conversationMessages.length.toLocaleString()} context-visible messages on the active, compaction-aware session branch.`,
		currentValue: `~${conversationTokens.toLocaleString()} tokens`,
	});
	items.push({
		id: "tool-definitions-size",
		label: "tool definitions",
		description: `Approximate serialized size of ${activeTools.length.toLocaleString()} active tool definitions. Provider-specific schema formatting may change the actual token count.`,
		currentValue: `~${toolTokens.toLocaleString()} tokens`,
	});

	const selectedSkills = (options.skills ?? []).map((skill) => ({
		...skill,
		disableModelInvocation: skillMode(skill, config) === "user only",
	}));
	const agentSkills = selectedSkills.filter((skill) => !skill.disableModelInvocation);
	for (const skill of agentSkills) {
		items.push({
			id: `skill:${skill.name}`,
			label: `skill • ${skill.name}`,
			description: skill.description,
			currentValue: "visible",
		});
	}
	if (agentSkills.length === 0) {
		items.push({
			id: "skills:none",
			label: "skills",
			description: "No skill names or descriptions are included in the model context.",
			currentValue: "none visible",
		});
	}

	const contextFiles = options.contextFiles ?? [];
	for (const file of contextFiles) {
		items.push({
			id: `context-file:${file.path}`,
			label: `context • ${file.path}`,
			description: `${file.content.length.toLocaleString()} source characters loaded by Pi outside the context manager extension. This content is included in the system prompt row.`,
			currentValue: `~${Math.ceil(file.content.length / 4).toLocaleString()} tokens`,
		});
	}
	if (contextFiles.length === 0) {
		items.push({
			id: "context-files:none",
			label: "context files",
			description: "Pi did not load any context files outside this extension.",
			currentValue: "none loaded",
		});
	}

	const hasRead = !options.selectedTools || options.selectedTools.includes("read");
	const skillCatalog = hasRead ? formatSkillsForPrompt(selectedSkills) : "";
	const managedCharacters = formatRules(activeRules).length + skillCatalog.length;
	const managedTokens = Math.ceil(managedCharacters / 4);
	items.push({
		id: "managed-context-size",
		label: "context manager",
		description: `${managedCharacters.toLocaleString()} characters from injected rules and the visible skill catalog. This is already included in the system prompt and estimated request rows. Rule matching is project-wide.`,
		currentValue: `~${managedTokens.toLocaleString()} tokens`,
	});
	items.push(...ruleItems);

	return items;
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
	readOnly = false,
): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify(`/${title.toLowerCase()} requires TUI mode`, "error");
		return;
	}

	await ctx.ui.custom((tui, theme, _keybindings, done) => {
		const container = new Container();
		container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 1));

		const settingsTheme = getSettingsListTheme();
		const listTheme = readOnly
			? {
				...settingsTheme,
				hint: (text: string) => settingsTheme.hint(text.replace("Enter/Space to change · ", "")),
			}
			: settingsTheme;
		const settings = new SettingsList(
			items,
			Math.min(items.length + 2, 18),
			listTheme,
			onChange,
			() => done(undefined),
			{ enableSearch: true },
		);
		container.addChild(settings);

		return {
			render: (width: number) => container.render(width),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				const isReadOnlyAction = readOnly && (
					_keybindings.matches(data, "tui.select.confirm") || data === " "
				);
				if (!isReadOnlyAction) settings.handleInput(data);
				tui.requestRender();
			},
		};
	});
}

/** Adds conditional rules and context visibility controls to Pi. */
export default function contextManagerExtension(pi: ExtensionAPI): void {
	let config = loadConfig();
	let rules = loadRules();
	const projectFilesByCwd = new Map<string, Promise<string[]>>();
	let matchingRulePaths = new Set<string>();
	const getProjectFiles = (cwd: string): Promise<string[]> => {
		const cached = projectFilesByCwd.get(cwd);
		if (cached) return cached;
		const pending = listProjectFiles(cwd);
		projectFilesByCwd.set(cwd, pending);
		return pending;
	};
	const refreshRuleMatches = async (cwd: string): Promise<string[]> => {
		const projectFiles = await getProjectFiles(cwd);
		matchingRulePaths = new Set(
			rules
				.filter((rule) => ruleMatchesProject(rule, projectFiles))
				.map((rule) => rule.relativePath),
		);
		return projectFiles;
	};

	pi.registerCommand("context", {
		description: "Inspect model context sources and estimated sizes",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/context requires TUI mode", "error");
				return;
			}

			rules = loadRules();
			await refreshRuleMatches(ctx.cwd);
			const items = await buildContextItems(pi, ctx, config, rules, getProjectFiles);
			await showSettings("Context", items, () => {}, ctx, true);
		},
	});

	pi.registerCommand("rules", {
		description: "Enable or disable conditional rule files",
		handler: async (_args, ctx) => {
			rules = loadRules();
			const projectFiles = await refreshRuleMatches(ctx.cwd);
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

	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig();
		rules = loadRules();
		projectFilesByCwd.clear();
		await refreshRuleMatches(ctx.cwd);
	});

	pi.on("before_agent_start", (event) => {
		const activeRules = rules.filter(
			(rule) => isRuleEnabled(rule, config) && matchingRulePaths.has(rule.relativePath),
		);
		const promptWithSelectedSkills = applySkillVisibility(event.systemPrompt, event.systemPromptOptions, config);
		return { systemPrompt: `${promptWithSelectedSkills}${formatRules(activeRules)}` };
	});
}
