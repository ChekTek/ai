import {
	formatSize,
	resizeImage,
	truncateHead,
	type TruncationResult,
} from "@earendil-works/pi-coding-agent";
import type { FetchPageResult } from "./fetch-page.ts";
import { err, ok, type Result } from "./result.ts";
import type { SearchWebResult } from "./search-web.ts";
import { TOOL_OUTPUT_MAX_BYTES, TOOL_OUTPUT_MAX_LINES } from "./settings.ts";
import { writeTempTextFile } from "./temp.ts";
import type { SearchDepth, SearchProviderName, WebFetchFormat } from "./types.ts";
import type { NormalizedSearchResult } from "./providers/types.ts";

export interface ToolOutputStore {
	writeTextFile(prefix: string, fileName: string, content: string): Promise<Result<string, ToolOutputStoreError>>;
}

export type ToolOutputStoreError = { readonly _tag: "TempFileWriteFailed"; readonly cause: unknown };

export class TempFileToolOutputStore implements ToolOutputStore {
	/** Write full tool output to a temporary text file. */
	async writeTextFile(prefix: string, fileName: string, content: string): Promise<Result<string, ToolOutputStoreError>> {
		try {
			return ok(await writeTempTextFile(prefix, fileName, content));
		} catch (cause: unknown) {
			return err({ _tag: "TempFileWriteFailed", cause });
		}
	}
}

export type PiTextContent = { readonly type: "text"; readonly text: string };
export type PiImageContent = { readonly type: "image"; readonly data: string; readonly mimeType: string };

export interface PiToolResult<Details> {
	readonly content: Array<PiTextContent | PiImageContent>;
	readonly details: Details;
}

export interface WebFetchDetails {
	readonly requestedUrl: string;
	readonly finalUrl: string;
	readonly format: WebFetchFormat;
	readonly status: number;
	readonly mime: string;
	readonly contentType: string;
	readonly charset?: string;
	readonly decoder?: string;
	readonly bytes: number;
	readonly image?: boolean;
	readonly truncated?: boolean;
	readonly fullOutputPath?: string;
}

export interface WebSearchDetails {
	readonly query: string;
	readonly depth: SearchDepth;
	readonly maxResults: number;
	readonly provider: SearchProviderName;
	readonly resultCount: number;
	readonly truncated?: boolean;
	readonly fullOutputPath?: string;
	readonly results: readonly NormalizedSearchResult[];
}

interface ProjectedTextOutput {
	readonly text: string;
	readonly truncated: boolean;
	readonly fullOutputPath?: string;
	readonly truncation: TruncationResult;
}

/** Project a fetch-page service result to a Pi tool result with truncation protection. */
export async function projectFetchPageResultToPiToolResult(
	result: FetchPageResult,
	store: ToolOutputStore,
): Promise<Result<PiToolResult<WebFetchDetails>, ToolOutputStoreError>> {
	if (result._tag === "Image") {
		const resized = await resizeImage(result.data, result.mime);
		if (resized) {
			return ok({
				content: [
					textContent(
						`Fetched image from ${result.finalUrl} (${resized.mimeType}, ${resized.width}x${resized.height})`,
					),
					imageContent(resized.data, resized.mimeType),
				],
				details: {
					requestedUrl: result.requestedUrl,
					finalUrl: result.finalUrl,
					format: result.format,
					status: result.status,
					mime: resized.mimeType,
					contentType: result.contentType,
					bytes: result.bytes,
					image: true,
				},
			});
		}

		return ok({
			content: [
				textContent(
					`Fetched image from ${result.finalUrl} (${result.mime || "image"}, ${formatSize(result.bytes)}). Could not inline the image; open the URL.`,
				),
			],
			details: {
				requestedUrl: result.requestedUrl,
				finalUrl: result.finalUrl,
				format: result.format,
				status: result.status,
				mime: result.mime,
				contentType: result.contentType,
				bytes: result.bytes,
				image: true,
			},
		});
	}

	const truncated = await projectTextOutput(result.text, {
		store,
		tempPrefix: "pi-webfetch-",
		fileName: "output.txt",
	});
	if (truncated._tag === "err") {
		return truncated;
	}

	return ok({
		content: [textContent(truncated.value.text)],
		details: {
			requestedUrl: result.requestedUrl,
			finalUrl: result.finalUrl,
			format: result.format,
			status: result.status,
			mime: result.mime,
			contentType: result.contentType,
			charset: result.charset,
			decoder: result.decoder,
			bytes: result.bytes,
			truncated: truncated.value.truncated,
			fullOutputPath: truncated.value.fullOutputPath,
		},
	});
}

