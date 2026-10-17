# Tauri Renderer Testing

Playwright tests the served frontend, not the compiled Tauri app. Do not run
`tauri dev`; start the frontend dev server only.

## Browser

- macOS/WKWebView behavior: `webkit`
- Linux/WebKitGTK behavior: `webkit`
- Windows/WebView2 behavior: `chrome`
- No stated platform: keep the `test-web` default, Chromium

These approximate the engine family. Native plugins, permissions, windows,
menus, deep links, and Rust behavior require native testing.

## Mock IPC

Use `@tauri-apps/api/mocks` rather than replacing `window.__TAURI_INTERNALS__`
manually:

```ts
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";

mockWindows("main");
mockIPC(
  (command, args) => {
    switch (command) {
      case "load_settings":
        return { theme: "dark" };
      case "save_settings":
        return undefined;
      default:
        throw new Error(`Unmocked Tauri command: ${command}`);
    }
  },
  { shouldMockEvents: true },
);
```

Load the mock bootstrap before importing application code so startup invokes
are intercepted. Enable it only for browser tests. Keep fixtures deterministic
and fail on unhandled commands. Mock plugin and sidecar calls explicitly.

HTTP `route` mocks do not intercept Tauri `invoke()` calls. State which Rust
commands were mocked and do not claim their implementations were tested.
