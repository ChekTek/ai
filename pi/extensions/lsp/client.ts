import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { formatErrorBlock } from "./format.ts";
import {
	commandExists,
	languageIdFor,
	resolveCommandPath,
	SERVERS,
	serverForFile,
	spawnArgv,
	type LspDiagnostic,
	type LspServer,
} from "./servers.ts";

/** Default JSON-RPC and diagnostics wait. */
const TIMEOUT_MS = 15_000;

/** Quiet period after the latest push-diagnostics publication. */
const SETTLE_MS = 800;

/** Skip files larger than this so a write does not stall on generated output. */
const MAX_FILE_BYTES = 1_500_000;

/** Status key shown in the Pi footer while diagnostics run. */
export const LSP_STATUS_KEY = "lsp";

/**
 * Session-lived language-server processes. Starts a server only when a matching
 * file is written or edited, reuses it for later files of the same type, and
 * shuts everything down on reset.
 */
export class LspSession {
	#clients = new Map<string, Promise<LspClient | undefined>>();
	#missing = new Set<string>();

	/**
	 * Returns a compact error block for a file, or undefined when there is
	 * nothing to append. Missing binaries, timeouts, and server crashes are
	 * skipped quietly.
	 * @param filePath Absolute path that was just written or edited.
	 * @param cwd Session working directory used as the LSP workspace root.
	 * @param signal Abort signal from the current agent turn.
	 * @param setStatus Footer status callback.
	 */
	async errorBlock(
		filePath: string,
		cwd: string,
		signal: AbortSignal | undefined,
		setStatus: (value: string | undefined) => void,
	): Promise<string | undefined> {
		const server = serverForFile(filePath);
		if (!server) return undefined;
		if (signal?.aborted) return undefined;

		try {
			const stats = await fs.stat(filePath);
			if (!stats.isFile() || stats.size > MAX_FILE_BYTES) return undefined;
		} catch {
			return undefined;
		}

		setStatus(server.name);
		try {
			const client = await this.#clientFor(server, cwd, signal);
			if (!client) return undefined;
			const text = await fs.readFile(filePath, "utf8");
			const diagnostics = await client.syncAndDiagnose(filePath, text, signal);
			return formatErrorBlock(filePath, diagnostics, cwd);
		} catch {
			return undefined;
		} finally {
			setStatus(undefined);
		}
	}

	/**
	 * Human-readable PATH and process status for `/lsp`.
	 * @param cwd Session working directory used to resolve commands.
	 */
	async statusMessage(cwd: string): Promise<string> {
		const lines = await Promise.all(
			SERVERS.map(async (server) => {
				const available = commandExists(server, cwd);
				const client = await this.#clients.get(clientKey(server, cwd));
				const running = client?.alive === true;
				const state = !available ? "command missing" : running ? "running" : "idle";
				return `${server.name} (${server.command.join(" ")}): ${state}`;
			}),
		);
		return lines.join("\n");
	}

