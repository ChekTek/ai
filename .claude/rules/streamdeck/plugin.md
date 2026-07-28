---
description: 'Use when working on Stream Deck plugin source code (TypeScript actions, plugin runtime, SDK integration).'
paths:
    - '{plugin*,*plugin}/src/**'
---

# Stream Deck Plugin Instructions

Rules for the plugin source code

## Plugin

- Always set `streamDeck.settings.useExperimentalMessageIdentifiers = true;` in the `plugin.ts`

## Error Handling

- Only action classes should handle errors so that we can use `showAlert` providing the user with feedback. Any caught error should be logged as `error`
- Connecting services can throw errors to be handled by the action classes

## Check Logs

- After re-building the plugin, check the first 15 lines of the log file in the `*.sdPlugin/logs` to ensure there wasn't a critical error.

## Action States

- If an action has exactly 2 states, use update the `manifest.json` to reflect this and call `setState` instead of relying on `setImage`.

## `onDidReceiveSettings` and `onDidReceiveGlobalSettings`

- Settings are already stored in these events, so there is no need to call `setSettings` or `setGlobalSettings` within these events.

## Is the plugin deployed?

- When modifying the UUID of an action/plugin or the structure of the settings, ask the user if the plugin is deployed to production. If so, we need to handle the transition from legacy settings to the new settings structure.

## Shared State

- If a plugin needs shared state, create a `plugin-store.ts` file and use a PluginStore singleton class exported like so `export default new PluginStore();`

## APIs and Third Party Services

- If a plugin needs to connect to an API or third party service, create a `*-service.ts` file and export a singleton class. For example `export default new FooService();`

## Actions

- For functions that are only used in 1 action prefer private methods on the action class over standalone functions

## `willAppear`

- Sometimes the `willAppear` event is called before the plugin is fully initialized. If an action's `willAppear` event depends on something from the `pluginStore`, service, or global settings, set up a promise to be resolved when the dependency is ready. Use `WithResolvers` from `@elgato/utils`. For example:

```ts
// in plugin-store.ts
private apiKeyResolvers = withResolvers<string | undefined>();

public get apiKey(): Promise<string | undefined> {
  return this.apiKeyResolvers.promise;
}

public setApiKey(apiKey?: string): void {
  this.apiKeyResolvers.resolve(apiKey);
}

// in *.service.ts
public async getPlayerStatus(): Promise<PlayerStatus> {
	const apiKey = await pluginStore.apiKey;
...
```

## Icon Style

- If the repo already has icons, use the existing style for new icons. Typically `svg`, reuse portions and colors from existing icons where it makes sense. Key icons and action icons should maintain a consistent style across the plugin. Action list icons should be white.

## Native Code Required

- If native code is required for functionality it should be a node.js addon (NAPI), so that we don't create a separate process from the plugin unless absolutely necessary. If possible prefer rust otherwise c++.

## Settings

- `setSettings` does not need to be called inside of `onDidReceiveSettings` because the settings are already persisted, so this code is redundant.
- there is no need to cache settings because the sdk does this automatically
- do not use `propertyInspectorDidAppear`, instead use a request and response via `onSendToPlugin`
