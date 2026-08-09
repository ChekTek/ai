---
name: sd-plan-mvp
description: "Create an implementation-ready Markdown MVP plan for a new Stream Deck plugin by researching its integration, agreeing on 5-10 useful actions, and clarifying architecture, settings, behavior, and visuals."
argument-hint: "[plugin idea, API documentation, or integration URL]"
disable-model-invocation: true
---

# Plan a Stream Deck Plugin MVP

Create a Markdown plan for the first useful version of a new Stream Deck
plugin. Do not implement the plugin.

Treat the conversation as part of the planning work: ask one focused question
at a time, explain why it matters, and use a question tool with choices when
available. Avoid generic checklist questions unrelated to the integration and
decisions already made.

## 1. Start with the plugin and integration

Ask these two questions first, in order, unless already answered:

1. What is the plugin's name?
2. What API, application, device, protocol, or other thing will it work with?

Accept documentation URLs, attached/pasted docs, local paths, or a
plain-language description for the second answer. Then gather only the
missing context needed to understand the integration:

- The primary user and their most common workflow.
- Supported operations, status data, events, authentication, connection
  method, rate limits, and platform constraints.
- Whether it talks to a local service, cloud API, device, CLI, or application.
- Target hardware when it affects the design, especially dial/touchscreen
  support.

Read provided documentation and inspect relevant local files; research
external docs if web access is available. Never invent endpoints, events,
fields, capabilities, or settings — label unverified behavior as an
assumption or open question.

## 2. Propose and approve actions

Derive ideas from capabilities the documentation actually supports, favoring
ones that are easy to implement but meaningfully useful in a repeated
workflow.

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
capability enabling it, why it's high-value/low-effort, and any limitation or
uncertainty.

Ask the user to approve, reject, or revise each candidate — track explicit
approval, never infer it from silence. Keep proposing until at least 5 are
approved, stop at 10, and prefer a coherent MVP over filling the quota with
weak variants. Do not move to Section 3 with fewer than 5 approved actions.

## 3. Resolve implementation details

Once actions are approved, ask contextual questions until another developer
could implement the plan without making product decisions. Resolve shared
decisions first, then action-specific ones. Cover what applies:

- Exact key, long-press, dial rotation/press, and touch behavior.
- Read/write operations, parameters, refresh cadence, subscriptions, caching,
  rate limits, retries, and stale-data behavior.
- Authentication, discovery, connection setup, global settings, and how
  connection health is shown.
- Property inspector settings per action — suggest concrete options from the
  docs (resources, ranges, modes, filters, units) rather than open-ended
  questions.
- Defaults and dependent settings that stay hidden until relevant.
- Key/dial/touchscreen states for loading, ready, active, inactive,
  disconnected, stale, and error.
- Icon direction, colors, labels, SVG templates, animations, and
  accessibility. Prefer SVG templates and a consistent visual system; use
  animation only when it communicates state.
- Error feedback, destructive-action confirmation, and offline/unavailable
  behavior.
- MVP boundaries, platform support, and explicit non-goals.

Recommend a strong default first when one exists, with a brief reason. Reuse
answers across actions instead of re-asking shared choices.

Before finishing, summarize the resolved action set and flag remaining
assumptions. Resolve product decisions via follow-up questions — leave only
genuine implementation-time discoveries as open questions.

## Stream Deck architecture rules

Apply these rules even when the current directory is not a Stream Deck plugin:

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
  components if planning inside an existing plugin.
- If native dependencies are required, include packaging work to copy them into
  the `.sdPlugin` bundle.
- If planning changes to an existing deployed plugin's UUIDs or settings
  structure, ask whether it is in production and include a migration strategy.
- Include JSDoc expectations and avoid adding dependencies unless necessary.

## 4. Write the plan

Once decisions are complete, write the plan to `./<plugin-slug>-mvp-plan.md`
(filesystem-safe lowercase kebab-case), unless the user provided another
destination. Never overwrite an existing file without explicit approval.

The plan must be implementation-ready and contain:

```markdown
# <Plugin Name> Stream Deck Plugin MVP Plan

## Product Summary
## Goals
## MVP Scope
## Non-Goals
## Integration Findings
### Verified Capabilities
### Constraints and Assumptions
## User Experience
### Setup and Connection Flow
### Shared Visual Language
### Error and Offline Behavior
## Approved Actions
### 1. <Action Name>
#### User Value
#### Interaction and Behavior
#### Property Inspector Settings
#### Visual States and Assets
#### Integration Operations
#### Edge Cases and Errors
#### Acceptance Criteria
## Architecture
### Project Structure
### Plugin Runtime
### Service and Connection Layer
### Shared State and Initialization
### Settings and Data Model
### Refresh, Events, and Rate Limits
### Error Handling and Logging
### Manifest and Property Inspectors
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
early: project skeleton and connection setup, shared integration layer, then
actions in value/dependency order, followed by visual polish and packaging.
Separate confirmed requirements from assumptions and cite documentation URLs
or local paths used.

After writing, report the plan path and the number of approved actions it
contains.
