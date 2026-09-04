import { readStoredCredential, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const CODEX_BASE = "https://chatgpt.com/backend-api/wham";

/** Fetches account quotas without making a model request. */
export async function fetchUsage(ctx: ExtensionCommandContext, signal: AbortSignal): Promise<UsageReport> {
	const provider = ctx.model!.provider;
	switch (provider) {
		case "openai-codex": {
			const headers = await codexHeaders(ctx);
			return codexReport(await request(`${CODEX_BASE}/usage`, headers, signal));
		}
		case "github-copilot":
			return copilotUsage(ctx, signal);
		case "cursor":
			return cursorUsage(signal);
		case "openai":
			return { title: "OpenAI API", rows: [], notes: [
				"API billing is separate from ChatGPT/Codex subscription quotas.",
				"Account balance percentages are not exposed by a normal inference API key.",
				"Billing: https://platform.openai.com/usage",
			] };
		default:
			return { title: provider, rows: [], notes: ["No account-quota adapter for this provider."] };
	}
}

/** Resolves refreshed Pi OAuth auth, preserving an explicit account header. */
export async function codexHeaders(ctx: ExtensionCommandContext) {
	const model = ctx.model!;
	if (model.provider !== "openai-codex") throw new Error("Banked resets require the openai-codex provider.");
	let auth;
	try {
		auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	} catch {
		throw new Error("Codex authentication could not be resolved. Run /login.");
	}
	if (!auth.ok || !auth.apiKey) throw new Error("Codex authentication unavailable. Run /login and choose OpenAI Codex.");
	if (new URL(auth.baseUrl ?? model.baseUrl).hostname !== "chatgpt.com") {
		throw new Error("Usage does not send custom Codex endpoint credentials to ChatGPT.");
	}
	const accountHeader = Object.entries(auth.headers ?? {}).find(([key]) => key.toLowerCase() === "chatgpt-account-id")?.[1];
	let account = text(accountHeader);
	if (!account) {
		try {
			const claims = object(JSON.parse(Buffer.from(auth.apiKey.split(".")[1], "base64url").toString("utf8")));
			account = text(object(claims["https://api.openai.com/auth"]).chatgpt_account_id);
		} catch {
			throw new Error("Codex usage requires ChatGPT OAuth, not an OpenAI API key. Run /login.");
		}
	}
	if (!account) throw new Error("Codex OAuth account ID is unavailable. Run /login.");
	return safeHeaders({ Authorization: `Bearer ${auth.apiKey}`, Accept: "application/json", "ChatGPT-Account-ID": account });
}

/** Reads fresh quota windows and redeemable resets using one pinned account. */
export async function fetchResets(headers: Headers, signal: AbortSignal) {
	const [usage, inventory] = await Promise.all([
		request(`${CODEX_BASE}/usage`, headers, signal),
		request(`${CODEX_BASE}/rate-limit-reset-credits`, headers, signal),
	]);
	const credits = array(inventory.credits).map(object).filter((credit) => {
		const expiry = date(credit.expires_at);
		return credit.status === "available" && text(credit.id) && expiry !== undefined && expiry > Date.now();
	}).map((credit) => ({
		id: text(credit.id)!,
		title: text(credit.title) ?? "Banked Codex reset",
		expiresAt: date(credit.expires_at)!,
	})).sort((a, b) => a.expiresAt - b.expiresAt);
	return { report: codexReport(usage), available: number(inventory.available_count), credits };
}

/** Sends exactly one idempotent redemption request; never retries a mutation. */
export async function consumeReset(headers: Headers, creditId: string, requestId: string, signal: AbortSignal) {
	const result = await request(`${CODEX_BASE}/rate-limit-reset-credits/consume`, headers, signal, {
		redeem_request_id: requestId,
		credit_id: creditId,
	});
	switch (result.code) {
		case "reset":
		case "already_redeemed":
			return "Reset redeemed. Fetching updated usage…";
		case "nothing_to_reset":
			return "No quota windows were eligible to reset.";
		case "no_credit":
			return "No banked reset is available.";
		default:
			throw new Error("Unrecognized redemption result. Check /usage before trying again.");
	}
}

async function copilotUsage(ctx: ExtensionCommandContext, signal: AbortSignal): Promise<UsageReport> {
	// The internal account endpoint needs the GitHub token (OAuth `refresh`),
	// not Pi's resolved, short-lived Copilot inference token.
	const oauth = ctx.modelRegistry.isUsingOAuth(ctx.model!);
	let credential;
	let resolved;
	try {
		credential = oauth ? readStoredCredential("github-copilot") : undefined;
		resolved = oauth ? undefined : await ctx.modelRegistry.getProviderAuth("github-copilot");
	} catch {
		throw new Error("Copilot authentication could not be resolved. Run /login.");
	}
	const token = oauth && credential?.type === "oauth" ? credential.refresh : resolved?.auth.apiKey;
	if (!token || !(token.startsWith("gh") || token.startsWith("github_pat_"))) {
		throw new Error("Copilot usage needs the GitHub login token in Pi's auth store. Run /login and choose GitHub Copilot.");
	}
	const domain = oauth && credential?.type === "oauth" ? text(credential.enterpriseUrl) ?? "github.com" : "github.com";
	const host = new URL(`https://${domain}`);
	if (host.hostname !== domain || (domain !== "github.com" && !domain.endsWith(".ghe.com"))) {
		throw new Error("Unsupported GitHub enterprise usage host.");
	}
	const data = await request(`https://api.${domain}/copilot_internal/user`, safeHeaders({
		Authorization: `token ${token}`,
		Accept: "application/json",
		"Editor-Version": "vscode/1.96.2",
		"Editor-Plugin-Version": "copilot-chat/0.26.7",
		"User-Agent": "GitHubCopilotChat/0.26.7",
		"X-Github-Api-Version": "2025-04-01",
	}), signal);
	const rows: UsageRow[] = [];
	const snapshots = object(data.quota_snapshots);
	for (const [key, label] of [["premium_interactions", "Premium interactions"], ["chat", "Chat"], ["completions", "Completions"]]) {
		const quota = object(snapshots[key]);
		if (!Object.keys(quota).length) continue;
		const remaining = number(quota.remaining);
		const entitlement = number(quota.entitlement);
		const placeholder = (entitlement !== undefined && entitlement < 0) || (remaining !== undefined && remaining < 0);
		const percent = number(quota.percent_remaining)
			?? (remaining !== undefined && entitlement !== undefined && entitlement > 0 ? 100 * remaining / entitlement : undefined);
		rows.push({
			label,
			remaining: quota.unlimited === true || placeholder ? undefined : percent,
			detail: quota.unlimited === true ? "Unlimited" : placeholder ? "Quota not reported" : countDetail(remaining, entitlement),
			resetAt: date(quota.quota_reset_at) ?? date(data.quota_reset_date),
		});
	}
	const notes: string[] = [];
	const creditsUsed = number(object(snapshots.premium_interactions).credits_used);
	if (creditsUsed !== undefined) notes.push(`Premium interaction credits used: ${creditsUsed.toLocaleString()} (provider units).`);
	if (data.token_based_billing === true) {
		notes.push("Token-based billing: unlimited quota markers do not mean unlimited free spend; a remaining credit budget is not reported here.");
	}
	return { title: `GitHub Copilot · ${text(data.copilot_plan) ?? "plan not reported"}`, rows, notes };
}

async function cursorUsage(signal: AbortSignal): Promise<UsageReport> {
	const cookie = process.env.CURSOR_USAGE_COOKIE?.trim();
	if (!cookie) {
		return { title: "Cursor", rows: [], notes: [
			"Cursor SDK API keys cannot read dashboard quotas.",
			"Set CURSOR_USAGE_COOKIE to your cursor.com session Cookie header, then restart Pi.",
			"Use the same account as Pi's Cursor login. No browser credentials are read automatically.",
			"Dashboard: https://cursor.com/dashboard?tab=usage",
		] };
	}
	const data = await request("https://cursor.com/api/usage-summary", safeHeaders({ Cookie: cookie, Accept: "application/json" }), signal);
	const individual = object(data.individualUsage);
	const plan = object(individual.plan);
	const resetAt = date(data.billingCycleEnd);
	const rows: UsageRow[] = [];
	for (const [key, label] of [["autoPercentUsed", "Cursor models (Auto/Composer)"], ["apiPercentUsed", "Other models"], ["totalPercentUsed", "Total included usage"]]) {
		const used = number(plan[key]);
		if (used !== undefined) rows.push({ label, remaining: 100 - used, resetAt });
	}
	for (const [label, value] of [
		["Included plan", plan], ["On-demand (individual)", individual.onDemand],
		["Personal cap", individual.overall], ["Team pool", object(data.teamUsage).pooled],
	] as const) {
		const budget = object(value);
		const used = number(budget.used);
		const limit = number(budget.limit);
		if (budget.enabled === false || used === undefined) continue;
		rows.push({
			label,
			remaining: limit !== undefined && limit > 0 ? 100 * (1 - used / limit) : undefined,
			detail: `$${(used / 100).toFixed(2)} used / ${limit === undefined ? "cap not reported" : `$${(limit / 100).toFixed(2)}`}`,
			resetAt,
		});
	}
	return { title: `Cursor · ${text(data.membershipType) ?? "plan not reported"}`, rows, notes: [
		"Source: configured dashboard cookie (account is not verified against Pi's SDK key).",
		"Team pool is shared; on-demand spending is separate from included usage.",
	] };
}

function codexReport(data: Record<string, unknown>): UsageReport {
	const rows: UsageRow[] = [];
	const addWindows = (label: string, value: unknown) => {
		const limit = object(value);
		for (const [key, fallback] of [["primary_window", "primary"], ["secondary_window", "secondary"]]) {
			const window = object(limit[key]);
			if (!Object.keys(window).length) continue;
			const used = number(window.used_percent);
			const seconds = number(window.limit_window_seconds);
			const after = number(window.reset_after_seconds);
			rows.push({
				label: `${label} · ${seconds === undefined ? fallback : duration(seconds)}`,
				remaining: used === undefined ? undefined : 100 - used,
				resetAt: date(window.reset_at) ?? (after === undefined ? undefined : Date.now() + after * 1000),
			});
		}
	};
	addWindows("Codex", data.rate_limit);
	addWindows("Code review", data.code_review_rate_limit);
	for (const extra of array(data.additional_rate_limits).map(object)) {
		const identifiers = [extra.limit_name, extra.metered_feature];
		if (identifiers.some((value) => text(value)?.toLowerCase().includes("spark"))) continue;
		addWindows(text(extra.limit_name) ?? text(extra.metered_feature) ?? "Additional limit", extra.rate_limit);
	}
	const credits = object(data.credits);
	const resets = number(object(data.rate_limit_reset_credits).available_count);
	const notes: string[] = [];
	if (credits.unlimited === true) notes.push("Extra usage credits: unlimited.");
	else if (text(credits.balance) !== undefined || number(credits.balance) !== undefined) {
		notes.push(`Extra usage credits: ${String(credits.balance)} (not a percentage).`);
	}
	if (resets !== undefined) notes.push(`Banked resets available: ${resets}${resets > 0 ? " · /usage reset to review and redeem" : ""}.`);
	return { title: `OpenAI Codex · ${text(data.plan_type) ?? "plan not reported"}`, rows, notes };
}

function safeHeaders(values: Record<string, string>) {
	try {
		return new Headers(values);
	} catch {
		// Headers errors can quote the offending value, including a token or cookie.
		throw new Error("Invalid usage authentication headers. Reauthenticate or check CURSOR_USAGE_COOKIE.");
	}
}

async function request(url: string, headers: Headers, signal: AbortSignal, body?: Record<string, string>) {
	const requestHeaders = new Headers(headers);
	if (body) requestHeaders.set("Content-Type", "application/json");
	let response: Response;
	try {
		response = await fetch(url, {
			method: body ? "POST" : "GET", headers: requestHeaders,
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
			redirect: "error",
		});
	} catch {
		throw new Error(signal.aborted ? "Usage request cancelled." : "Usage request failed or timed out.");
	}
	if (!response.ok) throw new Error(`Usage endpoint returned HTTP ${response.status}.${response.status === 401 || response.status === 403 ? " Reauthenticate or check account eligibility." : ""}`);
	try {
		const data: unknown = await response.json();
		if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
		return object(data);
	} catch {
		throw new Error("Usage endpoint returned an invalid JSON object.");
	}
}

function object(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === "string" && value.length > 0 ? value : undefined; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function date(value: unknown) {
	const milliseconds = typeof value === "number" ? value * 1000 : Date.parse(text(value) ?? "");
	return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
}
function duration(seconds: number) {
	if (seconds >= 86400) return `${seconds / 86400}d`;
	if (seconds >= 3600) return `${seconds / 3600}h`;
	return `${seconds / 60}m`;
}
function countDetail(remaining: number | undefined, limit: number | undefined) {
	return remaining === undefined || limit === undefined ? undefined : `${remaining} / ${limit} remaining`;
}

export type UsageReport = { title: string; rows: UsageRow[]; notes: string[] };
export type UsageRow = { label: string; remaining?: number; detail?: string; resetAt?: number };
