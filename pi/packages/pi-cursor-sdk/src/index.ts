import type { ExtensionAPI, ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { discoverModels, loadStartupModels, type CursorModelFallbackIssue } from "./model-discovery.js";
import { registerCursorRuntimeControls } from "./cursor-state.js";
import { registerCursorNativeToolDisplay } from "./cursor-native-tool-display-registration.js";
import { registerCursorPiToolBridge } from "./cursor-pi-tool-bridge.js";
import { registerCursorQuestionTool } from "./cursor-question-tool.js";
import { registerCursorSkillTool } from "./cursor-skill-tool.js";
import { registerCursorSessionScope } from "./cursor-session-scope.js";
import { registerCursorSessionAgentLifecycle } from "./cursor-session-agent-lifecycle.js";
import { registerCursorSessionAgentLineage } from "./cursor-session-agent-lineage.js";
import { registerCursorSessionAgentResume } from "./cursor-session-agent-resume.js";
import { streamCursorLazy } from "./cursor-provider-lazy.js";
import { CURSOR_API_KEY_CONFIG_VALUE, resolveCursorApiKey } from "./cursor-api-key.js";
import { registerCursorFallbackIssueWarning } from "./cursor-fallback-warning.js";
import { registerCursorAgentsContextDedup } from "./cursor-agents-context-registration.js";
import { registerCursorOverflowNormalization } from "./cursor-provider-overflow.js";
import { registerCursorSdkSessionProcessErrorGuard } from "./cursor-sdk-process-error-guard.js";
import { prepareCursorSessionForCompaction } from "./cursor-session-compaction-prep.js";

type CursorExtensionApi =
	& Pick<ExtensionAPI, "registerProvider" | "registerCommand" | "on">
	& Parameters<typeof registerCursorSessionScope>[0]
	& Parameters<typeof registerCursorSessionAgentLifecycle>[0]
	& Parameters<typeof registerCursorSessionAgentLineage>[0]
	& Parameters<typeof registerCursorSessionAgentResume>[0]
	& Parameters<typeof registerCursorRuntimeControls>[0]
	& Parameters<typeof registerCursorNativeToolDisplay>[0]
	& Parameters<typeof registerCursorQuestionTool>[0]
	& Parameters<typeof registerCursorSkillTool>[0]
	& Parameters<typeof registerCursorPiToolBridge>[0]
	& Parameters<typeof registerCursorFallbackIssueWarning>[0]
	& Parameters<typeof registerCursorAgentsContextDedup>[0]
	& Parameters<typeof registerCursorOverflowNormalization>[0]
	& Parameters<typeof registerCursorSdkSessionProcessErrorGuard>[0];

function createCursorProviderConfig(models: ProviderModelConfig[]): ProviderConfig {
	return {
		name: "Cursor",
		baseUrl: "https://cursor.com",
		apiKey: CURSOR_API_KEY_CONFIG_VALUE,
		api: "cursor-sdk",
		models,
		streamSimple: streamCursorLazy,
	};
}

function registerCursorProvider(pi: Pick<ExtensionAPI, "registerProvider">, models: ProviderModelConfig[]): void {
	pi.registerProvider("cursor", createCursorProviderConfig(models));
}

export default async function (pi: CursorExtensionApi) {
	// Session cwd must register before other session_start listeners that depend on it.
	registerCursorSessionScope(pi);
	registerCursorSessionAgentLineage(pi);
	registerCursorSessionAgentLifecycle(pi);
	registerCursorSessionAgentResume(pi);
	pi.on("session_before_compact", async () => {
		await prepareCursorSessionForCompaction();
	});
	registerCursorRuntimeControls(pi);
	registerCursorNativeToolDisplay(pi);
	registerCursorQuestionTool(pi);
	registerCursorSkillTool(pi);
	registerCursorPiToolBridge(pi);
	registerCursorAgentsContextDedup(pi);
	registerCursorOverflowNormalization(pi);

	// Provider registration must not wait for the network. A fresh disk cache is
	// preferred, otherwise the bundled catalog keeps Cursor selectable at startup.
	const startupModels = await loadStartupModels();
	registerCursorProvider(pi, startupModels);

	let backgroundRefreshStarted = false;
	let fallbackWarningRegistered = false;
	let sessionActive = false;
	pi.on("session_start", () => {
		sessionActive = true;
		if (backgroundRefreshStarted) return;
		backgroundRefreshStarted = true;
		const refreshModels = async () => {
			let fallbackIssue: CursorModelFallbackIssue | undefined;
			try {
				const models = await discoverModels({
					onFallback: (issue) => {
						fallbackIssue = issue;
					},
				});
				if (!sessionActive) return;
				registerCursorProvider(pi, models);
				if (fallbackIssue && !fallbackWarningRegistered) {
					fallbackWarningRegistered = true;
					registerCursorFallbackIssueWarning(pi, fallbackIssue);
				}
			} catch (error) {
				console.error("Cursor model catalog background refresh failed", error);
			}
		};
		refreshModels();
	});
	pi.on("session_shutdown", () => {
		sessionActive = false;
	});

	pi.registerCommand("cursor-refresh-models", {
		description: "Refresh the live Cursor model catalog without restarting pi",
		handler: async (_args, ctx) => {
			let refreshFallbackIssue: CursorModelFallbackIssue | undefined;
			const apiKey = resolveCursorApiKey(await ctx.modelRegistry.getApiKeyForProvider("cursor"));
			const refreshedModels = await discoverModels({
				apiKey,
				forceRefresh: true,
				onFallback: (issue) => {
					refreshFallbackIssue = issue;
				},
			});
			registerCursorProvider(pi, refreshedModels);
			if (!ctx.hasUI) return;
			if (refreshFallbackIssue) {
				ctx.ui.notify(`Cursor model catalog refresh did not use a live catalog: ${refreshFallbackIssue.message}`, "warning");
			} else {
				ctx.ui.notify(`Cursor model catalog refreshed with ${refreshedModels.length} model${refreshedModels.length === 1 ? "" : "s"}.`, "info");
			}
		},
	});

	// Register last so session_shutdown cleanup remains protected until other Cursor handlers finish.
	registerCursorSdkSessionProcessErrorGuard(pi);
}
