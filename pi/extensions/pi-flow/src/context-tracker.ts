import type { BeforeAgentStartEvent, ContextEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** How a context item was attributed. */
export type ContextProvenance = "explicit-skill" | "inferred" | "structured" | "unknown";

/** One inspectable item in a pre-model-call snapshot. */
export interface ContextItem {
	/** Stable identity used for diffs. */
	id: string;
	/** Item category. */
	kind: "file" | "message" | "prompt" | "skill" | "tool" | "unknown";
	/** Short label shown on the card. */
	label: string;
	/** How the item was attributed. */
	provenance: ContextProvenance;
}

/** Diff of two consecutive context snapshots. */
export interface ContextDiff {
	/** Items present now that were absent before. */
	added: string[];
	/** Items present before that are absent now. */
	removed: string[];
	/** Items present in both snapshots. */
	retained: string[];
}

/** A captured pre-model-call context snapshot. */
export interface ContextSnapshot {
	/** Stable snapshot id. */
	id: string;
	/** Sequence number of this model call. */
	index: number;
	/** Items visible to the model for this call. */
	items: ContextItem[];
	/** Diff against the previous snapshot, when one exists. */
	diff?: ContextDiff;
	/** Token usage at capture time. */
	usage?: { tokens: number | null; contextWindow: number; percent: number | null };
	/** Active model label. */
	model?: string;
	/** Explicit `/skill:name` invocations observed on the raw input. */
	explicitSkills: string[];
}

/** Compaction reason recorded from Pi's compact events. */
export type CompactionReason = "manual" | "overflow" | "threshold";

/**
 * Captures inspectable context snapshots without claiming provenance Pi cannot
 * establish. Snapshots stay in memory for the current session only.
 */
export class ContextTracker {
	readonly #snapshots: ContextSnapshot[] = [];
	readonly #expanded = new Set<string>();
	readonly #compactionReasons = new Map<string, CompactionReason>();
	#rawInput = "";
	#promptOptions: BeforeAgentStartEvent["systemPromptOptions"] | undefined;
	#seq = 0;

	/** Snapshots in capture order. */
	public get snapshots(): readonly ContextSnapshot[] {
		return this.#snapshots;
	}

	/** Node ids the user has expanded. */
	public get expanded(): ReadonlySet<string> {
		return this.#expanded;
	}

	/**
	 * Record raw input before skill and template expansion.
	 * @param text Unexpanded user input.
	 */
	public noteInput(text: string): void {
		this.#rawInput = text;
	}

	/**
	 * Remember structured system-prompt inputs from `before_agent_start`.
	 * @param options Prompt construction options.
	 */
	public notePromptOptions(options: BeforeAgentStartEvent["systemPromptOptions"]): void {
		this.#promptOptions = options;
	}

	/**
	 * Record why a compaction happened so historical nodes can label it.
	 * @param entryId Compaction entry id.
	 * @param reason Pi compaction trigger.
	 */
	public noteCompaction(entryId: string, reason: CompactionReason): void {
		this.#compactionReasons.set(entryId, reason);
	}

	/**
	 * Look up a recorded compaction reason.
	 * @param entryId Compaction entry id.
	 * @returns The reason, when known.
	 */
	public compactionReason(entryId: string): CompactionReason | undefined {
		return this.#compactionReasons.get(entryId);
	}

	/**
	 * Expand or collapse a context card.
	 * @param id Node id.
	 * @param expanded Whether the card should show detail.
	 */
	public setExpanded(id: string, expanded: boolean): void {
		if (expanded) {
			this.#expanded.add(id);
		} else {
			this.#expanded.delete(id);
		}
	}

	/**
	 * Capture the authoritative pre-model-call message snapshot.
	 * @param messages Context event messages.
	 * @param ctx Extension context for usage and model metadata.
	 */
	public capture(messages: ContextEvent["messages"], ctx: ExtensionContext): void {
		this.#seq += 1;
		const explicitSkills = detectExplicitSkills(this.#rawInput);
		const items = [
			...itemsFromMessages(messages),
			...itemsFromPromptOptions(this.#promptOptions, explicitSkills),
		];
		const previous = this.#snapshots.at(-1);
		const usage = ctx.getContextUsage();
		const snapshot: ContextSnapshot = {
			id: `context:${this.#seq}`,
			index: this.#seq,
			items,
			diff: previous ? diffItems(previous.items, items) : undefined,
			usage: usage
				? { tokens: usage.tokens, contextWindow: usage.contextWindow, percent: usage.percent }
				: undefined,
			model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
			explicitSkills,
		};
		this.#snapshots.push(snapshot);
	}

	/** Forget session-scoped context state. */
	public reset(): void {
		this.#snapshots.length = 0;
		this.#expanded.clear();
		this.#compactionReasons.clear();
		this.#rawInput = "";
		this.#promptOptions = undefined;
		this.#seq = 0;
	}
}

/**
 * Detect explicit `/skill:name` invocations from raw input.
 * @param text Unexpanded input.
 * @returns Skill names in invocation order.
 */
export function detectExplicitSkills(text: string): string[] {
	const names: string[] = [];
	const pattern = /(^|\s)\/skill:([A-Za-z0-9][\w-]*)/g;
	for (const match of text.matchAll(pattern)) {
		const name = match[2];
		if (name) {
			names.push(name);
		}
	}

	return names;
}

/**
 * Build context items from the message snapshot.
 * @param messages Context event messages.
 * @returns Message items.
 */
function itemsFromMessages(messages: ContextEvent["messages"]): ContextItem[] {
	return messages.map((message, index) => {
		const role = "role" in message ? String(message.role) : "message";
		const timestamp = "timestamp" in message && typeof message.timestamp === "number" ? message.timestamp : index;
		return {
			id: `message:${role}:${timestamp}:${index}`,
			kind: "message" as const,
			label: role,
			provenance: "structured" as const,
		};
	});
}

/**
 * Build context items from structured system-prompt options.
 * @param options Prompt construction options.
 * @param explicitSkills Skills invoked by `/skill:name`.
 * @returns File, tool, skill, and prompt items.
 */
function itemsFromPromptOptions(
	options: BeforeAgentStartEvent["systemPromptOptions"] | undefined,
	explicitSkills: readonly string[],
): ContextItem[] {
	if (!options) {
		return [];
	}

	const items: ContextItem[] = [];
	const explicit = new Set(explicitSkills);
	for (const file of options.contextFiles ?? []) {
		items.push({
			id: `file:${file.path}`,
			kind: "file",
			label: file.path,
			provenance: "structured",
		});
	}

	for (const tool of options.selectedTools ?? []) {
		items.push({
			id: `tool:${tool}`,
			kind: "tool",
			label: tool,
			provenance: "structured",
		});
	}

	for (const skill of options.skills ?? []) {
		items.push({
			id: `skill:${skill.name}`,
			kind: "skill",
			label: skill.name,
			provenance: explicit.has(skill.name) ? "explicit-skill" : "inferred",
		});
	}

	if (options.customPrompt) {
		items.push({ id: "prompt:custom", kind: "prompt", label: "custom system prompt", provenance: "structured" });
	}

	if (options.promptGuidelines && options.promptGuidelines.length > 0) {
		items.push({ id: "prompt:guidelines", kind: "prompt", label: "prompt guidelines", provenance: "structured" });
	}

	if (options.appendSystemPrompt) {
		items.push({ id: "prompt:append", kind: "prompt", label: "appended system prompt", provenance: "unknown" });
	}

	for (const name of explicitSkills) {
		if (!items.some((item) => item.id === `skill:${name}`)) {
			items.push({
				id: `skill:${name}`,
				kind: "skill",
				label: name,
				provenance: "explicit-skill",
			});
		}
	}

	return items;
}

/**
 * Diff two item lists by stable id.
 * @param previous Previous snapshot items.
 * @param next Current snapshot items.
 * @returns Added, removed, and retained labels.
 */
function diffItems(previous: readonly ContextItem[], next: readonly ContextItem[]): ContextDiff {
	const before = new Map(previous.map((item) => [item.id, item.label]));
	const after = new Map(next.map((item) => [item.id, item.label]));
	const added: string[] = [];
	const removed: string[] = [];
	const retained: string[] = [];
	for (const [id, label] of after) {
		if (before.has(id)) {
			retained.push(label);
		} else {
			added.push(label);
		}
	}

	for (const [id, label] of before) {
		if (!after.has(id)) {
			removed.push(label);
		}
	}

	return { added, removed, retained };
}
