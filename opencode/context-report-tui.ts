import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { AssistantMessage, Message, Model, SessionMessage, SkillV2Info, ToolListItem } from "@opencode-ai/sdk/v2";
import type { TuiDialogSelectOption, TuiPluginModule } from "@opencode-ai/plugin/tui";

import {
	evaluateRules,
	loadContextManagerConfig,
	loadRules,
	saveContextManagerConfig,
	type RuleResult,
} from "./context-manager.ts";

/** A captured server-side system prompt. */
interface SystemCapture {
	/** Time the request was prepared. */
	capturedAt: number;
	/** Model used for the captured request. */
	model: { providerID: string; id: string };
	/** Conditional rule decisions for the captured request. */
	rules: RuleResult[];
	/** Effective system prompt segments sent through plugin hooks. */
	system: string[];
}

/** A row in the context report dialog. */
interface ReportRow {
	/** Explanation shown below the row. */
	description: string;
	/** Stable row identifier. */
	id: string;
	/** Left-hand label. */
	label: string;
	/** Right-hand summary value. */
	value: string;
}

/** Conservatively estimates tokens from serialized text. */
function estimateTokens(value: string): number {
	return Math.ceil(value.length / 4);
}

/** Formats a number for compact report values. */
function formatNumber(value: number): string {
	return value.toLocaleString();
}

/** Reads the system-prompt capture for a session. */
async function readCapture(stateDirectory: string, sessionID: string): Promise<SystemCapture | undefined> {
	try {
		const path = join(stateDirectory, "context-reports", `${sessionID}.json`);
		return JSON.parse(await readFile(path, "utf8")) as SystemCapture;
	} catch {
		return undefined;
	}
}

/** Resolves the model currently selected for the session. */
function selectedModel(messages: readonly Message[], sessionModel?: { id: string; providerID: string }) {
	const user = messages.findLast((message) => message.role === "user");
	if (user) return { providerID: user.model.providerID, modelID: user.model.modelID };
	if (sessionModel) return { providerID: sessionModel.providerID, modelID: sessionModel.id };
	return undefined;
}

/** Finds the latest completed assistant response with usage data. */
function latestUsage(messages: readonly Message[]): AssistantMessage | undefined {
	return messages.findLast(
		(message): message is AssistantMessage => message.role === "assistant" && message.tokens.output > 0,
	);
}

/** Finds a model in OpenCode's live provider catalog. */
function findModel(
	providers: readonly { id: string; models: Record<string, Model> }[],
	selection?: { providerID: string; modelID: string },
): Model | undefined {
	if (!selection) return undefined;
	return providers.find((provider) => provider.id === selection.providerID)?.models[selection.modelID];
}

/** Extracts instruction file paths from OpenCode's composed system prompt. */
function instructionPaths(system: string): string[] {
	const prefix = "Instructions from: ";
	return system
		.split("\n")
		.filter((line) => line.startsWith(prefix))
		.map((line) => line.slice(prefix.length).trim());
}

/** Extracts skill names from the catalog visible in the system prompt. */
function visibleSkillNames(system: string): Set<string> {
	const names = new Set<string>();
	for (const line of system.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("<name>") || !trimmed.endsWith("</name>")) continue;
		names.add(trimmed.slice("<name>".length, -"</name>".length));
	}
	return names;
}

/** Serializes active context closely enough for a useful size estimate. */
function conversationTokens(messages: SessionMessage[]): number {
	return estimateTokens(JSON.stringify(messages));
}

/** Serializes tool definitions using the same public fields sent to providers. */
function toolTokens(tools: ToolListItem[]): number {
	return estimateTokens(JSON.stringify(tools));
}

