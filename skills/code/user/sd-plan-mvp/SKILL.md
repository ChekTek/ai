---
name: sd-plan-mvp
description: "Create an implementation-ready Markdown MVP plan for a new Stream Deck plugin by researching its integration, agreeing on 5-10 useful actions, and clarifying architecture, settings, behavior, and visuals."
argument-hint: "[plugin idea, API documentation, or integration URL]"
disable-model-invocation: true
---

# Plan a Stream Deck Plugin MVP

Markdown plan for the first useful version. Do not implement.

Ask one focused question at a time; use a question tool with a recommended default.

## 1. Plugin and integration

Ask, in order, unless already answered:

1. Plugin name?
2. What API, app, device, or protocol does it talk to?

Accept URLs, pasted docs, local paths, or a description. Then gather only missing context: primary user/workflow; operations, events, auth, connection, rate limits, platform; local vs cloud vs device; hardware (dials/touchscreen).

Read provided docs. Never invent endpoints, events, fields, or settings — label unknowns as assumptions.

## 2. Propose actions

From documented capabilities. Easy to implement, useful in a repeated workflow.

Patterns: status key; press to toggle/command/API; multi-state key; dial rotate; dial press; rotate+press; touchscreen feedback.

Present strongest candidates in small rounds. Each: name, user problem, input type, visual feedback, documented capability, why high-value/low-effort, limitations.

Explicit approve/reject/revise — never infer from silence. At least 5 approved, stop at 10. Do not continue with fewer than 5.

## 3. Implementation details

Ask until another developer could implement without product decisions. Shared first, then per-action. Cover what applies: key/long-press/dial/touch; read/write, refresh, subscriptions, cache, rate limits, retries, stale data; auth, discovery, global settings, connection health; PI settings (concrete options from docs); hidden dependents; visual states (loading/ready/active/inactive/disconnected/stale/error); SVG system; errors, confirmations, offline; MVP boundaries.

Reuse answers. Before finishing: summarize actions; only implementation-time discoveries stay open.

## Architecture

If Stream Deck plugin/UI rules are already in context, follow them. Otherwise:

- Strict TypeScript, official Stream Deck SDK. pnpm, rolldown, `@elgato/eslint-config` `config.strict`, `@elgato/prettier-config`.
- `streamDeck.settings.useExperimentalMessageIdentifiers = true` in `plugin.ts`.
- Integration in `*-service.ts`: `export default new FooService();`. Services throw; actions catch, log `error`, `showAlert`.
- Shared state only if needed: `plugin-store.ts`, same singleton pattern.
- `willAppear` vs async ready: `withResolvers` from `@elgato/utils`.
- One-action helpers: private methods. Two visual states: manifest + `setState`.
- Do not write settings back from `onDidReceiveSettings` / `onDidReceiveGlobalSettings`.
- Credentials/connection: global settings. Action choices: per-action settings.
- PI: SDPI Components; hide dependents; `const { streamDeckClient } = SDPIComponents`; listeners on `focusElement`.
- Consistent SVG icons. Native deps: copy into `.sdPlugin`. UUID/settings changes on a deployed plugin: ask, then migrate.

## 4. Write the plan

Write `./<plugin-slug>-mvp-plan.md` (kebab-case). Do not overwrite without approval.

Required headings: Product Summary; Goals; MVP Scope; Non-Goals; Integration Findings (Verified Capabilities, Constraints and Assumptions); User Experience (Setup and Connection, Shared Visual Language, Error and Offline); Approved Actions — for each: User Value, Interaction and Behavior, Property Inspector Settings, Visual States and Assets, Integration Operations, Edge Cases and Errors, Acceptance Criteria (observable); Architecture (Project Structure, Plugin Runtime, Service and Connection, Shared State, Settings, Refresh/Events/Rate Limits, Error Handling, Manifest and PIs); Implementation Phases (vertical slices, dependency order); Testing Strategy; Definition of Done; Risks and Open Questions; Documentation Sources.

Include proposed files/classes, settings ownership, and API ops. Cite docs. Report path and approved-action count.
