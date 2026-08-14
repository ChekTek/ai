---
name: test-tauri-native
description: "Run native Tauri end-to-end tests with WebdriverIO and the real platform webview. Use only when the user explicitly requests native Tauri testing."
compatibility: "Requires Tauri v2 and an isolated desktop GUI runner or Linux virtual display."
disable-model-invocation: true
---

# Test Native Tauri

Run only when invoked by the user. Use WebdriverIO with the compiled app:

- macOS: WKWebView
- Linux: WebKitGTK
- Windows: WebView2

Do not replace native coverage with Playwright.

## Protect the user's desktop

Run on configured CI, a VM, another machine, a separate GUI session, or Linux
Xvfb. If none is available, prepare the tests and explain the blocker; do not
launch the app on the user's desktop. Hiding, minimizing, or moving the window
off-screen is not reliable headless execution.

## Steps

1. Run `git status --short` and inspect existing Tauri, WebdriverIO, Cargo, CI,
   and runner configuration.
2. Reuse project scripts and dependencies.
   ```bash
   pnpm exec wdio run wdio.conf.ts
   ```
3. Prefer `@wdio/tauri-service` with `browserName: "tauri"` and the embedded
   provider. It requires `tauri-plugin-wdio-webdriver`; add test plugins and
   permissions only to test/debug builds. If the project deliberately uses the
   external Linux provider, use its installed WebKitWebDriver.
4. On Linux, run under the project's virtual display setup or:
   ```bash
   xvfb-run -a pnpm exec wdio run wdio.conf.ts
   ```
5. Point `appBinaryPath` at the actual test build. Keep one app instance unless
   the runner supports more.
6. Use real Rust commands when testing integration. Use
   `browser.tauri.mock()` only for intentional isolation and list every mock.
7. Run the narrowest requested suite. Collect assertion output,
   frontend/backend logs, and failure screenshots.

Report the runner, OS, webview, tested flows, real versus mocked Rust behavior,
failures, artifacts, and changed files.
