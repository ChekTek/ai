# CLAUDE

Project configuration for Claude Code. This is the canonical, Claude-native
source of truth; the `.github` equivalents are generated from it.

## Instructions

Coding standards live in `.claude/rules/`. Claude Code loads them
automatically — rules without a `paths` field apply to every session, and
path-scoped rules load when you work with matching files.

## Skills

Reusable workflows live in `.claude/skills/<name>/SKILL.md` and load on demand
(for example, `/save`).

## Syncing to GitHub Copilot

`.github/instructions/` and `.github/skills/` mirror this folder for GitHub
Copilot. After editing either side, run the `/sync-ai` skill to regenerate the
other.
