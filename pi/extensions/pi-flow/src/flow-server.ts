import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { type WebSocket, WebSocketServer } from "ws";

import type { FlowClientMessage, FlowServerMessage } from "./protocol.ts";

/** Content types for the static assets the canvas needs. */
const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
};

/** Hostnames the canvas is allowed to be served to. */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Cookie used so page sub-resources inherit the access token from the initial URL. */
const TOKEN_COOKIE = "pi_flow_token";

/** Configuration for a {@link FlowServer}. */
export interface FlowServerOptions {
	/** Absolute path of the directory holding the browser assets. */
	webRoot: string;
	/** Shared secret required by every request. */
	token: string;
	/** Called when a browser connects, so the server can send it a snapshot. */
	onConnection: (socket: WebSocket) => void;
	/** Called when a browser asks for a fresh snapshot. */
	onResync: (socket: WebSocket) => void;
}

/**
 * Create a random access token for a canvas server.
 * @returns URL-safe token.
 */
export function createToken(): string {
	return randomBytes(24).toString("base64url");
}

/**
 * Localhost-only HTTP and WebSocket server that hosts the conversation canvas.
 *
 * The server never binds to a public interface, rejects requests with a foreign
 * `Host` header, and requires a per-session token, so session content is not
 * readable by other machines or by unrelated pages in the browser.
 */
export class FlowServer {
	readonly #options: FlowServerOptions;
	readonly #sockets = new Set<WebSocket>();
	#http: Server | undefined;
	#ws: WebSocketServer | undefined;
	#port = 0;

	/**
	 * Create a server bound to a set of browser assets.
	 * @param options Server configuration.
	 */
	constructor(options: FlowServerOptions) {
		this.#options = options;
	}

	/** Port the server is listening on, or 0 when it is stopped. */
	public get port(): number {
		return this.#port;
	}

	/** URL that opens the canvas, including the access token. */
	public get url(): string {
		return `http://127.0.0.1:${this.#port}/?token=${this.#options.token}`;
	}

	/** Number of connected browsers. */
	public get clientCount(): number {
		return this.#sockets.size;
	}

