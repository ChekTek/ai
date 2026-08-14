---
name: herdr-init
description: "Create a standard five-tab Herdr workspace layout in the current directory: agent, editor, git, terminal, and process. Invoke manually when the user wants this exact layout. Requires HERDR_ENV=1."
disable-model-invocation: true
---

# Initialize Herdr Workspace

Create the standard Herdr layout in the calling workspace and current working
directory. Tab titles must match exactly, including their numeric prefixes:

1. `1 - agent`: run `opencode`.
2. `2 - editor`: run `fresh`.
3. `3 - git`: run `lazygit`.
4. `4 - terminal`: leave an available shell.
5. `5 - process`: leave an available shell.

Before issuing any Herdr command, verify that this agent is running inside a
Herdr-managed pane:

```bash
test "${HERDR_ENV:-}" = 1
```

If the check fails, say that you are not running inside Herdr and stop. Do not
inspect or control the focused Herdr session from outside Herdr.

The installed CLI is the authority for syntax. First inspect the tab command
group:

```bash
herdr tab
```

This workflow is destructive. Create all five replacement tabs in the current
workspace using the current directory as their cwd, then close every tab that
existed before the invocation. Do not read or inspect existing tabs beyond the
minimum needed to obtain their IDs for closure. Do not skip creation because a
matching name already exists. Read tab and root-pane IDs from the JSON response
instead of deriving them. Preserve the user's focus with `--no-focus` when
supported.

For `agent`, `editor`, and `git`, use `herdr pane run` on the new tab's root
pane to launch `opencode`, `fresh --no-restore`, and `lazygit`, respectively. Once
Fresh has started, use the pane input command with `ctrl+b` to show its file
explorer. Fresh has no command-line option that opens the file explorer
directly. Leave `terminal` and `process` at their interactive shell prompts.

Close the original tabs only after all five replacement tabs have been created
and their foreground commands submitted. Close the caller's tab last, because
doing so terminates this agent and prevents any further commands or response.

Do not create a workspace, worktree, or pane split. Do not focus a created tab
unless the user asks to switch to it.
