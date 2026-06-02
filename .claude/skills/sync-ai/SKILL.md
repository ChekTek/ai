---
name: sync-ai
description: Sync this repo's agent config between the Claude (.claude) and GitHub Copilot (.github) layouts. Use when instructions or skills have been edited in one folder and need to be mirrored into the other.
---

# Sync AI Config

This repo keeps the same agent config in two layouts. Editing either side
requires regenerating the other. Figure out which side changed (ask the user if
unclear), then translate it into the other.

## Layout mapping

| | Claude (`.claude/`) | Copilot (`.github/`) |
| --- | --- | --- |
| Instructions | `rules/<name>.md` | `instructions/<name>.instructions.md` |
| Skills | `skills/<name>/SKILL.md` | `skills/<name>/SKILL.md` |

Subfolders (e.g. `streamdeck/`) are preserved on both sides.

## Instructions: frontmatter differs

Only the frontmatter changes; the markdown body is copied verbatim.

- `description` is identical on both sides.
- Claude uses a `paths` YAML list; Copilot uses a single `applyTo` glob string.

Claude rule:

```yaml
---
description: '...'
paths:
  - "**/*.{ts,tsx}"
---
```

Copilot instruction:

```yaml
---
description: '...'
applyTo: '**/*.{ts,tsx}'
---
```

Conversion rules:
- `applyTo` ↔ the single `paths` entry. Keep glob braces like `{ts,tsx}` intact.
- A rule with **no** `paths` ↔ `applyTo: '**'` (applies everywhere).
- If a Copilot file ever has multiple comma-separated `applyTo` globs, split them
  into multiple `paths` entries, and join multiple `paths` with commas going back.

## Skills: mirror verbatim

`SKILL.md` is the same format for both tools. Copy each skill folder byte-for-byte
between `.claude/skills/` and `.github/skills/`. (This `sync-ai` skill included.)

## Handle renames and deletions

After translating, make the destination match the source exactly: remove any
instruction/skill on the destination side that no longer has a counterpart in the
source. Don't leave orphans.

## Finish

Report what changed (added / updated / removed) on the destination side.
