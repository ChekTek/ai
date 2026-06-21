# AI Configuration

Shareable AI agent configuration — coding instructions and skills — that works
in both **Claude Code** and the **GitHub Copilot VS Code Extension**.

VS Code Copilot discovers `.claude/rules` and `.claude/skills` natively, so the
same files drive both agents.

## Add To Repository

```bash
# One-time setup: add the remote
git remote add config https://github.com/ChekTek/ai.git

# Pull the config folder (run this anytime you want updates).
git fetch config main && git checkout config/main -- .claude
```

After the first pull, you can just invoke `/update-ai` in your agent to fetch the
latest config instead of running the commands by hand.

## User Setup

To use this config globally (for every project), symlink this repo's rules and
skills into your user-level `~/.claude` folder. Both Claude Code and the VS Code
Copilot extension discover these directories. The scripts below link each rule and
skill individually, so any config you already have is left in place. They have no
dependencies and resolve the repo path automatically, so you can run them from
anywhere and keep this clone wherever you want it to live permanently.

### macOS / Linux

```bash
./scripts/update-config.sh
```

### Windows (PowerShell)

Run from an elevated PowerShell (Administrator) or with Developer Mode enabled so
that creating symlinks is permitted:

```powershell
.\scripts\update-config-win.ps1
```

Re-run the script anytime (for example after `git pull`) to pick up new rules and
skills — existing links are refreshed and your own config is left untouched.
