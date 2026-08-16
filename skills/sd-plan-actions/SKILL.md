---
name: sd-plan-actions
description: "Create an implementation-ready Markdown plan for new actions in an existing Stream Deck plugin, by learning its current integration and conventions and agreeing on 3-10 useful actions."
argument-hint: "[new capability, feature area, or API surface to build actions for]"
disable-model-invocation: true
---

# Plan New Actions for an Existing Stream Deck Plugin

Markdown plan for new actions. Do not implement.

Ask one focused question at a time; use a question tool with a recommended default.

Follow Stream Deck plugin/UI rules already in context. Where they conflict with this plugin's conventions, keep the plugin's and note the discrepancy.

## 1. Learn the plugin

Locate it (cwd or a given path). Read `manifest.json`, any `*-service.ts`, any `plugin-store.ts`, and existing actions (PI patterns, icons, errors, settings).

Confirm the named capability is actually supported. If none was named, ask what workflow the actions should serve. Never invent endpoints, events, fields, or settings — label unknowns as assumptions.

## 2. Propose actions

From capabilities the integration actually supports, reusing existing services. Easy to implement, useful in a repeated workflow.

Patterns: status key; press to toggle/command/API; multi-state key; dial rotate; dial press; rotate+press; touchscreen feedback.

Present strongest candidates in small rounds. Each: name, user problem, input type, visual feedback, documented capability, why high-value/low-effort, limitations, whether new service methods are needed.

Explicit approve/reject/revise — never infer from silence. At least 3 approved, stop at 10. Do not continue with fewer than 3.

## 3. Implementation details

Ask until another developer could implement without product decisions. Shared first, then per-action. Cover what applies: key/long-press/dial/touch; read/write, refresh, subscriptions, cache, rate limits (reuse service methods; extend only when needed); whether existing connection/auth/global settings already cover it; PI settings matching this plugin; hidden dependents; visual states; icons in the existing SVG style; errors, confirmations, offline; production UUID/settings migration; non-goals.

Reuse answers. Before finishing: summarize actions; only implementation-time discoveries stay open.

## 4. Write the plan

Write `./<capability-slug>-actions-plan.md` (kebab-case). Do not overwrite without approval.

Required headings: Summary; Scope and Non-Goals; Integration Findings (Verified Capabilities, Constraints and Assumptions); Approved Actions — for each: User Value, Interaction and Behavior, Property Inspector Settings, Visual States and Assets, Integration Operations, Edge Cases and Errors, Acceptance Criteria (observable); Architecture Changes (Service Extensions, Shared State, Settings, Manifest Additions); Implementation Phases; Testing Strategy; Definition of Done; Risks and Open Questions; Documentation Sources.

Include proposed files/classes, settings ownership, and API ops. Cite docs. Report path and approved-action count.
