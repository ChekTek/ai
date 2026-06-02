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
