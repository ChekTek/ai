---
name: orchestrate
description: "Delegate coding work to another model family (GPT, Claude, or Grok) through the Copilot CLI. Use when you want a cross-family worker instead of doing the work yourself."
argument-hint: "[gpt|claude|grok] [task or goal]"
disable-model-invocation: true
---

# Orchestrate

Delegate to a Copilot CLI worker in a **different** model family, then verify the result yourself. You own the outcome. Do not delegate the review.

If no family is given, pick one you are not.

## Models

- **gpt** — complex: `gpt-5.6-sol --effort high --mode autopilot --max-autopilot-continues 15`. Everyday: `gpt-5.6-terra --effort medium --mode autopilot`. Light: `gpt-5.6-luna --effort low`.
- **claude** — complex: `claude-opus-5 --effort high --mode autopilot --max-autopilot-continues 15`. Everyday: `claude-sonnet-5 --effort medium --mode autopilot`. Light: `claude-sonnet-5 --effort low`.
- **grok** — `grok-4.6` at `--effort high --mode autopilot --max-autopilot-continues 15` (complex), `--effort medium --mode autopilot` (everyday), or `--effort low` (light).

Add-ons: `--context long_context` (large repo/diff), `--enable-all-github-mcp-tools` (issues, PRs, checks), `--allow-all-mcp-server-instructions`.

## Steps

1. `git status --short` so unrelated changes are visible later.
2. Ask the user clarifying questions. Split into sub-tasks and orchestrate each separately.
3. Pick model/effort from the list above.
4. Prompt: objective, relevant files, what "done" means. Do not commit, push, or open a PR unless the user asked.
5. Run:
   ```
   copilot -C <repo> --model=<model> <model-flags> --prompt <prompt> \
     --allow-all-tools --no-ask-user --stream=off --silent
   ```
6. Review the diff and run tests/build yourself.
7. If it fell short: one focused follow-up to the same model. If that fails, fix it yourself.

Report what changed and what you verified.
