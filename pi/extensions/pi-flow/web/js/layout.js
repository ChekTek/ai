/**
 * @import { FlowNode } from "./protocol.js"
 */

/** Card width in pixels. Must match `--card-width` in styles.css. */
export const CARD_WIDTH = 260;

/** Horizontal distance between neighbouring card centres. */
const COLUMN = CARD_WIDTH + 78;

/** Vertical space reserved between rows for edge routing. */
export const ROW_GAP = 78;

/** Card heights per node kind, in pixels. */
const CARD_HEIGHTS = {
	user: 124,
	assistant: 124,
	tool: 112,
	bash: 112,
	compaction: 104,
	branchSummary: 104,
	custom: 104,
	queued: 112,
	context: 112,
	skill: 96,
};

/** Extra height reserved on the card that hosts the prompt editor. */
const PROMPT_HOST_EXTRA = 118;

/** Minimum separation between sibling subtrees, in columns. */
const SUBTREE_GAP = 1;

/**
 * @typedef {object} NodeBox
 * @property {number} x Centre x in graph space.
 * @property {number} y Top edge y in graph space.
 * @property {number} width Card width.
 * @property {number} height Card height.
 */

/**
 * @typedef {object} FlowLayout
 * @property {Map<string, NodeBox>} boxes Card geometry keyed by node id.
 * @property {Map<number, { top: number, height: number }>} rows Row geometry keyed by depth.
 */

/**
 * @typedef {object} Subtree
 * @property {Map<number, [number, number]>} extents Occupied column range per depth, relative to this node.
 * @property {Map<string, number>} offsets Column offset of each child relative to this node.
 */

/**
 * Read the fixed height used for a node kind.
 * @param {FlowNode} node Node to measure.
 * @returns {number} Card height in pixels.
 */
export function cardHeight(node) {
	const base = CARD_HEIGHTS[node.kind] ?? 104;
	return node.promptHost ? base + PROMPT_HOST_EXTRA : base;
}

/**
 * Place every node on a collision-free grid of rows and columns.
 *
 * Rows come straight from the depth the extension assigns, so a card never shares
 * vertical space with the row above or below it. Columns are assigned with a
 * contour-packed tidy-tree pass: a node keeps its parent's column whenever it is
 * the only continuation, parallel tool calls fan out into their own lanes, and
 * sibling subtrees are pushed apart until their per-row extents no longer touch.
 * Appending to a conversation therefore leaves earlier cards where they were.
 * @param {FlowNode[]} nodes Nodes to place.
 * @param {Map<string, { x: number, y: number }>} pinned Manual positions from dragging.
 * @returns {FlowLayout} Card and row geometry.
 */
export function computeLayout(nodes, pinned) {
	const byId = new Map(nodes.map((node) => [node.id, node]));
	const children = new Map();
	const roots = [];

	for (const node of nodes) {
		const parentId = node.layoutParentId;
		if (parentId === null || !byId.has(parentId)) {
			roots.push(node);
			continue;
		}

		const siblings = children.get(parentId);
		if (siblings) {
			siblings.push(node);
		} else {
			children.set(parentId, [node]);
		}
	}

	const preOrder = collectPreOrder(roots, children);
	const subtrees = buildSubtrees(preOrder, children);
	const rootOffsets = packSiblings(roots, subtrees).offsets;
	const columns = new Map();

	for (const node of preOrder) {
		const parentId = node.layoutParentId;
		const parentColumn = parentId === null ? undefined : columns.get(parentId);
		if (parentColumn === undefined) {
			columns.set(node.id, rootOffsets.get(node.id) ?? 0);
			continue;
		}

		const offset = subtrees.get(parentId ?? "")?.offsets.get(node.id) ?? 0;
		columns.set(node.id, parentColumn + offset);
	}

	return toGeometry(preOrder, columns, pinned);
}

/**
 * Walk the layout tree parents-first so later passes can rely on the order.
 * @param {FlowNode[]} roots Nodes without a visible parent.
 * @param {Map<string, FlowNode[]>} children Children keyed by parent id.
 * @returns {FlowNode[]} Nodes in pre-order.
 */
function collectPreOrder(roots, children) {
	/** @type {FlowNode[]} */
	const order = [];
	const seen = new Set();
	const stack = [...roots].reverse();

	while (stack.length > 0) {
		const node = stack.pop();
		if (!node || seen.has(node.id)) {
			continue;
		}

		seen.add(node.id);
		order.push(node);
		for (const child of [...(children.get(node.id) ?? [])].reverse()) {
			stack.push(child);
		}
	}

	return order;
}

/**
 * Compute the column offsets and occupied extents of every subtree, bottom-up.
 * @param {FlowNode[]} preOrder Nodes in pre-order.
 * @param {Map<string, FlowNode[]>} children Children keyed by parent id.
 * @returns {Map<string, Subtree>} Subtree data keyed by node id.
 */
function buildSubtrees(preOrder, children) {
	/** @type {Map<string, Subtree>} */
	const subtrees = new Map();

	for (let index = preOrder.length - 1; index >= 0; index -= 1) {
		const node = preOrder[index];
		if (!node) {
			continue;
		}

		const kids = children.get(node.id) ?? [];
		const tools = kids
			.filter((child) => child.lane !== null)
			.sort((left, right) => (left.lane ?? 0) - (right.lane ?? 0));
		const spine = kids.filter((child) => child.lane === null);
		const packed = packSiblings(spine, subtrees, true);
		const extents = packed.extents;
		const offsets = packed.offsets;

		mergeExtents(extents, node.depth, 0, 0);
		tools.forEach((tool) => {
			const offset = (tool.lane ?? 0) - ((tool.laneCount ?? tools.length) - 1) / 2;
			offsets.set(tool.id, offset);
			const toolExtents = subtrees.get(tool.id)?.extents;
			if (toolExtents) {
				absorbExtents(extents, toolExtents, offset);
			}
		});

		subtrees.set(node.id, { extents, offsets });
	}

	return subtrees;
}

