import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { matchesGlob, relative, resolve, sep } from "node:path";

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

/** A loaded conditional rule. */
export interface Rule {
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

/** Persisted context-manager choices. */
export interface ContextManagerConfig {
	/** Explicit rule enablement overrides keyed by relative path. */
	rules: Record<string, boolean>;
}

/** A rule's effective state for the current project. */
export interface RuleResult extends Rule {
	/** Whether the rule is injected. */
	active: boolean;
	/** Project files matching the rule's path globs. */
	matches: string[];
	/** Why the rule is or is not injected. */
	status: "disabled" | "injected" | "not matched";
}

/** Returns the persistent configuration path below OpenCode's state directory. */
export function contextManagerConfigPath(stateDirectory: string): string {
	return resolve(stateDirectory, "context-manager.json");
}

/** Converts an absolute path to a portable relative path. */
function portableRelativePath(root: string, filePath: string): string {
	return relative(root, filePath).split(sep).join("/");
}

/** Removes matching outer quotes from a frontmatter scalar. */
function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length < 2) return trimmed;
	const first = trimmed[0];
	const last = trimmed.at(-1);
	return first === last && (first === "\"" || first === "'") ? trimmed.slice(1, -1) : trimmed;
}

/** Parses the frontmatter fields used by conditional rules. */
function parseRule(content: string) {
	const lines = content.split("\n");
	if (lines[0]?.trim() !== "---") return { body: content, description: undefined, paths: [] };

	let description: string | undefined;
	let inPaths = false;
	let bodyStart = 0;
	const paths: string[] = [];
	for (let index = 1; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.trim() === "---") {
			bodyStart = index + 1;
			break;
		}
		if (line.startsWith("description:")) {
			description = unquote(line.slice("description:".length));
			inPaths = false;
			continue;
		}
		if (line.trim() === "paths:") {
			inPaths = true;
			continue;
		}
		const trimmed = line.trimStart();
		if (inPaths && trimmed.startsWith("- ")) {
			paths.push(unquote(trimmed.slice(2)));
			continue;
		}
		if (line.length > 0 && line[0] !== " " && line[0] !== "\t") inPaths = false;
	}
	return { body: lines.slice(bodyStart).join("\n").trim(), description, paths };
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

/** Loads all rules published for OpenCode. */
export function loadRules(configDirectory: string): Rule[] {
	const rulesDirectory = resolve(configDirectory, "rules");
	return findMarkdownFiles(rulesDirectory)
		.map((filePath) => {
			const parsed = parseRule(readFileSync(filePath, "utf8"));
			const relativePath = portableRelativePath(rulesDirectory, filePath);
			return {
				body: parsed.body,
				description: parsed.description ?? relativePath,
				filePath,
				paths: parsed.paths,
				relativePath,
			};
		})
		.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

/** Loads persisted rule choices, falling back to defaults for malformed files. */
export function loadContextManagerConfig(stateDirectory: string): ContextManagerConfig {
	const path = contextManagerConfigPath(stateDirectory);
	if (!existsSync(path)) return { rules: {} };

	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ContextManagerConfig>;
		return { rules: parsed.rules ?? {} };
	} catch {
		return { rules: {} };
	}
}

/** Atomically persists rule choices. */
export function saveContextManagerConfig(stateDirectory: string, config: ContextManagerConfig): void {
	const path = contextManagerConfigPath(stateDirectory);
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	renameSync(temporary, path);
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

/** Returns whether a path matches a rule glob. */
function pathMatchesGlob(filePath: string, pattern: string): boolean {
	try {
		return matchesGlob(filePath, pattern);
	} catch {
		return false;
	}
}

/** Evaluates each rule for a project and the persisted user choices. */
export function evaluateRules(rules: Rule[], cwd: string, config: ContextManagerConfig): RuleResult[] {
	const projectFiles = listProjectFiles(cwd);
	return rules.map((rule) => {
		const enabled = config.rules[rule.relativePath] ?? true;
		const matches = rule.paths.length === 0
			? []
			: projectFiles.filter((filePath) => rule.paths.some((pattern) => pathMatchesGlob(filePath, pattern)));
		const status = !enabled ? "disabled" : rule.paths.length === 0 || matches.length > 0 ? "injected" : "not matched";
		return { ...rule, active: status === "injected", matches, status };
	});
}

/** Formats active rules for injection into the system prompt. */
export function formatRules(results: RuleResult[]): string | undefined {
	const active = results.filter((rule) => rule.active);
	if (active.length === 0) return undefined;
	const sections = active.map(
		(rule) => `<rule path="${rule.relativePath}">\n${rule.body}\n</rule>`,
	);
	return `<conditional_rules>\n${sections.join("\n\n")}\n</conditional_rules>`;
}
