---
name: test-web
description: "Test a website, web app, or web-based desktop renderer with Playwright CLI. Use for background browser interaction, UI verification, screenshots, console inspection, and network debugging."
compatibility: "Requires Node.js and the installed playwright-cli command."
---

# Test Web

Use `playwright-cli` to test the requested UI in a headless background browser.

## Setup

```bash
if ! command -v playwright-cli >/dev/null 2>&1; then
  npm install --global @playwright/cli@latest --ignore-scripts --no-audit --no-fund
fi
```

Choose the browser from, in order:

1. The user's request.
2. Project tests, documentation, configuration, or target platform.
3. Chromium by default.

Use `webkit` for an explicit WebKit, Safari, WKWebView, or WebKitGTK target.
Use `chrome` for Chromium/WebView2. Install the selected browser if needed:

```bash
playwright-cli install-browser <webkit|chromium>
```

## Inspect

1. Run `git status --short` and preserve unrelated changes.
2. Find the existing dev/test command, URL, browser configuration, and ignored
   artifact directory. Do not assume a framework or port.
3. If this is a Tauri project, read
   [references/tauri.md](references/tauri.md) before testing.
4. Reuse an existing server. Otherwise start only the web dev server with the
   project's existing background runner or detached `tmux`; clean up only what
   this run starts.

## Test

Use a short project-specific session name on every command:

```bash
playwright-cli -s=<session> open <url> --browser=<chrome|webkit>
playwright-cli -s=<session> snapshot --depth=6
```

Do not pass `--headed` or open `playwright-cli show`. Prefer snapshot refs,
roles, and test IDs over CSS selectors or coordinates.

For each flow:

1. Find the relevant elements with `snapshot` or `find`.
2. Perform the smallest interaction sequence.
3. Verify visible text, values, and state.
4. Check failures:
   ```bash
   playwright-cli -s=<session> console error
   playwright-cli -s=<session> requests
   ```
5. Capture a screenshot when layout matters or as failure evidence.

Use `route` for HTTP mocks. Close the browser and any server started by this
run when finished:

```bash
playwright-cli -s=<session> close
```

Report the browser, URL, tested flows, failures, artifacts, and any limits of
the browser approximation.