/** Creates the searchable report rows for the active session. */
async function buildRows(
	api: Parameters<NonNullable<TuiPluginModule["tui"]>>[0],
	sessionID: string,
): Promise<ReportRow[]> {
	const messages = api.state.session.messages(sessionID);
	const session = api.state.session.get(sessionID);
	const selection = selectedModel(messages, session?.model);
	const model = findModel(api.state.provider, selection);
	const capture = await readCapture(api.state.path.state, sessionID);
	const system = capture?.system.join("\n") ?? "";
	const systemTokens = capture ? estimateTokens(system) : undefined;

	let context: SessionMessage[] = [];
	let skills: SkillV2Info[] = [];
	let tools: ToolListItem[] = [];
	try {
		const response = await api.client.v2.session.context({ sessionID }, { throwOnError: true });
		context = response.data.data;
	} catch {
		// Keep the remaining report useful if this endpoint is unavailable.
	}
	try {
		const response = await api.client.v2.skill.list(
			{ location: { directory: api.state.path.directory } },
			{ throwOnError: true },
		);
		skills = response.data.data;
	} catch {
		// Skill visibility can still be inferred from the captured prompt.
	}
	if (selection) {
		try {
			const response = await api.client.tool.list({
				directory: api.state.path.directory,
				provider: selection.providerID,
				model: selection.modelID,
			});
			tools = response.data ?? [];
		} catch {
			// Report an unknown tool size instead of failing the command.
		}
	}

	const rows: ReportRow[] = [];
	const conversation = conversationTokens(context);
	const definitions = tools.length > 0 ? toolTokens(tools) : undefined;
	const estimated = systemTokens === undefined || definitions === undefined
		? undefined
		: systemTokens + conversation + definitions;
	const contextWindow = model?.limit.context;
	const estimatedPercent = estimated !== undefined && contextWindow
		? (estimated / contextWindow) * 100
		: undefined;
	rows.push({
		id: "estimated-request",
		label: "estimated request",
		value: estimated === undefined
			? "unknown"
			: `~${formatNumber(estimated)} / ${contextWindow ? formatNumber(contextWindow) : "?"}`,
		description: `Approximate OpenCode-visible input from the latest effective system prompt, active context, and ${tools.length} tool definitions. ${estimatedPercent?.toFixed(1) ?? "?"}% of the selected model's context window. Provider serialization can change the actual count.`,
	});

	const usage = latestUsage(messages);
	const usageTokens = usage
		? usage.tokens.input + usage.tokens.output + usage.tokens.reasoning + usage.tokens.cache.read + usage.tokens.cache.write
		: undefined;
	const usageModel = usage
		? findModel(api.state.provider, { providerID: usage.providerID, modelID: usage.modelID })
		: model;
	const usageWindow = usageModel?.limit.context;
	const usagePercent = usageTokens !== undefined && usageWindow ? (usageTokens / usageWindow) * 100 : undefined;
	rows.push({
		id: "opencode-context-usage",
		label: "OpenCode context usage",
		value: usageTokens === undefined
			? "unknown"
			: `${formatNumber(usageTokens)} / ${usageWindow ? formatNumber(usageWindow) : "?"}`,
		description: usageTokens === undefined
			? "No completed assistant response has context usage yet."
			: `Usage from the latest completed assistant response. ${usagePercent?.toFixed(1) ?? "?"}% of that response model's context window.`,
	});

	rows.push({
		id: "system-prompt",
		label: "system prompt",
		value: systemTokens === undefined ? "not captured" : `~${formatNumber(systemTokens)} tokens`,
		description: capture
			? `${formatNumber(system.length)} characters captured from the effective system prompt for ${capture.model.providerID}/${capture.model.id} at ${new Date(capture.capturedAt).toLocaleString()}.`
			: "The effective prompt becomes available after this session makes its first model request.",
	});
	rows.push({
		id: "conversation",
		label: "conversation",
		value: `~${formatNumber(conversation)} tokens`,
		description: `Approximate serialized size of ${formatNumber(context.length)} active, compaction-aware context messages.`,
	});
	rows.push({
		id: "tool-definitions",
		label: "tool definitions",
		value: definitions === undefined ? "unknown" : `~${formatNumber(definitions)} tokens`,
		description: definitions === undefined
			? "Tool definitions could not be loaded for the selected model."
			: `Approximate serialized size of ${formatNumber(tools.length)} available tool definitions. Agent permissions and provider serialization can change the actual request.`,
	});

	const visibleNames = visibleSkillNames(system);
	const visibleSkills = skills.filter((skill) => visibleNames.has(skill.name));
	if (visibleSkills.length === 0) {
		rows.push({
			id: "skills",
			label: "skills",
			value: capture ? "none visible" : "unknown",
			description: capture
				? "No registered skill names were found in the captured system prompt."
				: "Skill visibility is available after the first captured request.",
		});
	}
	for (const skill of visibleSkills) {
		rows.push({
			id: `skill:${skill.name}`,
			label: `skill | ${skill.name}`,
			value: "visible",
			description: skill.description ?? skill.location,
		});
	}

	const instructions = instructionPaths(system);
	if (instructions.length === 0) {
		rows.push({
			id: "instructions",
			label: "instruction files",
			value: capture ? "none loaded" : "unknown",
			description: "Instruction file paths are extracted from the captured effective system prompt.",
		});
	}
	for (const path of instructions) {
		rows.push({
			id: `instruction:${path}`,
			label: `instruction | ${path}`,
			value: "loaded",
			description: "Loaded by OpenCode and included in the system prompt row.",
		});
	}

	for (const rule of capture?.rules ?? []) {
		const examples = rule.matches.slice(0, 3).join(", ");
		const remaining = rule.matches.length > 3 ? `, and ${rule.matches.length - 3} more` : "";
		const description = rule.status === "disabled"
			? "Not added to context because this rule is disabled."
			: rule.status === "not matched"
				? `Not added to context. No project files match ${rule.paths.join(", ")}.`
				: rule.paths.length === 0
					? "Added to context because this rule applies to all projects."
					: `Added to context. Matched ${rule.matches.length} project file${rule.matches.length === 1 ? "" : "s"}: ${examples}${remaining}.`;
		rows.push({
			id: `rule:${rule.relativePath}`,
			label: `rule | ${rule.relativePath}`,
			value: rule.status,
			description,
		});
	}

	return rows;
}

