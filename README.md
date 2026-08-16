# AI Configuration

User-level coding instructions and skills shared across **Claude Code**,
**GitHub Copilot**, **Pi**, **OpenAI Codex**, and **OpenCode**, plus Pi extensions, themes, and keybindings.

The root `rules/`, `skills/`, `pi/extensions/`, `pi/themes/`, `pi/keybindings.json`,
and `opencode/` folders are the source of truth. The update scripts validate and publish them in the native
user/global format each harness expects.

## Source Layout

```text
rules/
├── general.md
├── rust.md
├── typescript.md
└── streamdeck/
    └── ...
skills/
└── refine-ticket/
    └── SKILL.md
pi/
├── keybindings.json
├── extensions/
│   ├── context-manager.ts
│   ├── keyboard-shortcuts.ts
│   ├── personas.ts
│   ├── web-tools.ts
│   ├── web-tools/
│   │   └── extension.ts
│   └── pi-flow/
│       ├── index.ts
│       ├── src/
│       └── web/
└── themes/
    └── nord.json
opencode/
├── context-manager.ts
├── context-report-tui.ts
├── plugins/
│   └── context-report.ts
└── tui.jsonc
```

Keep source files out of native folders such as `.claude` and `.agents`. Native
folders may be discovered directly, which would bypass target filtering.

## Targeting Harnesses

A skill or rule can restrict where it is published with `metadata.targets`:

```yaml
---
name: example-skill
description: Explain what the skill does and when to use it.
metadata:
  targets: "claude,copilot,pi,codex,opencode"
---
```

Use the same metadata in rule frontmatter:

```yaml
---
description: Use when working with TypeScript.
paths:
  - "**/*.ts"
metadata:
  targets: "claude,copilot,pi"
---
```

Supported targets are exactly:

- `claude` — Claude Code
- `copilot` — GitHub Copilot
- `pi` — Pi, regardless of the model Pi launches
- `codex` — OpenAI Codex
- `opencode` — OpenCode

If `metadata.targets` is absent, the file is published to all five harnesses.
Targets must be a quoted, comma-separated scalar. Empty, duplicate, malformed,
or unknown targets—including `gpt`—cause the script to fail before publishing
anything.

Targeting is based on the harness, not the model family. For example, a GPT
model launched by Pi still uses the `pi` target.

## User Setup

Run the update script for your platform after cloning or pulling this repo.
The scripts resolve the repository path automatically, so they can be invoked
from anywhere.

### macOS / Linux

```bash
./scripts/update-config.sh
```

### Windows

Run from an elevated PowerShell or enable Developer Mode so symbolic links can
be created:

```powershell
.\scripts\update-config-win.ps1
```

Re-run the script after changing targets, adding files, or pulling updates.
Links owned by this repo and generated files are refreshed; unrelated files are
left untouched. Runtime dependencies declared by local Pi extension directories
are installed with lifecycle scripts disabled. Directories with a
`pnpm-lock.yaml` are installed with `pnpm install --prod --frozen-lockfile`;
the rest use `npm install --omit=dev`. Both prune devDependencies, so run
`pnpm install` or `npm install` again in an extension folder before working on
it.

## Published Locations

| Harness | Skills | Rules | Extensions |
|---|---|---|---|
| Claude Code | `~/.claude/skills` | `~/.claude/rules` | — |
| GitHub Copilot | `~/.copilot/skills` | `~/.copilot/instructions/*.instructions.md` | — |
| Pi | `~/.pi/agent/skills` | `~/.pi/agent/rules` | `~/.pi/agent/extensions`, `~/.pi/agent/themes`, `~/.pi/agent/keybindings.json` |
| OpenAI Codex | `$CODEX_HOME/skills`, or `~/.codex/skills` | `$CODEX_HOME/AGENTS.md`, or `~/.codex/AGENTS.md` | — |
| OpenCode | `${XDG_CONFIG_HOME:-~/.config}/opencode/commands` | `${XDG_CONFIG_HOME:-~/.config}/opencode/rules` | `${XDG_CONFIG_HOME:-~/.config}/opencode/plugins`, plus TUI plugin config |

