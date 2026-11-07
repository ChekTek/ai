# Repository Guide

This repository is the source of truth for shared assistant configuration.
Edit `rules/`, `skills/`, `claude/`, `pi/`, and `scripts/`, not published
files under `~/.claude`, `~/.copilot`, `~/.pi`, or `~/.codex`.

## Requirements

- Keep the Unix and Windows publishing scripts behaviorally equivalent.
- Publishing must remain additive and preserve unmanaged configuration.
- `claude/settings.json` is merged into `~/.claude/settings.json` by top-level
  key. Managed keys replace, unmanaged keys stay.
- Never overwrite an unmanaged Codex `AGENTS.md`.
- Clean mode may remove unrelated files from managed directories. Preserve
  Codex's `skills/.system` and remove generated `AGENTS.md` files only when the
  repository ownership marker is present.
- Validate sources before publishing anything.
- Preserve existing frontmatter conventions. `metadata.targets`, when present,
  must contain unique values from `claude`, `copilot`, `pi`, and `codex`.
- Pi packages, themes, and keybindings are Pi-only. Keep package extension
  entry points compatible with Pi and `pi-acp` without duplicate registration.
- Claude settings are deep-merged into `~/.claude/settings.json`, never linked
  or replaced, because Claude Code writes its own keys there. Clean mode leaves
  that file alone.

## Workflow

1. Change the canonical source files.
2. Update both platform scripts when publishing behavior changes.
3. Run the update script for the current platform to validate and publish.
4. Keep the root README brief; put implementation details beside the relevant
   code.
