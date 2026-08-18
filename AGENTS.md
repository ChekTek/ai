# Repository Guide

This repository is the source of truth for shared assistant configuration.
Edit `rules/`, `skills/`, `pi/`, and `scripts/`, not published files under
`~/.claude`, `~/.copilot`, `~/.pi`, or `~/.codex`.

## Requirements

- Keep the Unix and Windows publishing scripts behaviorally equivalent.
- Publishing must remain additive and preserve unmanaged configuration.
- Never overwrite an unmanaged Codex `AGENTS.md`.
- Clean mode may remove unrelated files from managed directories. Preserve
  Codex's `skills/.system` and remove generated `AGENTS.md` files only when the
  repository ownership marker is present.
- Validate sources before publishing anything.
- Preserve existing frontmatter conventions. `metadata.targets`, when present,
  must contain unique values from `claude`, `copilot`, `pi`, and `codex`.
- Pi extensions, themes, and keybindings are Pi-only. Keep extension entry
  points compatible with Pi and `pi-acp` without duplicate registration.

## Workflow

1. Change the canonical source files.
2. Update both platform scripts when publishing behavior changes.
3. Run the update script for the current platform to validate and publish.
4. Keep the root README brief; put implementation details beside the relevant
   code.
