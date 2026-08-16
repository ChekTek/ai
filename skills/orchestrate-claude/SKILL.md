---
name: orchestrate-claude
description: "Delegate coding work to Claude models (Opus 5, Sonnet 5) through a Pi child on GitHub Copilot. Use when you are a GPT model and want a cross-family worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Claude

Follow the `orchestrate` skill using the **claude** family. If that skill is not loaded, the procedure is: different family than you; `git status --short`; self-contained prompt (no commit/push/PR unless asked); review the diff yourself; one follow-up then fix it yourself.

```
pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
  --provider github-copilot --model <id> --thinking <level> \
  "Task: <prompt>"
```

- complex: `claude-opus-5` `--thinking high`
- everyday: `claude-sonnet-5` `--thinking medium`
- light: `claude-sonnet-5` `--thinking low`
