import {
	isSearchRateLimitError,
	type NormalizedSearchResult,
	type SearchProvider,
	type SearchProviderError,
} from "./providers/types.ts";
import { err, ok, type Result } from "./result.ts";
import type { SearchDepth, SearchProviderName, SearchQuery, WebToolsSettings } from "./types.ts";

export interface SearchWebInput {
	readonly query: SearchQuery;
	readonly maxResults: number;
	readonly depth: SearchDepth;
}

export interface SearchWebResult {
	readonly query: SearchQuery;
	readonly depth: SearchDepth;
	readonly maxResults: number;
	readonly provider: SearchProviderName;
	readonly results: readonly NormalizedSearchResult[];
}

export type SearchWebError = { readonly _tag: "SearchDisabled" } | SearchProviderError;

export interface SearchWebDependencies {
	readonly provider: SearchProvider;
	readonly fallback?: SearchProvider;
	readonly settings: WebToolsSettings["search"];
}

export class SearchWeb {
	constructor(private readonly dependencies: SearchWebDependencies) {}

	/** Execute a web search through the configured provider, with an optional rate-limit fallback. */
	async search(
		input: SearchWebInput,
		options: { readonly signal?: AbortSignal } = {},
	): Promise<Result<SearchWebResult, SearchWebError>> {
		if (!this.dependencies.settings.enabled) {
			return err({ _tag: "SearchDisabled" });
		}

		const providerResult = await this.dependencies.provider.search(input, { signal: options.signal });
		if (providerResult._tag === "ok") {
			return ok(toSearchWebResult(input, this.dependencies.provider.name, providerResult.value));
		}

		const fallback = this.dependencies.fallback;
		if (!fallback || !isSearchRateLimitError(providerResult.error)) {
			return providerResult;
		}

		const fallbackResult = await fallback.search(input, { signal: options.signal });
		if (fallbackResult._tag === "err") {
			if (fallbackResult.error._tag === "SearchProviderCancelled") {
				return fallbackResult;
			}
			return providerResult;
		}

		return ok(toSearchWebResult(input, fallback.name, fallbackResult.value));
	}
}

function toSearchWebResult(
	input: SearchWebInput,
	provider: SearchProviderName,
	results: readonly NormalizedSearchResult[],
): SearchWebResult {
	return {
		query: input.query,
		depth: input.depth,
		maxResults: input.maxResults,
		provider,
		results,
	};
}
