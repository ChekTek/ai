---
name: test-streamdeck
description: "Run a Stream Deck plugin headlessly with the sdtest harness: screenshot keys, check SVG Tiny 1.2 compatibility, drive the property inspector, and verify onWillAppear resources are released in onWillDisappear."
compatibility: "Requires Node.js and the sdtest CLI from ~/Code/streamdeck-harness."
---

# Test Stream Deck

Use `sdtest` to exercise a plugin against a mock Stream Deck backend. It runs detached and
headless: no device, no install, and the user's own Stream Deck app is untouched.

## Setup

```bash
if ! command -v sdtest >/dev/null 2>&1; then
  (cd ~/Code/streamdeck-harness && pnpm install && pnpm build && pnpm browser && pnpm link --global)
fi
```

Build the plugin first if `CodePath` is missing — `sdtest` runs the shipped
`*.sdPlugin`, not the source.

## Session

Pick a short session name per plugin and pass it on every command. Sessions persist between
commands and self-terminate when idle.

```bash
sdtest -s=<session> start <path-to-plugin>
sdtest -s=<session> close
```

`start` reports the runtime, the emulated device, and every declared action. If it fails,
the error carries the launch command, process output, and the plugin's own log errors.

Reference an action by its UUID; use a context id only when several instances of the same
action are live. Add `--json` when parsing output.

## Check

1. `add <action-uuid> --settings '<json>'` places a key and sends `willAppear`.
2. `press <ref>`, `key-down`/`key-up`, `set-settings`, `set-global-settings` to drive it.
3. `key <ref>` shows what the plugin set: state, title, image source, settings.
4. `screenshot <ref>` renders the key and lints the SVG behind it.
5. `events`, `violations`, `logs`, `output` explain anything unexpected. `violations` is
   where the harness reports protocol misuse it detected — out-of-range `setState`, unknown
   commands, non-Tiny SVG in `setImage`, and commands sent after `willDisappear`.

For the property inspector: `pi-open <ref>`, then `pi-fields`, `pi-set <setting> <value>`,
`pi-click`, `pi-snapshot`, `pi-screenshot`, `pi-console`, `pi-close`. `pi-open` reports
`connected: false` when the page never called `connectElgatoStreamDeckSocket` — read
`pi-console` before assuming the harness is at fault.

For resource lifecycle:

```bash
sdtest -s=<session> check-lifecycle <action-uuid> --cycles 10
```

It cycles appear → interact → disappear and reports growth per cycle in memory and in
active handles, plus whether the plugin kept talking about a key after `willDisappear`.
Restart the session between checks — a leaking action keeps emitting and pollutes the next
measurement.

For artwork alone, no session needed:

```bash
sdtest lint-svg <path-to-plugin-or-svg>
```

Prefer a scenario file when the check is repeatable — one call, one report, non-zero exit
on failure:

```bash
sdtest run <scenario.yaml>
```

## Limits to state, not hide

- Screenshots come from Chromium, which renders far more than Stream Deck's Qt renderer. A
  key can look right and still be blank on hardware. `lint-svg` is the compatibility truth;
  the screenshot is only the intent.
- Title composition is an approximation, and the property inspector panel width is a guess.
- Native plugins have no debugger, so their lifecycle check is RSS plus the
  after-disappear check — coarser, and the report says so.
- Dials, encoders, multi-actions, and profile switching are not emulated.
- Only the protocol is mocked. The plugin runs for real, so pressing a key hits live APIs,
  spawns processes, and opens URLs. SDK commands like `openUrl` are recorded and left
  inert, but a plugin that opens a URL itself is not intercepted. Use test credentials,
  and warn the user before pressing keys whose handlers have external side effects.

## Report

State the plugin and runtime, which actions were exercised and how, key screenshots and
property-inspector screenshots by path, SVG Tiny 1.2 errors with file and line, the
lifecycle verdict with the numbers behind it, any violations or plugin log errors, and the
fidelity limits that apply to what was tested.
