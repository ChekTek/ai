---
name: herdr
description: "Create a five-tab Herdr layout (claude, pi, files, git, terminal) in the current workspace, or in a new workspace for a target directory. Requires HERDR_ENV=1."
argument-hint: "[target directory for a new workspace, or blank to rebuild the current one]"
disable-model-invocation: true
---

# Herdr Layout

Herdr is a separate, unpublished terminal workspace manager; this skill only works
inside it. Stop unless `HERDR_ENV=1`. `herdr workspace|tab|pane` print usage without a subcommand.

IDs from JSON: `workspace create` → `result.workspace.workspace_id`; `tab create` → `result.tab.tab_id`, `result.root_pane.pane_id`. `pane run` may print nothing on success; trust its exit status and never resubmit.

## Target

- No argument: current workspace, current directory.
- Argument: existing directory (relative to cwd, `~` expanded); stop if missing. `herdr workspace create --cwd <target> --label <basename> --no-focus`, then build there with `--workspace <id>`.

## Steps

1. Save the target workspace's existing tab IDs.
2. Create all five tabs, cwd = target, `--no-focus`, exact titles:
   `1 - claude`, `2 - pi`, `3 - files`, `4 - git`, `5 - terminal`.
3. `pane run` on each root pane: `claude`, `pi`, `yazi`, `lazygit`; leave terminal at the shell.
4. Close the saved tabs (including a new workspace's default tab). When rebuilding the current workspace, close the caller's tab last — it kills this agent. Never close it when targeting a new workspace.

Never skip creation because a title already exists. No worktrees, splits, or focus changes.
