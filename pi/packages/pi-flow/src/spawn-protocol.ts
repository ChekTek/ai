/** Cooperative spawn-event channel other extensions can emit on `pi.events`. */
export const FLOW_SPAWN_CHANNEL = "pi-flow:spawn:v1";

/** Lifecycle of a spawned task or process. */
export type FlowSpawnState = "aborted" | "completed" | "failed" | "queued" | "running";

/** Kind of spawned work. */
export type FlowSpawnType = "process" | "subagent" | "task";

/** Versioned spawn payload other extensions can emit. */
export interface FlowSpawnEvent {
	/** Protocol version. */
	version: 1;
	/** Parent tool call or node id. */
	parentId: string;
	/** Stable task identity. */
	taskId: string;
	/** Lifecycle state. */
	state: FlowSpawnState;
	/** Human label. */
	label?: string;
	/** Spawn kind. */
	type?: FlowSpawnType;
	/** Optional nested message previews. */
	messages?: FlowSpawnMessage[];
}

/** Nested message reported by a spawned task. */
export interface FlowSpawnMessage {
	/** Stable message id within the task. */
	id: string;
	/** Message role. */
	role: "assistant" | "tool" | "user";
	/** Short preview. */
	text?: string;
	/** Nested tool name, when the role is tool. */
	toolName?: string;
}

/**
 * Narrow an unknown event-bus payload to a v1 spawn event.
 * @param data Event payload.
 * @returns The spawn event, or undefined when the payload is not understood.
 */
export function asSpawnEvent(data: unknown): FlowSpawnEvent | undefined {
	if (typeof data !== "object" || data === null) {
		return undefined;
	}

	const record = data as Record<string, unknown>;
	if (record.version !== 1 || typeof record.parentId !== "string" || typeof record.taskId !== "string") {
		return undefined;
	}

	const state = record.state;
	if (state !== "queued" && state !== "running" && state !== "completed" && state !== "aborted" && state !== "failed") {
		return undefined;
	}

	return {
		version: 1,
		parentId: record.parentId,
		taskId: record.taskId,
		state,
		label: typeof record.label === "string" ? record.label : undefined,
		type: record.type === "process" || record.type === "subagent" || record.type === "task" ? record.type : "task",
		messages: Array.isArray(record.messages) ? record.messages.filter(isSpawnMessage) : undefined,
	};
}

/**
 * Narrow a nested spawn message.
 * @param value Candidate message.
 * @returns True when the value is a spawn message.
 */
function isSpawnMessage(value: unknown): value is FlowSpawnMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const record = value as Record<string, unknown>;
	return typeof record.id === "string" && (record.role === "assistant" || record.role === "tool" || record.role === "user");
}
