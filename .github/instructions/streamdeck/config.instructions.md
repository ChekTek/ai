---
description: "Use when editing project-level config (package.json, tsconfig.json, rollup/vite config, etc.) for a Stream Deck plugin project."
applyTo: "{plugin*,*plugin}/*"
---

# Stream Deck Config Instructions

- If a native dependencies is added to the project, update the configuration so the files are copied to the `*.sdPlugin` folder so it is distributed in the plugin package
- There should be an `eslint` config at the root using the `@elgato/eslint-config` package, with `config.strict`.
- `@elgato/prettier-config` should be a dev dependency and set in the `package.json`
- The project should use pnpm instead of npm
- The project should use rolldown instead of rollup.
