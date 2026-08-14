import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Plugin } from "@opencode-ai/plugin";

import { evaluateRules, formatRules, loadContextManagerConfig, loadRules, type RuleResult } from "../context-manager.ts";

/** Atomically records the effective system prompt for a session. */
async function writeReport(
	directory: string,
	sessionID: string,
	model: { providerID: string; id: string },
	system: string[],
	rules: RuleResult[],
): Promise<void> {
	const target = join(directory, `${sessionID}.json`);
	const temporary = `${target}.${process.pid}.tmp`;
	await mkdir(directory, { recursive: true });
	await writeFile(
		temporary,
		`${JSON.stringify({ capturedAt: Date.now(), model, rules, system }, null, 2)}\n`,
		"utf8",
	);
	await rename(temporary, target);
}

/** Captures context that OpenCode does not expose through its session API. */
const contextReportPlugin = (async ({ client, directory }) => {
	let paths: { config: string; state: string } | undefined;
	const openCodePaths = async () => {
		if (paths) return paths;
		const response = await client.path.get({ throwOnError: true });
		paths = response.data;
		return paths;
	};
	return {
		event: async ({ event }) => {
			if (event.type !== "session.deleted") return;
			const { state } = await openCodePaths();
			await rm(join(state, "context-reports", `${event.properties.info.id}.json`), { force: true });
		},
		"experimental.chat.system.transform": async (input, output) => {
			if (!input.sessionID) return;

			try {
				const { config, state } = await openCodePaths();
				const rules = evaluateRules(loadRules(config), directory, loadContextManagerConfig(state));
				const formattedRules = formatRules(rules);
				if (formattedRules) output.system.push(formattedRules);
				await writeReport(
					join(state, "context-reports"),
					input.sessionID,
					{ providerID: input.model.providerID, id: input.model.id },
					output.system,
					rules,
				);
			} catch (error) {
				await client.app.log({
					body: {
						service: "context-report",
						level: "error",
						message: "Failed to capture the effective system prompt",
						extra: { error: error instanceof Error ? error.message : String(error) },
					},
				});
			}
		},
	};
}) satisfies Plugin;

export default contextReportPlugin;
