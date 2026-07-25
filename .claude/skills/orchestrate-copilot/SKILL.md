---
name: orchestrate-copilot
description: "Orchestrate coding work through GitHub Copilot CLI models, delegating to the opposite model family (Claude orchestrator -> GPT workers, GPT orchestrator -> Claude workers). Use when delegating implementation or code tasks to Copilot instead of doing all the work directly."
argument-hint: "[task or goal]"
---

# Orchestrate Copilot CLI

Delegate coding work to a Copilot CLI model, then review the result yourself
before accepting it. You are accountable for the outcome, not the model.

Always delegate **across model families**. A worker from a different family has
different training biases and blind spots than you do, so its output is a real
second opinion rather than an echo of your own reasoning.

## Step 0: Pick the worker family

Identify your own model first, then choose the opposite family:

| You are | Delegate to | Models |
| --- | --- | --- |
| A Claude model (Sonnet, Opus, Haiku) | GPT family | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` |
| A GPT model (Sol, Terra, Luna, GPT-5.x) | Claude family | `claude-opus-5`, `claude-sonnet-5` |
| Anything else, or unsure | GPT family | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna` |

Never delegate to your own family — if you are Opus 5, don't dispatch Opus 5 or
Sonnet 5; if you are Sol, don't dispatch Terra or Luna.

## Models and flags

Each tier has its own flag recipe — heavier tasks get more reasoning effort and
autopilot persistence (closer to how GitHub's cloud coding agent behaves),
lighter tasks stay fast and cheap.

### GPT workers (use when you are Claude)

- **gpt-5.6-sol** — complex tasks: hard bugs, multi-step implementation, anything needing real thinking.
  `--effort high --mode autopilot --max-autopilot-continues 15`
- **gpt-5.6-terra** — everyday code tasks that aren't trivial but aren't complex either.
  `--effort medium --mode autopilot`
- **gpt-5.6-luna** — light, quick tasks: small lookups, one-line fixes, formatting.
  `--effort low`

### Claude workers (use when you are GPT)

- **claude-opus-5** — complex tasks: hard bugs, multi-step implementation, anything needing real thinking.
  `--effort high --mode autopilot --max-autopilot-continues 15`
- **claude-sonnet-5** — everyday code tasks that aren't trivial but aren't complex either.
  `--effort medium --mode autopilot`
- **claude-sonnet-5** — light, quick tasks: small lookups, one-line fixes, formatting.
  `--effort low`

Optional add-ons, any model:

- `--context long_context` — large repo or big diff won't fit default context.
- `--enable-all-github-mcp-tools` — task involves GitHub issues, PRs, or checks.
- `--allow-all-mcp-server-instructions` — task relies on other MCP servers.

## Workflow

1. Run `git status --short` first so you can spot unrelated changes later.
2. Determine your own model family and pick the worker family (Step 0).
3. Determine if the task can be split into smaller sub-tasks. If so, do that and orchestrate each sub-task separately.
4. Pick the tier within that family that matches the task's difficulty (see above).
5. Give it a self-contained prompt: objective, relevant files/context, and what
   "done" looks like. Tell it not to commit, push, or open a PR unless the user
   asked for that.
6. Invoke it with the model's flags:
   ```
   copilot -C <repo> --model=<model-name> <model-flags> --prompt <prompt> \
     --allow-all-tools --no-ask-user --stream=off --silent
   ```
7. Review the actual diff and run relevant tests/build yourself. Don't accept
   the model's own claim of success as proof.
8. If the output is wrong, incomplete, or low quality, send one focused
   follow-up back to the same model describing exactly what's missing. If it
   still falls short after that, do the fix yourself.

Report which model family you delegated to, what changed, and what you verified.
