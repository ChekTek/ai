---
name: refine-ticket-markdown
description: "Refine a ticket from any tracker (GitHub, Jira, …) by asking focused questions until the implementation plan is clear, then produce copy-able markdown to post as a comment — never modifying the ticket itself."
argument-hint: "[ticket URL, ID, or pasted ticket text]"
disable-model-invocation: true
---

# Refine a Ticket into a Copy-able Comment

Platform-agnostic sibling of refine-ticket: take a ticket from vague to
implementation-ready, but never touch the ticket — the result is a markdown
block the user copies and posts as a comment themselves.

## 1. Read the ticket

Use an authenticated tool for the ticket's platform — never a plain web fetch
of the URL, which fails on private trackers:

- GitHub: `gh issue view <number-or-url>` for title, body, and labels, plus
  `--comments` for the discussion thread.
- Jira or anything else: use a connected tracker tool if available; otherwise
  ask the user to paste the ticket title, description, and relevant comments.

Treat existing comments as prior discussion that may already answer questions.

## 2. Investigate before asking

Explore the code the ticket touches so questions are informed, not generic.
The code is the source of truth — verify the ticket's claims against actual
behavior and surface mismatches instead of assuming the ticket is right.

## 3. Ask questions until the plan is clear

Treat the conversation as the refinement work: ask one focused question at a
time, explain why it matters, and use a question tool with choices when
available. Recommend a strong default first when one exists.

Ask about what is actually unresolved — scope boundaries, user-facing
behavior, edge cases, data and API contracts, affected surfaces, migration —
not a generic checklist. Skip anything already answered by the ticket,
comments, or code. Stop when the remaining unknowns are implementation-time
discoveries rather than product decisions.

## 4. Produce the comment

Do not modify the ticket in any way — no edits, comments, or label changes.
Output the refined details as one copy-able block wrapped in a four-backtick
fence so inner code blocks survive copying:

- **Decisions** — choices resolved during refinement and why.
- **Scope** — what's included and explicit non-goals.
- **Implementation plan** — concrete steps with relevant files/classes.
- **Acceptance criteria** — observable and testable.
- **Open questions** — only genuine implementation-time discoveries.

Don't repeat what the ticket body already says — this is a comment adding
detail, not a rewrite. Keep the markdown portable: headings, bold, lists, and
fenced code only — no HTML or GitHub-specific references when the ticket
lives elsewhere. Iterate on the draft until the user is happy.
