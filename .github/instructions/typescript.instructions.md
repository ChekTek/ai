---
description: 'Use when working with TypeScript, JavaScript, TSX, JSX, frontend code, Node.js code, package scripts, and typed APIs.'
applyTo: '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'
---

# TypeScript Instructions

## Types

- Everything should have explicit types

## Connecting APIs

- When connecting to an API or service, create a dedicated service class `*-service.ts` that encapsulates all connection logic, API calls

## Error Handling

- Prefer using `try/catch/finally` for error handling over `.catch()`.

## Promises

- Use `async/await` syntax for working with promises instead of `.then()`

## Conditionals

- if/else statements exceeding 3 conditions should be refactored to use a switch statement
- conditionals can only be a ternary operator if they are simple and fit on one line
- if statements can only exclude {} if they fit on one line

## Preferred Libraries

- Event Emitter: [@elgato/utils](https://www.npmjs.com/package/@elgato/utils)
- Image Manipulation: [@resvg/resvg-js](https://www.npmjs.com/package/@resvg/resvg-js)
