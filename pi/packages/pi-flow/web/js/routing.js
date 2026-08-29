/**
 * @import { FlowEdge } from "./protocol.js"
 * @import { FlowLayout } from "./layout.js"
 */
import { ROW_GAP } from "./layout.js";

/** Corner radius used where an edge turns. */
const CORNER = 18;

/** Vertical spacing between the horizontal runs of edges that share an endpoint. */
const LANE_SPACING = 7;

/**
 * Build the SVG path for an edge.
 *
 * Horizontal runs are confined to the gap between two rows, which no card can
 * occupy, so routed edges never pass through a node. Edges that share a fan-out or
 * fan-in point are staggered inside that gap so their runs stay distinguishable.
 * @param {FlowEdge} edge Edge to route.
 * @param {FlowLayout} layout Card and row geometry.
 * @param {number} slot Index of this edge among the edges sharing its endpoint.
 * @param {number} slotCount Number of edges sharing its endpoint.
 * @returns {string | undefined} SVG path data, or undefined when an endpoint is missing.
 */
export function routeEdge(edge, layout, slot, slotCount) {
	const source = layout.boxes.get(edge.source);
	const target = layout.boxes.get(edge.target);
	if (!source || !target) {
		return undefined;
	}

	const startX = source.x;
	const startY = source.y + source.height;
	const endX = target.x;
	const endY = target.y;

	if (endY <= startY) {
		return `M ${round(startX)} ${round(startY)} L ${round(endX)} ${round(endY)}`;
	}

	if (Math.abs(endX - startX) < 1) {
		return `M ${round(startX)} ${round(startY)} L ${round(endX)} ${round(endY)}`;
	}

	const stagger = (slot - (slotCount - 1) / 2) * LANE_SPACING;
	const gap = Math.min(ROW_GAP, endY - startY);
	const middleY = clamp(startY + (endY - startY) / 2 + stagger, startY + gap * 0.25, endY - gap * 0.25);
	const direction = endX > startX ? 1 : -1;
	const radius = Math.min(CORNER, Math.abs(endX - startX) / 2, middleY - startY, endY - middleY);

	return [
		`M ${round(startX)} ${round(startY)}`,
		`L ${round(startX)} ${round(middleY - radius)}`,
		`Q ${round(startX)} ${round(middleY)} ${round(startX + direction * radius)} ${round(middleY)}`,
		`L ${round(endX - direction * radius)} ${round(middleY)}`,
		`Q ${round(endX)} ${round(middleY)} ${round(endX)} ${round(middleY + radius)}`,
		`L ${round(endX)} ${round(endY)}`,
	].join(" ");
}

/**
 * Assign each edge a slot within the fan it belongs to.
 *
 * Tool branches fan out from one assistant, and rejoin edges fan in to the node
 * that follows them, so each group is keyed by whichever end they share.
 * @param {FlowEdge[]} edges Edges to group.
 * @returns {Map<string, { slot: number, slotCount: number }>} Slot assignment keyed by edge id.
 */
export function assignEdgeSlots(edges) {
	/** @type {Map<string, FlowEdge[]>} */
	const groups = new Map();
	for (const edge of edges) {
		const key = edge.kind === "rejoin" ? `in:${edge.target}` : `out:${edge.source}`;
		const group = groups.get(key);
		if (group) {
			group.push(edge);
		} else {
			groups.set(key, [edge]);
		}
	}

	/** @type {Map<string, { slot: number, slotCount: number }>} */
	const slots = new Map();
	for (const group of groups.values()) {
		group.forEach((edge, index) => slots.set(edge.id, { slot: index, slotCount: group.length }));
	}

	return slots;
}

/**
 * Keep a value inside an inclusive range.
 * @param {number} value Value to clamp.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number} Clamped value.
 */
function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * Trim coordinate precision so path strings stay short.
 * @param {number} value Coordinate.
 * @returns {number} Rounded coordinate.
 */
function round(value) {
	return Math.round(value * 10) / 10;
}
