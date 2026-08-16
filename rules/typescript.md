---
description: 'Use when working with TypeScript, JavaScript, TSX, JSX, frontend code, Node.js code, package scripts, and typed APIs.'
paths:
    - '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'
---

# TypeScript Instructions

- If a type can be inferred, do not write it. Do not use `any` or `unknown` unless necessary.
- Single-use types stay in that implementation file, at the bottom.
- `try/catch/finally` over `.catch()`. `async/await` over `.then()`.
- if/else with more than 3 conditions → `switch`. Ternary and brace-less `if` only when they fit on one line.
- Do not prefix calls with `void`.
- Prefer `const` and destructuring.
- Avoid inheritance unless it is a clear win.
- JSDoc exported public APIs.
