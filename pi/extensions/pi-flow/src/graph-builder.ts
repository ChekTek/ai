import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";

import type { ContextSnapshot } from "./context-tracker.ts";
import { type LiveState, messageKey } from "./live-state.ts";
import type { FlowAgentMessage, FlowAssistantMessage, FlowToolResultMessage } from "./messages.ts";
import {
	formatToolArguments,
	imageCountOf,
	preview,
	summariseToolArguments,
	textOf,
	thinkingOf,
	toolCallsOf,
	truncate,
} from "./messages.ts";
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeStatus, FlowQueuedPrompt, FlowSessionInfo } from "./protocol.ts";

/** Maximum characters kept for the inspector panel body of a node. */
const DETAIL_LIMIT = 1200;

/** Position in the layout tree that the next spine node attaches to. */
interface Anchor {
	/** Id of the closest visible ancestor node, or null at the top of the graph. */
	nodeId: string | null;
	/** Row index for the next spine node. */
	depth: number;
	/** Tool node ids that must rejoin into the next spine node. */
	rejoinFrom: string[];
}

/** Fields every node shares regardless of what backs it. */
interface NodeBase {
	/** Stable node id. */
	id: string;
	/** Row index in the top-down layout. */
	depth: number;
	/** Spine ancestor in the layout tree. */
	layoutParentId: string | null;
	/** Session entry id, when the node is persisted. */
	entryId?: string;
	/** Whether the node sits on the active branch. */
	onActiveBranch: boolean;
	/** Unix milliseconds for the underlying message or entry. */
	timestamp?: number;
}

/** Everything the browser needs for one revision of the canvas. */
export interface FlowSnapshot {
	/** Session metadata for the canvas header. */
	session: FlowSessionInfo;
	/** Cards and connections. */
	graph: FlowGraph;
}

/**
 * Build the canvas graph from persisted session entries plus live agent activity.
 *
 * Node identity comes from session entry ids and provider tool call ids, so
 * rebuilding after a browser reconnect or a Pi reload produces the same graph
 * instead of duplicate nodes.
 * @param ctx Extension context for the active session.
 * @param live In-flight agent state that Pi has not persisted yet.
 * @returns Session metadata and the full graph.
 */
export function buildSnapshot(ctx: ExtensionContext, live: LiveState): FlowSnapshot {
	const session = ctx.sessionManager;
	const entries = session.getEntries();
	const nodes: FlowNode[] = [];
	const edges: FlowEdge[] = [];
	const toolNodes = new Map<string, FlowNode>();
	const committedMessageKeys = new Set<string>();
	const committedToolCallIds = new Set<string>();
	const userTexts = new Set<string>();
	const activeIds = collectActiveBranchIds(session);
	const leafId = session.getLeafId();
	const childrenByParent = groupByParent(entries);

	let tipAnchor: Anchor = { nodeId: null, depth: 0, rejoinFrom: [] };
	const stack: { entry: SessionEntry; anchor: Anchor }[] = [];
	for (const root of [...(childrenByParent.get(null) ?? [])].reverse()) {
		stack.push({ entry: root, anchor: tipAnchor });
	}

	while (stack.length > 0) {
		const frame = stack.pop();
		if (!frame) {
			break;
		}

		const { entry, anchor } = frame;
		let childAnchor = anchor;

		if (entry.type === "message") {
			committedMessageKeys.add(messageKey(entry.message));
			if (entry.message.role === "user") {
				userTexts.add(textOf(entry.message.content).trim());
			}
		}

		if (entry.type === "message" && entry.message.role === "toolResult") {
			committedToolCallIds.add(entry.message.toolCallId);
			applyToolResult(toolNodes.get(entry.message.toolCallId), entry.message);
		} else {
			const node = createEntryNode(entry, anchor, activeIds.has(entry.id));
			if (node) {
				nodes.push(node);
				edges.push(...connectToAnchor(node, anchor));
				childAnchor = attachToolBranches(node, messageOf(entry), nodes, edges, toolNodes, live);
			}
		}

		if (entry.id === leafId) {
			tipAnchor = childAnchor;
		}

		for (const child of [...(childrenByParent.get(entry.id) ?? [])].reverse()) {
			stack.push({ entry: child, anchor: childAnchor });
		}
	}

	live.prune(committedMessageKeys, committedToolCallIds);

	for (const liveMessage of live.messages) {
		const base: NodeBase = {
			id: `live:${liveMessage.key}`,
			depth: tipAnchor.depth,
			layoutParentId: tipAnchor.nodeId,
			onActiveBranch: true,
			timestamp: timestampOf(liveMessage.message),
		};

		const node = createMessageNode(base, liveMessage.message, !liveMessage.settled);
		if (!node) {
			continue;
		}

		nodes.push(node);
		edges.push(...connectToAnchor(node, tipAnchor));
		tipAnchor = attachToolBranches(node, liveMessage.message, nodes, edges, toolNodes, live);
		if (liveMessage.message.role === "user") {
			userTexts.add(textOf(liveMessage.message.content).trim());
		}
	}

	live.settleQueued(userTexts);
	appendQueuedNodes(nodes, edges, live.queued, tipAnchor);
	appendContextNodes(nodes, edges, live, tipAnchor);
	markSummarized(nodes, session);
	labelCompactions(nodes, live);
	markPromptHost(nodes);

	return {
		session: describeSession(ctx, live),
		graph: { nodes, edges },
	};
}

