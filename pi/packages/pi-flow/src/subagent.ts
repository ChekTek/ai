import { preview, truncate } from "./messages.ts";
import type { FlowNodeStatus } from "./protocol.ts";
import type { FlowSpawnEvent, FlowSpawnState } from "./spawn-protocol.ts";

/** Parsed subagent tool details from the shipped Pi example. */
export interface SubagentDetails {
	/** Execution mode. */
	mode: "chain" | "parallel" | "single";
	/** Per-task results in source order. */
	results: SubagentResult[];
}

/** One subagent task result. */
export interface SubagentResult {
	/** Agent name. */
	agent: string;
	/** Task prompt. */
	task: string;
	/** Process exit code. */
	exitCode?: number;
	/** Stop reason from the child agent. */
	stopReason?: string;
	/** Error text. */
	errorMessage?: string;
	/** Chain step number. */
	step?: number;
	/** Nested messages, when provided. */
	messages?: { role?: string; content?: unknown }[];
}

/**
 * Parse subagent tool details from a partial or final tool result.
 * @param result Tool result payload.
 * @returns Details, or undefined when the payload is not a subagent result.
 */
export function asSubagentDetails(result: unknown): SubagentDetails | undefined {
	if (typeof result !== "object" || result === null || !("details" in result)) {
		return undefined;
	}

	const details = (result as { details?: unknown }).details;
	if (typeof details !== "object" || details === null) {
		return undefined;
	}

	const record = details as Record<string, unknown>;
	const mode = record.mode;
	if (mode !== "single" && mode !== "parallel" && mode !== "chain") {
		return undefined;
	}

	if (!Array.isArray(record.results)) {
		return undefined;
	}

	return {
		mode,
		results: record.results.map((item, index) => asSubagentResult(item, index)),
	};
}

/**
 * Map a spawn state onto a card status.
 * @param state Spawn lifecycle.
 * @returns Node status.
 */
export function spawnStatus(state: FlowSpawnState): FlowNodeStatus {
	switch (state) {
		case "queued":
		case "running":
			return "running";
		case "failed":
			return "error";
		case "aborted":
			return "aborted";
		default:
			return "success";
	}
}

/**
 * Build a card preview for a spawn event.
 * @param spawn Spawn event.
 * @returns Preview text.
 */
export function spawnPreview(spawn: FlowSpawnEvent): string | undefined {
	const last = spawn.messages?.at(-1)?.text;
	return last ? preview(last) : spawn.label;
}

/**
 * Build inspector text for a spawn event.
 * @param spawn Spawn event.
 * @returns Detail text.
 */
export function spawnDetail(spawn: FlowSpawnEvent): string | undefined {
	const lines = [spawn.label, spawn.type, spawn.state, ...(spawn.messages ?? []).map((message) => message.text ?? "")];
	const text = lines.filter(Boolean).join("\n");
	return text.length > 0 ? truncate(text, 1200) : undefined;
}

/**
 * Narrow one subagent result object.
 * @param value Candidate result.
 * @param index Fallback step index.
 * @returns A result record.
 */
function asSubagentResult(value: unknown, index: number): SubagentResult {
	if (typeof value !== "object" || value === null) {
		return { agent: "subagent", task: "", step: index + 1 };
	}

	const record = value as Record<string, unknown>;
	return {
		agent: typeof record.agent === "string" ? record.agent : "subagent",
		task: typeof record.task === "string" ? record.task : "",
		exitCode: typeof record.exitCode === "number" ? record.exitCode : undefined,
		stopReason: typeof record.stopReason === "string" ? record.stopReason : undefined,
		errorMessage: typeof record.errorMessage === "string" ? record.errorMessage : undefined,
		step: typeof record.step === "number" ? record.step : index + 1,
		messages: Array.isArray(record.messages) ? record.messages : undefined,
	};
}
