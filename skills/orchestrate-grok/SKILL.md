---
name: orchestrate-grok
description: "Delegate coding work to Grok 4.5 through the Copilot CLI. Use when you want a Grok worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Grok

Delegate to a Grok worker, then verify the result yourself. You own the outcome.

If you are a Grok model, use `orchestrate-gpt`, `orchestrate-claude`, or
`orchestrate-kimi` instead — always delegate across model families so the
worker's blind spots differ from yours.

## Models

- **grok-4.5** — complex: hard bugs, multi-step implementation.
  `--effort high --mode autopilot --max-autopilot-continues 15`
- **grok-4.5** — everyday tasks.
  `--effort medium --mode autopilot`
- **grok-4.5** — light: lookups, one-line fixes, formatting.
  `--effort low`

Add-ons: `--context long_context` (large repo/diff), `--enable-all-github-mcp-tools`
(issues, PRs, checks), `--allow-all-mcp-server-instructions` (other MCP servers).

## Steps

1. Run `git status --short` so you can spot unrelated changes later.
2. Ask any clarifying questions about the task.
3. Split the task into sub-tasks where possible and orchestrate each separately.
4. Pick the effort matching the task's difficulty.
5. Write a self-contained prompt: objective, relevant files, and what "done"
   means. Say not to commit, push, or open a PR unless the user asked for it.
6. Invoke:
   ```
   copilot -C <repo> --model=<model> <model-flags> --prompt <prompt> \
     --allow-all-tools --no-ask-user --stream=off --silent
   ```
7. Review the diff and run tests/build yourself — its claim of success isn't proof **DO NOT DELEGATE THE REVIEW**.
8. If it fell short, send one focused follow-up to the same model. If that fails,
   fix it yourself.

Report what changed and what you verified.
