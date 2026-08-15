/**
 * @import { FlowEdge, FlowNode } from "./protocol.js"
 * @import { NodeBox } from "./layout.js"
 */
import { computeLayout } from "./layout.js";
import { assignEdgeSlots, routeEdge } from "./routing.js";

/** SVG namespace for path creation. */
const SVG_NS = "http://www.w3.org/2000/svg";

/** Zoom bounds. */
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 2.5;

/** Pixels the pointer may travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/** Padding kept around the graph when fitting it to the viewport. */
const FIT_PADDING = 64;

/**
 * @typedef {object} CanvasElements
 * @property {HTMLElement} stage Scroll/zoom container.
 * @property {SVGGElement} edgeLayer Transformed edge group inside the edge layer.
 * @property {HTMLElement} nodes Transformed node container.
 * @property {HTMLElement} empty Placeholder shown when the graph is empty.
 */

/**
 * @typedef {object} CanvasCallbacks
 * @property {(node: FlowNode | undefined) => void} onSelect Called when the selection changes.
 * @property {(id: string, x: number, y: number) => void} onPin Called when a card is dragged to a new position.
 * @property {(text: string, deliverAs?: import("./protocol.js").FlowDeliverAs) => void} onPrompt Called when the graph editor submits.
 * @property {(text: string) => void} onDraft Called when draft text changes.
 * @property {(enabled: boolean) => void} onAutoChange Called when Auto mode is enabled or disabled.
 */

/**
 * Renders the conversation graph and owns all pointer and keyboard interaction.
 *
 * Cards are plain elements in a transformed container and edges are SVG paths in a
 * group carrying the identical transform, so both layers stay aligned at any zoom
 * level without re-running layout while panning.
 */
export class FlowCanvas {
	/** @type {CanvasElements} */
	#dom;

	/** @type {CanvasCallbacks} */
	#callbacks;

	/** @type {Map<string, HTMLElement>} */
	#nodeElements = new Map();

	/** @type {Map<string, SVGPathElement>} */
	#edgeElements = new Map();

	/** @type {FlowNode[]} */
	#nodes = [];

	/** @type {FlowEdge[]} */
	#edges = [];

	/** @type {Map<string, NodeBox>} */
	#boxes = new Map();

	/** Viewport transform in graph units. @type {{ x: number, y: number, k: number }} */
	#view = { x: 0, y: 0, k: 1 };

	/** @type {string | undefined} */
	#selectedId;

	/** @type {boolean} */
	#auto = true;

	/** @type {boolean} */
	#fitted = false;

	/** @type {boolean} */
	#dragging = false;

	/** @type {boolean} */
	#busy = false;

	/** @type {string} */
	#draft = "";

	/** @type {number | undefined} */
	#animFrame;

	/** Milliseconds for Auto camera animation. */
	#animStarted = 0;

	/** @type {{ x: number, y: number, k: number } | undefined} */
	#animFrom;

	/** @type {{ x: number, y: number, k: number } | undefined} */
	#animTo;

	/**
	 * @param {CanvasElements} dom Canvas elements.
	 * @param {CanvasCallbacks} callbacks Selection and drag callbacks.
	 */
	constructor(dom, callbacks) {
		this.#dom = dom;
		this.#callbacks = callbacks;
		this.#bindPointer();
		this.#bindWheel();
	}

	/** Whether Auto camera following is enabled. @returns {boolean} Auto state. */
	get auto() {
		return this.#auto;
	}

	/** @param {boolean} value Whether to keep current activity in view. */
	set auto(value) {
		this.#auto = value;
		if (value) {
			this.#frameActivity(true);
		}

		this.#callbacks.onAutoChange(value);
	}

