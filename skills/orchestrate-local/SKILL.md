---
name: orchestrate-local
description: "Delegate coding work to the local qwen3.8:latest model through an isolated Pi child. Use when the user wants local orchestration and the parent is not a Qwen model."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Local

Delegate to exactly one isolated local worker using
`ollama/qwen3.8:latest`. Never substitute another model.

Do not run this skill from a Qwen parent because that would delegate to the same
model family. Use `orchestrate` instead.

## Steps

1. Run `git status --short` to record unrelated changes.
2. Give the worker a self-contained objective, relevant files, and completion
   criteria. Forbid commits, pushes, and PRs unless the user requested them.
3. Run:

   ```bash
   pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
     --provider ollama --model qwen3.8:latest --thinking high \
     "Task: <prompt>"
   ```

4. Code review the diff and run the relevant tests or build yourself.
5. If needed, give the same worker up to three focused follow-ups, then finish the work
   yourself.

Report what changed and what you verified.
