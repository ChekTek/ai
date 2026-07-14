---
description: 'Use when setting project-wide coding standards, AI assistant behavior, collaboration rules, and repository workflow expectations.'
---

# General Instructions

- Use less words when describing something and reasoning. Be concise

## Code

- Follow existing code style and patterns in the project (unless words like "refactor" or "rewrite" are used then use your best judgment)
- Prefer simplicity, human readability, and maintainability over cleverness or terseness
- Only use a regex if necessary. If a regex is needed, comment explicitly what it matches and why
- Small amounts of duplication are acceptable if it improves readability and reduces complexity
- Do not exceed a nesting depth of 3 levels
- Avoid introducing new dependencies unless necessary. If a new dependency is added, it should be well-maintained, widely used, and have a permissive license

## Github Issues & Requirements (AKA "Tickets")

- When creating an issue on GitHub, the `needs review` label should always be added. If the label does not exist yet on the repository, create it with the description: "An agent created this ticket and requires manual review" and color `#d93f0b`
