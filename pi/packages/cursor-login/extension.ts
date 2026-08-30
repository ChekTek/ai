import { Cursor } from "@cursor/sdk";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DEFAULT_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Mint a Cursor SDK API key through the browser login flow.
 *
 * The key is stored as Pi OAuth credentials so `/login` can offer Cursor next
 * to subscription providers. pi-cursor-sdk still consumes it as an API key
 * through `getApiKey`.
 * @param callbacks Pi OAuth UI callbacks for the login URL and cancellation.
 * @returns Credentials Pi persists in `auth.json`.
 */
async function loginCursor(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
	callbacks.onProgress?.("Opening Cursor login in your browser…");
	const result = await Cursor.auth.login({
		store: null,
		apiKeyName: "Pi",
		onLoginUrl: (url) => {
			callbacks.onAuth({
				url,
				instructions: "Complete Cursor login in your browser. If it does not open, paste this URL.",
			});
		},
		signal: callbacks.signal,
	});
	if (!result.apiKey) {
		throw new Error("Cursor login did not return an API key.");
	}

	return {
		refresh: result.apiKey,
		access: result.apiKey,
		expires: result.apiKeyExpiresAtMs ?? Date.now() + DEFAULT_KEY_TTL_MS,
	};
}

/**
 * Cursor API keys are not refreshable. Ask the user to log in again.
 * @param _credentials Previously stored Cursor credentials.
 * @param signal Abort signal from Pi's token refresh.
 * @returns Never; Cursor has no refresh token.
 */
async function refreshCursorToken(
	_credentials: OAuthCredentials,
	signal: AbortSignal,
): Promise<OAuthCredentials> {
	signal.throwIfAborted();
	throw new Error("Cursor browser login expired. Run /login and choose Cursor again.");
}

/**
 * Register Cursor browser login on the `cursor` provider without replacing
 * pi-cursor-sdk's models or stream handler. Pi merges defined keys only.
 * @param pi Extension API supplied by Pi.
 */
export default function cursorLoginExtension(pi: ExtensionAPI): void {
	pi.registerProvider("cursor", {
		name: "Cursor",
		oauth: {
			name: "Cursor",
			isSubscription: true,
			login: loginCursor,
			refreshToken: refreshCursorToken,
			getApiKey: (credentials) => credentials.access,
		},
	});
}
