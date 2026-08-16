---
name: build-for-pi
description: Restore Pi harness documentation into context and follow it when building Pi extensions, themes, skills, TUI, SDK, or related Pi internals. Use only when the user invokes this skill.
disable-model-invocation: true
---

# Build for Pi

The personas extension strips Pi's built-in self-documentation from the system prompt. Invoking this skill restores that block, with absolute paths for this install, for the rest of the session.

Read Pi docs only when working on Pi itself, its SDK, extensions, themes, skills, or TUI.

- Main documentation: package `README.md`
- Additional docs: package `docs/`
- Examples: package `examples/` (extensions, custom tools, SDK)
- When reading Pi docs or examples, resolve `docs/...` under Additional docs and `examples/...` under Examples, not the current working directory
- When asked about: extensions (`docs/extensions.md`, `examples/extensions/`), themes (`docs/themes.md`), skills (`docs/skills.md`), prompt templates (`docs/prompt-templates.md`), TUI components (`docs/tui.md`), keybindings (`docs/keybindings.md`), SDK integrations (`docs/sdk.md`), custom providers (`docs/custom-provider.md`), adding models (`docs/models.md`), Pi packages (`docs/packages.md`), environment variables (`docs/environment-variables.md`)
- When working on Pi topics, read the docs and examples, and follow `.md` cross-references before implementing
- Always read Pi `.md` files completely and follow links to related docs (e.g., `tui.md` for TUI API details)
