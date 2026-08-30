import type { SessionMessageEntry } from "@earendil-works/pi-coding-agent";

/** Message union stored on session entries and emitted by message lifecycle events. */
export type FlowAgentMessage = SessionMessageEntry["message"];

/** Assistant message variant of {@link FlowAgentMessage}. */
export type FlowAssistantMessage = Extract<FlowAgentMessage, { role: "assistant" }>;

/** Tool result message variant of {@link FlowAgentMessage}. */
export type FlowToolResultMessage = Extract<FlowAgentMessage, { role: "toolResult" }>;

/** Content block carried by messages. Narrowed structurally by the `type` field. */
type ContentBlock = {
	type: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	arguments?: unknown;
};

/** A tool call requested by an assistant message. */
export interface ToolCallBlock {
	/** Provider-assigned tool call id, matching `tool_execution_*` events. */
	id: string;
	/** Tool name. */
	name: string;
	/** Raw tool arguments. */
	arguments: unknown;
}

/**
 * Collapse whitespace so previews stay on a predictable number of card lines.
 * @param value Raw text.
 * @returns Text with runs of whitespace replaced by single spaces.
 */
function collapseWhitespace(value: string): string {
	// Matches any run of whitespace, including newlines, so multi-line bodies fit one card line.
	return value.replace(/\s+/g, " ").trim();
}

/**
 * Shorten text to a maximum length, appending an ellipsis when truncated.
 * @param value Raw text.
 * @param max Maximum number of characters to keep.
 * @returns Truncated text.
 */
export function truncate(value: string, max: number): string {
	const trimmed = value.trim();
	if (trimmed.length <= max) {
		return trimmed;
	}

	return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Build a single-line card preview from arbitrary text.
 * @param value Raw text.
 * @param max Maximum number of characters to keep.
 * @returns Collapsed and truncated text.
 */
export function preview(value: string, max = 220): string {
	return truncate(collapseWhitespace(value), max);
}

/**
 * Read the content blocks of a message as a plain array.
 * @param content Message content, which may be a bare string.
 * @returns Content blocks, or an empty array when the content is a string.
 */
function toBlocks(content: unknown): ContentBlock[] {
	return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

/**
 * Extract the visible text of a message, ignoring thinking and tool calls.
 * @param content Message content.
 * @returns Concatenated text blocks.
 */
export function textOf(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}

	return toBlocks(content)
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text ?? "")
		.join("\n");
}

/**
 * Extract the reasoning text of a message.
 * @param content Message content.
 * @returns Concatenated thinking blocks.
 */
export function thinkingOf(content: unknown): string {
	return toBlocks(content)
		.filter((block) => block.type === "thinking" && typeof block.thinking === "string")
		.map((block) => block.thinking ?? "")
		.join("\n");
}

/**
 * Extract the tool calls requested by an assistant message.
 * @param content Message content.
 * @returns Tool call blocks in assistant source order.
 */
export function toolCallsOf(content: unknown): ToolCallBlock[] {
	return toBlocks(content)
		.filter((block) => block.type === "toolCall" && typeof block.id === "string")
		.map((block) => ({
			id: block.id ?? "",
			name: block.name ?? "tool",
			arguments: block.arguments,
		}));
}

/**
 * Count the images attached to a message.
 * @param content Message content.
 * @returns Number of image blocks.
 */
export function imageCountOf(content: unknown): number {
	return toBlocks(content).filter((block) => block.type === "image").length;
}

/**
 * Summarise tool arguments into a compact subtitle such as a path or command.
 * @param args Raw tool arguments.
 * @returns Short human readable summary, or undefined when nothing useful exists.
 */
export function summariseToolArguments(args: unknown): string | undefined {
	if (args === undefined || args === null) {
		return undefined;
	}

	if (typeof args === "string") {
		return preview(args, 90);
	}

	if (typeof args !== "object") {
		return preview(String(args), 90);
	}

	const record = args as Record<string, unknown>;
	const preferredKeys = ["command", "path", "file_path", "filePath", "pattern", "query", "url", "name"];
	for (const key of preferredKeys) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) {
			return preview(value, 90);
		}
	}

	const firstString = Object.values(record).find((value) => typeof value === "string" && value.length > 0);
	return typeof firstString === "string" ? preview(firstString, 90) : undefined;
}

/**
 * Render tool arguments as pretty JSON for the inspector panel.
 * @param args Raw tool arguments.
 * @param max Maximum number of characters to keep.
 * @returns Formatted JSON, or undefined when the arguments cannot be serialised.
 */
export function formatToolArguments(args: unknown, max = 1200): string | undefined {
	if (args === undefined || args === null) {
		return undefined;
	}

	try {
		return truncate(JSON.stringify(args, null, 2), max);
	} catch {
		return undefined;
	}
}
