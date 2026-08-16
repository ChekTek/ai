import { accessSync, constants, existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

/** Hardcoded language-server routes. The model never sees this list. */
export const SERVERS: readonly LspServer[] = [
	{
		name: "typescript",
		command: ["typescript-language-server", "--stdio"],
		extensions: [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"],
	},
	{
		name: "mdx",
		command: ["mdx-language-server", "--stdio"],
		extensions: [".mdx"],
	},
	{
		name: "astro",
		command: ["astro-ls", "--stdio"],
		extensions: [".astro"],
	},
	{
		name: "biome",
		command: ["biome", "lsp-proxy"],
		extensions: [".css", ".html", ".json", ".jsonc"],
	},
	{
		name: "dart",
		command: ["dart", "language-server"],
		extensions: [".dart"],
		pushDiagnosticsGraceMs: 2_000,
	},
	{
		name: "rust-analyzer",
		command: ["rust-analyzer"],
		extensions: [".rs"],
		pullDiagnosticsGraceMs: 5_000,
	},
	{
		name: "clangd",
		command: ["clangd", "--background-index", "--clang-tidy"],
		extensions: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp", ".mm"],
	},
];

/** Language ids advertised in textDocument/didOpen. */
const LANGUAGE_IDS: Record<string, string> = {
	".astro": "astro",
	".c": "c",
	".cc": "cpp",
	".cjs": "javascript",
	".cpp": "cpp",
	".css": "css",
	".cts": "typescript",
	".cxx": "cpp",
	".dart": "dart",
	".h": "c",
	".hpp": "cpp",
	".html": "html",
	".js": "javascript",
	".json": "json",
	".jsonc": "jsonc",
	".jsx": "javascriptreact",
	".mdx": "mdx",
	".mjs": "javascript",
	".mm": "objective-cpp",
	".mts": "typescript",
	".rs": "rust",
	".ts": "typescript",
	".tsx": "typescriptreact",
};

/**
 * Returns the server that handles this file extension, if any.
 * @param filePath File path whose extension selects a server.
 */
export function serverForFile(filePath: string): LspServer | undefined {
	const extension = path.extname(filePath);
	return SERVERS.find((server) => server.extensions.includes(extension));
}

/**
 * Returns the LSP language id for a file, falling back to the extension name.
 * @param filePath File path to map.
 */
export function languageIdFor(filePath: string): string {
	const extension = path.extname(filePath);
	return LANGUAGE_IDS[extension] ?? extension.slice(1);
}

/**
 * Returns whether the server's executable is on PATH relative to `cwd`.
 * @param server Server whose first command token is resolved.
 * @param cwd Working directory used to resolve relative PATH entries.
 */
export function commandExists(server: LspServer, cwd: string): boolean {
	return resolveCommandPath(server.command[0] ?? "", cwd) !== undefined;
}

/**
 * Resolves an executable from PATH, including Windows PATHEXT-style suffixes.
 * @param command Executable name or path.
 * @param cwd Working directory used to resolve relative PATH entries.
 */
export function resolveCommandPath(command: string, cwd: string): string | undefined {
	if (!command) return undefined;

	const platform = process.platform;
	const extensions = platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
	if (command.includes("/") || command.includes("\\")) {
		const commandPath = path.isAbsolute(command) ? command : path.resolve(cwd, command);
		return resolveRunnableFile(commandPath, extensions, platform);
	}

	const pathValue = process.env.PATH ?? "";
	for (const directory of pathValue.split(platform === "win32" ? ";" : ":")) {
		const resolved = resolveRunnableFile(
			path.resolve(cwd, directory || ".", command),
			extensions,
			platform,
		);
		if (resolved) return resolved;
	}

	return undefined;
}

/**
 * Wraps `.bat`/`.cmd` launches on Windows so they run through `cmd.exe`.
 * `cmd.exe /s /c` takes one command string; paths with spaces must stay quoted
 * after `/s` strips the outer quotes.
 * @param command Resolved executable path.
 * @param args Arguments for that executable.
 */
export function spawnArgv(command: string, args: string[]): SpawnArgv {
	if (process.platform !== "win32" || !/\.(?:bat|cmd)$/i.test(command)) {
		return { command, args };
	}

	const comSpec = process.env.ComSpec?.trim() || "cmd.exe";
	const commandLine = [command, ...args].map(quoteCmdArgument).join(" ");
	return {
		command: comSpec,
		args: ["/d", "/s", "/c", `"${commandLine}"`],
		windowsVerbatimArguments: true,
	};
}

function quoteCmdArgument(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

function resolveRunnableFile(
	filePath: string,
	extensions: string[],
	platform: NodeJS.Platform,
): string | undefined {
	for (const extension of extensions) {
		const candidate = `${filePath}${extension}`;
		if (isRunnableFile(candidate, platform)) return candidate;
	}

	return undefined;
}

function isRunnableFile(filePath: string, platform: NodeJS.Platform): boolean {
	if (!existsSync(filePath)) return false;

	try {
		if (!statSync(filePath).isFile()) return false;
		if (platform !== "win32") accessSync(filePath, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

interface SpawnArgv {
	command: string;
	args: string[];
	windowsVerbatimArguments?: boolean;
}

/** One configured language server. */
export interface LspServer {
	name: string;
	command: string[];
	extensions: string[];
	diagnosticsSettleMs?: number;
	pushDiagnosticsGraceMs?: number;
	pullDiagnosticsGraceMs?: number;
}

/** LSP diagnostic payload used for error filtering. */
export interface LspDiagnostic {
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
	severity?: number;
	code?: string | number;
	source?: string;
	message: string;
}
