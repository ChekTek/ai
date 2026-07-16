---
name: orchestrate-copilot
description: "Orchestrate coding work through GitHub Copilot CLI models (Sol, Terra, Luna). Use when delegating implementation or code tasks to Copilot instead of doing all the work directly."
argument-hint: "[task or goal]"
---

# Orchestrate Copilot CLI

Delegate coding work to a Copilot CLI model, then review the result yourself
before accepting it. You are accountable for the outcome, not the model.

## Models

- **GPT-5.6 Sol** — complex tasks: hard bugs, multi-step implementation, anything needing real thinking.
- **GPT-5.6 Terra** — everyday code tasks that aren't trivial but aren't complex either.
- **GPT-5.6 Luna** — light, quick tasks: small lookups, one-line fixes, formatting.

## Workflow

1. Run `git status --short` first so you can spot unrelated changes later.
2. Pick the model that matches the task's difficulty (see above).
3. Give it a self-contained prompt: objective, relevant files/context, and what
   "done" looks like. Tell it not to commit, push, or open a PR unless the user
   asked for that.
4. Invoke it:
   ```
   copilot -C <repo> --model=<model-name> --prompt <prompt> \
     --allow-all-tools --no-ask-user --stream=off --silent
   ```
5. Review the actual diff and run relevant tests/build yourself. Don't accept
   the model's own claim of success as proof.
6. If the output is wrong, incomplete, or low quality, send one focused
   follow-up back to the same model describing exactly what's missing. If it
   still falls short after that, do the fix yourself.

Report what changed and what you verified.