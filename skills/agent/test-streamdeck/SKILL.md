---
name: test-streamdeck
description: "Test/Run a Stream Deck plugin headlessly"
compatibility: "Requires Node.js 24 or later and the sdtest CLI from the @chektek/streamdeck-harness npm package."
---

# Test Stream Deck

`sdtest` runs a plugin with a mock Stream Deck.

## Setup

If `sdtest` is not available, install the latest published package. Stop and tell the user if
the install fails.

```bash
if ! command -v sdtest >/dev/null 2>&1; then
  npm install -g @chektek/streamdeck-harness@latest && sdtest install-browser
fi
```

- `sdtest` runs the built `*.sdPlugin`. Build the plugin.
- If the Stream Deck app runs the plugin from the same `*.sdPlugin` folder, do not replace
  its binary. Copy the folder without `logs` to a temporary directory, put the new build in
  the copy, and test the copy.

## Session

Use one short session name for each plugin. Give it with each command.

```bash
sdtest -s=<session> start <path-to-plugin>
sdtest -s=<session> close
```

- Refer to an action by its UUID. Use a context id only when the action has more than one
  instance.
- Add `--json` to parse the output.

## Secrets

Do not put a secret on the command line. Do not print a secret.

```bash
sdtest -s=<session> start <path-to-plugin> --dotenv <path-to-.env> --global-settings @<secrets.json>
```

- `--dotenv` gives the variables of a `.env` file to the plugin. `sdtest` hides the values of
  that file in its output. A value shows as the name of its variable.
- `--global-settings @<file>` reads secret settings from a JSON file. Give `--dotenv` also when
  the same secret is in the `.env` file, so that `sdtest` hides it in settings, events and logs.
- A secret that is not in the `.env` file is not hidden. Mask it before you print output.

## Check

- Put a key on the device: `add <action-uuid> --settings '<json>'`
- Operate the key: `press <ref>`, `key-down`, `key-up`, `set-settings`, `set-global-settings`
- See what the plugin set: `key <ref>`
- Draw the key and lint its SVG: `screenshot <ref>`
- Find the cause of a problem: `events`, `violations`, `logs`, `output`
- Test the property inspector: `pi-open <ref>`, then `pi-fields`, `pi-set <setting> <value>`,
  `pi-click`, `pi-snapshot`, `pi-screenshot`, `pi-console`, `pi-close`. If `pi-open` shows
  `connected: false`, read `pi-console` first.
- Find resource leaks: `check-lifecycle <action-uuid> --cycles 10`. Start a new session for
  each check.
- Lint SVG files without a session: `sdtest lint-svg <path-to-plugin-or-svg>`
- Run a check that you will repeat: `sdtest run <scenario.yaml>`. The exit code is not zero
  when a step fails.

## Install

Do this when the test is complete and you tested a copy. It changes the Stream Deck app of
the user.

```bash
streamdeck stop <plugin-uuid>
cp <new-build> <installed-plugin>/bin/
streamdeck restart <plugin-uuid>
```

- Read the last lines of `*.sdPlugin/logs`. Tell the user the errors.

## Limits

Tell the user the limits that apply to the test.

- Chromium draws the screenshots. It draws more SVG than Stream Deck. A key can look correct
  and be blank on a device. Trust `lint-svg`, not the screenshot.
- The title text and the property inspector width are estimates.
- For a native plugin, the lifecycle check uses only RSS and the commands that the plugin
  sends after `willDisappear`.
- Dials, multi-actions and profile switching are not emulated.
- The plugin runs for real. A key press can call live APIs, start processes and open URLs.
  The mock does not run `openUrl`, but it cannot stop a plugin that opens a URL itself. Use
  test credentials. Warn the user before you press a key that has an effect outside the test.

## Report

- The plugin and its runtime.
- The actions that you tested, and how.
- The paths of the screenshots.
- SVG errors, with file and line.
- The lifecycle verdict and its numbers.
- Violations and plugin log errors.
- The installed plugin: replaced and restarted, or not.
- The limits that apply.
