# AI Configuration

Shareable AI agent configuration — coding instructions and skills — for both
**Claude Code** and **GitHub Copilot**.

## Layout

| Purpose | Claude Code | GitHub Copilot |
| --- | --- | --- |
| Instructions | `.claude/rules/*.md` (`paths`) | `.github/instructions/*.instructions.md` (`applyTo`) |
| Skills | `.claude/skills/<name>/SKILL.md` | `.github/skills/<name>/SKILL.md` |

`.claude/` is the canonical, Claude-native source of truth. The `.github/`
equivalents are generated from it (see Syncing). Each tool natively discovers
its own folder, so no symlinks are required.

## Syncing

The two layouts are kept in sync manually with a skill. After editing either
side, invoke `/sync-ai` in your agent (Claude Code or Copilot) and it will
translate your changes into the other layout.

`sync-ai` is only useful in this source repo, so the copy commands below exclude
it — it stays here but never propagates to consumers.

## Add To Repository

```bash
# One-time setup: add the remote
git remote add config https://github.com/ChekTek/ai.git

# Pull the folders (run this anytime you want updates).
# The exclude keeps the repo-only sync-ai skill from being copied.
git fetch config main && git checkout config/main -- .claude .github ':!**/sync-ai/**'
```

After the first pull, you can just invoke `/update-ai` in your agent to fetch the
latest config instead of running the commands by hand.
