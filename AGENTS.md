# Repository Guide

This is the source repository for Zack's user-level AI assistant configuration.
It keeps shared rules, skills, and Pi extensions in one version-controlled
place, then publishes them into the native config locations used by Claude
Code, GitHub Copilot, Pi, and OpenAI Codex.

## Source of Truth

- `rules/` contains coding and collaboration instructions.
- `skills/` contains reusable agent skills. Each skill lives in its own
  directory with a `SKILL.md`.
- `pi/extensions/` contains Pi-specific extensions.
- `scripts/update-config.sh` and `scripts/update-config-win.ps1` validate and
  publish those sources on macOS/Linux and Windows.

Edit the canonical files in this repository, not generated files or links under
`~/.claude`, `~/.copilot`, `~/.pi`, or `~/.codex`.

## Targeting

Rules and skills publish to all supported tools by default. To limit a file,
set `metadata.targets` in its frontmatter to a comma-separated combination of
`claude`, `copilot`, `pi`, and `codex`. Pi extensions are always Pi-specific.

Keep the Unix and Windows update scripts behaviorally equivalent when changing
publishing behavior. The scripts are additive by default and must not overwrite
unmanaged user configuration. Treat `--clean`/`-Clean` changes carefully
because they can delete files from managed config directories.

## Working Here

1. Make changes in `rules/`, `skills/`, `pi/extensions/`, or both update scripts.
2. Preserve existing frontmatter and directory conventions.
3. Run the update script for the current platform to validate and publish the
   configuration.
4. Update `README.md` when destinations, targeting, setup, or runtime behavior
   changes.

See `README.md` for published paths, target metadata examples, clean-mode
behavior, and Pi extension details.