Skills, Pi extensions, Pi themes, and Pi keybindings are linked directly to their
canonical sources. Pi extensions, themes, and keybindings are Pi-specific and do
not use `metadata.targets`. Codex skills
use its private `$CODEX_HOME/skills` location rather than the shared
`~/.agents/skills`, because Pi also discovers the shared location and would see
Codex-only skills. Claude rules are also linked directly. Copilot rules are
generated with Claude's `paths` converted to Copilot's `applyTo`.

Codex does not use Claude's conditional rule-file format, so its targeted rules
are combined into a generated global `AGENTS.md`. Rules without `paths` always
apply; rules with `paths` retain those patterns and are labeled as conditional
instructions.

OpenCode rules are linked individually to its global `rules` directory. The
context-manager plugin scans the current Git project and injects only enabled
rules whose `paths` match at least one tracked or unignored file. Rules without
`paths` always match. Use `/rules` to enable or disable individual rule files;
selections persist in OpenCode's state directory. Skills with
`disable-model-invocation: true` are converted into generated global commands
so they are available through `/` completion. Other skills are linked to
OpenCode's global `skills` directory. Restart OpenCode after publishing because
it loads commands, rules, and plugins at startup.

The OpenCode context report uses a server plugin to capture each session's
latest effective system prompt and a TUI plugin to register `/context`. The
command opens a searchable, read-only report covering estimated request size,
OpenCode's latest usage measurement, system prompt, active conversation, tool
definitions, visible skills, instruction files, and published rules. It runs
locally without sending a model request. The first system-prompt report becomes
available after the session has made a model request.

Pi rules remain separate under `~/.pi/agent/rules`. The `context-manager.ts`
extension scans the current Git project and adds only enabled rules whose
`paths` match at least one tracked or unignored file. Rules without `paths`
always match. Use `/rules` in Pi to enable or disable individual rule files.
Selections persist in `~/.pi/agent/context-manager.json`.

Use `/skills` in Pi to choose whether each skill is `agent` enabled or
`user only`. Agent-enabled skills expose their name, description, and path to
the model so it can load them automatically. User-only skills remain available
through `/skill:name` but are removed from the model's initial context.

Use `/context` to open a searchable, read-only table covering the estimated
next request, Pi's current usage measurement, effective system prompt,
conversation, active tool definitions, injected and excluded rules,
agent-visible skills, Pi context files, and context-manager contribution.
User-only skills are omitted because they are not part of the model context.
Select a row to see details.

### Pi Personas

`pi/extensions/personas.ts` swaps only the default coding-assistant identity
for the current session. Tools, guidelines, and project context stay as Pi
built them. Custom `--system-prompt` / `SYSTEM.md` prompts are left alone
when they do not contain Pi's default identity sentence.

```text
/persona              open the picker (TUI)
/persona developer    coding assistant (session default)
/persona designer     design work such as layouts, visual systems, copy, and specifications
/persona general      helpful assistant for research and general work
```

The choice resets to `developer` on each new session. The footer shows
`persona:<name>` on the right of the working-directory line, above the model.
Changing persona mid-session asks whether to compact when the session already
has chat messages, because the new identity already busts the prompt-cache
prefix.

The extension also removes Pi's built-in self-documentation from that default
prompt. Restore it for the rest of the session with `/skill:build-for-pi`.
That skill defaults to `user only` (`disable-model-invocation: true`), so it
is not in the model's initial context until you invoke it.

The scripts will not overwrite an unmanaged Codex `AGENTS.md`, because silently
doing so would destroy user instructions. Pi leaves unmanaged `AGENTS.md` files
alone. OpenCode and Pi remove only legacy generated global files created by
older versions of this repository.

Copilot CLI and VS Code both read `~/.copilot` directly, so Copilot content is
published only once. VS Code also discovers Claude locations by default, which
can display the same shared skill twice. Disable the Claude locations in VS
Code when using this setup:

```jsonc
"chat.instructionsFilesLocations": {
  ".claude/rules": false,
  "~/.claude/rules": false
},
"chat.agentSkillsLocations": {
  ".claude/skills": false,
  "~/.claude/skills": false
}
```

Set `COPILOT_CLI_INSTRUCTIONS_DIR` to override Copilot's instruction folder.
Set `CODEX_HOME` to override the Codex configuration folder.