/**
 * Group session entries by parent id while preserving insertion order.
 * @param entries All session entries.
 * @returns Children keyed by parent id, with roots under `null`.
 */
function groupByParent(entries: readonly SessionEntry[]): Map<string | null, SessionEntry[]> {
	const grouped = new Map<string | null, SessionEntry[]>();
	for (const entry of entries) {
		const siblings = grouped.get(entry.parentId);
		if (siblings) {
			siblings.push(entry);
		} else {
			grouped.set(entry.parentId, [entry]);
		}
	}

	return grouped;
}

/**
 * Read the message carried by a session entry, when it has one.
 * @param entry Session entry.
 * @returns The message, or undefined for non-message entries.
 */
function messageOf(entry: SessionEntry): FlowAgentMessage | undefined {
	return entry.type === "message" ? entry.message : undefined;
}

/**
 * Read the timestamp of a message.
 * @param message Message to inspect.
 * @returns Unix milliseconds, or undefined when the message has no timestamp.
 */
function timestampOf(message: FlowAgentMessage): number | undefined {
	return "timestamp" in message ? message.timestamp : undefined;
}

/**
 * Collect the entry ids on the session's active branch.
 * @param session Read-only session manager from the extension context.
 * @returns Ids of every entry between the current leaf and the root.
 */
function collectActiveBranchIds(session: ExtensionContext["sessionManager"]): Set<string> {
	try {
		return new Set(session.getBranch().map((entry) => entry.id));
	} catch {
		return new Set<string>();
	}
}

/**
 * Describe the active session for the canvas header.
 * @param ctx Extension context for the active session.
 * @param live In-flight agent state.
 * @returns Session metadata.
 */
function describeSession(ctx: ExtensionContext, live: LiveState): FlowSessionInfo {
	const session = ctx.sessionManager;

	return {
		sessionId: session.getSessionId(),
		name: session.getSessionName(),
		cwd: session.getCwd(),
		file: session.getSessionFile(),
		model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
		leafId: session.getLeafId(),
		busy: live.busy,
		draft: live.draft,
		queued: [...live.queued],
		contextUsage: ctx.getContextUsage(),
	};
}

/**
 * Create the edges that connect a new spine node to its anchor.
 * @param node Newly created node.
 * @param anchor Anchor the node attaches to.
 * @returns Rejoin edges from parallel tool branches, or a single flow edge.
 */
function connectToAnchor(node: FlowNode, anchor: Anchor): FlowEdge[] {
	if (anchor.rejoinFrom.length > 0) {
		return anchor.rejoinFrom.map((source) => ({
			id: `${source}->${node.id}`,
			source,
			target: node.id,
			kind: "rejoin" as const,
			onActiveBranch: node.onActiveBranch,
		}));
	}

	if (anchor.nodeId === null) {
		return [];
	}

	return [
		{
			id: `${anchor.nodeId}->${node.id}`,
			source: anchor.nodeId,
			target: node.id,
			kind: "flow",
			onActiveBranch: node.onActiveBranch,
		},
	];
}

