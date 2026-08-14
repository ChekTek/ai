import type { FlowAgentMessage } from "./messages.ts";

/** In-flight tool execution that has no persisted `toolResult` entry yet. */
export interface LiveToolExecution {
	/** Provider-assigned tool call id. */
	toolCallId: string;
	/** Tool name. */
	toolName: string;
	/** Raw tool arguments. */
	args: unknown;
	/** Whether the tool is still executing. */
	running: boolean;
	/** Whether the finished tool reported an error. */
	isError: boolean;
	/** Latest partial or final result payload. */
	result: unknown;
}

/** A message that has been emitted by the agent but is not in the session tree yet. */
export interface LiveMessage {
	/** Stable key of the form `role:timestamp`. */
	key: string;
	/** Latest snapshot of the message. */
	message: FlowAgentMessage;
	/** Whether the message finished streaming. */
	settled: boolean;
}

/**
 * Build the identity used to match a live message against a persisted entry.
 *
 * Pi keeps the message timestamp when it writes the message to the session file,
 * so `role:timestamp` is stable across the streaming and persisted forms.
 * @param message Message to key.
 * @returns Stable message key.
 */
export function messageKey(message: FlowAgentMessage): string {
	const timestamp = "timestamp" in message ? message.timestamp : 0;
	return `${message.role}:${timestamp}`;
}

/**
 * Tracks agent activity that Pi has not written to the session tree yet.
 *
 * The graph is rebuilt from persisted session entries on every change; this state
 * supplies the streaming assistant message and running tool calls that would
 * otherwise be invisible until the turn completes.
 */
export class LiveState {
	readonly #messages = new Map<string, LiveMessage>();
	readonly #tools = new Map<string, LiveToolExecution>();
	#busy = false;

	/** Whether the agent is currently running a turn. */
	public get busy(): boolean {
		return this.#busy;
	}

	public set busy(value: boolean) {
		this.#busy = value;
	}

	/** Live messages in arrival order. */
	public get messages(): readonly LiveMessage[] {
		return [...this.#messages.values()];
	}

	/**
	 * Look up a running or recently finished tool execution.
	 * @param toolCallId Provider-assigned tool call id.
	 * @returns The tracked execution, or undefined when the tool is unknown.
	 */
	public getTool(toolCallId: string): LiveToolExecution | undefined {
		return this.#tools.get(toolCallId);
	}

	/**
	 * Record or refresh a streaming message.
	 *
	 * Pi finalises an assistant message as a new object, so its timestamp can differ
	 * from the streamed partial. Only one assistant message streams at a time, so the
	 * previous assistant snapshot is replaced rather than kept alongside the new one.
	 * @param message Latest message snapshot.
	 * @param settled Whether the message finished streaming.
	 */
	public trackMessage(message: FlowAgentMessage, settled: boolean): void {
		const key = messageKey(message);
		if (message.role === "assistant") {
			for (const [existingKey, existing] of this.#messages) {
				if (existing.message.role === "assistant" && existingKey !== key) {
					this.#messages.delete(existingKey);
				}
			}
		}

		this.#messages.set(key, { key, message, settled });
	}

	/**
	 * Record the start of a tool execution.
	 * @param toolCallId Provider-assigned tool call id.
	 * @param toolName Tool name.
	 * @param args Raw tool arguments.
	 */
	public startTool(toolCallId: string, toolName: string, args: unknown): void {
		this.#tools.set(toolCallId, { toolCallId, toolName, args, running: true, isError: false, result: undefined });
	}

	/**
	 * Record streaming output for a running tool.
	 * @param toolCallId Provider-assigned tool call id.
	 * @param partialResult Latest partial result payload.
	 */
	public updateTool(toolCallId: string, partialResult: unknown): void {
		const tool = this.#tools.get(toolCallId);
		if (tool) {
			tool.result = partialResult;
		}
	}

	/**
	 * Record the completion of a tool execution.
	 * @param toolCallId Provider-assigned tool call id.
	 * @param result Final result payload.
	 * @param isError Whether the tool reported an error.
	 */
	public endTool(toolCallId: string, result: unknown, isError: boolean): void {
		const tool = this.#tools.get(toolCallId);
		if (tool) {
			tool.running = false;
			tool.isError = isError;
			tool.result = result;
		}
	}

	/**
	 * Drop live state that is now represented by persisted session entries.
	 * @param committedMessageKeys Keys of messages found in the session tree.
	 * @param committedToolCallIds Tool call ids that have a persisted `toolResult` entry.
	 */
	public prune(committedMessageKeys: ReadonlySet<string>, committedToolCallIds: ReadonlySet<string>): void {
		for (const key of this.#messages.keys()) {
			if (committedMessageKeys.has(key)) {
				this.#messages.delete(key);
			}
		}

		for (const [toolCallId, tool] of this.#tools) {
			if (!tool.running && committedToolCallIds.has(toolCallId)) {
				this.#tools.delete(toolCallId);
			}
		}
	}

	/** Forget all live state, for example when a new session replaces the current one. */
	public reset(): void {
		this.#messages.clear();
		this.#tools.clear();
		this.#busy = false;
	}
}
