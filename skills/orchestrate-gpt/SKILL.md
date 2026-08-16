---
name: orchestrate-gpt
description: "Delegate coding work to GPT models (Sol, Terra, Luna) through the Copilot CLI. Use when you are a Claude model and want a cross-family worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate GPT

Follow the `orchestrate` skill using the **gpt** family. If that skill is not loaded, the procedure is: different family than you; `git status --short`; self-contained prompt (no commit/push/PR unless asked); review the diff yourself; one follow-up then fix it yourself.

```
copilot -C <repo> --model=<model> <model-flags> --prompt <prompt> \
  --allow-all-tools --no-ask-user --stream=off --silent
```

- complex: `gpt-5.6-sol --effort high --mode autopilot --max-autopilot-continues 15`
- everyday: `gpt-5.6-terra --effort medium --mode autopilot`
- light: `gpt-5.6-luna --effort low`
