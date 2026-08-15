import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import type { WebSocket } from "ws";

import { openInBrowser } from "./browser-launcher.ts";
import { FlowServer } from "./flow-server.ts";
import { buildSnapshot } from "./graph-builder.ts";
import { computeDelta, isEmptyDelta } from "./graph-delta.ts";
import { LiveState } from "./live-state.ts";
import { getProcessState } from "./process-state.ts";
import type { FlowClientMessage, FlowDeliverAs, FlowGraph, FlowSessionInfo } from "./protocol.ts";

/** Delay used to batch bursts of streaming events into a single broadcast. */
const BROADCAST_DELAY_MS = 60;

/** Absolute path of the directory holding the browser assets. */
const WEB_ROOT = join(import.meta.dirname, "..", "web");

/**
 * Owns the session-scoped canvas: the localhost server, the live agent state, and
 * the graph revisions broadcast to connected browsers.
 */
export class FlowService {
	readonly #live = new LiveState();
	readonly #pi: ExtensionAPI;
	#server: FlowServer | undefined;
	#starting: Promise<string> | undefined;
	#stopping: Promise<void> | undefined;
	#generation = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#graph: FlowGraph | undefined;
	#session: FlowSessionInfo | undefined;
	#revision = 0;
	#latestCtx: ExtensionContext | undefined;

	/**
	 * Create the session-scoped canvas service.
	 * @param pi Extension API used to submit prompts from the graph.
	 */
	constructor(pi: ExtensionAPI) {
		this.#pi = pi;
	}

	/** Live agent state fed by the extension's event handlers. */
	public get live(): LiveState {
		return this.#live;
	}

	/** Whether a localhost server is currently listening. */
	public get running(): boolean {
		return this.#server !== undefined;
	}

	/** URL of the running canvas, or undefined when the server is stopped. */
	public get url(): string | undefined {
		return this.#server?.url;
	}

