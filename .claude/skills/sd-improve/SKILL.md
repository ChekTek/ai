---
name: sd-improve
description: "Audit an existing Stream Deck plugin against project quality rules and correctness, then write a Markdown plan for resolving violations, bugs, and missing/broken features."
argument-hint: "[path to plugin, or leave blank to use the current directory]"
disable-model-invocation: true
---

# Improve an Existing Stream Deck Plugin

Audit a Stream Deck plugin's code and produce a Markdown plan to fix what's
wrong. Do not make code changes yourself — this skill only investigates and
plans.

## 1. Locate the plugin

If a path is given, use it; otherwise assume the current directory (or its
`*.sdPlugin`/`plugin*` subfolder). Ask the user if no plugin can be found.
Inventory `manifest.json`, `package.json`, all `src/**` source, and the
property inspector UI under `**/*.sdPlugin/ui/**`.

## 2. Check against quality rules

Read every source, config, manifest, and UI file, checking each against the
rules below (from `.claude/rules/streamdeck/*.md`, `general.md`,
`typescript.md`). For every violation, record the file, line, rule broken,
and a one-line fix.

### Config & tooling

- pnpm, rolldown, `@elgato/eslint-config` with `config.strict`, and
  `@elgato/prettier-config`.
- Native dependencies are copied into the `.sdPlugin` bundle by the build
  config.

### Plugin runtime

- `streamDeck.settings.useExperimentalMessageIdentifiers = true` set in
  `plugin.ts`.
- Only action classes catch errors, log them as `error`, and call
  `showAlert`; services throw instead of handling.
- Actions with exactly 2 states use manifest-defined states + `setState`, not
  manual `setImage` toggling.
- `onDidReceiveSettings`/`onDidReceiveGlobalSettings` never call
  `setSettings`/`setGlobalSettings` back.
- Shared state lives in a `plugin-store.ts` singleton; API/service logic
  lives in a dedicated `*-service.ts` singleton.
- Helpers used by only one action are private methods on that action class,
  not standalone functions.
- `willAppear` handlers that depend on store/service/global-settings
  readiness use `withResolvers` rather than racing.
- Icons follow the existing SVG style/colors when the repo already has
  icons.
- If a UUID or settings structure changed, check whether a migration path
  exists for already-deployed installs.

### Property inspector (UI)

- Built with SDPI Components; dependent settings are hidden until their
  parent is selected.
- Uses `const { streamDeckClient } = SDPIComponents` rather than a raw
  WebSocket.
- Listeners are attached through each component's `focusElement`.

### TypeScript/general conventions

- No unnecessary explicit types or `any`/`unknown`; single-use types live at
  the bottom of their file.
- `try/catch/finally` over `.catch()`; `async/await` over `.then()`.
- if/else with more than 3 conditions uses a `switch`; ternaries and
  brace-less `if` only when single-line.
- No `void`-prefixed fire-and-forget calls; prefer `const` and destructuring.
- Inheritance only when a clear, obvious win.
- JSDoc present for exported members; nesting depth ≤ 3; no unnecessary
  dependencies.

## 3. Check for bugs and missing/broken features

Beyond style, trace actual behavior:

- Walk each action's lifecycle (`willAppear`, key/dial press, settings
  updates) for unhandled promise rejections, race conditions, or state that
  can desync from the real device/service.
- Compare `manifest.json` states/settings/UUIDs against what the code and
  property inspector actually implement — flag anything declared but unused,
  or used but undeclared.
- Look for TODOs/FIXMEs, dead code, swallowed errors, and API calls missing
  rate-limit/retry/stale-data handling described in the plugin's own
  conventions.
- If the plugin builds locally, rebuild it and check the first 15 lines of
  the `*.sdPlugin/logs` log file for startup errors.
- Note anything that looks like a partially implemented or silently broken
  feature, and what finishing or fixing it would require.

## 4. Write the plan

Write findings to `./<plugin-slug>-improve-plan.md` (filesystem-safe
lowercase kebab-case), unless the user gave another destination. Never
overwrite an existing file without explicit approval.

The plan must contain:

```markdown
# <Plugin Name> Stream Deck Plugin Improvement Plan

## Summary
## Rule Violations
### <Category>
- File/line, rule broken, fix
## Bugs and Broken Behavior
### <Issue>
#### Evidence
#### Impact
#### Fix
## Missing or Incomplete Features
### <Feature>
#### Current State
#### What's Missing
#### Recommended Fix
## Recommended Priority Order
## Out of Scope / Non-Goals
## Open Questions
```

Order "Recommended Priority Order" by risk and effort — correctness and
data-loss/user-facing bugs first, rule violations with real impact next,
style-only violations last. Ask the user before making product-level
judgment calls (e.g., whether to finish, remove, or redesign a broken
feature) rather than deciding unilaterally in the plan.

After writing, report the plan path and a count of issues found per
category.