	/**
	 * Replace the rendered graph.
	 * @param {FlowNode[]} nodes Nodes to draw.
	 * @param {FlowEdge[]} edges Edges to draw.
	 * @param {Map<string, { x: number, y: number }>} pinned Manual positions from dragging.
	 * @param {{ draft?: string, busy?: boolean }} [state] Editor and agent state.
	 */
	render(nodes, edges, pinned, state) {
		this.#nodes = nodes;
		this.#edges = edges;
		this.#busy = Boolean(state?.busy);
		if (state?.draft !== undefined) {
			const active = document.activeElement;
			if (!(active instanceof Element && active.closest(".node-prompt"))) {
				this.#draft = state.draft;
			}
		}

		this.#dom.empty.hidden = nodes.length > 0;

		const layout = computeLayout(nodes, pinned);
		this.#boxes = layout.boxes;
		this.#syncNodes();
		this.#syncEdges(layout);

		if (!this.#fitted && nodes.length > 0) {
			this.#fitted = true;
			if (this.#auto) {
				this.#frameActivity(true);
			} else {
				this.#fitView();
			}
		} else if (this.#auto) {
			this.#frameActivity();
		}
	}

	/** Scale and centre the graph so the whole conversation is visible. */
	fit() {
		this.#disableAuto();
		this.#fitView();
	}

	/** Apply a fit-to-view transform without changing Auto mode. */
	#fitView() {
		const bounds = this.#bounds();
		const stage = this.#dom.stage.getBoundingClientRect();
		if (!bounds || stage.width === 0 || stage.height === 0) {
			return;
		}

		const scale = clamp(
			Math.min((stage.width - FIT_PADDING * 2) / bounds.width, (stage.height - FIT_PADDING * 2) / bounds.height),
			MIN_ZOOM,
			1,
		);

