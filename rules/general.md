---
description: "Use when setting project-wide coding standards, AI assistant behavior, collaboration rules, and repository workflow expectations."
---

# General Instructions

- Be concise.

## Code

- Regex only when absolutely necessary; comment what it matches and why.
- New dependencies only when necessary: well-maintained, widely used, permissive license.
- Before adding/upgrading dependencies, check sources, install scripts, and vulnerabilities (including transitives).
- Don't write unit tests unless asked.
- Do not write inline comments unless asked.
- Code is the source of truth. Update docs/comments that disagree with it.
- Docs: briefly explain what, never history.

## Git - Commits, Pull Requests, Issues, Comments

- Use the `tldr` skill
- Never add AI attribution (e.g. "Generated with Claude Code")
- Do not include JIRA references/links

## GitHub issues

- Creating an issue: add `needs review`. If the label is missing, create it with description "An agent created this ticket and requires manual review" and color `#d93f0b`.
