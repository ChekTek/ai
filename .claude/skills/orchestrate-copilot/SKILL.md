---
name: orchestrate-copilot
description: "Orchestrate coding work through GitHub Copilot CLI models (Sol, Terra, Luna). Use when delegating implementation or code tasks to Copilot instead of doing all the work directly."
argument-hint: "[task or goal]"
---

# Orchestrate Copilot CLI

Delegate coding work to a Copilot CLI model, then review the result yourself
before accepting it. You are accountable for the outcome, not the model.

## Models

Each model has its own flag recipe — heavier tasks get more reasoning effort
and autopilot persistence (closer to how GitHub's cloud coding agent behaves),
lighter tasks stay fast and cheap.

- **GPT-5.6 Sol** — complex tasks: hard bugs, multi-step implementation, anything needing real thinking.
  `--effort high --mode autopilot --max-autopilot-continues 15`
- **GPT-5.6 Terra** — everyday code tasks that aren't trivial but aren't complex either.
  `--effort medium --mode autopilot`
- **GPT-5.6 Luna** — light, quick tasks: small lookups, one-line fixes, formatting.
  `--effort low`

Optional add-ons, any model:

- `--context long_context` — large repo or big diff won't fit default context.
- `--enable-all-github-mcp-tools` — task involves GitHub issues, PRs, or checks.
- `--allow-all-mcp-server-instructions` — task relies on other MCP servers.

## Workflow

1. Run `git status --short` first so you can spot unrelated changes later.
2. Determine if the task can be split into smaller sub-tasks. If so, do that and orchestrate each sub-task separately.
3. Pick the model that matches the task's difficulty (see above).
4. Give it a self-contained prompt: objective, relevant files/context, and what
   "done" looks like. Tell it not to commit, push, or open a PR unless the user
   asked for that.
5. Invoke it with the model's flags:
   ```
   copilot -C <repo> --model=<model-name> <model-flags> --prompt <prompt> \
     --allow-all-tools --no-ask-user --stream=off --silent
   ```
6. Review the actual diff and run relevant tests/build yourself. Don't accept
   the model's own claim of success as proof.
7. If the output is wrong, incomplete, or low quality, send one focused
   follow-up back to the same model describing exactly what's missing. If it
   still falls short after that, do the fix yourself.

Report what changed and what you verified.