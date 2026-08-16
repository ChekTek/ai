---
description: 'Use when working on Stream Deck plugin source, config, or manifest.'
paths:
    - '{plugin*,*plugin}/**'
    - '**/*.sdPlugin/manifest.json'
---

# Stream Deck Plugin Instructions

## Config

- Root ESLint uses `@elgato/eslint-config` with `config.strict`.
- `@elgato/prettier-config` is a dev dependency, set in `package.json`.
- Use pnpm, not npm. Use rolldown, not rollup.
- Copy native dependency files into `*.sdPlugin` so they ship in the package.

## Plugin

- Set `streamDeck.settings.useExperimentalMessageIdentifiers = true;` in `plugin.ts`.
- After rebuild, check the first 15 lines of `*.sdPlugin/logs` for critical errors.

## Errors

- Only action classes catch errors: log as `error` and `showAlert`. Services throw.

## Actions and state

- Exactly 2 visual states: declare them in `manifest.json` and use `setState`, not `setImage`.
- UUID changes: update `manifest.json` and every source reference.
- UUID or settings-structure changes: ask if the plugin is in production; migrate legacy settings if so.
- Logic used by one action: private methods on that action class.

## Settings

- `onDidReceiveSettings` / `onDidReceiveGlobalSettings` already contain stored settings. Do not call `setSettings` / `setGlobalSettings` there. The SDK caches settings; do not cache them yourself.
- Do not use `propertyInspectorDidAppear`; use request/response via `onSendToPlugin`.

## Services and shared state

- API/connection logic: `*-service.ts` exported as `export default new FooService();`. Import it; never pass it into an action.
- Shared state only if needed: `plugin-store.ts` exported as `export default new PluginStore();`. Import it; never pass it into an action.

## willAppear

If `willAppear` depends on an async value that may not be ready, use `withResolvers` from `@elgato/utils`:

```ts
private apiKeyResolvers = withResolvers<string | undefined>();

public get apiKey(): Promise<string | undefined> {
  return this.apiKeyResolvers.promise;
}

public setApiKey(apiKey?: string): void {
  this.apiKeyResolvers.resolve(apiKey);
}
```

## Icons

- Match existing SVG style, colors, and pieces. Key and action icons stay consistent. Action list icons are white.

## Native addons

- Prefer a Node NAPI addon (Rust, else C++) over a separate process.

## Libraries

- Event emitter: `@elgato/utils`
- Image manipulation: `@resvg/resvg-js`
