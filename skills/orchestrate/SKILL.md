---
name: orchestrate
description: "Delegate coding work to one Pi child on GitHub Copilot in a different model family. Use when you want a cross-family worker; route Claude parents to GPT, GPT parents to Claude, and Grok parents to GPT."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate

Delegate to exactly one cross-family Pi worker, then verify its work yourself.
You own the outcome and do not delegate the final review.

## Routing

Choose the worker from the parent model's family. Never use the same family as
the parent.

- Claude parent → GPT worker
- GPT parent → Claude worker
- Grok parent → GPT worker
- Any other parent family → GPT worker

Use `--provider github-copilot`. Match the model and thinking level to the task:

- GPT: complex `gpt-5.6-sol` high; everyday `gpt-5.6-terra` medium; light
  `gpt-5.6-luna` low.
- Claude: complex `claude-opus-5` high; everyday `claude-sonnet-5` medium;
  light `claude-sonnet-5` low.

## Steps

1. Run `git status --short` to record unrelated changes.
2. Clarify the task if needed and give the worker a self-contained objective,
   relevant files, and completion criteria. Forbid commits, pushes, and PRs
   unless the user requested them.
3. Run:

   ```bash
   pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
     --provider github-copilot --model <id> --thinking <level> \
     "Task: <prompt>"
   ```

4. Code review the diff and run the relevant tests or build yourself. Test manually if you can.
5. If needed, give the same worker up to three focused follow-ups, then finish the work
   yourself.

Report what changed and what you verified.
