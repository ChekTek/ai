---
name: herdr-init
description: "Create a standard five-tab Herdr workspace layout in the current directory: agent, editor, git, terminal, and process. Invoke manually when the user wants this exact layout. Requires HERDR_ENV=1."
disable-model-invocation: true
---

# Initialize Herdr Workspace

Same `HERDR_ENV=1` gate as herdr; stop if missing. `herdr tab` is the syntax authority.

Create this layout in the calling workspace and current directory. Titles must match, including numeric prefixes:

1. `1 - agent`: `opencode`
2. `2 - editor`: `fresh`
3. `3 - git`: `lazygit`
4. `4 - terminal`: available shell
5. `5 - process`: available shell

This replaces existing tabs. Create all five first (current dir as cwd, `--no-focus` when supported), then close every tab that existed before. Do not skip creation because a matching name exists. Read IDs from JSON. Do not inspect existing tabs beyond IDs needed to close them.

On the new root panes: `herdr pane run` → `opencode`, `fresh --no-restore`, `lazygit`. After Fresh starts, send `ctrl+b` so the file explorer shows (no CLI flag for that). Leave `terminal` and `process` at a shell prompt.

Close original tabs only after the five replacements exist and their commands are submitted. Close the caller's tab last — that kills this agent.

Do not create a workspace, worktree, or pane split. Do not focus a created tab unless asked.
