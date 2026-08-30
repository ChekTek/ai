import type { FlowEdge, FlowGraph, FlowGraphDelta, FlowNode } from "./protocol.ts";

/**
 * Compare two graph revisions so only the changed parts are sent to the browser.
 * @param previous Graph from the last broadcast, or undefined for the first one.
 * @param next Freshly built graph.
 * @returns The difference between the two graphs.
 */
export function computeDelta(previous: FlowGraph | undefined, next: FlowGraph): FlowGraphDelta {
	const previousNodes = indexById(previous?.nodes ?? []);
	const previousEdges = indexById(previous?.edges ?? []);
	const delta: FlowGraphDelta = {
		addedNodes: [],
		updatedNodes: [],
		removedNodeIds: [],
		addedEdges: [],
		updatedEdges: [],
		removedEdgeIds: [],
	};

	for (const node of next.nodes) {
		const before = previousNodes.get(node.id);
		if (!before) {
			delta.addedNodes.push(node);
		} else if (JSON.stringify(before) !== JSON.stringify(node)) {
			delta.updatedNodes.push(node);
		}

		previousNodes.delete(node.id);
	}

	for (const edge of next.edges) {
		const before = previousEdges.get(edge.id);
		if (!before) {
			delta.addedEdges.push(edge);
		} else if (JSON.stringify(before) !== JSON.stringify(edge)) {
			delta.updatedEdges.push(edge);
		}

		previousEdges.delete(edge.id);
	}

	delta.removedNodeIds = [...previousNodes.keys()];
	delta.removedEdgeIds = [...previousEdges.keys()];

	return delta;
}

/**
 * Determine whether a delta contains anything worth sending.
 * @param delta Delta to inspect.
 * @returns True when at least one node or edge changed.
 */
export function isEmptyDelta(delta: FlowGraphDelta): boolean {
	return (
		delta.addedNodes.length === 0 &&
		delta.updatedNodes.length === 0 &&
		delta.removedNodeIds.length === 0 &&
		delta.addedEdges.length === 0 &&
		delta.updatedEdges.length === 0 &&
		delta.removedEdgeIds.length === 0
	);
}

/**
 * Index nodes or edges by their id.
 * @param items Items to index.
 * @returns Map keyed by id.
 */
function indexById<T extends FlowEdge | FlowNode>(items: readonly T[]): Map<string, T> {
	return new Map(items.map((item) => [item.id, item]));
}