		this.#view = {
			k: scale,
			x: stage.width / 2 - (bounds.x + bounds.width / 2) * scale,
			y: stage.height / 2 - (bounds.y + bounds.height / 2) * scale,
		};

		this.#applyTransform();
	}

	/**
	 * Zoom around the centre of the viewport.
	 * @param {number} factor Multiplier applied to the current zoom level.
	 */
	zoomBy(factor) {
		this.#disableAuto();
		const stage = this.#dom.stage.getBoundingClientRect();
		this.#zoomAt(stage.width / 2, stage.height / 2, factor);
	}

	/**
	 * Select a card, or clear the selection.
	 * @param {string | undefined} id Node id, or undefined to clear.
	 */
	select(id) {
		this.#selectedId = id;
		for (const [nodeId, element] of this.#nodeElements) {
			element.classList.toggle("selected", nodeId === id);
		}

		for (const edge of this.#edges) {
			const element = this.#edgeElements.get(edge.id);
			if (!element) {
				continue;
			}

			const touches = Boolean(id) && (edge.source === id || edge.target === id);
			element.classList.toggle("highlight", touches);
		}

		this.#callbacks.onSelect(id ? this.#nodes.find((node) => node.id === id) : undefined);
	}

	/** Create, update, and remove card elements to match the current graph. */
	#syncNodes() {
		const seen = new Set();
		for (const node of this.#nodes) {
			seen.add(node.id);
			const box = this.#boxes.get(node.id);
			if (!box) {
				continue;
			}

			let element = this.#nodeElements.get(node.id);
			if (!element) {
				element = createCard(node.id);
				this.#bindPrompt(element);
				this.#nodeElements.set(node.id, element);
				this.#dom.nodes.append(element);
			}

			updateCard(element, node, node.id === this.#selectedId, this.#draft, this.#busy);
			element.style.transform = `translate(${box.x - box.width / 2}px, ${box.y}px)`;
			element.style.height = `${box.height}px`;
		}

		for (const [id, element] of this.#nodeElements) {
			if (!seen.has(id)) {
				element.remove();
				this.#nodeElements.delete(id);
			}
		}
	}

	/**
	 * Create, update, and remove edge paths to match the current graph.
	 * @param {import("./layout.js").FlowLayout} layout Card and row geometry.
	 */
	#syncEdges(layout) {
		const slots = assignEdgeSlots(this.#edges);
		const seen = new Set();

		for (const edge of this.#edges) {
			const slot = slots.get(edge.id) ?? { slot: 0, slotCount: 1 };
			const path = routeEdge(edge, layout, slot.slot, slot.slotCount);
			if (!path) {
				continue;
			}

			seen.add(edge.id);
			let element = this.#edgeElements.get(edge.id);
			if (!element) {
				element = document.createElementNS(SVG_NS, "path");
				this.#edgeElements.set(edge.id, element);
				this.#dom.edgeLayer.append(element);
			}

			element.setAttribute("d", path);
			element.setAttribute(
				"class",
				`edge ${edge.kind}${edge.onActiveBranch ? " active" : ""}${
					this.#selectedId && (edge.source === this.#selectedId || edge.target === this.#selectedId) ? " highlight" : ""
				}`,
			);
		}

		for (const [id, element] of this.#edgeElements) {
			if (!seen.has(id)) {
				element.remove();
				this.#edgeElements.delete(id);
			}
		}
	}

	/**
	 * Push the current viewport transform onto both layers.
	 * @returns {void}
	 */
	#applyTransform() {
		const { x, y, k } = this.#view;
		this.#dom.nodes.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
		this.#dom.edgeLayer.setAttribute("transform", `translate(${x} ${y}) scale(${k})`);
		this.#dom.stage.style.backgroundSize = `${26 * k}px ${26 * k}px`;
		this.#dom.stage.style.backgroundPosition = `${x}px ${y}px`;
	}

	/**
	 * Zoom while keeping the graph point under a viewport position fixed.
	 * @param {number} pointerX Viewport x, relative to the stage.
	 * @param {number} pointerY Viewport y, relative to the stage.
	 * @param {number} factor Multiplier applied to the current zoom level.
	 */
	#zoomAt(pointerX, pointerY, factor) {
		const next = clamp(this.#view.k * factor, MIN_ZOOM, MAX_ZOOM);
		const ratio = next / this.#view.k;
		this.#view = {
			k: next,
			x: pointerX - (pointerX - this.#view.x) * ratio,
			y: pointerY - (pointerY - this.#view.y) * ratio,
		};

		this.#applyTransform();
	}

	/**
	 * Find the bounding box of every card in graph space.
	 * @returns {{ x: number, y: number, width: number, height: number } | undefined} Bounds.
	 */
	#bounds() {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const box of this.#boxes.values()) {
			minX = Math.min(minX, box.x - box.width / 2);
			maxX = Math.max(maxX, box.x + box.width / 2);
			minY = Math.min(minY, box.y);
			maxY = Math.max(maxY, box.y + box.height);
		}

		if (minX === Infinity) {
			return undefined;
		}

		return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
	}

	/**
	 * Animate the viewport toward the latest relevant activity.
	 * @param {boolean} [immediate] Skip animation and snap.
	 */
	#frameActivity(immediate = false) {
		if (!this.#auto || this.#dragging) {
			return;
		}

		const target = this.#activityView();
		if (!target) {
			return;
		}

		if (immediate || viewsClose(this.#view, target)) {
			this.#stopAnimation();
			this.#view = target;
			this.#applyTransform();
			return;
		}

		this.#animFrom = { ...this.#view };
		this.#animTo = target;
		this.#animStarted = performance.now();
		if (this.#animFrame === undefined) {
			this.#animFrame = requestAnimationFrame((time) => this.#tickAnimation(time));
		}
	}

	/**
	 * Disable Auto mode after a manual camera or layout change.
	 */
	#disableAuto() {
		if (!this.#auto) {
			return;
		}

		this.#auto = false;
		this.#stopAnimation();
		this.#callbacks.onAutoChange(false);
	}

	/**
	 * Bind the prompt form on a newly created card.
	 * @param {HTMLElement} card Card element.
	 */
	#bindPrompt(card) {
		const form = card.querySelector(".node-prompt");
		const input = card.querySelector(".node-prompt-input");
		if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLTextAreaElement)) {
			return;
		}

		form.addEventListener("pointerdown", (event) => event.stopPropagation());
		form.addEventListener("submit", (event) => {
			event.preventDefault();
			this.#callbacks.onPrompt(input.value, this.#busy ? "followUp" : undefined);
		});
		input.addEventListener("input", () => this.#callbacks.onDraft(input.value));
		input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.shiftKey) {
				return;
			}

			event.preventDefault();
			if ((event.metaKey || event.ctrlKey) && this.#busy) {
				this.#callbacks.onPrompt(input.value, "steer");
				return;
			}

			form.requestSubmit();
		});
	}

	/**
	 * Compute a viewport that keeps the latest main node near centre with nearby branches visible.
	 * @returns {{ x: number, y: number, k: number } | undefined} Target view.
	 */
	#activityView() {
		const focus = this.#focusNode();
		const box = focus ? this.#boxes.get(focus.id) : undefined;
		if (!focus || !box) {
			return undefined;
		}

		const nearby = this.#nearbyBoxes(focus);
		let minX = box.x - box.width / 2;
		let maxX = box.x + box.width / 2;
		let minY = box.y;
		let maxY = box.y + box.height;
		for (const other of nearby) {
			minX = Math.min(minX, other.x - other.width / 2);
			maxX = Math.max(maxX, other.x + other.width / 2);
			minY = Math.min(minY, other.y);
			maxY = Math.max(maxY, other.y + other.height);
		}

		const stage = this.#dom.stage.getBoundingClientRect();
		if (stage.width === 0 || stage.height === 0) {
			return undefined;
		}

		const padding = 80;
		const width = Math.max(maxX - minX, 1);
		const height = Math.max(maxY - minY, 1);
		const scale = clamp(
			Math.min((stage.width - padding * 2) / width, (stage.height - padding * 2) / height),
			MIN_ZOOM,
			1.15,
		);
		return {
			k: scale,
			x: stage.width / 2 - ((minX + maxX) / 2) * scale,
			y: stage.height / 2 - ((minY + maxY) / 2) * scale,
		};
	}

	/**
	 * Choose the node Auto mode should keep in view.
	 * @returns {FlowNode | undefined} Focus node.
	 */
	#focusNode() {
		const live = [...this.#nodes].reverse().find((node) => {
			return node.onActiveBranch && (node.status === "running" || node.status === "streaming" || node.kind === "queued");
		});
		if (live) {
			return live;
		}

		return [...this.#nodes].reverse().find((node) => node.onActiveBranch && node.lane === null && node.kind !== "tool");
	}

	/**
	 * Collect nearby branch cards to keep in frame with the focus node.
	 * @param {FlowNode} focus Node Auto is following.
	 * @returns {import("./layout.js").NodeBox[]} Nearby boxes.
	 */
	#nearbyBoxes(focus) {
		/** @type {import("./layout.js").NodeBox[]} */
		const boxes = [];
		for (const node of this.#nodes) {
			if (node.id === focus.id || Math.abs(node.depth - focus.depth) > 2) {
				continue;
			}

			const box = this.#boxes.get(node.id);
			if (box) {
				boxes.push(box);
			}

			if (boxes.length >= 6) {
				break;
			}
		}

		return boxes;
	}

	/**
	 * Advance the Auto camera animation.
	 * @param {number} time Animation timestamp.
	 */
	#tickAnimation(time) {
		const from = this.#animFrom;
		const to = this.#animTo;
		if (!from || !to) {
			this.#animFrame = undefined;
			return;
		}

		const progress = clamp((time - this.#animStarted) / 280, 0, 1);
		const eased = 1 - (1 - progress) ** 3;
		this.#view = {
			x: from.x + (to.x - from.x) * eased,
			y: from.y + (to.y - from.y) * eased,
			k: from.k + (to.k - from.k) * eased,
		};
		this.#applyTransform();
		if (progress < 1 && this.#auto) {
			this.#animFrame = requestAnimationFrame((next) => this.#tickAnimation(next));
			return;
		}

		this.#animFrame = undefined;
		this.#animFrom = undefined;
		this.#animTo = undefined;
	}

	/** Cancel an in-flight Auto camera animation. */
	#stopAnimation() {
		if (this.#animFrame !== undefined) {
			cancelAnimationFrame(this.#animFrame);
			this.#animFrame = undefined;
		}

		this.#animFrom = undefined;
		this.#animTo = undefined;
	}

	/** Wire panning, card dragging, and click selection. */
	#bindPointer() {
		const stage = this.#dom.stage;

		stage.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) {
				return;
			}

			if (event.target instanceof Element && event.target.closest(".node-prompt, .node-expand")) {
				return;
			}

			const target = event.target instanceof Element ? event.target.closest(".flow-node") : null;
			const card = target instanceof HTMLElement ? target : undefined;
			const id = card?.dataset.id;
			const box = id ? this.#boxes.get(id) : undefined;
			const start = { x: event.clientX, y: event.clientY };
			const origin = box ? { x: box.x, y: box.y } : { x: this.#view.x, y: this.#view.y };
			let moved = false;

			stage.setPointerCapture(event.pointerId);
			if (!card) {
				stage.classList.add("panning");
			}

			/** @param {PointerEvent} move Pointer move event. */
			const onMove = (move) => {
				const dx = move.clientX - start.x;
				const dy = move.clientY - start.y;
				if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
					return;
				}

				moved = true;
				this.#disableAuto();
				if (card && id && box) {
					this.#dragging = true;
					card.classList.add("dragging");
					const x = origin.x + dx / this.#view.k;
					const y = origin.y + dy / this.#view.k;
					this.#callbacks.onPin(id, x, y);
				} else {
					this.#view = { ...this.#view, x: origin.x + dx, y: origin.y + dy };
					this.#applyTransform();
				}
			};

			/** Finish the gesture and decide whether it was a click. */
			const onUp = () => {
				stage.removeEventListener("pointermove", onMove);
				stage.removeEventListener("pointerup", onUp);
				stage.removeEventListener("pointercancel", onUp);
				stage.releasePointerCapture(event.pointerId);
				stage.classList.remove("panning");
				card?.classList.remove("dragging");
				this.#dragging = false;

				if (!moved) {
					this.select(id === this.#selectedId ? undefined : id);
				}
			};

			stage.addEventListener("pointermove", onMove);
			stage.addEventListener("pointerup", onUp);
			stage.addEventListener("pointercancel", onUp);
		});
	}

	/** Wire wheel zoom and trackpad panning. */
	#bindWheel() {
		this.#dom.stage.addEventListener(
			"wheel",
			(event) => {
				event.preventDefault();
				this.#disableAuto();
				const stage = this.#dom.stage.getBoundingClientRect();
				const pointerX = event.clientX - stage.left;
				const pointerY = event.clientY - stage.top;

				if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) > Math.abs(event.deltaX) * 2) {
					this.#zoomAt(pointerX, pointerY, Math.exp(-event.deltaY / 400));
					return;
				}

				this.#view = { ...this.#view, x: this.#view.x - event.deltaX, y: this.#view.y - event.deltaY };
				this.#applyTransform();
			},
			{ passive: false },
		);
	}
}

