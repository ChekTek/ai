---
name: orchestrate-claude
description: "Delegate coding work to Claude models (Opus 5, Sonnet 5) through the Copilot CLI. Use when you are a GPT model and want a cross-family worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Claude

Follow the `orchestrate` skill using the **claude** family. If that skill is not loaded, the procedure is: different family than you; `git status --short`; self-contained prompt (no commit/push/PR unless asked); review the diff yourself; one follow-up then fix it yourself.

```
copilot -C <repo> --model=<model> <model-flags> --prompt <prompt> \
  --allow-all-tools --no-ask-user --stream=off --silent
```

- complex: `claude-opus-5 --effort high --mode autopilot --max-autopilot-continues 15`
- everyday: `claude-sonnet-5 --effort medium --mode autopilot`
- light: `claude-sonnet-5 --effort low`
