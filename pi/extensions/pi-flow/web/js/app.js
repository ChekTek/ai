/**
 * @import { FlowNode, FlowSessionInfo } from "./protocol.js"
 */
import { FlowCanvas } from "./canvas.js";
import { FlowClient } from "./client.js";
import { GraphStore } from "./graph-store.js";

const store = new GraphStore();
const dom = {
	stage: requireElement("stage", HTMLElement),
	edgeLayer: requireElement("edge-layer", SVGGElement),
	nodes: requireElement("nodes", HTMLElement),
	empty: requireElement("empty", HTMLElement),
	inspector: requireElement("inspector", HTMLElement),
	inspectorClose: requireElement("inspector-close", HTMLElement),
	inspectorTitle: requireElement("inspector-title", HTMLElement),
	inspectorSubtitle: requireElement("inspector-subtitle", HTMLElement),
	inspectorBadges: requireElement("inspector-badges", HTMLElement),
	inspectorBody: requireElement("inspector-body", HTMLElement),
	sessionName: requireElement("session-name", HTMLElement),
	sessionMeta: requireElement("session-meta", HTMLElement),
	fit: requireElement("fit", HTMLButtonElement),
	zoomIn: requireElement("zoom-in", HTMLButtonElement),
	zoomOut: requireElement("zoom-out", HTMLButtonElement),
	auto: requireElement("auto", HTMLButtonElement),
	connection: requireElement("connection", HTMLElement),
	emptyPrompt: requireElement("empty-prompt", HTMLFormElement),
	emptyPromptInput: requireElement("empty-prompt-input", HTMLTextAreaElement),
};

const canvas = new FlowCanvas(dom, {
	onSelect: showInspector,
	onPin: (id, x, y) => {
		store.pin(id, x, y);
		draw();
	},
	onPrompt: submitPrompt,
	onDraft: persistDraft,
	onAutoChange: syncAutoButton,
});

/** @type {FlowSessionInfo | undefined} */
let session;

/** @type {string} */
let draft = "";

/** @type {number} */
let revision = -1;

/** @type {import("./client.js").ConnectionState} */
let connectionState = "connecting";

/** @type {string | undefined} */
let connectionDetail;

const client = new FlowClient(socketUrl(), {
	onMessage: (message) => {
		switch (message.type) {
			case "snapshot":
				revision = message.revision;
				session = message.session;
				store.replace(message.graph);
				if (draft.length === 0) {
					draft = message.session.draft;
					dom.emptyPromptInput.value = draft;
				}
				break;
			case "patch":
				if (message.revision <= revision) {
					return;
				}

				revision = message.revision;
				session = message.session;
				store.apply(message.delta);
				break;
			case "closing":
				client.stop(message.reason);
				return;
		}

		showSession();
		draw();
	},
	onState: showConnection,
});

dom.fit.addEventListener("click", () => canvas.fit());
dom.zoomIn.addEventListener("click", () => canvas.zoomBy(1.2));
dom.zoomOut.addEventListener("click", () => canvas.zoomBy(1 / 1.2));
dom.inspectorClose.addEventListener("click", () => canvas.select(undefined));
syncAutoButton(canvas.auto);
dom.auto.addEventListener("click", () => {
	canvas.auto = !canvas.auto;
});
dom.emptyPrompt.addEventListener("submit", (event) => {
	event.preventDefault();
	submitPrompt(dom.emptyPromptInput.value, session?.busy ? "followUp" : undefined);
});
dom.emptyPromptInput.addEventListener("input", () => persistDraft(dom.emptyPromptInput.value));
dom.emptyPromptInput.addEventListener("keydown", (event) => {
	if (event.key !== "Enter" || event.shiftKey) {
		return;
	}

	event.preventDefault();
	if ((event.metaKey || event.ctrlKey) && session?.busy) {
		submitPrompt(dom.emptyPromptInput.value, "steer");
		return;
	}

	dom.emptyPrompt.requestSubmit();
});