/**
 * Build an empty card element.
 * @param {string} id Node id, stored for hit testing.
 * @returns {HTMLElement} Card element.
 */
function createCard(id) {
	const card = document.createElement("div");
	card.className = "flow-node";
	card.dataset.id = id;
	card.innerHTML =
		'<span class="node-port in"></span>' +
		'<div class="node-head"><span class="node-title"></span><span class="node-status"></span></div>' +
		'<div class="node-subtitle"></div>' +
		'<div class="node-preview"></div>' +
		'<div class="node-badges"></div>' +
		'<button type="button" class="node-expand" hidden>Expand</button>' +
		'<form class="node-prompt" hidden>' +
		'<textarea class="node-prompt-input" rows="3" placeholder="Message Pi…"></textarea>' +
		'<div class="node-prompt-actions">' +
		'<button type="submit" class="node-prompt-send">Send</button>' +
		'<span class="node-prompt-hint">Enter to send · ⌘Enter to steer while busy</span>' +
		"</div></form>" +
		'<span class="node-port out"></span>';

	return card;
}

/**
 * Write node contents into a card element.
 * @param {HTMLElement} card Card element.
 * @param {FlowNode} node Node data.
 * @param {boolean} selected Whether the card is selected.
 * @param {string} draft Draft prompt text.
 * @param {boolean} busy Whether the agent is working.
 */
