---
name: herdr-tab
description: "Open a command or directory in a new Herdr tab, in the Herdr terminal UI or the desktop app."
argument-hint: "[command or directory to open]"
disable-model-invocation: true
---

# Herdr Tab

Herdr is a separate, unpublished terminal workspace manager; this skill only works
inside it. Follow the section for the environment, or stop if neither applies:

- `HERDR_ENV=1`: terminal UI
- `HC_TERMINAL_ID` is set: desktop app

The directory defaults to the current one. For a directory with no command,
skip the command step. Never resubmit a command. Leave focus where it is unless
the user asks to switch to the tab.

## Terminal UI

1. `herdr tab create --cwd <directory> --label <title> --no-focus`. The new
   pane's ID is `result.root_pane.pane_id` in the JSON output. Use `--focus` to
   switch to it.
2. `herdr pane run <pane_id> <command>`. It may print nothing on success; trust
   its exit status.

## Desktop app

1. `hc get "$HC_TERMINAL_ID"`: the space ID is `labels["herdr.space"]`.
2. `hc run --bg --keep --no-parent --no-notify --cwd <directory> --label herdr.space=<space_id> --json`.
   `address` is the new terminal. Its tab appears a moment later without taking
   focus.
3. `hc send <address> <command>`.
4. Find the tab holding that terminal in `herdr-app ls`, then
   `herdr-app do tab.rename --id <tab_id> --name <title>`. To switch to it:
   `herdr-app do tab.select --id <tab_id>`.

Do not use `herdr-app do tab.new`: it takes focus, so the user's typing lands in
the new tab.