window.addEventListener("keydown", (event) => {
	if (
		event.target instanceof HTMLInputElement ||
		event.target instanceof HTMLTextAreaElement ||
		event.metaKey ||
		event.ctrlKey
	) {
		return;
	}

	switch (event.key) {
		case "f":
		case "F":
			canvas.fit();
			break;
		case "Escape":
			canvas.select(undefined);
			break;
		case "+":
		case "=":
			canvas.zoomBy(1.2);
			break;
		case "-":
			canvas.zoomBy(1 / 1.2);
			break;
		default:
			break;
	}
});

client.connect();

/** Redraw the canvas from the current store contents. */
function draw() {
	canvas.render(store.nodes, store.edges, store.pinned, { draft, busy: Boolean(session?.busy) });
}

/**
 * Submit a prompt from the graph editor.
 * @param {string} text Prompt text.
 * @param {import("./protocol.js").FlowDeliverAs} [deliverAs] Delivery mode while the agent is busy.
 */
function submitPrompt(text, deliverAs) {
	if (text.trim().length === 0) {
		return;
	}

	client.send({ type: "prompt", text, deliverAs });
	draft = "";
	dom.emptyPromptInput.value = "";
}

/**
 * Persist draft text locally and on the extension.
 * @param {string} text Draft prompt.
 */
function persistDraft(text) {
	draft = text;
	client.send({ type: "draft", text });
}

/**
 * Mirror Auto mode onto the toolbar toggle.
 * @param {boolean} enabled Whether Auto is on.
 */
function syncAutoButton(enabled) {
	dom.auto.classList.toggle("on", enabled);
}

/** Write session metadata into the toolbar. */
function showSession() {
	if (!session) {
		return;
	}

	renderConnection();
	dom.sessionName.textContent = session.name ?? "Untitled session";
	dom.sessionMeta.textContent = [session.cwd, session.model, session.sessionId.slice(0, 8)].filter(Boolean).join(" · ");
	document.title = session.name ? `${session.name} · pi-flow` : "pi-flow";
}

/**
 * Record a new connection state and refresh the indicator.
 * @param {import("./client.js").ConnectionState} state Connection state.
 * @param {string} [detail] Extra text for closed connections.
 */
function showConnection(state, detail) {
	connectionState = state;
	connectionDetail = detail;
	renderConnection();
}

/** Paint the connection indicator from the current connection and session state. */
function renderConnection() {
	const labels = {
		connecting: "connecting",
		live: session?.busy ? "working" : "live",
		offline: "reconnecting…",
		closed: connectionDetail ? `closed: ${connectionDetail}` : "closed",
	};

	const classes = {
		connecting: "pill pill-offline",
		live: session?.busy ? "pill pill-busy" : "pill pill-online",
		offline: "pill pill-offline",
		closed: "pill pill-offline",
	};

	dom.connection.textContent = labels[connectionState];
	dom.connection.className = classes[connectionState];
}

/**
 * Show or hide the detail panel for a node.
 * @param {FlowNode | undefined} node Selected node.
 */
function showInspector(node) {
	if (!node) {
		dom.inspector.hidden = true;
		return;
	}

	dom.inspector.hidden = false;
	dom.inspectorTitle.textContent = node.title;
	dom.inspectorSubtitle.textContent = node.subtitle ?? "";
	dom.inspectorBody.textContent = node.detail ?? node.preview ?? "";

	const badges = [node.status, ...(node.badges ?? [])];
	if (node.timestamp) {
		badges.push(new Date(node.timestamp).toLocaleTimeString());
	}

	dom.inspectorBadges.textContent = "";
	for (const badge of badges) {
		const element = document.createElement("span");
		element.className = "node-badge";
		element.textContent = badge;
		dom.inspectorBadges.append(element);
	}
}

/**
 * Build the websocket URL, carrying the token the extension injected into the page.
 * @returns {string} Websocket endpoint.
 */
function socketUrl() {
	const token = document.body.dataset.flowToken ?? "";
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

	return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

/**
 * Look up a required element and narrow its type.
 * @template {Element} T
 * @param {string} id Element id.
 * @param {new () => T} type Expected element constructor.
 * @returns {T} The element.
 */
function requireElement(id, type) {
	const element = document.getElementById(id);
	if (!(element instanceof type)) {
		throw new Error(`missing #${id}`);
	}

	return element;
}