### Pi Web Tools

The `pi/extensions/web-tools.ts` entry point plus the `pi/extensions/web-tools/`
directory add the `webfetch` and `websearch` tools.

Upstream ships its entry point as `index.ts`, which makes Pi load the folder as
a directory extension. This copy renames it to `web-tools/extension.ts` and
re-exports it from `web-tools.ts` instead, because the `pi-acp` ACP adapter
(used by editors such as Zed) builds its startup list with
`readdirSync(extensionsDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"))`
and therefore never shows a directory extension. The re-export is the single
registration; keeping both an `index.ts` and a wrapper makes Pi load the
extension twice and fail with `Tool "webfetch" conflicts with ...`.

The wrapper has to sit next to the directory rather than point straight at the
entry point, because Pi resolves an extension's relative imports against the
symlink path rather than the real path. A `web-tools.ts` symlinked directly to
`web-tools/extension.ts` fails with `Cannot find module './webfetch.ts'`.

The update scripts run `npm install` in the extension folder before linking it,
so `node_modules/` is generated locally and ignored by Git while
`package-lock.json` is tracked.

`webfetch` works without configuration. `websearch` needs an Exa MCP-compatible
endpoint exported before Pi starts, otherwise the tool fails when it is first
called:

```bash
export PI_WEB_TOOLS_EXA_ENDPOINT="https://mcp.exa.ai/mcp"
```

Pi reads this from the environment of the process that launches it, so a
GUI-launched editor using the ACP integration does not inherit a shell profile.
Set it where that process can see it, or start the editor from a shell that
exports it.

Extensions resolve once at startup, so restart Pi after publishing a new one.

### Pi Flow

`pi/extensions/pi-flow/` adds `/flow`, a live conversation graph for the current
Pi session. The command starts a localhost-only server and opens it in the
default browser; running it again reuses the same server and URL instead of
starting another server.

```text
/flow           open or focus the canvas
/flow status    print the canvas URL
/flow stop      close the canvas and stop the server
```

The canvas reconstructs the existing session tree on open, then streams user and
assistant messages, tool-call lifecycle, and turn state as they happen. Each
assistant message with tool calls fans out into one branch per call so parallel
tools sit side by side, and every branch rejoins whatever follows on the spine.
Cards show live status (streaming, running, success, error, aborted); entries
that are not on the active branch are dimmed.

The latest active main-flow node hosts an embedded prompt editor. Submitting
from the graph uses `pi.sendUserMessage()` with prompt-template expansion, so
slash commands and skills behave as they do in Pi. While the agent is busy,
Enter queues a follow-up and ⌘Enter steers; queued prompts appear as distinct
cards until Pi accepts them. Draft text survives ordinary graph updates and
browser reconnects.

Auto camera mode is on by default. It animates toward the latest relevant
activity, keeps the latest main node near the centre, and keeps a handful of
nearby branches in view when space allows. Running branch work is followed
temporarily, then the camera returns to the main thread. Panning, zooming, or
dragging a node turns Auto off; the Auto control restores it. Dragged cards stay
pinned so incremental layout does not move them.

Each model call adds a compact context snapshot branch. Consecutive snapshots
are diffed into added, removed, and retained items. Loaded context files,
selected tools, structured system-prompt inputs, and skills come from Pi's
`before_agent_start` options. Explicit `/skill:name` input is attributed;
unattributed skill context is labelled inferred. Context usage and the active
model appear on the snapshot and in the toolbar. Cards stay collapsed by
default; Expand reveals item lists without logging full prompt bodies.
Compaction is a funnel node that distinguishes summarized history from the
recent entries Pi retained, including when `/flow` opens an existing session.

The supported `subagent` tool expands into live child branches for single,
parallel, and chained modes, including nested messages from tool details.
Completed children rejoin the parent tool result. Nested branches can be
collapsed. Other extensions can report spawned work on `pi.events` channel
`pi-flow:spawn:v1` with `{ version: 1, parentId, taskId, state, label, type,
messages }`. Shell tools without those events stay opaque process cards.

