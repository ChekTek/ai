---
name: orchestrate-grok
description: "Delegate coding work to Grok 4.6 through the Copilot CLI. Use when you want a Grok worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Grok

Follow the `orchestrate` skill using the **grok** family. If that skill is not loaded, the procedure is: different family than you; `git status --short`; self-contained prompt (no commit/push/PR unless asked); review the diff yourself; one follow-up then fix it yourself.

```
copilot -C <repo> --model=<model> <model-flags> --prompt <prompt> \
  --allow-all-tools --no-ask-user --stream=off --silent
```

- complex: `grok-4.6 --effort high --mode autopilot --max-autopilot-continues 15`
- everyday: `grok-4.6 --effort medium --mode autopilot`
- light: `grok-4.6 --effort low`
