---
name: orchestrate-fleet
description: "Split work across multiple isolated Pi children on GitHub Copilot, always in a different model family from the parent. Use only when the user invokes this skill; fan out to at least two children."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Fleet

Split the work across at least two parallel Pi children. Do not implement it
yourself. Children never spawn children; you synthesize and verify their work.

## Routing

Every child must use the family selected from the parent model. Never use the
parent's family.

- Claude parent → GPT children
- GPT parent → Claude children
- Grok parent → GPT children
- Any other parent family → GPT children

Use GitHub Copilot and the same model tiers as `orchestrate`: GPT
`gpt-5.6-sol|terra|luna`; Claude `claude-opus-5` or `claude-sonnet-5`.
Thinking levels are `high`, `medium`, and `low`; use the everyday model at
medium unless a task clearly needs another tier.

## Roles

Pass the role as `--append-system-prompt`. Scouts, reviewers, and oracles use
`read,grep,find,ls`; workers add `bash,write,edit`.

- scout: investigate and return compressed findings; do not edit
- worker: implement only its assigned slice
- reviewer: review one angle and report `file:line` findings; do not edit
- oracle: challenge the plan; do not edit

Default to parallel scouts, disjoint workers when implementation is needed,
then fresh reviewers. Use one fix worker if review finds problems.

## Steps

1. Run `git status --short` to record unrelated changes.
2. Split the task into at least two child assignments. Run at most four children
   concurrently and eight per wave.
3. Give each child a self-contained objective, relevant files, and completion
   criteria. Forbid commits, pushes, and PRs unless the user requested them.
4. Run each child:

   ```bash
   pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
     --provider github-copilot --model <id> --thinking <level> \
     --tools <role-tools> --append-system-prompt "<role line>" \
     "Task: <prompt>"
   ```

5. Review the combined diff and run the relevant tests or build yourself.
6. Use up to three follow-up waves. Report unresolved blockers instead of
   implementing them yourself.

Report what changed, what you verified, and any remaining blockers.