/**
 * Create tool branch nodes for an assistant node and return the anchor for its successors.
 *
 * Parallel tool calls each reserve their own lane one row below the assistant, and
 * every lane rejoins into whatever comes next on the spine.
 * @param node Spine node the tools belong to.
 * @param message Message backing the node, when it has one.
 * @param nodes Accumulated node list.
 * @param edges Accumulated edge list.
 * @param toolNodes Index of tool nodes by tool call id.
 * @param live In-flight agent state.
 * @returns Anchor describing where the next spine node belongs.
 */
function attachToolBranches(
	node: FlowNode,
	message: FlowAgentMessage | undefined,
	nodes: FlowNode[],
	edges: FlowEdge[],
	toolNodes: Map<string, FlowNode>,
	live: LiveState,
): Anchor {
	const toolCalls = message?.role === "assistant" ? toolCallsOf(message.content) : [];
	if (toolCalls.length === 0) {
		return { nodeId: node.id, depth: node.depth + 1, rejoinFrom: [] };
	}

	const rejoinFrom: string[] = [];
	toolCalls.forEach((call, index) => {
		const toolNode: FlowNode = {
			id: `tool:${call.id}`,
			kind: "tool",
			depth: node.depth + 1,
			layoutParentId: node.id,
			lane: index,
			laneCount: toolCalls.length,
			title: call.name,
			subtitle: summariseToolArguments(call.arguments),
			detail: formatToolArguments(call.arguments),
			status: "running",
			onActiveBranch: node.onActiveBranch,
		};

		const liveTool = live.getTool(call.id);
		if (liveTool) {
			applyLiveToolState(toolNode, liveTool.running, liveTool.isError, liveTool.result);
		}

		nodes.push(toolNode);
		toolNodes.set(call.id, toolNode);
		rejoinFrom.push(toolNode.id);
		edges.push({
			id: `${node.id}->${toolNode.id}`,
			source: node.id,
			target: toolNode.id,
			kind: "branch",
			onActiveBranch: node.onActiveBranch,
		});
	});

	return { nodeId: node.id, depth: node.depth + 2, rejoinFrom };
}

/**
 * Attach queued graph submissions as distinct cards on the live tip.
 * @param nodes Accumulated node list.
 * @param edges Accumulated edge list.
 * @param queued Prompts waiting for Pi to accept them.
 * @param anchor Live tip of the active branch.
 */
function appendQueuedNodes(
	nodes: FlowNode[],
	edges: FlowEdge[],
	queued: readonly FlowQueuedPrompt[],
	anchor: Anchor,
): void {
	let parentId = anchor.nodeId;
	let depth = anchor.depth;
	for (const item of queued) {
		const node: FlowNode = {
			id: item.id,
			kind: "queued",
			depth,
			layoutParentId: parentId,
			lane: null,
			laneCount: null,
			title: item.deliverAs === "steer" ? "Queued steering" : "Queued follow-up",
			preview: preview(item.text),
			detail: truncate(item.text, DETAIL_LIMIT),
			status: "running",
			onActiveBranch: true,
			badges: [item.deliverAs],
		};
		nodes.push(node);
		if (parentId) {
			edges.push({
				id: `${parentId}->${node.id}`,
				source: parentId,
				target: node.id,
				kind: "flow",
				onActiveBranch: true,
			});
		}

		parentId = node.id;
		depth += 1;
	}
}

/**
 * Attach inspectable context snapshots and explicit skill nodes as side branches.
 * @param nodes Accumulated node list.
 * @param edges Accumulated edge list.
 * @param live Live agent and context state.
 * @param anchor Live tip used when no user node is available.
 */
