---
name: herdr
description: "Control Herdr, a terminal multiplexer for coding agents. Use only when the user explicitly mentions Herdr or asks to use Herdr to inspect or control panes, tabs, workspaces, commands, or another agent. Do not use merely because a task could benefit from a background terminal, delegation, or parallel work. Requires HERDR_ENV=1."
disable-model-invocation: true
---

# Herdr

```bash
test "${HERDR_ENV:-}" = 1
```

If that fails: say you are not inside Herdr and stop.

`herdr` in PATH talks to this session. `herdr --help`, then a group with no subcommand (`herdr agent`, `herdr pane`, …), is the syntax authority. Do not run bare `herdr` (attaches TUI). Do not omit args on mutating commands (`herdr workspace create` runs with defaults). Parse JSON; do not invent IDs.

## Primitives

- Workspace/tab/pane = layout. Pane commands = raw terminals. Agent commands = the recognized coding agent in a pane.
- `agent start` needs an existing available shell pane; it never splits or creates layout.
- Target agents by unique live name (`[a-z][a-z0-9_-]{0,31}`) or host pane ID — not terminal IDs or kind labels.
- IDs: workspace `w1`, tab `w1:t1`, pane `w1:p1`. After `pane move`, use `.result.move_result.pane.pane_id`.
- Caller: `$HERDR_WORKSPACE_ID`, `$HERDR_TAB_ID`, `$HERDR_PANE_ID`. Prefer `--current` for the calling pane. Omitting a target may hit the UI-focused pane.
- `idle` = ready and seen in the focused UI. `done` = idle after unseen background work. `blocked` = approval/question UI. `unknown` ≠ complete.

## Start an agent

Default: sibling pane in this tab, this cwd. No new workspace/tab/worktree unless asked. Split wide panes right, tall/narrow down. Keep user focus.

```bash
herdr pane layout --pane "$HERDR_PANE_ID"
herdr pane split --current --direction right --cwd "$PWD" --no-focus
herdr agent start reviewer --kind codex --pane <pane-id>
herdr agent prompt reviewer "..." --wait --timeout 120000
```

`--wait` settles on idle/done/blocked. Use `--until` only for a specific state. Keys: `herdr agent send-keys reviewer esc`. Inspect: `herdr agent get` / `herdr agent read --source recent-unwrapped`.

If raising `--lines` does not reveal more of a finished response, the agent is likely on the alternate screen — ask it to write Markdown to a temp file and return the path.

## Ordinary command

Same split, then `herdr pane run`, `pane wait-output`, `pane read`. `--match` literal, `--regex` Rust regex.

## Safety

- `--no-focus` unless asked to switch. Use `--current`, a pane ID, or a unique agent name.
- Do not close layout you did not create. Never `herdr server stop` or kill the main process unless the user intends that.
- Server errors: JSON stderr, exit 1. Syntax errors: exit 2.