function updateCard(card, node, selected, draft, busy) {
	card.className = [
		"flow-node",
		`kind-${node.kind}`,
		`status-${node.status}`,
		node.onActiveBranch ? "" : "off-branch",
		node.promptHost ? "prompt-host" : "",
		node.summarized ? "summarized" : "",
		selected ? "selected" : "",
	]
		.filter(Boolean)
		.join(" ");
	card.title = node.title;

	setText(card, ".node-title", node.title);
	setText(card, ".node-subtitle", node.subtitle ?? "");
	setText(card, ".node-preview", node.preview ?? "");

	const form = card.querySelector(".node-prompt");
	const input = card.querySelector(".node-prompt-input");
	const send = card.querySelector(".node-prompt-send");
	if (form instanceof HTMLFormElement) {
		form.hidden = !node.promptHost;
	}

	if (input instanceof HTMLTextAreaElement && node.promptHost && document.activeElement !== input) {
		input.value = draft;
	}

	if (send instanceof HTMLButtonElement) {
		send.textContent = busy ? "Queue" : "Send";
	}

	const expand = card.querySelector(".node-expand");
	if (expand instanceof HTMLButtonElement) {
		const expandable = node.kind === "context" || (node.badges ?? []).includes("collapsed") || (node.badges ?? []).includes("expanded");
		expand.hidden = !expandable;
		expand.textContent = node.expanded ? "Collapse" : "Expand";
		expand.dataset.expanded = node.expanded ? "true" : "false";
	}

	const badges = card.querySelector(".node-badges");
	if (badges) {
		badges.textContent = "";
		for (const badge of node.badges ?? []) {
			const element = document.createElement("span");
			element.className = "node-badge";
			element.textContent = badge;
			badges.append(element);
		}
	}
}

/**
 * Set the text of a child element, hiding it when empty.
 * @param {HTMLElement} card Card element.
 * @param {string} selector Child selector.
 * @param {string} text Text to display.
 */
function setText(card, selector, text) {
	const element = card.querySelector(selector);
	if (element instanceof HTMLElement) {
		element.textContent = text;
		element.hidden = text.length === 0;
	}
}

/**
 * Keep a value inside an inclusive range.
 * @param {number} value Value to clamp.
 * @param {number} [min] Lower bound.
 * @param {number} [max] Upper bound.
 * @returns {number} Clamped value.
 */
function clamp(value, min = MIN_ZOOM, max = MAX_ZOOM) {
	return Math.min(Math.max(value, min), max);
}

/**
 * True when two viewport transforms are close enough that animating would jitter.
 * @param {{ x: number, y: number, k: number }} left First view.
 * @param {{ x: number, y: number, k: number }} right Second view.
 * @returns {boolean} Whether the views are effectively equal.
 */
function viewsClose(left, right) {
	return Math.abs(left.x - right.x) < 2 && Math.abs(left.y - right.y) < 2 && Math.abs(left.k - right.k) < 0.01;
}
