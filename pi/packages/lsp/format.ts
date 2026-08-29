import path from "node:path";

import type { LspDiagnostic } from "./servers.ts";

/** Maximum error lines appended onto a write/edit result. */
const ERROR_LINE_CAP = 20;

/** LSP Error severity. Warnings, info, and hints are dropped. */
const ERROR_SEVERITY = 1;

/**
 * Returns compact error lines for a file, or undefined when there are none.
 * @param filePath Absolute path that was just written or edited.
 * @param diagnostics Diagnostics from the language server.
 * @param cwd Session working directory, used to shorten paths.
 */
export function formatErrorBlock(
	filePath: string,
	diagnostics: LspDiagnostic[],
	cwd: string,
): string | undefined {
	const relative = path.relative(cwd, filePath);
	let displayPath = filePath;
	if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
		displayPath = relative;
	}
	const lines = diagnostics.filter(isErrorDiagnostic).map((diagnostic) => {
		const line = diagnostic.range.start.line + 1;
		const column = diagnostic.range.start.character + 1;
		const source = diagnostic.source ?? "lsp";
		const code = diagnostic.code === undefined ? "" : ` ${diagnostic.code}`;
		// Flatten whitespace so each diagnostic stays a single context line.
		const message = diagnostic.message.replace(/\s+/g, " ").trim();
		return `${displayPath}:${line}:${column}: error ${source}${code}: ${message}`;
	});

	if (lines.length === 0) return undefined;

	const shown = lines.slice(0, ERROR_LINE_CAP);
	const extra = lines.length - shown.length;
	const body = shown.join("\n");
	const header = "LSP errors detected in this file, please fix:";
	if (extra <= 0) return `\n\n${header}\n${body}`;
	return `\n\n${header}\n${body}\n… and ${extra} more`;
}

function isErrorDiagnostic(diagnostic: LspDiagnostic): boolean {
	return diagnostic.severity === undefined || diagnostic.severity === ERROR_SEVERITY;
}