	/**
	 * Start the canvas server if needed and return the URL that opens it.
	 *
	 * Concurrent calls share a single startup, and a call made while a shutdown is
	 * in flight waits for that shutdown to finish before starting again.
	 * @param ctx Extension context for the active session.
	 * @returns The canvas URL.
	 */
	public async start(ctx: ExtensionContext): Promise<string> {
		while (this.#stopping) {
			await this.#stopping;
		}

		if (this.#server) {
			return this.#server.url;
		}

		const starting = (this.#starting ??= this.#startServer(ctx));
		try {
			return await starting;
		} finally {
			if (this.#starting === starting) {
				this.#starting = undefined;
			}
		}
	}

	/**
	 * Open or refocus the canvas in the user's browser.
	 * @param ctx Extension context for the active session.
	 * @returns The canvas URL.
	 */
	public async open(ctx: ExtensionContext): Promise<string> {
		const url = await this.start(ctx);
		openInBrowser(url);

		return url;
	}

	/**
	 * Rebuild the graph and broadcast the difference, batching rapid updates.
	 * @param ctx Extension context for the active session.
	 */
	public schedule(ctx: ExtensionContext): void {
		if (!this.#server || this.#timer) {
			return;
		}

		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			this.publish(ctx);
		}, BROADCAST_DELAY_MS);
		this.#timer.unref?.();
	}

	/**
	 * Rebuild the graph and broadcast the difference immediately.
	 * @param ctx Extension context for the active session.
	 */
	public publish(ctx: ExtensionContext): void {
		this.#latestCtx = ctx;
		const server = this.#server;
		if (!server) {
			return;
		}

		const snapshot = buildSnapshot(ctx, this.#live);
		const delta = computeDelta(this.#graph, snapshot.graph);
		const sessionChanged = JSON.stringify(this.#session) !== JSON.stringify(snapshot.session);
		this.#graph = snapshot.graph;
		this.#session = snapshot.session;

		if (isEmptyDelta(delta) && !sessionChanged) {
			return;
		}

		this.#revision += 1;
		server.broadcast({ type: "patch", revision: this.#revision, session: snapshot.session, delta });
	}

	/**
	 * Handle a message from a connected browser.
	 * @param ctx Extension context for the active session.
	 * @param message Client message.
	 */
	public handleClient(ctx: ExtensionContext, message: FlowClientMessage): void {
		switch (message.type) {
			case "resync":
				return;
			case "draft":
				this.#live.draft = message.text;
				return;
			case "prompt":
				this.#submitPrompt(ctx, message.text, message.deliverAs);
				return;
		}
	}

	/**
	 * Stop the server and tell connected browsers why.
	 *
	 * Safe to call repeatedly, including when the server was never started or while
	 * a startup is still in flight: an in-flight startup is cancelled and its server
	 * is closed, so no listener survives the shutdown.
	 * @param reason Human readable shutdown reason.
	 */
	public async stop(reason: string): Promise<void> {
		this.#generation += 1;
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = undefined;
		}

		const stopping = this.#stopServer(reason);
		this.#stopping = stopping;
		try {
			await stopping;
		} finally {
			if (this.#stopping === stopping) {
				this.#stopping = undefined;
			}
		}
	}

	/**
	 * Wait for any in-flight startup to unwind, then release the server.
	 * @param reason Human readable shutdown reason.
	 */
	async #stopServer(reason: string): Promise<void> {
		await this.#starting?.catch(() => undefined);

		const server = this.#server;
		this.#server = undefined;
		this.#starting = undefined;
		this.#graph = undefined;
		this.#session = undefined;
		this.#latestCtx = undefined;
		this.#live.reset();

		if (!server) {
			return;
		}

		server.broadcast({ type: "closing", reason });
		await server.stop();
	}

	/**
	 * Create and bind the localhost server.
	 * @param ctx Extension context for the active session.
	 * @returns The canvas URL.
	 */
	async #startServer(ctx: ExtensionContext): Promise<string> {
		const generation = this.#generation;
		const state = getProcessState();
		const server = new FlowServer({
			webRoot: WEB_ROOT,
			token: state.token,
			onConnection: (socket): void => this.#sendSnapshot(ctx, socket, server),
			onResync: (socket): void => this.#sendSnapshot(ctx, socket, server),
			onClientMessage: (message): void => {
				const current = this.#latestCtx ?? ctx;
				this.handleClient(current, message);
			},
		});

		state.port = await server.start(state.port);
		if (generation !== this.#generation) {
			await server.stop();
			throw new Error("pi-flow startup was cancelled by shutdown");
		}

		state.enabled = true;
		this.#server = server;
		this.#graph = undefined;
		this.#session = undefined;
		this.#latestCtx = ctx;

		return server.url;
	}

	/**
	 * Send the full canvas state to one browser.
	 *
	 * Pending changes are published to every client first, so the snapshot and the
	 * revision counter stay consistent for clients that are already connected.
	 * @param ctx Extension context for the active session.
	 * @param socket Connection to send to.
	 * @param server Server that owns the connection.
	 */
	#sendSnapshot(ctx: ExtensionContext, socket: WebSocket, server: FlowServer): void {
		if (this.#server !== server) {
			return;
		}

		this.publish(ctx);

		const graph = this.#graph;
		const session = this.#session;
		if (!graph || !session) {
			return;
		}

		server.send(socket, { type: "snapshot", revision: this.#revision, session, graph });
	}

	/**
	 * Submit a prompt from the graph through Pi's supported user-message API.
	 * @param ctx Extension context for the active session.
	 * @param text Prompt text.
	 * @param requested Delivery mode chosen by the browser, when the agent is busy.
	 */
	#submitPrompt(ctx: ExtensionContext, text: string, requested?: FlowDeliverAs): void {
		const trimmed = text.trim();
		if (trimmed.length === 0) {
			return;
		}

		const busy = !ctx.isIdle();
		const deliverAs = busy ? (requested ?? "followUp") : undefined;
		try {
			if (deliverAs) {
				this.#pi.sendUserMessage(trimmed, { deliverAs, expandPromptTemplates: true });
				this.#live.queuePrompt(trimmed, deliverAs);
			} else {
				this.#pi.sendUserMessage(trimmed, { expandPromptTemplates: true });
				this.#live.draft = "";
			}
		} catch (error) {
			notifyError(ctx, error);
			return;
		}

		this.publish(ctx);
	}
}

/**
 * Show a submission failure in Pi when a UI is available.
 * @param ctx Extension context.
 * @param error Thrown value.
 */
function notifyError(ctx: ExtensionContext, error: unknown): void {
	if (ctx.hasUI) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}
