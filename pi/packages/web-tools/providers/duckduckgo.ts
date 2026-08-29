import { parseHTML } from "linkedom";
import { decodeTextBuffer, parseContentType } from "../network.ts";
import type { PublicWebClient, PublicWebError } from "../public-web-client.ts";
import { err, ok, type Result } from "../result.ts";
import { parsePublicHttpUrl, type PublicHttpUrl, type WebToolsSettings } from "../types.ts";
import type { NormalizedSearchResult, SearchProvider, SearchProviderError, SearchProviderRequest } from "./types.ts";

export const DUCKDUCKGO_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/";
export const MAX_DUCKDUCKGO_RESPONSE_BYTES = 1 * 1024 * 1024;
const DUCKDUCKGO_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

export class DuckDuckGoSearchProvider implements SearchProvider {
	readonly name = "duckduckgo" as const;

	constructor(
		private readonly publicWeb: PublicWebClient,
		private readonly fetchSettings: WebToolsSettings["fetch"],
	) {}

	/** Search DuckDuckGo's keyless HTML endpoint and return normalized public-web results. */
	async search(
		input: SearchProviderRequest,
		options: { readonly signal?: AbortSignal } = {},
	): Promise<Result<readonly NormalizedSearchResult[], SearchProviderError>> {
		const requestUrl = duckDuckGoSearchUrl(input.query);
		if (requestUrl._tag === "err") {
			return err({ _tag: "SearchProviderUnavailable", provider: this.name, cause: requestUrl.error });
		}

		const response = await this.publicWeb.get(
			{
				url: requestUrl.value,
				accept: "text/html",
				userAgent: DUCKDUCKGO_USER_AGENT,
				fallbackUserAgent: this.fetchSettings.fallbackUserAgent,
				maxRedirects: this.fetchSettings.maxRedirects,
				maxResponseBytes: MAX_DUCKDUCKGO_RESPONSE_BYTES,
				blockPrivateHosts: this.fetchSettings.blockPrivateHosts,
			},
			{ signal: options.signal },
		);
		if (response._tag === "err") {
			return err(mapPublicWebError(response.error));
		}

		const parsedContentType = parseContentType(response.value.headers.get("content-type"));
		const decoded = decodeTextBuffer(response.value.body, parsedContentType.charset);
		const parsed = parseDuckDuckGoHtml(decoded.text, input.maxResults);
		if (parsed._tag === "err") {
			return parsed;
		}

		return ok(parsed.value);
	}
}

/** Build the DuckDuckGo HTML search URL for a query. */
export function duckDuckGoSearchUrl(query: string): Result<PublicHttpUrl, { readonly reason: string }> {
	const url = new URL(DUCKDUCKGO_HTML_SEARCH_URL);
	url.searchParams.set("q", query);
	const parsed = parsePublicHttpUrl(url.toString());
	if (parsed._tag === "err") {
		return err({ reason: "Invalid DuckDuckGo search URL" });
	}
	return parsed;
}

/** Parse DuckDuckGo HTML result cards into normalized search results. */
export function parseDuckDuckGoHtml(
	html: string,
	maxResults: number,
): Result<readonly NormalizedSearchResult[], SearchProviderError> {
	const { document } = parseHTML(html);
	const results: NormalizedSearchResult[] = [];
	let parseableResults = 0;

	for (const container of document.querySelectorAll(".result")) {
		if (container.classList.contains("result--ad")) {
			continue;
		}

		const anchor = container.querySelector(".result__a");
		const title = anchor?.textContent?.trim() ?? "";
		const href = anchor?.getAttribute("href")?.trim() ?? "";
		const resultUrl = href ? decodeDuckDuckGoResultUrl(href) : undefined;
		if (!title || !resultUrl) {
			continue;
		}

		parseableResults += 1;
		const snippet = container.querySelector(".result__snippet")?.textContent?.trim();
		results.push({
			title,
			url: resultUrl,
			snippet: snippet || undefined,
		});
		if (results.length >= maxResults) {
			break;
		}
	}

	if (parseableResults === 0) {
		return err({ _tag: "SearchProviderNoRecognizedResults", provider: "duckduckgo" });
	}

	return ok(results);
}

function decodeDuckDuckGoResultUrl(href: string): PublicHttpUrl | undefined {
	try {
		const link = new URL(href, DUCKDUCKGO_HTML_SEARCH_URL);
		const destination = link.searchParams.get("uddg") ?? link.href;
		const parsed = parsePublicHttpUrl(destination);
		return parsed._tag === "ok" ? parsed.value : undefined;
	} catch {
		return undefined;
	}
}

function mapPublicWebError(error: PublicWebError): SearchProviderError {
	switch (error._tag) {
		case "PublicWebCancelled":
			return { _tag: "SearchProviderCancelled", provider: "duckduckgo", cause: error.cause };
		case "HttpStatusRejected":
			return { _tag: "SearchProviderStatusRejected", provider: "duckduckgo", status: error.status };
		case "ResponseTooLarge":
			return { _tag: "SearchProviderResponseTooLarge", provider: "duckduckgo", maxBytes: error.maxBytes };
		default:
			return { _tag: "SearchProviderUnavailable", provider: "duckduckgo", cause: error };
	}
}
