---
name: herdr-init-repo
description: "Create a five-tab Herdr layout (claude, pi, files, git, terminal) in the current workspace, or in a new workspace for a target directory. Works in the Herdr terminal UI and the desktop app."
argument-hint: "[target directory for a new workspace, or blank to rebuild the current one]"
disable-model-invocation: true
---

# Herdr Layout

Herdr is a separate, unpublished terminal workspace manager; this skill only works
inside it. Follow the section for the environment, or stop if neither applies:

- `HERDR_ENV=1`: terminal UI
- `HC_TERMINAL_ID` is set: desktop app

The desktop app calls a workspace a space.

## Target

- No argument: current workspace, current directory.
- Argument: existing directory (relative to cwd, `~` expanded); stop if missing. Build in a new workspace named after its basename.

## Layout

Five tabs in this order, cwd = target, with exact titles and programs:
`1 - claude` runs `claude`, `2 - pi` runs `pi`, `3 - files` runs `yazi`,
`4 - git` runs `lazygit`, `5 - terminal` stays at the shell.

Never skip creation because a title already exists. Never resubmit a program.
No worktrees or splits, and focus ends where it started.

## Terminal UI

`herdr workspace|tab|pane` print usage without a subcommand. IDs from JSON: `workspace create` → `result.workspace.workspace_id`; `tab create` → `result.tab.tab_id`, `result.root_pane.pane_id`.

1. New workspace only: `herdr workspace create --cwd <target> --label <basename> --no-focus`, then pass `--workspace <id>` below.
2. Save the target workspace's existing tab IDs.
3. `herdr tab create --cwd <target> --label <title> --no-focus` for each tab.
4. `herdr pane run <pane_id> <program>` on each root pane. It may print nothing on success; trust its exit status.
5. Close the saved tabs (including a new workspace's default tab). When rebuilding the current workspace, close the caller's tab last — it kills this agent. Never close it when targeting a new workspace.

## Desktop app

`herdr-app commands` lists every command and its arguments.

1. Space ID:
   - Current: `labels["herdr.space"]` from `hc get "$HC_TERMINAL_ID"`.
   - New: read `space` from `herdr-app status`, then run `herdr-app do space.new --name <basename> --folder <target>` and `herdr-app do space.select --id <that space>` in one shell command. `space.new` takes focus, so the user's typing lands in the new space until it is restored.
2. Save the target space's existing tab IDs from `herdr-app ls`.
3. `hc run --bg --keep --no-parent --no-notify --cwd <target> --label herdr.space=<space_id> --json` for each tab. `address` is the new terminal. Each becomes a tab a moment later, without taking focus and in no fixed order.
4. Find each terminal's tab in `herdr-app ls`, then `herdr-app do tab.rename --id <tab_id> --name <title>` and `herdr-app do tab.move --id <tab_id> --index <position>`.
5. `hc send <address> <program>` for each program.
6. Close the saved tabs (including a new space's default tab) with `herdr-app do tab.close --id <tab_id> --confirmed true`. When rebuilding the current space, close the caller's tab last — it kills this agent. Never close it when targeting a new space.

Do not use `herdr-app do tab.new`: it takes focus on every call.
