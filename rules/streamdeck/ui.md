---
description: 'Use when working on Stream Deck property inspector UI (HTML/JS/CSS in the .sdPlugin/ui folder).'
paths:
  - "**/*.sdPlugin/ui/**"
---

# Stream Deck UI Instructions

- Use [SDPI Components](https://sdpi-components.dev/docs/components).
- Hide settings that depend on a parent until that parent is selected.
- Talk to the plugin with `const { streamDeckClient } = SDPIComponents;` — do not open a WebSocket.
- Attach listeners through each component's `focusElement`.
- `sdpi-item` elements need a `title` that describes the setting.