/**
 * Place sibling subtrees side by side so their per-row extents never touch.
 * @param {FlowNode[]} siblings Siblings to place, in order.
 * @param {Map<string, Subtree>} subtrees Subtree data keyed by node id.
 * @param {boolean} [centre] Whether to centre the group on column zero.
 * @returns {{ offsets: Map<string, number>, extents: Map<number, [number, number]> }} Offsets and merged extents.
 */
function packSiblings(siblings, subtrees, centre = false) {
	/** @type {Map<string, number>} */
	const offsets = new Map();
	/** @type {Map<number, [number, number]>} */
	let extents = new Map();

	siblings.forEach((sibling, index) => {
		const subtree = subtrees.get(sibling.id);
		const siblingExtents = subtree?.extents ?? new Map();
		if (index === 0) {
			extents = cloneExtents(siblingExtents);
			offsets.set(sibling.id, 0);
			return;
		}

		const shift = requiredShift(extents, siblingExtents);
		offsets.set(sibling.id, shift);
		absorbExtents(extents, siblingExtents, shift);
	});

	if (centre && siblings.length > 1) {
		const placed = siblings.map((sibling) => offsets.get(sibling.id) ?? 0);
		const middle = (Math.min(...placed) + Math.max(...placed)) / 2;
		for (const sibling of siblings) {
			offsets.set(sibling.id, (offsets.get(sibling.id) ?? 0) - middle);
		}

		shiftExtents(extents, -middle);
	}

	return { offsets, extents };
}

/**
 * Copy an extent map, including the `[min, max]` arrays, so later packing cannot
 * mutate a subtree that has already been stored.
 * @param {Map<number, [number, number]>} source Extents to copy.
 * @returns {Map<number, [number, number]>} Independent copy.
 */
function cloneExtents(source) {
	/** @type {Map<number, [number, number]>} */
	const cloned = new Map();
	for (const [depth, range] of source) {
		cloned.set(depth, [range[0], range[1]]);
	}

	return cloned;
}

/**
 * Find how far right a subtree must move to clear everything placed so far.
 * @param {Map<number, [number, number]>} placed Extents already occupied.
 * @param {Map<number, [number, number]>} candidate Extents of the subtree being added.
 * @returns {number} Column offset to apply to the candidate.
 */
function requiredShift(placed, candidate) {
	let shift = 0;
	for (const [depth, range] of candidate) {
		const occupied = placed.get(depth);
		if (occupied) {
			shift = Math.max(shift, occupied[1] - range[0] + SUBTREE_GAP);
		}
	}

	return shift;
}

/**
 * Merge one extent map into another, applying a column offset.
 * @param {Map<number, [number, number]>} target Map to grow.
 * @param {Map<number, [number, number]>} source Map to merge in.
 * @param {number} offset Column offset applied to the source.
 */
function absorbExtents(target, source, offset) {
	for (const [depth, range] of source) {
		mergeExtents(target, depth, range[0] + offset, range[1] + offset);
	}
}

/**
 * Widen the extent recorded for a single row.
 * @param {Map<number, [number, number]>} target Map to grow.
 * @param {number} depth Row index.
 * @param {number} min Leftmost column.
 * @param {number} max Rightmost column.
 */
function mergeExtents(target, depth, min, max) {
	const range = target.get(depth);
	if (range) {
		range[0] = Math.min(range[0], min);
		range[1] = Math.max(range[1], max);
	} else {
		target.set(depth, [min, max]);
	}
}

/**
 * Move every recorded extent sideways.
 * @param {Map<number, [number, number]>} extents Extents to move.
 * @param {number} offset Column offset.
 */
function shiftExtents(extents, offset) {
	for (const range of extents.values()) {
		range[0] += offset;
		range[1] += offset;
	}
}

/**
 * Convert rows and columns into pixel geometry, honouring dragged positions.
 * @param {FlowNode[]} nodes Nodes in pre-order.
 * @param {Map<string, number>} columns Column index per node id.
 * @param {Map<string, { x: number, y: number }>} pinned Manual positions from dragging.
 * @returns {FlowLayout} Card and row geometry.
 */
function toGeometry(nodes, columns, pinned) {
	/** @type {Map<number, { top: number, height: number }>} */
	const rows = new Map();
	for (const node of nodes) {
		const row = rows.get(node.depth);
		const height = cardHeight(node);
		if (row) {
			row.height = Math.max(row.height, height);
		} else {
			rows.set(node.depth, { top: 0, height });
		}
	}

	const depths = [...rows.keys()].sort((left, right) => left - right);
	let top = 0;
	for (const depth of depths) {
		const row = rows.get(depth);
		if (!row) {
			continue;
		}

		row.top = top;
		top += row.height + ROW_GAP;
	}

	/** @type {Map<string, NodeBox>} */
	const boxes = new Map();
	for (const node of nodes) {
		const row = rows.get(node.depth);
		const manual = pinned.get(node.id);
		boxes.set(node.id, {
			x: manual ? manual.x : (columns.get(node.id) ?? 0) * COLUMN,
			y: manual ? manual.y : (row?.top ?? 0),
			width: CARD_WIDTH,
			height: cardHeight(node),
		});
	}

	return { boxes, rows };
}
