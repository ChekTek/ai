---
name: to-tickets
description: "Turn an existing implementation plan into full vertical-slice, actionable GitHub issues, each independently shippable and reviewable."
argument-hint: "[path to plan file, or leave blank to use the most recent plan]"
disable-model-invocation: true
---

# Turn a Plan into GitHub Tickets

Convert an implementation plan into GitHub issues. Each ticket must be a
vertical slice — a complete, demonstrable piece of value that cuts through
every layer it touches (UI/action, service, settings) — not a
horizontal layer like "build the service class" on its own.

## 1. Find the plan

If a path is given, read it. Otherwise look for the most recently modified
plan-shaped file in the repo (e.g. `*-mvp-plan.md` from `/sd-plan-mvp`, `*-actions-plan.md`, or any
other `*-plan.md`), or use the plan already agreed in this conversation. Ask
the user if none is found or more than one is a plausible match.

## 2. Slice into vertical tickets

Group the plan's phases/actions into tickets that each deliver working,
demonstrable value on their own, preserving the plan's dependency order. Note
which tickets block others. Prefer fewer, meatier vertical slices over many
thin horizontal ones.

## 3. Ask any clarifying questions

If the plan is ambiguous or missing information needed to create a ticket, ask the user for clarification.

## 4. Draft each ticket

For each ticket, include:

- **Title** — short and action-oriented.
- **Context** — why this matters, pulled from the plan's summary/goals.
- **Scope** — what's included and explicit non-goals for this slice.
- **Implementation notes** — relevant files/classes, API operations, settings,
  and architecture rules from the plan.
- **Acceptance criteria** — observable and testable.
- **Dependencies** — other tickets that must land first.

Do not invent requirements the plan doesn't support; carry over the plan's
assumptions and open questions into the relevant ticket instead of resolving
them yourself.

## 5. Confirm before creating

Show the user the drafted tickets (title + one-line scope each) and confirm
the target repo (infer from the git remote if unambiguous). Creating issues
is visible to others, so get explicit approval before creating anything.

## 6. Create the issues

Use `gh issue create` for each approved ticket. Always add the `needs review`
label — create it first if it doesn't exist yet, with description "An agent
created this ticket and requires manual review" and color `#d93f0b`. Reference
blocking tickets in the body (e.g. "Depends on #12").

After creation, report the created issue URLs in dependency order.
