---
name: revdiff
description: "Open a diff for the user in revdiff and collect annotations. Use when asked to show a diff, open a diff viewer, or annotate changes—not for agent-only code reviews."
compatibility: "Requires revdiff (`brew install umputun/apps/revdiff`); automatic tabs require Herdr's terminal UI or desktop app."
---

# Revdiff

Open the viewer in a new Herdr tab, never in the agent's shell. Check required
CLIs with `command -v`; report missing tools rather than installing them.

## Scope

| Request | Arguments |
| --- | --- |
| All uncommitted changes | `HEAD --untracked` |
| Staged only | `--staged` |
| Unstaged and new files | `--untracked` |
| All local work against a branch | `<merge-base> --untracked` |
| Branch commits only | `<branch>...HEAD` |
| One commit (use `HEAD` for latest) | `<sha>~1 <sha>` |
| Between refs | `<base> <against>` |

Use the requested branch; `<merge-base>` comes from `git merge-base <branch> HEAD`.
Compare against the branch tip only if requested. Single refs compare against
the working tree; two-ref comparisons ignore `--untracked`. For root commits,
use Git's empty tree as the base. Repeat `--only=<path>` to select files.

Check the selected scope with `git diff --stat` using matching refs, `--cached`
for staged changes, and matching paths. Include `git ls-files --others
--exclude-standard` when showing untracked files. Report errors or an empty
scope instead of opening a tab.

## Open

Use the target repository's root as `<directory>`. Without either Herdr environment
below, give the user `revdiff <arguments>` to run themselves and stop.

Otherwise create an output file with `mktemp -t revdiff.XXXXXX` and remember its
absolute path. Build this command, shell-quoting paths and refs:

```bash
revdiff <arguments> -o '<output file>' && exit
```

Send the whole command as **one quoted argument**, once only. Success closes the
tab; errors leave it visible. A silent send can succeed: trust the exit status.

### Terminal UI (`HERDR_ENV=1`)

1. `herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd '<directory>' --label revdiff --focus`
2. Read `result.root_pane.pane_id`, then `herdr pane run <pane_id> '<command>'`.

### Desktop app (`HC_TERMINAL_ID` set)

1. `hc get "$HC_TERMINAL_ID" --json`: read `labels["herdr.space"]`.
2. `herdr-app do tab.new --name revdiff --space <space_id> --folder '<directory>'`
3. Read `terminal`, then `hc send <terminal> '<command>'`.

## Feedback

Tell the user the diff is open: `a` annotates, `q` saves and quits, `Q` quits
without saving (default keys). Ask them to message when finished; do not poll.

Read the output only when they confirm completion. Empty means no saved feedback,
not approval; a missing file is an error. Records start with `##` headers naming
a file, line, or range, optionally marked `(+)`/`(-)` or `(file-level)`. Answer
questions and apply requested changes against the current code, then delete only
this review's temporary file.
