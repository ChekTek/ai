---
name: orchestrate-fleet
description: "Split work across multiple isolated Pi children on GitHub Copilot. Use only when the user invokes this skill; always fan out to at least two children instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Fleet

You are the parent. Split the work into **at least two** parallel `pi` children. Do not implement the task yourself. Children never spawn children. You synthesize and verify.

If no family is given, pick one you are not. Default everyday: `gpt-5.6-terra` `--thinking medium`.

## Roles

Append as `--append-system-prompt`. Tools: scout/reviewer/oracle `read,grep,find,ls,bash`; worker adds `write,edit`.

- **scout** — recon; compressed findings another agent can use; no edits
- **worker** — implement only the assigned slice
- **reviewer** — read-only review of one angle; `file:line` findings
- **oracle** — challenge the plan; no edits

Default loop: scouts in parallel → workers if implementing → fresh reviewers in parallel (correctness, tests, simplicity) → one fix worker if needed. Parallel workers only on disjoint files.

## Models

`--provider github-copilot`. Same IDs as `orchestrate`: gpt `gpt-5.6-sol|terra|luna`; claude `claude-opus-5` / `claude-sonnet-5`; grok `grok-4.6`. Thinking `high` / `medium` / `low`.

## Steps

1. `git status --short` so unrelated changes are visible later.
2. Split into ≥2 child tasks. Cap 8 per wave, 4 concurrent (parallel bash calls).
3. Prompt each child: objective, relevant files, what "done" means. Do not commit, push, or open a PR unless the user asked.
4. Run each child:
   ```
   pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
     --provider github-copilot --model <id> --thinking <level> \
     --tools <role-tools> --append-system-prompt "<role line>" \
     "Task: <prompt>"
   ```
5. Review the combined diff and run tests/build yourself.
6. If it fell short: one follow-up wave, then finish it yourself.

Report what changed and what you verified.
