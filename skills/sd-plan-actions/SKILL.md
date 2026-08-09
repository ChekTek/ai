---
name: sd-plan-actions
description: "Create an implementation-ready Markdown plan for new actions in an existing Stream Deck plugin, by learning its current integration and conventions and agreeing on 3-10 useful actions."
argument-hint: "[new capability, feature area, or API surface to build actions for]"
disable-model-invocation: true
---

# Plan New Actions for an Existing Stream Deck Plugin

Create a Markdown plan for one or more new actions to add to an existing
Stream Deck plugin. Do not implement the actions.

Treat the conversation as part of the planning work: ask one focused question
at a time, explain why it matters, and use a question tool with choices when
available. Avoid generic checklist questions unrelated to the plugin's
existing integration and decisions already made.

## 1. Learn the existing plugin

Locate the plugin (current directory or a given path) and read:

- `manifest.json` for existing actions, UUIDs, and states.
- Any `*-service.ts` for existing integration capabilities and
  authentication.
- Any `plugin-store.ts` for existing shared state.
- Existing actions for established conventions: property inspector patterns,
  icon style, error handling, and settings shape.

If a capability, feature area, or API surface was named, confirm it maps to
something the existing integration (or its documented API) actually
supports. If not specified, ask what new capability or workflow the actions
should serve. Never invent endpoints, events, fields, capabilities, or
settings beyond what the integration supports or documents — label
unverified behavior as an assumption or open question.

## 2. Propose and approve actions

Derive ideas from capabilities the integration actually supports — reusing
the existing services where possible — favoring ones that are easy to
implement but meaningfully useful in a repeated workflow.

Consider all applicable interaction patterns:

- Key showing live status or a value.
- Key press toggling state, invoking a command, or making an API call.
- Multi-state key combining status and control.
- Dial rotation changing a continuous or stepped value.
- Dial press toggling, selecting, resetting, or confirming.
- Dial rotation and press together.
- Touchscreen feedback for a dial action.

Present the strongest candidates first, in small rounds. For each, include:
name, user problem/interaction, input type, visual feedback, the documented
capability enabling it, why it's high-value/low-effort, and any limitation
or uncertainty — including whether it needs new service methods.

Ask the user to approve, reject, or revise each candidate — track explicit
approval, never infer it from silence. Keep proposing until at least 3 are
approved, stop at 10, and prefer a coherent set over filling the quota with
weak variants. Do not move to Section 3 with fewer than 3 approved actions.

## 3. Resolve implementation details

Once actions are approved, ask contextual questions until another developer
could implement the plan without making product decisions. Resolve shared
decisions first, then action-specific ones. Cover what applies:

- Exact key, long-press, dial rotation/press, and touch behavior.
- Read/write operations, parameters, refresh cadence, subscriptions, caching,
  rate limits, retries, and stale-data behavior — reusing existing
  service methods where they already cover this, extending them only
  where needed.
- Whether new authentication, discovery, or global settings are needed, or
  whether existing connection setup already covers it.
- Property inspector settings per action — suggest concrete options from the
  docs (resources, ranges, modes, filters, units) rather than open-ended
  questions, matching the plugin's existing property inspector patterns.
- Defaults and dependent settings that stay hidden until relevant.
- Key/dial/touchscreen states for loading, ready, active, inactive,
  disconnected, stale, and error.
- New icons following the plugin's existing SVG style, colors, and
  components.
- Error feedback, destructive-action confirmation, and offline/unavailable
  behavior.
- Whether the plugin is already deployed to production, requiring a
  migration strategy for any UUID or settings-structure change.
- Non-goals for this batch of actions.

Recommend a strong default first when one exists, with a brief reason. Reuse
answers across actions instead of re-asking shared choices.

Before finishing, summarize the resolved action set and flag remaining
assumptions. Resolve product decisions via follow-up questions — leave only
genuine implementation-time discoveries as open questions.

## Stream Deck architecture rules

Apply these rules, but defer to the existing plugin's established
conventions where they conflict — note the discrepancy rather than silently
overriding it:

- Plan a strict TypeScript plugin using the official Stream Deck SDK.
- Use pnpm, rolldown, `@elgato/eslint-config` with `config.strict`, and
  `@elgato/prettier-config`.
- Set `streamDeck.settings.useExperimentalMessageIdentifiers = true` in
  `plugin.ts`.
- Put all integration and connection logic in a dedicated `*-service.ts`
  singleton, exported as `export default new FooService();` and imported
  directly. Service methods may throw; action classes catch errors, log them
  as errors, and call `showAlert` for user feedback.
- Only if actions share state, plan a `plugin-store.ts` singleton, exported
  as `export default new PluginStore();` and imported directly.
- If `willAppear` can run before an async dependency is ready, coordinate
  readiness with `withResolvers` from `@elgato/utils`.
- Keep logic used by only one action as private methods on that action class.
- For actions with exactly two visual states, define both states in
  `manifest.json` and use `setState` rather than switching images manually.
- Do not write settings back from `onDidReceiveSettings` or
  `onDidReceiveGlobalSettings`; those events already contain stored settings.
- Store shared credentials and connection configuration globally when
  appropriate. Keep action-specific choices in per-action settings.
- Build property inspectors with SDPI Components. Hide dependent settings until
  their parent choice is selected. Use
  `const { streamDeckClient } = SDPIComponents` rather than opening a WebSocket,
  and attach component listeners through each component's `focusElement`.
- Prefer a consistent SVG icon system. Reuse existing icon style, colors, and
  components from the plugin.
- If native dependencies are required, include packaging work to copy them into
  the `.sdPlugin` bundle.
- If planning changes to an existing deployed plugin's UUIDs or settings
  structure, ask whether it is in production and include a migration strategy.
- Include JSDoc expectations and avoid adding dependencies unless necessary.

## 4. Write the plan

Write the plan to `./<capability-slug>-actions-plan.md`, unless the user
provided another destination. Use a filesystem-safe lowercase kebab-case
slug. Never overwrite an existing file without explicit approval.

The plan must be implementation-ready and contain:

```markdown
# <Plugin Name>: <Capability> Actions Plan

## Summary
## Scope and Non-Goals
## Integration Findings
### Verified Capabilities
### Constraints and Assumptions
## Approved Actions
### 1. <Action Name>
#### User Value
#### Interaction and Behavior
#### Property Inspector Settings
#### Visual States and Assets
#### Integration Operations
#### Edge Cases and Errors
#### Acceptance Criteria
## Architecture Changes
### Service Extensions
### Shared State
### Settings and Data Model
### Manifest Additions
## Implementation Phases
## Testing Strategy
## Definition of Done
## Risks and Open Questions
## Documentation Sources
```

Repeat the action subsection for every approved action, including proposed
file/class names, settings interfaces and ownership, API operations,
event/data flow, polling or subscription ownership, and action registration.
Acceptance criteria must be observable and testable.

Order implementation phases by dependency, producing a usable vertical slice
early. Separate confirmed requirements from assumptions and cite
documentation URLs or local paths used.

After writing, report the plan path and the number of approved actions it
contains.