function appendContextNodes(
	nodes: FlowNode[],
	edges: FlowEdge[],
	live: LiveState,
	anchor: Anchor,
): void {
	const host =
		[...nodes].reverse().find((node) => node.onActiveBranch && node.kind === "user") ??
		nodes.find((node) => node.id === anchor.nodeId);
	const parentId = host?.id ?? anchor.nodeId;
	if (!parentId) {
		return;
	}

	const snapshots = live.context.snapshots;
	snapshots.forEach((snapshot, index) => {
		const expanded = live.context.expanded.has(snapshot.id);
		const diff = snapshot.diff;
		const added = diff?.added.length ?? 0;
		const removed = diff?.removed.length ?? 0;
		const retained = diff?.retained.length ?? snapshot.items.length;
		const usage =
			snapshot.usage?.percent !== null && snapshot.usage?.percent !== undefined
				? `${Math.round(snapshot.usage.percent)}%`
				: snapshot.usage?.tokens !== null && snapshot.usage?.tokens !== undefined
					? `${snapshot.usage.tokens.toLocaleString()} tok`
					: undefined;
		const previewText = expanded
			? snapshot.items.map((item) => `${item.label} (${item.provenance})`).join("\n")
			: `${added} added · ${removed} removed · ${retained} retained`;
		const node: FlowNode = {
			id: snapshot.id,
			kind: "context",
			depth: (host?.depth ?? anchor.depth) + 1,
			layoutParentId: parentId,
			lane: index,
			laneCount: snapshots.length + snapshot.explicitSkills.length,
			title: `Context ${snapshot.index}`,
			subtitle: [snapshot.model, usage].filter(Boolean).join(" · ") || undefined,
			preview: preview(previewText, expanded ? 400 : 220),
			detail: truncate(formatSnapshotDetail(snapshot), DETAIL_LIMIT),
			status: "success",
			onActiveBranch: true,
			badges: usage ? [usage, "collapsed"] : ["collapsed"],
			expanded,
		};
		if (expanded) {
			node.badges = (node.badges ?? []).map((badge) => (badge === "collapsed" ? "expanded" : badge));
		}

		nodes.push(node);
		edges.push({
			id: `${parentId}->${node.id}`,
			source: parentId,
			target: node.id,
			kind: "branch",
			onActiveBranch: true,
		});

		snapshot.explicitSkills.forEach((name, skillIndex) => {
			const skillId = `${snapshot.id}:skill:${name}`;
			const skill: FlowNode = {
				id: skillId,
				kind: "skill",
				depth: node.depth + 1,
				layoutParentId: node.id,
				lane: skillIndex,
				laneCount: snapshot.explicitSkills.length,
				title: `/skill:${name}`,
				subtitle: "explicit invocation",
				preview: `Attributed to /skill:${name}`,
				status: "success",
				onActiveBranch: true,
				badges: ["explicit"],
			};
			nodes.push(skill);
			edges.push({
				id: `${node.id}->${skill.id}`,
				source: node.id,
				target: skill.id,
				kind: "branch",
				onActiveBranch: true,
			});
		});
	});
}

/**
 * Render a snapshot for the inspector without dumping full message bodies.
 * @param snapshot Context snapshot.
 * @returns Inspector text.
 */
function formatSnapshotDetail(snapshot: ContextSnapshot): string {
	const lines = [`Model call ${snapshot.index}`, snapshot.model ? `Model: ${snapshot.model}` : undefined];
	if (snapshot.usage) {
		lines.push(
			`Usage: ${snapshot.usage.tokens ?? "unknown"} / ${snapshot.usage.contextWindow} (${snapshot.usage.percent ?? "?"}%)`,
		);
	}

	if (snapshot.diff) {
		lines.push(`Added: ${snapshot.diff.added.join(", ") || "none"}`);
		lines.push(`Removed: ${snapshot.diff.removed.join(", ") || "none"}`);
		lines.push(`Retained: ${snapshot.diff.retained.length} items`);
	}

	lines.push("Items:");
	for (const item of snapshot.items) {
		lines.push(`- ${item.kind} ${item.label} [${item.provenance}]`);
	}

	return lines.filter(Boolean).join("\n");
}

/**
 * Mark nodes that compaction replaced with a summary.
 * @param nodes Current nodes.
 * @param session Active session manager.
 */
function markSummarized(nodes: FlowNode[], session: ExtensionContext["sessionManager"]): void {
	let kept: Set<string>;
	try {
		kept = new Set(session.buildContextEntries().map((entry) => entry.id));
	} catch {
		return;
	}

	for (const node of nodes) {
		if (node.entryId && !kept.has(node.entryId) && node.kind !== "compaction" && node.kind !== "branchSummary") {
			node.summarized = true;
			node.badges = [...(node.badges ?? []), "summarized"];
		}
	}
}

/**
 * Apply recorded compaction reasons to funnel nodes.
 * @param nodes Current nodes.
 * @param live Live context tracker.
 */
