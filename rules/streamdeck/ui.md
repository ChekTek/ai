---
description: 'Use when working on Stream Deck property inspector UI (HTML/JS/CSS in the .sdPlugin/ui folder).'
paths:
  - "**/*.sdPlugin/ui/**"
---

# Stream Deck UI Instructions

- Use [SDPI Components](https://sdpi-components.dev/docs/components).
- Talk to the plugin with `const { streamDeckClient } = SDPIComponents;` — do not open a WebSocket.
- Attach listeners through the component's `focusElement`.
- `sdpi-item` elements need a `title` that describes the setting.
