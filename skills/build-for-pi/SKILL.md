---
name: build-for-pi
description: Restore Pi harness documentation into context and follow it when building Pi extensions, themes, skills, TUI, SDK, or related Pi internals. Use only when the user invokes this skill.
disable-model-invocation: true
---

# Build for Pi

The personas extension strips Pi's built-in self-documentation. Invoking this skill restores that block in the system prompt for the rest of the session. Custom `--system-prompt` / `SYSTEM.md` prompts without Pi's default identity are unchanged.

Follow the restored "Pi documentation" section. Read those files (docs and examples paths listed there, not the current working directory) before changing Pi internals, the SDK, extensions, themes, skills, or TUI.
