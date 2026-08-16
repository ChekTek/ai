/**
 * @import { FlowEdge, FlowGraph, FlowGraphDelta, FlowNode } from "./protocol.js"
 */

/**
 * Holds the current graph and applies incremental updates from the extension.
 *
 * Nodes are keyed by the id the extension assigns, so replaying a snapshot after a
 * reconnect replaces state in place instead of duplicating it.
 */
export class GraphStore {
	/** @type {Map<string, FlowNode>} */
	#nodes = new Map();

	/** @type {Map<string, FlowEdge>} */
	#edges = new Map();

	/** Nodes the user dragged, keyed by node id. @type {Map<string, { x: number, y: number }>} */
	#pinned = new Map();

	/** Current nodes in insertion order. @returns {FlowNode[]} Nodes. */
	get nodes() {
		return [...this.#nodes.values()];
	}

	/** Current edges in insertion order. @returns {FlowEdge[]} Edges. */
	get edges() {
		return [...this.#edges.values()];
	}

	/** Manual positions for dragged nodes. @returns {Map<string, { x: number, y: number }>} Pinned positions. */
	get pinned() {
		return this.#pinned;
	}

	/**
	 * Look up a node.
	 * @param {string} id Node id.
	 * @returns {FlowNode | undefined} The node, when present.
	 */
	getNode(id) {
		return this.#nodes.get(id);
	}

	/**
	 * Replace the whole graph.
	 * @param {FlowGraph} graph Complete graph from a snapshot message.
	 */
	replace(graph) {
		this.#nodes = new Map(graph.nodes.map((node) => [node.id, node]));
		this.#edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
		this.#dropOrphanPins();
	}

	/**
	 * Apply an incremental update.
	 * @param {FlowGraphDelta} delta Difference from the previous revision.
	 */
	apply(delta) {
		for (const id of delta.removedNodeIds) {
			this.#nodes.delete(id);
		}

		for (const id of delta.removedEdgeIds) {
			this.#edges.delete(id);
		}

		for (const node of [...delta.addedNodes, ...delta.updatedNodes]) {
			this.#nodes.set(node.id, node);
		}

		for (const edge of [...delta.addedEdges, ...delta.updatedEdges]) {
			this.#edges.set(edge.id, edge);
		}

		this.#dropOrphanPins();
	}

	/**
	 * Remember a node position chosen by dragging.
	 * @param {string} id Node id.
	 * @param {number} x Centre x in graph space.
	 * @param {number} y Top edge y in graph space.
	 */
	pin(id, x, y) {
		this.#pinned.set(id, { x, y });
	}

	/** Forget manual positions for nodes that no longer exist. */
	#dropOrphanPins() {
		for (const id of [...this.#pinned.keys()]) {
			if (!this.#nodes.has(id)) {
				this.#pinned.delete(id);
			}
		}
	}
}
