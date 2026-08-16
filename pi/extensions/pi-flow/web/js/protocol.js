/**
 * Browser-side mirror of the types in `src/protocol.ts`.
 *
 * Keep both files in sync: the extension serialises these shapes straight onto
 * the WebSocket, so a change on either side has to be made on both.
 */

/**
 * @typedef {"user" | "assistant" | "tool" | "bash" | "compaction" | "branchSummary" | "custom" | "queued" | "context" | "skill"} FlowNodeKind
 */

/**
 * @typedef {"steer" | "followUp"} FlowDeliverAs
 */

/**
 * @typedef {"streaming" | "running" | "success" | "error" | "aborted"} FlowNodeStatus
 */

/**
 * @typedef {object} FlowNode
 * @property {string} id Stable identity derived from the session entry or tool call id.
 * @property {FlowNodeKind} kind Category used for styling and layout.
 * @property {number} depth Row index in the top-down layout.
 * @property {string | null} layoutParentId Node this one hangs from in the layout tree.
 * @property {number | null} lane Position among sibling tool branches, or null on the spine.
 * @property {number | null} laneCount Number of sibling tool branches, or null on the spine.
 * @property {string} title Card heading.
 * @property {string} [subtitle] Secondary heading.
 * @property {string} [preview] Short body text rendered on the card.
 * @property {string} [detail] Longer body text rendered in the inspector.
 * @property {FlowNodeStatus} status Lifecycle state.
 * @property {number} [timestamp] Unix milliseconds for the underlying message.
 * @property {string} [entryId] Session entry id, when persisted.
 * @property {boolean} onActiveBranch Whether the node sits on the active branch.
 * @property {string[]} [badges] Small badges rendered on the card.
 * @property {boolean} [promptHost] Whether this card hosts the active prompt editor.
 * @property {boolean} [expanded] Whether an expandable context card is showing detail.
 * @property {boolean} [summarized] Whether compaction replaced this node with a summary.
 * @property {boolean} [isLeaf] Whether this node is the current session leaf.
 * @property {string} [label] Persistent bookmark label.
 * @property {string} [parentEntryId] Parent session entry id.
 * @property {string} [promptText] Original user prompt text.
 */

/**
 * @typedef {object} FlowEdge
 * @property {string} id Stable identity derived from the endpoints.
 * @property {string} source Source node id.
 * @property {string} target Target node id.
 * @property {"flow" | "branch" | "rejoin"} kind Whether the edge follows the spine, branches, or rejoins.
 * @property {boolean} onActiveBranch Whether both endpoints sit on the active branch.
 */

/**
 * @typedef {object} FlowGraph
 * @property {FlowNode[]} nodes Every card.
 * @property {FlowEdge[]} edges Every connection.
 */

/**
 * @typedef {object} FlowSessionInfo
 * @property {string} sessionId Session UUID.
 * @property {string} [name] User-defined session name.
 * @property {string} cwd Working directory of the session.
 * @property {string} [file] Session file path.
 * @property {string} [model] Active model label.
 * @property {string | null} leafId Current leaf entry id.
 * @property {boolean} busy Whether the agent is currently working.
 * @property {string} draft Draft prompt text preserved across reconnects.
 * @property {FlowQueuedPrompt[]} queued Graph-submitted prompts not yet in the session.
 * @property {{ tokens: number | null, percent: number | null, contextWindow: number }} [contextUsage] Current context window usage.
 */

/**
 * @typedef {object} FlowQueuedPrompt
 * @property {string} id Stable id for the queued card.
 * @property {string} text Prompt text.
 * @property {FlowDeliverAs} deliverAs Delivery mode used while the agent was busy.
 */

/**
 * @typedef {object} FlowGraphDelta
 * @property {FlowNode[]} addedNodes Nodes that did not exist before.
 * @property {FlowNode[]} updatedNodes Nodes whose contents changed.
 * @property {string[]} removedNodeIds Ids of nodes that no longer exist.
 * @property {FlowEdge[]} addedEdges Edges that did not exist before.
 * @property {FlowEdge[]} updatedEdges Edges whose contents changed.
 * @property {string[]} removedEdgeIds Ids of edges that no longer exist.
 */

/**
 * @typedef {{ type: "snapshot", revision: number, session: FlowSessionInfo, graph: FlowGraph }
 *   | { type: "patch", revision: number, session: FlowSessionInfo, delta: FlowGraphDelta }
 *   | { type: "closing", reason: string }} FlowServerMessage
 */

/**
 * @typedef {{ type: "resync" }
 *   | { type: "draft", text: string }
 *   | { type: "prompt", text: string, deliverAs?: FlowDeliverAs }
 *   | { type: "collapse", id: string, expanded: boolean }
 *   | { type: "navigate", entryId: string, mode: "continue" | "edit" }
 *   | { type: "label", entryId: string, label?: string }} FlowClientMessage
 */

/**
 * Narrow an arbitrary parsed payload to a server message.
 * @param {unknown} value Parsed JSON payload.
 * @returns {FlowServerMessage | undefined} The message, or undefined when unrecognised.
 */
export function asServerMessage(value) {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const type = /** @type {{ type?: unknown }} */ (value).type;
	if (type === "snapshot" || type === "patch" || type === "closing") {
		return /** @type {FlowServerMessage} */ (value);
	}

	return undefined;
}
