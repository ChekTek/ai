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
	#follow = true;

	/** @type {boolean} */
	#fitted = false;

	/** @type {boolean} */
	#dragging = false;

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

	/** Whether the newest activity is kept in view. @returns {boolean} Follow state. */
	get follow() {
		return this.#follow;
	}

	/** @param {boolean} value Whether to keep the newest activity in view. */
	set follow(value) {
		this.#follow = value;
		if (value) {
			this.#revealNewest();
		}
	}

	/**
	 * Replace the rendered graph.
	 * @param {FlowNode[]} nodes Nodes to draw.
	 * @param {FlowEdge[]} edges Edges to draw.
	 * @param {Map<string, { x: number, y: number }>} pinned Manual positions from dragging.
	 */
	render(nodes, edges, pinned) {
		this.#nodes = nodes;
		this.#edges = edges;
		this.#dom.empty.hidden = nodes.length > 0;

		const layout = computeLayout(nodes, pinned);
		this.#boxes = layout.boxes;
		this.#syncNodes();
		this.#syncEdges(layout);

		if (!this.#fitted && nodes.length > 0) {
			this.#fitted = true;
			this.fit();
		} else if (this.#follow) {
			this.#revealNewest();
		}
	}

	/** Scale and centre the graph so the whole conversation is visible. */
	fit() {
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
				this.#nodeElements.set(node.id, element);
				this.#dom.nodes.append(element);
			}

			updateCard(element, node, node.id === this.#selectedId);
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

	/** Pan just enough to bring the newest card into view. */
	#revealNewest() {
		if (this.#dragging) {
			return;
		}

		const newest = this.#nodes.at(-1);
		const box = newest ? this.#boxes.get(newest.id) : undefined;
		if (!box) {
			return;
		}

		const stage = this.#dom.stage.getBoundingClientRect();
		const { x, y, k } = this.#view;
		const left = box.x * k - (box.width * k) / 2 + x;
		const right = left + box.width * k;
		const top = box.y * k + y;
		const bottom = top + box.height * k;
		const margin = 48;
		let nextX = x;
		let nextY = y;

		if (right > stage.width - margin) {
			nextX -= right - (stage.width - margin);
		} else if (left < margin) {
			nextX += margin - left;
		}

		if (bottom > stage.height - margin) {
			nextY -= bottom - (stage.height - margin);
		} else if (top < margin) {
			nextY += margin - top;
		}

		if (nextX !== x || nextY !== y) {
			this.#view = { x: nextX, y: nextY, k };
			this.#applyTransform();
		}
	}

	/** Wire panning, card dragging, and click selection. */
	#bindPointer() {
		const stage = this.#dom.stage;

		stage.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) {
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
		'<span class="node-port out"></span>';

	return card;
}

/**
 * Write node contents into a card element.
 * @param {HTMLElement} card Card element.
 * @param {FlowNode} node Node data.
 * @param {boolean} selected Whether the card is selected.
 */
function updateCard(card, node, selected) {
	card.className = [
		"flow-node",
		`kind-${node.kind}`,
		`status-${node.status}`,
		node.onActiveBranch ? "" : "off-branch",
		selected ? "selected" : "",
	]
		.filter(Boolean)
		.join(" ");
	card.title = node.title;

	setText(card, ".node-title", node.title);
	setText(card, ".node-subtitle", node.subtitle ?? "");
	setText(card, ".node-preview", node.preview ?? "");

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
