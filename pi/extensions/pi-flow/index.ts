import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { FlowService } from "./src/flow-service.ts";
import type { FlowAgentMessage } from "./src/messages.ts";
import { getProcessState } from "./src/process-state.ts";

/**
 * Register the pi-flow conversation canvas.
 *
 * `/flow` starts a localhost-only browser canvas for the active session, streams
 * message and tool lifecycle updates to it, and tears the server down whenever Pi
 * shuts the session runtime down.
 * @param pi Extension API supplied by Pi.
 */
export default function piFlowExtension(pi: ExtensionAPI): void {
	const service = new FlowService(pi);

	pi.registerCommand("flow", {
		description: "Open or focus the pi-flow conversation graph for this session",
		getArgumentCompletions: (prefix) => {
			const items = [
				{ value: "open", label: "open — start or focus the canvas" },
				{ value: "stop", label: "stop — close the canvas server" },
				{ value: "status", label: "status — show the canvas URL" },
			];
			const matches = items.filter((item) => item.value.startsWith(prefix));

			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => handleCommand(service, args, ctx),
	});

	pi.on("session_start", async (_event, ctx) => {
		service.live.reset();
		if (!getProcessState().enabled) {
			return;
		}

		try {
			await service.start(ctx);
			service.publish(ctx);
		} catch (error) {
			notify(ctx, `pi-flow could not restart: ${describeError(error)}`, "error");
		}
	});

	pi.on("session_shutdown", async (event) => {
		if (event.reason === "quit") {
			getProcessState().enabled = false;
		}

		await service.stop(`session ${event.reason}`);
	});

	pi.on("agent_start", (_event, ctx) => {
		service.live.busy = true;
		service.schedule(ctx);
	});

	pi.on("agent_settled", (_event, ctx) => {
		service.live.busy = false;
		service.publish(ctx);
	});

	pi.on("message_start", (event, ctx) => {
		trackMessage(service, event.message, false);
		service.schedule(ctx);
	});

	pi.on("message_update", (event, ctx) => {
		trackMessage(service, event.message, false);
		service.schedule(ctx);
	});

	pi.on("message_end", (event, ctx) => {
		trackMessage(service, event.message, true);
		service.schedule(ctx);
	});

	pi.on("tool_execution_start", (event, ctx) => {
		service.live.startTool(event.toolCallId, event.toolName, event.args);
		service.publish(ctx);
	});

	pi.on("tool_execution_update", (event, ctx) => {
		service.live.updateTool(event.toolCallId, event.partialResult);
		service.schedule(ctx);
	});

	pi.on("tool_execution_end", (event, ctx) => {
		service.live.endTool(event.toolCallId, event.result, event.isError);
		service.publish(ctx);
	});

	pi.on("turn_start", (_event, ctx) => service.schedule(ctx));
	pi.on("turn_end", (_event, ctx) => service.schedule(ctx));
	pi.on("input", (event) => {
		service.live.context.noteInput(event.text);
	});
	pi.on("before_agent_start", (event) => {
		service.live.context.notePromptOptions(event.systemPromptOptions);
	});
	pi.on("context", (event, ctx) => {
		service.live.context.capture(event.messages, ctx);
		service.schedule(ctx);
	});
	pi.on("session_compact", (event, ctx) => {
		service.live.context.noteCompaction(event.compactionEntry.id, event.reason);
		service.publish(ctx);
	});
	pi.on("session_tree", (_event, ctx) => service.publish(ctx));
	pi.on("session_info_changed", (_event, ctx) => service.publish(ctx));
	pi.on("model_select", (_event, ctx) => service.publish(ctx));
}

/**
 * Run the `/flow` command.
 * @param service Canvas service for the active session.
 * @param args Raw command arguments.
 * @param ctx Command context.
 */
async function handleCommand(service: FlowService, args: string, ctx: ExtensionCommandContext): Promise<void> {
	const action = args.trim().toLowerCase();

	switch (action) {
		case "stop": {
			getProcessState().enabled = false;
			await service.stop("stopped by /flow stop");
			notify(ctx, "pi-flow canvas stopped.", "info");
			return;
		}
		case "status": {
			const url = service.url;
			notify(ctx, url ? `pi-flow canvas: ${url}` : "pi-flow canvas is not running.", "info");
			return;
		}
		default: {
			try {
				const url = await service.open(ctx);
				service.publish(ctx);
				notify(ctx, `pi-flow canvas: ${url}`, "info");
			} catch (error) {
				notify(ctx, `pi-flow could not start: ${describeError(error)}`, "error");
			}
		}
	}
}

/**
 * Record message lifecycle updates that Pi has not persisted yet.
 *
 * Tool results are ignored because tool nodes already carry their own execution
 * state, and other roles are persisted before the graph is next rebuilt.
 * @param service Canvas service for the active session.
 * @param message Message from the lifecycle event.
 * @param settled Whether the message finished streaming.
 */
function trackMessage(service: FlowService, message: FlowAgentMessage, settled: boolean): void {
	if (message.role !== "user" && message.role !== "assistant") {
		return;
	}

	service.live.trackMessage(message, settled);
}

/**
 * Show a notification when the current mode has a UI.
 * @param ctx Extension context.
 * @param message Message to show.
 * @param level Notification level.
 */
function notify(ctx: ExtensionContext, message: string, level: "error" | "info" | "warning"): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
	}
}

/**
 * Describe an unknown thrown value.
 * @param error Thrown value.
 * @returns Human readable message.
 */
function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
