---
name: orchestrate-kimi
description: "Delegate coding work to Kimi K3 through the Copilot CLI. Use when you want a Kimi worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Kimi

Delegate to a Kimi worker, then verify the result yourself. You own the outcome.

If you are a Kimi model, use `orchestrate-gpt`, `orchestrate-claude`, or
`orchestrate-grok` instead — always delegate across model families so the
worker's blind spots differ from yours.

## Models

- **kimi-k3** — complex: hard bugs, multi-step implementation.
  `--effort max --mode autopilot --max-autopilot-continues 15`
- **kimi-k3** — everyday tasks.
  `--effort high --mode autopilot`
- **kimi-k3** — light: lookups, one-line fixes, formatting.
  `--effort low`

Add-ons: `--context long_context` (large repo/diff), `--enable-all-github-mcp-tools`
(issues, PRs, checks), `--allow-all-mcp-server-instructions` (other MCP servers).

Kimi K3 supports `low`, `high`, and `max` effort (no `medium`). Use `max` for
hard multi-step work and `high` for ordinary implementation.

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
