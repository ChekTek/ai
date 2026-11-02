---
name: code-review
description: "Review code changes for bugs, simplification, readability, and code reduction."
argument-hint: "[PR, branch, commit, range, or path]"
disable-model-invocation: true
---

# Code Review

Review only; don't change code or Git state unless asked.

## Target

Use the first that applies:

1. The user-specified target.
2. Uncommitted changes, including untracked files.
3. `git diff <base>...HEAD`, where base is `main`, or `develop` if there is no `main` (local or remote).

Ask if unclear. Stop if there are no changes.

## Review

Read applicable repo instructions, the diff, and relevant surrounding code, callers, and tests. Look for:

- **Bugs:** realistic failures; give the trigger and impact.
- **Simplification:** less branching, state, duplication, or abstraction.
- **Human Readability:** clearer names, flow, and intent; not style preferences.
- **Reduction:** code or dependencies that can be safely removed.
- **Other:** security, performance, compatibility, tests, and docs.

Verify each finding against the code; no speculation or unrelated cleanup. Run focused checks when practical.

## Report

Return the entire report as copyable Markdown inside a single fenced `markdown` code block.