	/**
	 * Start listening on localhost.
	 * @param preferredPort Port to reuse across reloads, or 0 to pick any free port.
	 * @returns The port the server bound to.
	 */
	public async start(preferredPort = 0): Promise<number> {
		const http = createServer((request, response) => {
			this.#handleRequest(request, response).catch(() => {
				response.writeHead(500).end("pi-flow: internal error");
			});
		});

		this.#port = await listen(http, preferredPort);
		this.#http = http;
		this.#ws = new WebSocketServer({ server: http, path: "/ws" });
		this.#ws.on("connection", (socket, request) => this.#handleSocket(socket, request));

		return this.#port;
	}

	/**
	 * Send a message to every connected browser.
	 * @param message Message to send.
	 */
	public broadcast(message: FlowServerMessage): void {
		const payload = JSON.stringify(message);
		for (const socket of this.#sockets) {
			this.send(socket, payload);
		}
	}

	/**
	 * Send a message to a single browser.
	 * @param socket Target connection.
	 * @param message Message or pre-serialised payload.
	 */
	public send(socket: WebSocket, message: FlowServerMessage | string): void {
		if (socket.readyState !== socket.OPEN) {
			return;
		}

		try {
			socket.send(typeof message === "string" ? message : JSON.stringify(message));
		} catch {
			this.#sockets.delete(socket);
		}
	}

	/** Close every connection and release the port. Safe to call more than once. */
	public async stop(): Promise<void> {
		for (const socket of this.#sockets) {
			try {
				socket.close(1001, "pi-flow shutting down");
			} catch {
				socket.terminate();
			}
		}

		this.#sockets.clear();

		const ws = this.#ws;
		this.#ws = undefined;
		if (ws) {
			await new Promise<void>((resolve) => ws.close(() => resolve()));
		}

		const http = this.#http;
		this.#http = undefined;
		this.#port = 0;
		if (http) {
			await new Promise<void>((resolve) => {
				http.close(() => resolve());
				// Browsers keep the static-asset connections alive, so close them explicitly
				// or `close` never fires and shutdown hangs on a still-listening server.
				http.closeAllConnections();
			});
		}
	}

	/**
	 * Serve a static asset after validating the host and the access token.
	 * @param request Incoming request.
	 * @param response Response to write.
	 */
	async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
		if (!isLocalHost(request)) {
			response.writeHead(403).end("pi-flow: forbidden host");
			return;
		}

		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		const queryToken = url.searchParams.get("token");
		if (!this.#isAuthorised(request, queryToken)) {
			response.writeHead(401).end("pi-flow: invalid or missing token");
			return;
		}

		const filePath = this.#resolveAsset(url.pathname);
		if (!filePath) {
			response.writeHead(404).end("pi-flow: not found");
			return;
		}

		let body: Buffer | string;
		try {
			body = await readFile(filePath);
		} catch {
			response.writeHead(404).end("pi-flow: not found");
			return;
		}

		const headers: Record<string, string> = {
			"content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
			"cache-control": "no-store",
		};

		if (extname(filePath) === ".html") {
			body = body.toString("utf8").replaceAll("%%FLOW_TOKEN%%", this.#options.token);
			headers["set-cookie"] = `${TOKEN_COOKIE}=${this.#options.token}; Path=/; SameSite=Strict`;
		}

		response.writeHead(200, headers).end(body);
	}

	/**
	 * Accept a browser connection once its host and token check out.
	 * @param socket Newly opened connection.
	 * @param request Upgrade request.
	 */
	#handleSocket(socket: WebSocket, request: IncomingMessage): void {
		const url = new URL(request.url ?? "/ws", "http://127.0.0.1");
		if (!isLocalHost(request) || !this.#isAuthorised(request, url.searchParams.get("token"))) {
			socket.close(1008, "pi-flow: unauthorised");
			return;
		}

		this.#sockets.add(socket);
		socket.on("close", () => this.#sockets.delete(socket));
		socket.on("error", () => this.#sockets.delete(socket));
		socket.on("message", (raw) => {
			const message = parseClientMessage(raw.toString());
			if (message?.type === "resync") {
				this.#options.onResync(socket);
			}
		});

		this.#options.onConnection(socket);
	}

	/**
	 * Check the access token from the query string or the session cookie.
	 * @param request Incoming request.
	 * @param queryToken Token supplied in the query string, when present.
	 * @returns True when the request may proceed.
	 */
	#isAuthorised(request: IncomingMessage, queryToken: string | null): boolean {
		if (queryToken === this.#options.token) {
			return true;
		}

		return readCookie(request.headers.cookie, TOKEN_COOKIE) === this.#options.token;
	}

	/**
	 * Map a request path onto a file inside the web root.
	 * @param pathname Request path.
	 * @returns Absolute file path, or undefined when the path escapes the web root.
	 */
	#resolveAsset(pathname: string): string | undefined {
		const requested = pathname === "/" ? "/index.html" : pathname;
		// Matches leading slashes and backslashes so the path cannot resolve outside the web root.
		const relative = normalize(decodeURIComponent(requested)).replace(/^([/\\])+/, "");
		if (relative.length === 0 || relative === ".." || relative.startsWith(`..${sep}`)) {
			return undefined;
		}

		return join(this.#options.webRoot, relative);
	}
}

/**
 * Bind an HTTP server to loopback, falling back to an ephemeral port when needed.
 * @param server Server to bind.
 * @param preferredPort Port to try first, or 0 to pick any free port.
 * @returns The port the server bound to.
 */
async function listen(server: Server, preferredPort: number): Promise<number> {
	for (const port of preferredPort > 0 ? [preferredPort, 0] : [0]) {
		try {
			await new Promise<void>((resolve, reject) => {
				const onError = (error: Error): void => reject(error);
				server.once("error", onError);
				server.listen(port, "127.0.0.1", () => {
					server.removeListener("error", onError);
					resolve();
				});
			});

			const address = server.address();
			if (address && typeof address === "object") {
				return address.port;
			}
		} catch {
			continue;
		}
	}

	throw new Error("pi-flow could not bind a localhost port");
}

/**
 * Reject requests whose `Host` header points somewhere other than loopback.
 * @param request Incoming request.
 * @returns True when the host is a loopback address.
 */
function isLocalHost(request: IncomingMessage): boolean {
	const host = request.headers.host;
	if (!host) {
		return false;
	}

	const withoutPort = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
	return ALLOWED_HOSTS.has(withoutPort ?? "");
}

/**
 * Read a single cookie value from a `Cookie` header.
 * @param header Raw `Cookie` header.
 * @param name Cookie name.
 * @returns Cookie value, or undefined when absent.
 */
function readCookie(header: string | undefined, name: string): string | undefined {
	if (!header) {
		return undefined;
	}

	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key === name) {
			return rest.join("=");
		}
	}

	return undefined;
}

/**
 * Parse a message sent by the browser.
 * @param raw Raw text frame.
 * @returns The parsed message, or undefined when it is not understood.
 */
function parseClientMessage(raw: string): FlowClientMessage | undefined {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && (parsed as { type?: unknown }).type === "resync") {
			return { type: "resync" };
		}
	} catch {
		return undefined;
	}

	return undefined;
}