function labelCompactions(nodes: FlowNode[], live: LiveState): void {
	for (const node of nodes) {
		if (node.kind !== "compaction" || !node.entryId) {
			continue;
		}

		const reason = live.context.compactionReason(node.entryId);
		if (!reason) {
			continue;
		}

		node.title = reason === "manual" ? "Manual compaction" : reason === "overflow" ? "Overflow compaction" : "Auto compaction";
		node.badges = [reason, "funnel"];
	}
}

/**
 * Put the prompt editor on the latest active main-flow node.
 * @param nodes Current nodes.
 */
function markPromptHost(nodes: FlowNode[]): void {
	for (let index = nodes.length - 1; index >= 0; index -= 1) {
		const node = nodes[index];
		if (!node?.onActiveBranch || node.lane !== null) {
			continue;
		}

		if (node.kind === "tool" || node.kind === "queued" || node.kind === "context" || node.kind === "skill") {
			continue;
		}

		node.promptHost = true;
		return;
	}
}

/**
 * Apply a persisted tool result to its tool node.
 * @param node Tool node, when the matching assistant tool call was found.
 * @param message Persisted tool result message.
 */
function applyToolResult(node: FlowNode | undefined, message: FlowToolResultMessage): void {
	if (!node) {
		return;
	}

	const output = textOf(message.content);
	node.status = message.isError ? "error" : "success";
	node.preview = output.length > 0 ? preview(output) : undefined;
	node.detail = joinDetail(node.detail, output);
	node.timestamp = message.timestamp;
}

/**
 * Apply in-flight execution state to a tool node.
 * @param node Tool node to update.
 * @param running Whether the tool is still executing.
 * @param isError Whether the finished tool reported an error.
 * @param result Latest partial or final result payload.
 */
function applyLiveToolState(node: FlowNode, running: boolean, isError: boolean, result: unknown): void {
	const output = extractToolOutput(result);
	if (running) {
		node.status = "running";
	} else {
		node.status = isError ? "error" : "success";
	}

	if (output.length > 0) {
		node.preview = preview(output);
		node.detail = joinDetail(node.detail, output);
	}
}

/**
 * Read displayable text out of a tool result payload.
 * @param result Partial or final tool result.
 * @returns Text output, or an empty string when nothing is displayable.
 */
function extractToolOutput(result: unknown): string {
	if (typeof result === "string") {
		return result;
	}

	if (typeof result === "object" && result !== null && "content" in result) {
		return textOf((result as { content: unknown }).content);
	}

	return "";
}

/**
 * Append tool output beneath the tool argument block in the inspector body.
 * @param head Existing detail text, usually the formatted arguments.
 * @param output Tool output text.
 * @returns Combined detail text.
 */
function joinDetail(head: string | undefined, output: string): string | undefined {
	const tail = output.trim().length > 0 ? truncate(output, DETAIL_LIMIT) : undefined;
	if (head && tail) {
		return `${head}\n\n${tail}`;
	}

	return tail ?? head;
}

/**
 * Create the canvas node for a session entry.
 * @param entry Session entry.
 * @param anchor Anchor the node attaches to.
 * @param onActiveBranch Whether the entry sits on the active branch.
 * @returns A node, or null when the entry has no visual representation.
 */
function createEntryNode(entry: SessionEntry, anchor: Anchor, onActiveBranch: boolean): FlowNode | null {
	const base: NodeBase = {
		id: `entry:${entry.id}`,
		depth: anchor.depth,
		layoutParentId: anchor.nodeId,
		entryId: entry.id,
		onActiveBranch,
		timestamp: Date.parse(entry.timestamp) || undefined,
	};

	switch (entry.type) {
		case "message":
			return createMessageNode(
				{ ...base, timestamp: timestampOf(entry.message) ?? base.timestamp },
				entry.message,
				false,
			);
		case "compaction":
			return {
				...base,
				kind: "compaction",
				lane: null,
				laneCount: null,
				title: "Compaction",
				subtitle: `${entry.tokensBefore.toLocaleString()} tokens before · kept ${entry.firstKeptEntryId.slice(0, 8)}`,
				preview: preview(entry.summary),
				detail: truncate(
					`Summarized history:\n${entry.summary}\n\nRecent context retained from entry ${entry.firstKeptEntryId}.`,
					DETAIL_LIMIT,
				),
				status: "success",
				badges: ["funnel"],
			};
		case "branch_summary":
			return {
				...base,
				kind: "branchSummary",
				lane: null,
				laneCount: null,
				title: "Branch summary",
				preview: preview(entry.summary),
				detail: truncate(entry.summary, DETAIL_LIMIT),
				status: "success",
			};
		case "custom_message": {
			const text = textOf(entry.content);
			return {
				...base,
				kind: "custom",
				lane: null,
				laneCount: null,
				title: entry.customType,
				subtitle: "extension message",
				preview: preview(text),
				detail: truncate(text, DETAIL_LIMIT),
				status: "success",
			};
		}
		default:
			return null;
	}
}

