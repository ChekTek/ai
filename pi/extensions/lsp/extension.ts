import path from "node:path";

import {
	isEditToolResult,
	isWriteToolResult,
	type ExtensionAPI,
	type ToolResultEvent,
} from "@earendil-works/pi-coding-agent";

import { LSP_STATUS_KEY, LspSession } from "./client.ts";

/**
 * Appends capped LSP errors onto write/edit results. No extra model tools.
 * @param pi Extension API supplied by Pi.
 */
export default function lspExtension(pi: ExtensionAPI): void {
	const session = new LspSession();

	pi.registerCommand("lsp", {
		description: "Show configured language servers and whether each command is on PATH",
		handler: async (_args, ctx) => {
			ctx.ui.notify(await session.statusMessage(ctx.cwd), "info");
		},
	});

	pi.on("session_start", async () => {
		await session.reset();
	});

	pi.on("session_shutdown", async () => {
		await session.reset();
	});

	pi.on("tool_result", async (event, ctx) => {
		const filePath = mutationPath(event, ctx.cwd);
		if (!filePath) return;

		const block = await session.errorBlock(
			filePath,
			ctx.cwd,
			ctx.signal,
			(value) => ctx.ui.setStatus(LSP_STATUS_KEY, value),
		);
		if (!block) return;
		return { content: appendText(event.content, block) };
	});
}

function mutationPath(event: ToolResultEvent, cwd: string): string | undefined {
	if (event.isError) return undefined;
	if (!isEditToolResult(event) && !isWriteToolResult(event)) return undefined;
	const rawPath = event.input.path;
	if (typeof rawPath !== "string" || rawPath.length === 0) return undefined;
	return path.resolve(cwd, rawPath);
}

function appendText(
	content: ToolResultEvent["content"],
	block: string,
): ToolResultEvent["content"] {
	const next = [...content];
	const last = next.at(-1);
	if (last?.type === "text") {
		next[next.length - 1] = { type: "text", text: `${last.text}${block}` };
		return next;
	}

	next.push({ type: "text", text: block.trimStart() });
	return next;
}
