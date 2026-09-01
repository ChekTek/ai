---
name: review
description: "Review code changes for real correctness, design, convention, and efficiency problems, favoring recall while requiring a concrete failure or cost for every finding."
argument-hint: "[PR, branch, commit range, path, or other scope]"
disable-model-invocation: true
---

# Code Review

Review for **recall**: catching a real bug matters more than avoiding an occasional false positive, but every finding needs a concrete failure scenario or cost.

## 1. Scope

Use the first applicable scope:

1. A PR, branch, commit range, path, or other scope supplied by the user.
2. Uncommitted changes: `git diff HEAD` and every untracked file from `git status --short`.
3. The current branch against the repository's default branch: `git diff <default>...HEAD`.

Read the repository instructions that apply to changed paths.

## 2. Find candidates

Read every hunk and its enclosing function or component. Inspect independently from each angle:

- **Line by line:** Wrong conditions or boundaries, null handling, missing awaits, falsy-zero checks, copy-paste variables, swallowed errors, unsafe regexes, and platform or timing assumptions.
- **Removed behavior:** For each deletion or replacement, identify its invariant and where the new code restores it. Missing guards, validation, cleanup, and error paths are candidates.
- **Cross-file:** Check callers and callees for changed inputs, outputs, exceptions, ordering, or lifecycle assumptions.
- **Reuse:** Name any existing helper duplicated by new code and the resulting behavior or maintenance risk.
- **Simplification:** Find derivable state, copy-paste, unnecessary nesting, and dead code; name the simpler form and concrete cost.
- **Efficiency:** Find repeated work or I/O, unnecessarily sequential work, blocking hot paths, and closures retaining large scopes; name the cheaper alternative.
- **Altitude:** Check whether a special case belongs in shared infrastructure; state the failure or maintenance cost.
- **Conventions:** Flag only violations where you can quote the exact applicable repository rule and offending line. Never report personal style preferences.

Correctness outranks cleanup. Keep any candidate with a realistic failure or cost until verification; do not silently discard uncertain ones.

## 3. Verify

Deduplicate candidates and re-read the relevant diff, implementation, callers, tests, and configuration. Assign each one:

- **CONFIRMED:** The failure follows directly from the code.
- **PLAUSIBLE:** A reachable runtime state can cause it, though the diff does not prove it will occur.
- **REFUTED:** Code, types, constants, tests, or a guard show it cannot occur, or it has no observable effect.

Report CONFIRMED and PLAUSIBLE findings only. A PLAUSIBLE finding must name the reachable state, not merely speculate.

## 4. Report

Return one fenced Markdown block with at most 10 findings, most severe first. For cleanup findings, **Failure** states the concrete cost. If none survive, put only `No findings.` below the heading.

````markdown
## Code Review: <scope>

### 1. <short summary>
- **File:** `path/to/file.ext:123`
- **Verdict:** CONFIRMED | PLAUSIBLE
- **Category:** correctness | reuse | simplification | efficiency | altitude | conventions
- **Failure:** <concrete input/state → wrong result, crash, or cost>
- **Fix:** <one line, optional>

### 2. ...
````
