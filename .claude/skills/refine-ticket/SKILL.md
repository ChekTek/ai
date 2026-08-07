---
name: refine-ticket
description: "Refine a GitHub issue by asking focused questions until the implementation plan is clear, then update the issue with the full details once approved, keeping the needs review label."
argument-hint: "[issue number or URL]"
disable-model-invocation: true
---

# Refine a GitHub Ticket

Take a GitHub issue from vague to implementation-ready. Ask questions until
another developer could implement it without making product decisions, then —
with the user's approval — write the details back to the issue.

## 1. Fetch the issue

Always fetch with the GitHub CLI — never a web fetch of the issue URL, which
fails on private repos:

```sh
gh issue view <number-or-url>            # title, body, labels
gh issue view <number-or-url> --comments # discussion thread
```

Both accept a bare number (current repo's remote) or a full issue URL. Ask if
no argument is given or the repo is ambiguous. Treat comments as prior
discussion that may already answer questions.

## 2. Investigate before asking

Explore the code the issue touches so questions are informed, not generic.
The code is the source of truth — verify the issue's claims against actual
behavior and surface mismatches instead of assuming the issue is right.

## 3. Ask questions until the plan is clear

Treat the conversation as the refinement work: ask one focused question at a
time, explain why it matters, and use a question tool with choices when
available. Recommend a strong default first when one exists.

Ask about what is actually unresolved — scope boundaries, user-facing
behavior, edge cases, data and API contracts, affected surfaces, migration —
not a generic checklist. Skip anything already answered by the issue,
comments, or code. Stop when the remaining unknowns are implementation-time
discoveries rather than product decisions.

## 4. Draft the updated ticket and get approval

Present the proposed issue body for review:

- **Context** — the problem and why it matters, preserving still-relevant
  original content.
- **Scope** — what's included and explicit non-goals.
- **Implementation plan** — concrete steps with relevant files/classes and
  the decisions made during refinement.
- **Acceptance criteria** — observable and testable.
- **Open questions** — only genuine implementation-time discoveries.

Propose a clearer title too if the original no longer fits. Iterate until the
user is happy — editing the issue is visible to others, so get explicit
approval before writing anything.

## 5. Update the issue

Write the approved body to a temp file and apply it with
`gh issue edit <ref> --body-file <file>` (add `--title` if it changed).

Then fix the labels: remove `needs refinement` if present, and make sure
`needs review` is still on the issue — if it's missing add it, creating the
label first if it doesn't exist, with description "An agent created this
ticket and requires manual review" and color `#d93f0b`. Both in one call:

```sh
gh issue edit <ref> --remove-label "needs refinement" --add-label "needs review"
```

Report the issue URL and a one-line summary of what changed.
