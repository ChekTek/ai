---
description: 'Use when setting project-wide coding standards, AI assistant behavior, collaboration rules, and repository workflow expectations.'
---

# General Instructions

- Be concise.

## Code

- Follow existing style unless the user asks to refactor or rewrite.
- Prefer simplicity and readability over cleverness.
- Regex only when necessary; comment what it matches and why.
- Small duplication is fine if it is clearer.
- Nesting depth ≤ 3.
- New dependencies only when necessary: well-maintained, widely used, permissive license.
- Don't write unit tests unless asked.
- Code is the source of truth. Update docs/comments that disagree with it.

## GitHub issues

- Creating an issue: add `needs review`. If the label is missing, create it with description "An agent created this ticket and requires manual review" and color `#d93f0b`.
