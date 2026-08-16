---
name: orchestrate-kimi
description: "Delegate coding work to Kimi K3 through the Copilot CLI. Use when you want a Kimi worker instead of doing the work yourself."
argument-hint: "[task or goal]"
disable-model-invocation: true
---

# Orchestrate Kimi

Follow the `orchestrate` skill using the **kimi** family. If that skill is not loaded, the procedure is: different family than you; `git status --short`; self-contained prompt (no commit/push/PR unless asked); review the diff yourself; one follow-up then fix it yourself.

```
copilot -C <repo> --model=<model> <model-flags> --prompt <prompt> \
  --allow-all-tools --no-ask-user --stream=off --silent
```

Kimi has no `medium`.

- complex: `kimi-k3 --effort max --mode autopilot --max-autopilot-continues 15`
- everyday: `kimi-k3 --effort high --mode autopilot`
- light: `kimi-k3 --effort low`
