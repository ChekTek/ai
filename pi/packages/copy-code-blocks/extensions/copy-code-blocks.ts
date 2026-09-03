import { randomUUID } from "node:crypto";

import { copyToClipboard, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	type Component,
	getCapabilities,
	hyperlink,
	Marked,
	Markdown,
	type MarkdownTheme,
	setCapabilities,
	type Token,
	type Tokens,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

const COPY_URL_PREFIX = "pi-copy-code://";
const COPY_WIDGET_KEY = "copy-code-blocks";
const LANGUAGE_NAMES: Record<string, string> = {
	bash: "bash",
	c: "c",
	"c++": "c++",
	cjs: "javascript",
	cpp: "c++",
	cs: "c#",
	csharp: "c#",
	dockerfile: "docker",
	ex: "elixir",
	exs: "elixir",
	go: "go",
	gql: "graphql",
	h: "c",
	hpp: "c++",
	hs: "haskell",
	htm: "html",
	js: "javascript",
	jsx: "javascript",
	kt: "kotlin",
	kts: "kotlin",
	md: "markdown",
	mjs: "javascript",
	objc: "objective-c",
	pl: "perl",
	ps1: "powershell",
	py: "python",
	rb: "ruby",
	rs: "rust",
	sh: "shell",
	shell: "shell",
	tf: "terraform",
	text: "text",
	txt: "text",
	ts: "typescript",
	tsx: "typescript",
	yml: "yaml",
	zsh: "zsh",
};
const markdownParser = new Marked();

/** Identifies code blocks emitted by Marked. */
function isCodeBlock(token: Token): token is Tokens.Code {
	return token.type === "code";
}

/** Finds code blocks nested in lists and blockquotes, in source order. */
function findCodeBlocks(token: Token): Tokens.Code[] {
	if (token.type === "blockquote") return token.tokens.flatMap(findCodeBlocks);
	if (token.type === "list") return token.items.flatMap((item) => item.tokens.flatMap(findCodeBlocks));
	return isCodeBlock(token) ? [token] : [];
}

/** Enables OSC 8 in Zed versions that support it but Pi does not yet detect. */
function supportsHyperlinks(): boolean {
	const capabilities = getCapabilities();
	if (capabilities.hyperlinks) return true;
	if (process.env.TERM_PROGRAM?.toLowerCase() !== "zed") return false;

	setCapabilities({ ...capabilities, hyperlinks: true });
	return true;
}

/** Installs Pi fullscreen's URL activation hook and follows renderer replacements. */
function createCopyHook(tui: TUI, ctx: ExtensionContext, codeByToken: ReadonlyMap<string, string>): CopyHook {
	// Pi exposes clickable OSC 8 links but not a public URL-handler registration
	// API. TuiAltScreen stores its injected handler on this runtime property.
	const internals = tui as TUI & FullscreenTuiInternals;
	let disposed = false;
	const originalOpenUrl: FullscreenTuiInternals["openUrl"] = internals.openUrl;
	const openUrl = async (url: string) => {
		if (!url.startsWith(COPY_URL_PREFIX)) {
			originalOpenUrl?.call(tui, url);
			return;
		}

		const code = codeByToken.get(url.slice(COPY_URL_PREFIX.length));
		if (code === undefined) {
			ctx.ui.notify("That code block is no longer available", "warning");
			return;
		}

		try {
			await copyToClipboard(code);
			ctx.ui.notify("Copied code block", "info");
		} catch (error) {
			ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		}
	};
	const ensure = () => {
		if (disposed || tui.mode !== "fullscreen") return false;
		if (internals.openUrl !== openUrl) {
			internals.openUrl = openUrl;
		}
		return true;
	};

	ensure();
	return {
		ensure,
		render: () => {
			ensure();
			return [];
		},
		invalidate: () => {},
		dispose: () => {
			disposed = true;
			if (tui.mode === "fullscreen" && internals.openUrl === openUrl) internals.openUrl = originalOpenUrl;
		},
	};
}

/** Renders a theme-colored code card with a language label and copy button in its header. */
function renderCodeCard(
	markdown: MarkdownInternals,
	token: Tokens.Code,
	width: number,
	url: string,
	theme: ExtensionContext["ui"]["theme"],
): string[] {
	const sidePadding = width >= 5 ? 2 : 0;
	const codeWidth = Math.max(1, width - sidePadding * 2);
	const highlightedLines = markdown.theme.highlightCode
		? markdown.theme.highlightCode(token.text, token.lang)
		: token.text.split("\n").map((line) => markdown.theme.codeBlock(line));
	const codeLines = highlightedLines.flatMap((line) => wrapTextWithAnsi(line, codeWidth));
	const lines = [applyCodeBackground("", width, theme)];

	lines.push(applyCodeBackground(renderHeader(token.lang, width, sidePadding, url, theme), width, theme));
	lines.push(applyCodeBackground("", width, theme));
	for (const codeLine of codeLines) {
		lines.push(applyCodeBackground(`${" ".repeat(sidePadding)}${codeLine}`, width, theme));
	}
	lines.push(applyCodeBackground("", width, theme));
	return lines;
}

/** Lays out the language name on the left and the copy button on the right. */
function renderHeader(
	lang: string | undefined,
	width: number,
	sidePadding: number,
	url: string,
	theme: ExtensionContext["ui"]["theme"],
): string {
	// Plain ASCII button: copy glyphs are missing from most terminal mono fonts.
	const button = hyperlink(theme.fg("muted", "|copy|"), url);
	const copy = ` ${button} `;
	const copyWidth = visibleWidth(copy);
	const rightPadding = Math.max(0, sidePadding - 1);
	const minGap = width > sidePadding + copyWidth + rightPadding ? 1 : 0;
	const maxLanguageWidth = Math.max(0, width - sidePadding - rightPadding - copyWidth - minGap);

	let languageText = getLanguageName(lang);
	if (visibleWidth(languageText) > maxLanguageWidth) {
		languageText = maxLanguageWidth > 0 ? languageText.slice(0, maxLanguageWidth) : "";
	}
	const language = languageText ? theme.fg("muted", languageText) : "";
	const used = sidePadding + visibleWidth(language) + copyWidth + rightPadding;
	const gap = Math.max(0, width - used);
	return `${" ".repeat(sidePadding)}${language}${" ".repeat(gap)}${copy}${" ".repeat(rightPadding)}`;
}

/** Expands fence tags to readable language names, falling back to the tag itself. */
function getLanguageName(lang: string | undefined): string {
	const tag = lang?.trim().split(/\s+/)[0]?.toLowerCase();
	if (!tag) return "text";
	return LANGUAGE_NAMES[tag] ?? tag;
}

function applyCodeBackground(content: string, width: number, theme: ExtensionContext["ui"]["theme"]): string {
	const padding = " ".repeat(Math.max(0, width - visibleWidth(content)));
	return theme.bg("userMessageBg", `${content}${padding}`);
}

/** Replaces Pi's fenced presentation for registered blocks while preserving syntax highlighting. */
function installCodeRenderer(
	ctx: ExtensionContext,
	codeTokensByRenderedCode: ReadonlyMap<string, string[]>,
	isReady: () => boolean,
): () => void {
	const prototype = Markdown.prototype as MarkdownPrototype;
	const originalRenderToken = prototype.renderToken;
	const tokenUsage = new Map<string, number>();
	const renderToken: MarkdownRenderToken = function (token, width, nextTokenType, styleContext) {
		if (!isCodeBlock(token) || !isReady()) {
			return originalRenderToken.call(this, token, width, nextTokenType, styleContext);
		}

		const tokens = codeTokensByRenderedCode.get(token.text);
		if (!tokens || tokens.length === 0) {
			return originalRenderToken.call(this, token, width, nextTokenType, styleContext);
		}

		const usageIndex = tokenUsage.get(token.text) ?? 0;
		tokenUsage.set(token.text, usageIndex + 1);
		const copyToken = tokens[usageIndex % tokens.length];

		const url = `${COPY_URL_PREFIX}${copyToken}`;
		const lines = renderCodeCard(this, token, width, url, ctx.ui.theme);
		if (nextTokenType && nextTokenType !== "space") lines.push("");
		return lines;
	};
	prototype.renderToken = renderToken;

	return () => {
		if (prototype.renderToken === renderToken) prototype.renderToken = originalRenderToken;
	};
}

/** Makes rendered code blocks copyable from Pi's fullscreen transcript. */
export default function copyCodeBlocksExtension(pi: ExtensionAPI): void {
	const codeByToken = new Map<string, string>();
	const codeTokensByRenderedCode = new Map<string, string[]>();
	let copyHook: CopyHook | undefined;
	let disposeCodeRenderer = () => {};

	const registerCode = (code: string, renderedCode: string) => {
		const token = randomUUID();
		codeByToken.set(token, code);
		const tokens = codeTokensByRenderedCode.get(renderedCode);
		if (tokens) {
			tokens.push(token);
		} else {
			codeTokensByRenderedCode.set(renderedCode, [token]);
		}
	};

	pi.registerMarkdownTransformer((markdown, context) => {
		if (context.isStreaming || context.messageType === "assistant-thinking") return markdown;
		if (!supportsHyperlinks() || !copyHook?.ensure()) return markdown;

		const codeBlocks = markdownParser.lexer(markdown).flatMap(findCodeBlocks);
		const renderedCodeBlocks = markdownParser.lexer(markdown.replace(/\t/g, "   ")).flatMap(findCodeBlocks);
		for (const [index, codeBlock] of codeBlocks.entries()) {
			registerCode(codeBlock.text, renderedCodeBlocks[index]?.text ?? codeBlock.text);
		}
		return markdown;
	});

	pi.on("session_start", (_event, ctx) => {
		disposeCodeRenderer();
		codeByToken.clear();
		codeTokensByRenderedCode.clear();
		if (ctx.mode !== "tui") return;

		ctx.ui.setWidget(
			COPY_WIDGET_KEY,
			(tui) => {
				copyHook = createCopyHook(tui, ctx, codeByToken);
				return copyHook;
			},
			{ placement: "aboveEditor" },
		);
		disposeCodeRenderer = installCodeRenderer(ctx, codeTokensByRenderedCode, () => copyHook?.ensure() ?? false);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.mode === "tui") ctx.ui.setWidget(COPY_WIDGET_KEY, undefined);
		disposeCodeRenderer();
		disposeCodeRenderer = () => {};
		copyHook = undefined;
		codeByToken.clear();
		codeTokensByRenderedCode.clear();
	});
}

interface CopyHook extends Component {
	ensure(): boolean;
	dispose(): void;
}

interface FullscreenTuiInternals {
	openUrl?: (url: string) => void;
}

interface MarkdownInternals {
	theme: MarkdownTheme;
}

interface MarkdownStyleContext {
	applyText(text: string): string;
	stylePrefix: string;
}

type MarkdownRenderToken = (
	this: MarkdownInternals,
	token: Token,
	width: number,
	nextTokenType?: string,
	styleContext?: MarkdownStyleContext,
) => string[];

interface MarkdownPrototype {
	renderToken: MarkdownRenderToken;
}
