---
name: sd-improve
description: "Audit an existing Stream Deck plugin against project quality rules and correctness, then write a Markdown plan for resolving violations, bugs, and missing/broken features."
argument-hint: "[path to plugin, or leave blank to use the current directory]"
disable-model-invocation: true
---

# Improve an Existing Stream Deck Plugin

Audit the plugin and write a Markdown plan. Do not change code.

## 1. Locate the plugin

Path if given, otherwise cwd (or its `*.sdPlugin` / `plugin*` subfolder). Ask if none is found. Inventory `manifest.json`, `package.json`, `src/**`, and `**/*.sdPlugin/ui/**`.

## 2. Check against rules

Read every source, config, manifest, and UI file. Audit against the Stream Deck and TypeScript rules already in context. For each violation: file, line, rule, one-line fix.

## 3. Bugs and missing/broken features

- Walk each action lifecycle (`willAppear`, key/dial press, settings updates) for unhandled rejections, races, or desync from the device/service.
- Compare `manifest.json` states/settings/UUIDs to code and the PI — unused declarations or undeclared usage.
- TODOs, dead code, swallowed errors, missing rate-limit/retry/stale-data handling the plugin already uses elsewhere.
- If it builds, rebuild and check the first 15 lines of `*.sdPlugin/logs`.
- Note half-finished or silently broken features and what finishing them would take.

## 4. Write the plan

Write `./<plugin-slug>-improve-plan.md` (kebab-case). Do not overwrite without approval.

Required headings: Summary; Rule Violations (by category: file/line, rule, fix); Bugs and Broken Behavior (Evidence, Impact, Fix); Missing or Incomplete Features (Current State, What's Missing, Recommended Fix); Recommended Priority Order; Out of Scope / Non-Goals; Open Questions.

Priority: correctness and data-loss/user-facing bugs first, then impactful rule violations, then style. Ask before product calls (finish vs remove vs redesign).

Report path and issue counts per category.
