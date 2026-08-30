/**
 * @import { FlowClientMessage, FlowServerMessage } from "./protocol.js"
 */
import { asServerMessage } from "./protocol.js";

/** Delay before the first reconnect attempt. */
const MIN_RETRY_MS = 500;

/** Upper bound on the reconnect backoff. */
const MAX_RETRY_MS = 8000;

/**
 * Parse a JSON payload without throwing on malformed input.
 * @param {string} raw Raw websocket payload.
 * @returns {unknown} Parsed value, or undefined when the payload is not JSON.
 */
function parse(raw) {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

/**
 * @typedef {"connecting" | "live" | "offline" | "closed"} ConnectionState
 */

/**
 * @typedef {object} FlowClientHandlers
 * @property {(message: FlowServerMessage) => void} onMessage Called for every decoded server message.
 * @property {(state: ConnectionState, detail?: string) => void} onState Called whenever the connection state changes.
 */

/**
 * Keeps a websocket open to the extension and reconnects when it drops.
 *
 * The extension keeps the same port and token across reloads and session
 * replacements, so an open tab recovers on its own: every successful connection
 * asks for a fresh snapshot, which replaces whatever the tab was showing.
 */
export class FlowClient {
	/** @type {string} */
	#url;

	/** @type {FlowClientHandlers} */
	#handlers;

	/** @type {WebSocket | undefined} */
	#socket;

	/** @type {number | undefined} */
	#retryTimer;

	/** @type {number} */
	#retryDelay = MIN_RETRY_MS;

	/** @type {boolean} */
	#stopped = false;

	/**
	 * @param {string} url Websocket endpoint including the access token.
	 * @param {FlowClientHandlers} handlers Message and state callbacks.
	 */
	constructor(url, handlers) {
		this.#url = url;
		this.#handlers = handlers;
	}

	/** Open the connection and keep it open. */
	connect() {
		if (this.#stopped || this.#socket) {
			return;
		}

		this.#handlers.onState("connecting");
		const socket = new WebSocket(this.#url);
		this.#socket = socket;

		socket.addEventListener("open", () => {
			this.#retryDelay = MIN_RETRY_MS;
			this.#handlers.onState("live");
			this.send({ type: "resync" });
		});

		socket.addEventListener("message", (event) => {
			if (typeof event.data !== "string") {
				return;
			}

			const message = asServerMessage(parse(event.data));
			if (message) {
				this.#handlers.onMessage(message);
			}
		});

		socket.addEventListener("close", () => {
			this.#socket = undefined;
			if (this.#stopped) {
				return;
			}

			this.#handlers.onState("offline");
			this.#scheduleRetry();
		});

		socket.addEventListener("error", () => socket.close());
	}

	/**
	 * Send a message when the socket is open.
	 * @param {FlowClientMessage} message Message to send.
	 */
	send(message) {
		if (this.#socket?.readyState === WebSocket.OPEN) {
			this.#socket.send(JSON.stringify(message));
		}
	}

	/**
	 * Stop reconnecting and close the socket.
	 * @param {string} [detail] Reason to show in the connection indicator.
	 */
	stop(detail) {
		this.#stopped = true;
		if (this.#retryTimer !== undefined) {
			window.clearTimeout(this.#retryTimer);
			this.#retryTimer = undefined;
		}

		this.#socket?.close();
		this.#socket = undefined;
		this.#handlers.onState("closed", detail);
	}

	/** Queue another connection attempt with exponential backoff. */
	#scheduleRetry() {
		if (this.#retryTimer !== undefined) {
			return;
		}

		const delay = this.#retryDelay;
		this.#retryDelay = Math.min(delay * 2, MAX_RETRY_MS);
		this.#retryTimer = window.setTimeout(() => {
			this.#retryTimer = undefined;
			this.connect();
		}, delay);
	}
}