	/** Shuts down every server started this session. */
	async reset(): Promise<void> {
		const pending = [...this.#clients.values()];
		this.#clients.clear();
		this.#missing.clear();
		await Promise.all(
			pending.map(async (started) => {
				const client = await started.catch(() => undefined);
				await client?.dispose();
			}),
		);
	}

	async #clientFor(
		server: LspServer,
		cwd: string,
		signal: AbortSignal | undefined,
	): Promise<LspClient | undefined> {
		if (this.#missing.has(server.name)) return undefined;

		const [executable, ...args] = server.command;
		if (!executable) return undefined;

		const commandPath = resolveCommandPath(executable, cwd);
		if (!commandPath) {
			this.#missing.add(server.name);
			return undefined;
		}

		const key = clientKey(server, cwd);
		const existing = this.#clients.get(key);
		if (existing) {
			const client = await existing;
			if (client?.alive) return client;
			if (this.#clients.get(key) === existing) this.#clients.delete(key);
		}

		const inFlight = this.#clients.get(key);
		if (inFlight) {
			const client = await inFlight;
			return client?.alive ? client : undefined;
		}

		const started = LspClient.start(server, commandPath, args, cwd, signal);
		this.#clients.set(key, started);
		const client = await started;
		if (!client?.alive && this.#clients.get(key) === started) this.#clients.delete(key);
		return client?.alive ? client : undefined;
	}
}

class LspClient {
	#child?: ChildProcessWithoutNullStreams;
	#buffer = Buffer.alloc(0);
	#nextId = 1;
	#pending = new Map<number, PendingRequest>();
	#published = new Map<string, { version: number; diagnostics: LspDiagnostic[] }>();
	#waiters = new Map<string, Set<DiagnosticWaiter>>();
	#documents = new Map<string, number>();
	#stderr = "";
	#serverCapabilities: Record<string, unknown> = {};
	#tail: Promise<void> = Promise.resolve();
	#server: LspServer;
	#cwd: string;

	constructor(server: LspServer, cwd: string) {
		this.#server = server;
		this.#cwd = cwd;
	}

	get alive(): boolean {
		return this.#child !== undefined && !this.#child.killed;
	}

	static async start(
		server: LspServer,
		commandPath: string,
		args: string[],
		cwd: string,
		signal: AbortSignal | undefined,
	): Promise<LspClient | undefined> {
		const client = new LspClient(server, cwd);
		try {
			throwIfAborted(signal);
			await client.#spawn(commandPath, args);
			throwIfAborted(signal);
			await client.#initialize();
			return client;
		} catch {
			client.close();
			return undefined;
		}
	}

	/**
	 * Opens or updates a document and waits for diagnostics.
	 * @param filePath Absolute file path.
	 * @param text Current file contents.
	 * @param signal Abort signal from the current agent turn.
	 */
	syncAndDiagnose(
		filePath: string,
		text: string,
		signal: AbortSignal | undefined,
	): Promise<LspDiagnostic[]> {
		return this.#enqueue(async () => {
			throwIfAborted(signal);
			const uri = pathToFileURL(filePath).href;
			const afterVersion = this.#published.get(uri)?.version ?? 0;
			this.#syncDocument(uri, filePath, text);
			return this.#diagnostics(uri, afterVersion, signal);
		});
	}

	async dispose(): Promise<void> {
		if (!this.#child) return;

		try {
			await this.#request("shutdown", null);
			this.#notify("exit", undefined);
		} catch {
			// Process may already be gone.
		} finally {
			this.close();
		}
	}

	close(): void {
		this.#rejectAll(`${this.#server.name} LSP request cancelled.`);
		if (this.#child && !this.#child.killed) this.#child.kill("SIGTERM");
		this.#child = undefined;
	}

	async #spawn(commandPath: string, args: string[]): Promise<void> {
		const spawnCommand = spawnArgv(commandPath, args);
		const child = spawn(spawnCommand.command, spawnCommand.args, {
			cwd: this.#cwd,
			env: process.env,
			stdio: "pipe",
		});
		this.#child = child;
		child.stdout.on("data", (chunk: Buffer) => {
			try {
				this.#onData(chunk);
			} catch (error) {
				this.#fail(`${this.#server.name} LSP sent invalid JSON-RPC: ${errorMessage(error)}.`);
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			this.#stderr = `${this.#stderr}${chunk.toString()}`.slice(-8_000);
		});
		child.stdin.on("error", (error) => {
			this.#fail(`${this.#server.name} LSP stdin write failed: ${error.message}.`);
		});
		child.once("exit", () => {
			if (this.#child === child) this.#child = undefined;
			this.#rejectAll(`${this.#server.name} LSP server exited.${this.#formatStderr()}`);
		});

		await new Promise<void>((resolve, reject) => {
			child.once("spawn", () => resolve());
			child.once("error", (error) => {
				if (this.#child === child) this.#child = undefined;
				reject(new Error(`${this.#server.name} failed to start: ${error.message}.`));
			});
		});
	}

	async #initialize(): Promise<void> {
		const rootUri = directoryUri(this.#cwd);
		const response = await this.#request("initialize", {
			processId: process.pid,
			rootUri,
			workspaceFolders: [{ uri: rootUri, name: path.basename(this.#cwd) || "workspace" }],
			capabilities: {
				textDocument: {
					diagnostic: { dynamicRegistration: false, relatedDocumentSupport: true },
					publishDiagnostics: {},
					synchronization: { didSave: true },
				},
				workspace: {
					configuration: true,
					workspaceFolders: true,
				},
			},
		});
		const result = asRecord(response.result);
		this.#serverCapabilities = asRecord(result?.capabilities) ?? {};
		this.#notify("initialized", {});
	}

	#syncDocument(uri: string, filePath: string, text: string): void {
		const version = (this.#documents.get(uri) ?? 0) + 1;
		this.#documents.set(uri, version);
		if (version === 1) {
			this.#notify("textDocument/didOpen", {
				textDocument: {
					uri,
					languageId: languageIdFor(filePath),
					version,
					text,
				},
			});
			return;
		}

		this.#notify("textDocument/didChange", {
			textDocument: { uri, version },
			contentChanges: [{ text }],
		});
	}

	async #diagnostics(
		uri: string,
		afterVersion: number,
		signal: AbortSignal | undefined,
	): Promise<LspDiagnostic[]> {
		if (!this.#serverCapabilities.diagnosticProvider) {
			return this.#waitForPublished(uri, afterVersion, this.#server.pushDiagnosticsGraceMs, signal);
		}

		const response = await this.#request("textDocument/diagnostic", {
			textDocument: { uri },
		});
		const result = asRecord(response.result);
		const diagnostics = asDiagnostics(result?.items);
		if (diagnostics.length > 0 || !this.#server.pullDiagnosticsGraceMs) return diagnostics;
		return this.#waitForPublished(
			uri,
			afterVersion,
			this.#server.pullDiagnosticsGraceMs,
			signal,
			diagnostics,
		);
	}

	#waitForPublished(
		uri: string,
		afterVersion: number,
		graceMs: number | undefined,
		signal: AbortSignal | undefined,
		fallback: LspDiagnostic[] = [],
	): Promise<LspDiagnostic[]> {
		return new Promise((resolve, reject) => {
			let done = false;
			let settleTimer: NodeJS.Timeout | undefined;
			let graceTimer: NodeJS.Timeout | undefined;
			let overallTimer: NodeJS.Timeout | undefined;
			const settleMs = this.#server.diagnosticsSettleMs ?? SETTLE_MS;

			const finish = (diagnostics: LspDiagnostic[], error?: Error) => {
				if (done) return;
				done = true;
				if (settleTimer) clearTimeout(settleTimer);
				if (graceTimer) clearTimeout(graceTimer);
				if (overallTimer) clearTimeout(overallTimer);
				signal?.removeEventListener("abort", onAbort);
				this.#waiters.get(uri)?.delete(waiter);
				if (this.#waiters.get(uri)?.size === 0) this.#waiters.delete(uri);
				if (error) reject(error);
				else resolve(diagnostics);
			};
			const onAbort = () => finish([], abortError());
			const waiter: DiagnosticWaiter = {
				onPublish: (publication) => {
					if (publication.version <= afterVersion) return;
					if (settleTimer) clearTimeout(settleTimer);
					settleTimer = setTimeout(() => {
						finish(this.#published.get(uri)?.diagnostics ?? publication.diagnostics);
					}, settleMs);
				},
				fail: (reason) => finish([], reason instanceof Error ? reason : new Error(String(reason))),
			};

			const waiters = this.#waiters.get(uri) ?? new Set<DiagnosticWaiter>();
			waiters.add(waiter);
			this.#waiters.set(uri, waiters);
			signal?.addEventListener("abort", onAbort, { once: true });

			if (graceMs) {
				graceTimer = setTimeout(() => {
					const latest = this.#published.get(uri);
					finish(
						latest && latest.version > afterVersion ? latest.diagnostics : fallback,
					);
				}, Math.min(graceMs, TIMEOUT_MS));
			}

			overallTimer = setTimeout(() => {
				const latest = this.#published.get(uri);
				if (latest && latest.version > afterVersion) {
					finish(latest.diagnostics);
					return;
				}
				if (graceMs) {
					finish(fallback);
					return;
				}
				finish([]);
			}, TIMEOUT_MS);

			const existing = this.#published.get(uri);
			if (existing) waiter.onPublish(existing);
			if (signal?.aborted) onAbort();
		});
	}

	#enqueue<T>(work: () => Promise<T>): Promise<T> {
		const run = this.#tail.then(work, work);
		this.#tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	#request(method: string, params: unknown): Promise<JsonRpcMessage> {
		const id = this.#nextId++;
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.#pending.delete(id);
				reject(
					new Error(`${this.#server.name} LSP timed out: ${method}.${this.#formatStderr()}`),
				);
			}, TIMEOUT_MS);
			this.#pending.set(id, { resolve, reject, timeout });
			try {
				this.#send({ jsonrpc: "2.0", id, method, params });
			} catch (error) {
				clearTimeout(timeout);
				this.#pending.delete(id);
				reject(error);
			}
		});
	}

	#notify(method: string, params: unknown): void {
		this.#send(
			params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params },
		);
	}

	#send(message: JsonRpcMessage): void {
		if (!this.#child) throw new Error(`${this.#server.name} LSP server is not running.`);

		const body = JSON.stringify(message);
		try {
			this.#child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
		} catch (error) {
			const messageText =
				`${this.#server.name} LSP stdin write failed: ${errorMessage(error)}.` +
				this.#formatStderr();
			this.#fail(messageText);
			throw new Error(messageText);
		}
	}

	#onData(chunk: Buffer): void {
		this.#buffer = Buffer.concat([this.#buffer, chunk]);

		while (true) {
			const separator = this.#buffer.indexOf("\r\n\r\n");
			if (separator < 0) return;

			const header = this.#buffer.subarray(0, separator).toString("utf8");
			const contentLength = /Content-Length:\s*(\d+)/i.exec(header)?.[1];
			if (!contentLength) throw new Error(`Invalid LSP header: ${header}`);

			const bodyStart = separator + 4;
			const bodyLength = Number(contentLength);
			if (this.#buffer.length < bodyStart + bodyLength) return;

			const rawBody = this.#buffer.subarray(bodyStart, bodyStart + bodyLength).toString("utf8");
			this.#buffer = this.#buffer.subarray(bodyStart + bodyLength);
			this.#handleMessage(JSON.parse(rawBody) as JsonRpcMessage);
		}
	}

	#handleMessage(message: JsonRpcMessage): void {
		if (Object.hasOwn(message, "id") && !message.method) {
			const pending = typeof message.id === "number" ? this.#pending.get(message.id) : undefined;
			if (!pending) return;
			clearTimeout(pending.timeout);
			this.#pending.delete(message.id as number);
			if (message.error) {
				pending.reject(
					new Error(`${this.#server.name} LSP error: ${message.error.message}`),
				);
				return;
			}
			pending.resolve(message);
			return;
		}

		if (message.method === "textDocument/publishDiagnostics") {
			const params = asRecord(message.params);
			const uri = typeof params?.uri === "string" ? params.uri : undefined;
			if (!uri) return;
			const previous = this.#published.get(uri)?.version ?? 0;
			const publication = {
				version: previous + 1,
				diagnostics: asDiagnostics(params?.diagnostics),
			};
			this.#published.set(uri, publication);
			const waiters = this.#waiters.get(uri);
			if (waiters) {
				for (const waiter of [...waiters]) waiter.onPublish(publication);
			}
			return;
		}

		if (Object.hasOwn(message, "id") && message.method) {
			this.#respondToServer(message);
		}
	}

	#respondToServer(message: JsonRpcMessage): void {
		if (message.method === "workspace/configuration") {
			const params = asRecord(message.params);
			const items = Array.isArray(params?.items) ? params.items : [];
			this.#send({ jsonrpc: "2.0", id: message.id, result: items.map(() => ({})) });
			return;
		}

		if (message.method === "workspace/workspaceFolders") {
			const rootUri = directoryUri(this.#cwd);
			this.#send({
				jsonrpc: "2.0",
				id: message.id,
				result: [{ uri: rootUri, name: path.basename(this.#cwd) || "workspace" }],
			});
			return;
		}

		this.#send({ jsonrpc: "2.0", id: message.id, result: null });
	}

	#fail(message: string): void {
		this.#rejectAll(message);
		if (this.#child && !this.#child.killed) this.#child.kill("SIGTERM");
		this.#child = undefined;
	}

	#rejectAll(message: string): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error(message));
		}
		this.#pending.clear();
		for (const waiters of this.#waiters.values()) {
			for (const waiter of [...waiters]) waiter.fail(new Error(message));
		}
		this.#waiters.clear();
	}

	#formatStderr(): string {
		const stderr = this.#stderr.trim();
		return stderr ? `\nServer stderr:\n${stderr}` : "";
	}
}

function clientKey(server: LspServer, cwd: string): string {
	return `${server.name}:${cwd}`;
}

function directoryUri(directory: string): string {
	const withSep = directory.endsWith(path.sep) ? directory : `${directory}${path.sep}`;
	return pathToFileURL(withSep).href;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw abortError();
}

function abortError(): Error {
	return new Error("LSP diagnostics aborted.");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function asDiagnostics(value: unknown): LspDiagnostic[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isDiagnostic);
}

function isDiagnostic(value: unknown): value is LspDiagnostic {
	if (typeof value !== "object" || value === null) return false;
	const diagnostic = value as LspDiagnostic;
	return typeof diagnostic.message === "string" && typeof diagnostic.range?.start?.line === "number";
}

interface PendingRequest {
	resolve: (message: JsonRpcMessage) => void;
	reject: (reason: unknown) => void;
	timeout: NodeJS.Timeout;
}

interface DiagnosticWaiter {
	onPublish: (publication: { version: number; diagnostics: LspDiagnostic[] }) => void;
	fail: (reason: unknown) => void;
}

interface JsonRpcMessage {
	jsonrpc?: "2.0";
	id?: number | string | null;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string };
}
