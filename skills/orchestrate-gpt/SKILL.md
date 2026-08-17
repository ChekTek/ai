---
name: orchestrate-gpt
description: "Delegate coding work to GPT models (Sol, Terra, Luna) through a Pi child on GitHub Copilot. Use when you are a Claude model and want a cross-family worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate GPT

Follow the `orchestrate` skill using the **gpt** family. If that skill is not loaded, the procedure is: different family than you; `git status --short`; self-contained prompt (no commit/push/PR unless asked); review the diff yourself; one follow-up then fix it yourself.

```
pi -p --no-session --no-extensions --no-skills --no-prompt-templates -a \
  --provider github-copilot --model <id> --thinking <level> \
  "Task: <prompt>"
```

- complex: `gpt-5.6-sol` `--thinking high`
- everyday: `gpt-5.6-terra` `--thinking medium`
- light: `gpt-5.6-luna` `--thinking low`
