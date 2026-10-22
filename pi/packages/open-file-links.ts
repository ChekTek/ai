// Makes Markdown links to local files open in the system default app.
//
// Agents often link files as `[name](src/file.ts#L12)` or `[name](/abs/file.ts:12)`.
// Pi passes those hrefs unchanged to OSC 8 and, in fullscreen mode, to `open`
// (or `xdg-open` / `rundll32`), which cannot resolve relative paths, `~`, or
// line suffixes. This transformer rewrites only the rendered Markdown so links
// to existing files point at absolute `file://` URLs. Stored messages and model
// context are unchanged.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getCapabilities, Marked, type Tokens } from "@earendil-works/pi-tui";

const markdownParser = new Marked();

/** Rewrites local file links in rendered Markdown to absolute `file://` URLs. */
export default function openFileLinksExtension(pi: ExtensionAPI): void {
	let cwd = process.cwd();

	pi.on("session_start", (_event, ctx) => {
		cwd = ctx.cwd;
	});

	pi.registerMarkdownTransformer((markdown) => {
		// Without OSC 8, Pi prints the href beside the label, so keep the original.
		if (!getCapabilities().hyperlinks || !markdown.includes("]")) return markdown;
		return rewriteFileLinks(markdown, cwd);
	});
}

function rewriteFileLinks(markdown: string, cwd: string): string {
	// Top-level token raws concatenate to the normalized source, which lets each
	// link be replaced inside its own block instead of matching code blocks.
	const tokens = markdownParser.lexer(markdown);
	let output = "";

	for (const token of tokens) {
		let block = token.raw;
		let cursor = 0;
		markdownParser.walkTokens([token], (child) => {
			if (child.type !== "link") return;
			const link = child as Tokens.Link;
			const url = toFileUrl(link.href, cwd);
			const start = block.indexOf(link.raw, cursor);
			if (!url || start < 0) return;

			const replacement = `[${link.text}](<${url}>)`;
			block = block.slice(0, start) + replacement + block.slice(start + link.raw.length);
			cursor = start + replacement.length;
		});
		output += block;
	}
	return output;
}

/** Resolves an href to an existing local path, ignoring line and fragment suffixes. */
function toFileUrl(href: string, cwd: string): string | undefined {
	if (!href || href.startsWith("#") || href.startsWith("file:")) return;

	const withoutFragment = href.replace(/#.*$/, "");
	// Matches editor-style line suffixes such as `:12` or `:12:4`.
	const withoutLine = withoutFragment.replace(/:\d+(?::\d+)?$/, "");
	for (const candidate of new Set([href, withoutFragment, withoutLine, safeDecode(withoutLine)])) {
		if (!candidate) continue;
		const expanded = candidate === "~" || candidate.startsWith("~/") ? homedir() + candidate.slice(1) : candidate;
		const path = resolve(cwd, expanded);
		if (existsSync(path)) return pathToFileURL(path).href;
	}
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
