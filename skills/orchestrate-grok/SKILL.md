---
name: orchestrate-grok
description: "Delegate coding work to Grok 4.6 through a Pi child on GitHub Copilot. Use when you want a Grok worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Grok

Follow the `orchestrate` skill using the **grok** family. If that skill is not loaded, the procedure is: different family than you; `git status --short`; self-contained prompt (no commit/push/PR unless asked); review the diff yourself; one follow-up then fix it yourself.

```
pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
  --provider github-copilot --model <id> --thinking <level> \
  "Task: <prompt>"
```

- complex: `grok-4.6` `--thinking high`
- everyday: `grok-4.6` `--thinking medium`
- light: `grok-4.6` `--thinking low`
