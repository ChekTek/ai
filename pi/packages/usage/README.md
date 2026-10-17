# Provider usage

- `/usage` fetches account quotas for the **active provider** without a model call.
- `/usage reset` reviews and redeems an eligible **OpenAI Codex banked reset**.
  Selection and a separate confirmation both default to Cancel. It never buys
  credits, changes a subscription, or resets automatically.

Reports show percentages **remaining**, provider-reported reset times in the
local timezone, and a checked timestamp. Missing data stays “not reported”, not
0% or unlimited. Reports are stored as custom entries outside model context;
RPC/ACP also receives a notification. Print/JSON mode stores the entry only.

## Providers

| Pi provider | Source / limitations |
| --- | --- |
| `github-copilot` | GitHub `copilot_internal/user`: premium interactions, chat, completions, and reset date when supplied. Uses Pi's stored GitHub OAuth token (the credential's `refresh` field), **not** the short-lived Copilot inference token. API-key auth resolves through Pi. Supports github.com and stored ghe.com enterprise domains. |
| `openai-codex` | ChatGPT WHAM usage: primary/secondary windows, code review, additional model limits (excluding Codex Spark), extra credits, and banked-reset count. Auth resolves through Pi so Pi owns OAuth refresh. Uses the explicit account header or the token's account claim. Custom endpoint credentials are not forwarded to ChatGPT. |
| `openai` | No subscription percentage with an inference API key. Shows billing link and any observed request/token rate-limit headers, separately labeled. |
| Others | Explicit unsupported-account-quota message, plus standard rate-limit headers if observed. |

Standard `x-ratelimit-*` headers are an in-memory snapshot of the last observed
response, not a live account balance. Transports may omit them. Their reset
values are shown verbatim with the observation time. Switching models clears
these snapshots. No background polling or inference probes are performed.

Copilot OAuth reads the configured Pi agent directory's auth store through Pi's
public `readStoredCredential` API. An SDK host using a different in-memory auth
store cannot expose its GitHub refresh token through the model registry; that
setup needs a compatible stored login to query Copilot account quotas.

## Banked resets

Eligible Codex accounts can receive promotional banked resets. These are
separate from ordinary automatic quota resets and paid extra-usage credits.
`/usage reset` fetches fresh windows and inventory, lists unexpired available
resets earliest-expiry first, and shows the selected reset, expiration, account
ID, and current windows before confirmation. Redemption requires an idle agent
and interactive UI. The same account is pinned throughout the operation.

One confirmed selection sends one POST with a UUID idempotency key and explicit
credit ID, then refreshes usage. There are **no automatic mutation retries**. If
network failure makes the outcome ambiguous, check `/usage` and the dashboard
before trying again. The extension does not manufacture resets; eligibility and
which windows reset are controlled by OpenAI. `/new`, `/compact`, and OAuth
refresh do not replenish provider quotas.

These are internal provider endpoints and may change. HTTP failures and invalid
JSON produce sanitized errors rather than exposing response bodies or secrets.
Each HTTP request has a 15-second timeout; session shutdown aborts requests.
Quota failures never block normal model use.

References:
- [Official Codex reset client](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs)
- [Codex App Server API](https://developers.openai.com/codex/app-server)
- [Copilot usage source](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/Copilot/CopilotUsageFetcher.swift)

`../usage.ts` is the sole entry point for Pi and pi-acp. This directory has no
`index.ts` or package manifest, avoiding duplicate registration. No dependencies
or publishing-script changes are needed.