/** Project a search-web service result to a Pi tool result with truncation protection. */
export async function projectSearchWebResultToPiToolResult(
	result: SearchWebResult,
	store: ToolOutputStore,
): Promise<Result<PiToolResult<WebSearchDetails>, ToolOutputStoreError>> {
	const output = formatSearchResults(result.query, result.results);
	const truncated = await projectTextOutput(output, {
		store,
		tempPrefix: "pi-websearch-",
		fileName: "output.txt",
	});
	if (truncated._tag === "err") {
		return truncated;
	}

	return ok({
		content: [textContent(truncated.value.text)],
		details: {
			query: result.query,
			depth: result.depth,
			maxResults: result.maxResults,
			provider: result.provider,
			resultCount: result.results.length,
			truncated: truncated.value.truncated,
			fullOutputPath: truncated.value.fullOutputPath,
			results: result.results,
		},
	});
}

/** Format normalized search results as URL-forward text for LLM consumption. */
export function formatSearchResults(query: string, results: readonly NormalizedSearchResult[]): string {
	if (results.length === 0) {
		return `Search results for: ${query}\n\nNo results found.`;
	}

	const lines = [`Search results for: ${query}`, ""];
	for (const [index, result] of results.entries()) {
		lines.push(`${index + 1}. ${result.title}`);
		lines.push(`   URL: ${result.url}`);
		const snippet = snippetForModel(result.snippet);
		if (snippet) {
			lines.push(`   ${snippet}`);
		}
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

const SEARCH_SNIPPET_MAX_CHARS = 200;

function snippetForModel(snippet: string | undefined): string | undefined {
	if (!snippet) {
		return undefined;
	}
	const collapsed = snippet.replace(/\s+/g, " ").trim();
	if (!collapsed) {
		return undefined;
	}
	if (collapsed.length <= SEARCH_SNIPPET_MAX_CHARS) {
		return collapsed;
	}
	return `${collapsed.slice(0, SEARCH_SNIPPET_MAX_CHARS - 3).trimEnd()}...`;
}

async function projectTextOutput(
	output: string,
	options: { readonly store: ToolOutputStore; readonly tempPrefix: string; readonly fileName: string },
): Promise<Result<ProjectedTextOutput, ToolOutputStoreError>> {
	const truncation = truncateHead(output, {
		maxBytes: TOOL_OUTPUT_MAX_BYTES,
		maxLines: TOOL_OUTPUT_MAX_LINES,
	});

	if (!truncation.truncated) {
		return ok({ text: truncation.content, truncated: false, truncation });
	}

	const fullOutputPath = await options.store.writeTextFile(options.tempPrefix, options.fileName, output);
	if (fullOutputPath._tag === "err") {
		return fullOutputPath;
	}

	const omittedLines = truncation.totalLines - truncation.outputLines;
	const omittedBytes = truncation.totalBytes - truncation.outputBytes;
	let text = truncation.content;
	text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	text += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
	text += ` Full output saved to: ${fullOutputPath.value}. Use read on that path for the rest.]`;

	return ok({ text, truncated: true, fullOutputPath: fullOutputPath.value, truncation });
}

function textContent(text: string): PiTextContent {
	return { type: "text", text };
}

function imageContent(data: string, mimeType: string): PiImageContent {
	return { type: "image", data, mimeType };
}
