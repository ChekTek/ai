import { createToken } from "./flow-server.ts";

/** Canvas state that must outlive a single extension instance. */
export interface FlowProcessState {
	/** Whether `/flow` is currently enabled for this Pi process. */
	enabled: boolean;
	/** Port to reuse so open browser tabs reconnect after a reload. */
	port: number;
	/** Access token to reuse so open browser tabs stay authorised. */
	token: string;
}

/** Key used to stash canvas state on the Node global across extension reloads. */
const STATE_KEY = Symbol.for("pi-flow.process-state");

/**
 * Read the canvas state shared by every extension instance in this Pi process.
 *
 * Pi tears down and rebuilds extensions on `/reload` and on session replacement.
 * Keeping the port and token on the process global lets the rebuilt extension
 * restart the same server, so browser tabs reconnect to the same URL instead of
 * being orphaned.
 * @returns The shared state, created on first use.
 */
export function getProcessState(): FlowProcessState {
	const host = globalThis as typeof globalThis & { [STATE_KEY]?: FlowProcessState };
	const existing = host[STATE_KEY];
	if (existing) {
		return existing;
	}

	const created: FlowProcessState = { enabled: false, port: 0, token: createToken() };
	host[STATE_KEY] = created;

	return created;
}