/**
 * Create the canvas node for a message, whether persisted or streaming.
 * @param base Shared node fields.
 * @param message Message to render.
 * @param streaming Whether the message is still streaming.
 * @returns A node, or null when the message has no visual representation.
 */
function createMessageNode(base: NodeBase, message: FlowAgentMessage, streaming: boolean): FlowNode | null {
	const spine = { ...base, lane: null, laneCount: null } satisfies NodeBase & Pick<FlowNode, "lane" | "laneCount">;

	switch (message.role) {
		case "user": {
			const text = textOf(message.content);
			const images = imageCountOf(message.content);
			return {
				...spine,
				kind: "user",
				title: "You",
				preview: preview(text),
				detail: truncate(text, DETAIL_LIMIT),
				status: "success",
				badges: images > 0 ? [`${images} image${images === 1 ? "" : "s"}`] : undefined,
			};
		}
		case "assistant":
			return createAssistantNode(spine, message, streaming);
		case "bashExecution":
			return {
				...spine,
				kind: "bash",
				title: "Shell",
				subtitle: preview(message.command, 90),
				preview: preview(message.output),
				detail: truncate(message.output, DETAIL_LIMIT),
				status: message.cancelled || (message.exitCode ?? 0) !== 0 ? "error" : "success",
				badges: message.exitCode === undefined ? undefined : [`exit ${message.exitCode}`],
			};
		case "custom": {
			const text = textOf(message.content);
			return {
				...spine,
				kind: "custom",
				title: message.customType,
				subtitle: "extension message",
				preview: preview(text),
				detail: truncate(text, DETAIL_LIMIT),
				status: "success",
			};
		}
		case "compactionSummary":
			return {
				...spine,
				kind: "compaction",
				title: "Compaction",
				preview: preview(message.summary),
				detail: truncate(message.summary, DETAIL_LIMIT),
				status: "success",
			};
		case "branchSummary":
			return {
				...spine,
				kind: "branchSummary",
				title: "Branch summary",
				preview: preview(message.summary),
				detail: truncate(message.summary, DETAIL_LIMIT),
				status: "success",
			};
		default:
			return null;
	}
}

/**
 * Create the canvas node for an assistant message.
 * @param spine Shared node fields for a spine node.
 * @param message Assistant message.
 * @param streaming Whether the message is still streaming.
 * @returns The assistant node.
 */
function createAssistantNode(
	spine: NodeBase & Pick<FlowNode, "lane" | "laneCount">,
	message: FlowAssistantMessage,
	streaming: boolean,
): FlowNode {
	const text = textOf(message.content);
	const thinking = thinkingOf(message.content);
	const body = text.length > 0 ? text : thinking;
	const badges: string[] = [];

	if (thinking.length > 0) {
		badges.push("thinking");
	}

	if (message.usage?.totalTokens) {
		badges.push(`${message.usage.totalTokens.toLocaleString()} tok`);
	}

	return {
		...spine,
		kind: "assistant",
		title: message.model ?? "Assistant",
		subtitle: message.provider,
		preview: body.length > 0 ? preview(body) : undefined,
		detail: body.length > 0 ? truncate(body, DETAIL_LIMIT) : undefined,
		status: resolveAssistantStatus(message, streaming),
		badges: badges.length > 0 ? badges : undefined,
	};
}

/**
 * Map an assistant stop reason to a card status.
 * @param message Assistant message.
 * @param streaming Whether the message is still streaming.
 * @returns Card status.
 */
function resolveAssistantStatus(message: FlowAssistantMessage, streaming: boolean): FlowNodeStatus {
	switch (message.stopReason) {
		case "error":
			return "error";
		case "aborted":
			return "aborted";
		case "pending":
			return "streaming";
		default:
			return streaming ? "streaming" : "success";
	}
}