The graph marks the active path, the current leaf, and historical branches.
Selecting a historical user message can navigate to its parent, restore the
prompt in the graph editor, and submit a new persistent Pi branch. Selecting a
non-user node continues from that entry. Navigation uses `ctx.navigateTree()`
from the last `/flow` command context, asks Pi for a branch-summary choice, and
resyncs after completion or cancellation. Node labels are stored with
`pi.setLabel()` and survive reloads.

Interaction is pan (drag the background or scroll), zoom (wheel, `+`/`-`, or the
toolbar), node drag, click to select and inspect, `F` to fit the graph, and `Esc`
to clear the selection. Layout is incremental: rows come from conversation depth
and columns are packed so subtrees never collide, which keeps existing cards in
place as the conversation grows.

The server binds to `127.0.0.1` only, rejects requests whose `Host` header is not
a loopback address, and requires a per-process random token supplied in the URL
and then stored as a cookie. Port and token survive `/reload` and session
replacement, so an open tab reconnects on its own; the tab is told why when the
session shuts down.

Runtime needs only the `ws` package, and the browser assets are plain ES modules
served straight from `web/`, so there is no build step. Development scripts:

```bash
cd pi/extensions/pi-flow
pnpm install
pnpm run build   # typecheck (server and browser) plus lint
```

Design notes and reference mockups are in `pi/extensions/pi-flow/docs/`.

### Pi Themes

Themes in `pi/themes/` are linked to `~/.pi/agent/themes`. This repository
includes the dark `nord` theme. Run the update script, then select `nord` in
Pi's `/settings`.

### Pi Keybindings

`pi/keybindings.json` is linked to `~/.pi/agent/keybindings.json`. It unbinds
`app.thinking.toggle` (`ctrl+t`), `app.tools.expand` (`ctrl+o`), model cycling
(`ctrl+p` / `shift+ctrl+p`), and follow-up queueing (`alt+enter`) so thinking
and tool output stay visible, model changes go through the selector
(`ctrl+l`), and messages sent while the agent is working always steer. The
footer shortcut list omits those actions as well, and tool output is expanded
on session start. Run the update script, then `/reload` or restart Pi.

[pi-web-tools]: https://github.com/dmmulroy/pi-web-tools

## Starting Fresh

Pass `--clean` (`-Clean` on Windows) to empty the managed publishing folders
before republishing:

```bash
./scripts/update-config.sh --clean
```

This permanently deletes everything in these folders, including configuration
not created by this repo:

- `~/.claude/rules`
- `~/.claude/skills`
- `~/.copilot/skills`
- `~/.copilot/instructions`
- `~/.pi/agent/skills`
- `~/.pi/agent/extensions`
- `~/.pi/agent/themes`
- `~/.pi/agent/keybindings.json` when managed by this repo
- `~/.pi/agent/rules`
- `$CODEX_HOME/skills`, or `~/.codex/skills`
- `${XDG_CONFIG_HOME:-~/.config}/opencode/commands`
- `${XDG_CONFIG_HOME:-~/.config}/opencode/plugins`
- `${XDG_CONFIG_HOME:-~/.config}/opencode/rules`
- `${XDG_CONFIG_HOME:-~/.config}/opencode/context-manager.ts`
- `${XDG_CONFIG_HOME:-~/.config}/opencode/context-report-tui.ts`
- `${XDG_CONFIG_HOME:-~/.config}/opencode/tui.jsonc` when managed by this repo

Codex's managed `$CODEX_HOME/skills/.system` directory is preserved. The legacy
generated Pi and OpenCode `AGENTS.md` files and current generated Codex
`AGENTS.md` are removed only when they contain this repo's generated marker.
The script lists removals and asks for confirmation.
Pass `--yes` (`-Yes` on Windows) to skip the prompt; this is required for a
non-interactive clean.

## Copilot Agent Orchestration

`orchestrate` delegates repository work to a Copilot CLI model in another
family so the worker's blind spots differ from the reviewer's. Pass the family
as the first argument: `gpt`, `claude`, `grok`, or `kimi`. Wrappers
`orchestrate-gpt`, `orchestrate-claude`, `orchestrate-grok`, and
`orchestrate-kimi` pin that family.

The calling agent must verify the resulting diff. Requires `copilot` installed
and authenticated.