/** Converts report rows to OpenCode's read-only select dialog. */
function dialogOptions(rows: ReportRow[]): TuiDialogSelectOption<string>[] {
	const width = Math.min(42, Math.max(...rows.map((row) => row.label.length)));
	return rows.map((row) => ({
		title: `${row.label.padEnd(width)}  ${row.value}`,
		value: row.id,
		description: row.description,
	}));
}

/** Adds the local `/context` report to OpenCode's TUI. */
const tui = async (api: Parameters<NonNullable<TuiPluginModule["tui"]>>[0]) => {
	const showRules = () => {
		const config = loadContextManagerConfig(api.state.path.state);
		const results = evaluateRules(loadRules(api.state.path.config), api.state.path.directory, config);
		const options = results.map((rule): TuiDialogSelectOption<string> => {
			const enabled = config.rules[rule.relativePath] ?? true;
			const patterns = rule.paths.length > 0 ? rule.paths.join(", ") : "all projects";
			const projectStatus = rule.paths.length === 0 || rule.matches.length > 0
				? "active in this project"
				: "no matching project paths";
			return {
				title: `${rule.relativePath}  ${enabled ? "enabled" : "disabled"}`,
				value: rule.relativePath,
				description: `${rule.description} | ${projectStatus} | ${patterns}`,
				onSelect: () => {
					config.rules[rule.relativePath] = !enabled;
					saveContextManagerConfig(api.state.path.state, config);
					showRules();
				},
			};
		});
		api.ui.dialog.setSize("xlarge");
		api.ui.dialog.replace(() => api.ui.DialogSelect({
			title: "Rules",
			placeholder: "Search rules",
			options,
		}));
	};

	api.keymap.registerLayer({
		commands: [
			{
				name: "context-report.show",
				title: "Inspect model context",
				desc: "Show context sources and estimated sizes",
				category: "Session",
				namespace: "palette",
				slashName: "context",
				async run() {
					const route = api.route.current;
					if (route.name !== "session") {
						api.ui.toast({ message: "/context requires an active session", variant: "warning" });
						return;
					}
					const sessionID = route.params?.sessionID;
					if (typeof sessionID !== "string") return;

					const rows = await buildRows(api, sessionID);
					api.ui.dialog.setSize("xlarge");
					api.ui.dialog.replace(() => api.ui.DialogSelect({
						title: "Context",
						placeholder: "Search context",
						options: dialogOptions(rows),
					}));
				},
			},
			{
				name: "context-manager.rules",
				title: "Configure conditional rules",
				desc: "Enable or disable conditional rule files",
				category: "Session",
				namespace: "palette",
				slashName: "rules",
				run: showRules,
			},
		],
	});
};

export default {
	id: "chektek.context-report",
	tui,
} satisfies TuiPluginModule;
