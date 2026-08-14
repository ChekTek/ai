/**
 * Wire protocol shared by the pi-flow extension server and the browser canvas.
 *
 * The browser client mirrors these shapes in JSDoc typedefs, so any change here
 * must be reflected in `web/js/protocol.js`.
 */

/** Category of a node on the conversation canvas. */
export type FlowNodeKind = "assistant" | "bash" | "branchSummary" | "compaction" | "custom" | "tool" | "user";

/** Lifecycle state rendered on a node card. */
export type FlowNodeStatus = "aborted" | "error" | "running" | "streaming" | "success";

/** A single card on the canvas. */
export interface FlowNode {
	/** Stable identity, derived from the session entry id or the tool call id. */
	id: string;
	/** Category used for styling and layout. */
	kind: FlowNodeKind;
	/** Row index in the top-down layout. */
	depth: number;
	/** Node this one hangs from in the layout tree, or null for a root. */
	layoutParentId: string | null;
	/** Position among sibling tool branches, or null when the node sits on the spine. */
	lane: number | null;
	/** Number of sibling tool branches sharing the same parent, or null when on the spine. */
	laneCount: number | null;
	/** Card heading. */
	title: string;
	/** Secondary heading, such as a tool argument summary. */
	subtitle?: string;
	/** Short body text rendered on the card. */
	preview?: string;
	/** Longer body text rendered in the inspector panel. */
	detail?: string;
	/** Lifecycle state. */
	status: FlowNodeStatus;
	/** Unix milliseconds for the underlying message, when known. */
	timestamp?: number;
	/** Session entry id, when the node is backed by a persisted entry. */
	entryId?: string;
	/** Whether the node sits on the session's active branch. */
	onActiveBranch: boolean;
	/** Small key/value badges rendered on the card. */
	badges?: string[];
}

/** A connection between two cards. */
export interface FlowEdge {
	/** Stable identity derived from the endpoints. */
	id: string;
	/** Source node id. */
	source: string;
	/** Target node id. */
	target: string;
	/** Whether the edge follows the spine, branches into a tool, or rejoins the spine. */
	kind: "branch" | "flow" | "rejoin";
	/** Whether both endpoints sit on the session's active branch. */
	onActiveBranch: boolean;
}

/** Full canvas contents. */
export interface FlowGraph {
	/** Every card, in traversal order. */
	nodes: FlowNode[];
	/** Every connection, in traversal order. */
	edges: FlowEdge[];
}

/** Session metadata shown in the canvas header. */
export interface FlowSessionInfo {
	/** Session UUID. */
	sessionId: string;
	/** User-defined session name, when set. */
	name?: string;
	/** Working directory of the session. */
	cwd: string;
	/** Session file path, or undefined for in-memory sessions. */
	file?: string;
	/** Active model label, when known. */
	model?: string;
	/** Current leaf entry id. */
	leafId: string | null;
	/** Whether the agent is currently working. */
	busy: boolean;
}

/** Difference between two graph revisions. */
export interface FlowGraphDelta {
	/** Nodes that did not exist in the previous revision. */
	addedNodes: FlowNode[];
	/** Nodes whose contents changed. */
	updatedNodes: FlowNode[];
	/** Ids of nodes that no longer exist. */
	removedNodeIds: string[];
	/** Edges that did not exist in the previous revision. */
	addedEdges: FlowEdge[];
	/** Edges whose contents changed. */
	updatedEdges: FlowEdge[];
	/** Ids of edges that no longer exist. */
	removedEdgeIds: string[];
}

/** Messages sent from the extension to the browser. */
export type FlowServerMessage =
	| {
			/** Complete canvas state, sent on every new connection. */
			type: "snapshot";
			revision: number;
			session: FlowSessionInfo;
			graph: FlowGraph;
	  }
	| {
			/** Incremental change since the previous revision. */
			type: "patch";
			revision: number;
			session: FlowSessionInfo;
			delta: FlowGraphDelta;
	  }
	| {
			/** The extension is shutting the session-scoped server down. */
			type: "closing";
			reason: string;
	  };

/** Messages sent from the browser to the extension. */
export type FlowClientMessage = {
	/** Ask for a fresh snapshot, for example after a dropped connection. */
	type: "resync";
};
