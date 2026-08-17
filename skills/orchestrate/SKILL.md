---
name: orchestrate
description: "Delegate coding work to another model family (GPT, Claude, or Grok) through a Pi child on GitHub Copilot. Use when you want a cross-family worker instead of doing the work yourself."
argument-hint: "[gpt|claude|grok] [task or goal]"
disable-model-invocation: true
---

# Orchestrate

Delegate to a Pi worker on GitHub Copilot in a **different** model family, then verify the result yourself. You own the outcome. Do not delegate the review.

If no family is given, pick one you are not.

## Models

`--provider github-copilot`. `--thinking` is `high` / `medium` / `low`.

- **gpt** — complex: `gpt-5.6-sol` `--thinking high`. Everyday: `gpt-5.6-terra` `--thinking medium`. Light: `gpt-5.6-luna` `--thinking low`.
- **claude** — complex: `claude-opus-5` `--thinking high`. Everyday: `claude-sonnet-5` `--thinking medium`. Light: `claude-sonnet-5` `--thinking low`.
- **grok** — `grok-4.6` at `--thinking high` (complex), `medium` (everyday), or `low` (light).

## Steps

1. `git status --short` so unrelated changes are visible later.
2. Ask the user clarifying questions. Split into sub-tasks and orchestrate each separately.
3. Pick model/thinking from the list above.
4. Prompt: objective, relevant files, what "done" means. Do not commit, push, or open a PR unless the user asked.
5. Run:
   ```
   pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
     --provider github-copilot --model <id> --thinking <level> \
     "Task: <prompt>"
   ```
6. Review the diff and run tests/build yourself.
7. If it fell short: one focused follow-up to the same model. If that fails, fix it yourself.

Report what changed and what you verified.
