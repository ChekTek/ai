---
description: "Use when setting project-wide coding standards, AI assistant behavior, collaboration rules, and repository workflow expectations."
---

# General Instructions

- Be concise.

## Code

- Prefer simplicity and human readability over cleverness.
- Regex only when necessary; comment what it matches and why.
- Small duplication is fine if it is easier to understand.
- New dependencies only when necessary: well-maintained, widely used, permissive license.
- Don't write unit tests unless asked.
- Code is the source of truth. Update docs/comments that disagree with it.
- Docs: briefly explain what, never history.

## Git

- Never add AI attribution (e.g. "Generated with Claude Code") to commits, PRs, issues, or comments.
- Do not include JIRA information/links in commits, PRs, issues, or comments.

## GitHub issues

- Creating an issue: add `needs review`. If the label is missing, create it with description "An agent created this ticket and requires manual review" and color `#d93f0b`.
