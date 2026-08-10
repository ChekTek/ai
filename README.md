# AI Configuration

User-level coding instructions and skills shared across **Claude Code**,
**GitHub Copilot**, **Pi**, and **OpenAI Codex**, plus Pi extensions.

The root `rules/`, `skills/`, and `pi/extensions/` folders are the source of
truth. The update scripts validate and publish them in the native user/global
format each harness expects.

## Source Layout

```text
rules/
├── general.md
├── typescript.md
└── streamdeck/
    └── ...
skills/
└── refine-ticket/
    └── SKILL.md
pi/
└── extensions/
    ├── context-manager.ts
    ├── keyboard-shortcuts.ts
    └── web-tools/
        └── index.ts
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
  targets: "claude,copilot,pi,codex"
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

If `metadata.targets` is absent, the file is published to all four harnesses.
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
are installed with lifecycle scripts disabled.

## Published Locations

| Harness | Skills | Rules | Extensions |
|---|---|---|---|
| Claude Code | `~/.claude/skills` | `~/.claude/rules` | — |
| GitHub Copilot | `~/.copilot/skills` | `~/.copilot/instructions/*.instructions.md` | — |
| Pi | `~/.pi/agent/skills` | `~/.pi/agent/rules` | `~/.pi/agent/extensions` |
| OpenAI Codex | `$CODEX_HOME/skills`, or `~/.codex/skills` | `$CODEX_HOME/AGENTS.md`, or `~/.codex/AGENTS.md` | — |

Skills and Pi extensions are linked directly to their canonical sources. Pi
extensions are Pi-specific and do not use `metadata.targets`. Codex skills
use its private `$CODEX_HOME/skills` location rather than the shared
`~/.agents/skills`, because Pi also discovers the shared location and would see
Codex-only skills. Claude rules are also linked directly. Copilot rules are
generated with Claude's `paths` converted to Copilot's `applyTo`.

Codex does not use Claude's conditional rule-file format, so its targeted rules
are combined into a generated global `AGENTS.md`. Rules without `paths` always
apply; rules with `paths` retain those patterns and are labeled as conditional
instructions.

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

The scripts will not overwrite an unmanaged Codex `AGENTS.md`, because silently
doing so would destroy user instructions. Pi leaves unmanaged `AGENTS.md` files
alone and removes only the legacy generated global file created by older
versions of this repository.

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

The `pi/extensions/web-tools/` extension adds the `webfetch` and `websearch`
tools. Its source is vendored from [dmmulroy/pi-web-tools][pi-web-tools] under
the MIT license; `LICENSE` is kept alongside the source. Only files reachable
from `index.ts` are vendored, so the upstream tests, `tsconfig.json`, dev
dependencies, and two modules no harness reaches (`truncation.ts`, superseded by
`tool-output.ts`, and the `vendor.d.ts` ambient types, which only a `tsc` run
consumes) are omitted.

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

Extensions resolve once at startup. Restart Pi after publishing a new one, and
expect directory extensions to be listed by entry point
(`extensions/web-tools/index.ts`) rather than by folder.

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
- `~/.pi/agent/rules`
- `$CODEX_HOME/skills`, or `~/.codex/skills`

Codex's managed `$CODEX_HOME/skills/.system` directory is preserved. The legacy
generated Pi `AGENTS.md` and current generated Codex `AGENTS.md` are removed only
when they contain this repo's generated marker. The script lists removals and
asks for confirmation.
Pass `--yes` (`-Yes` on Windows) to skip the prompt; this is required for a
non-interactive clean.

## Copilot Agent Orchestration

Two skills delegate repository work to a Copilot CLI model in the other model
family so the worker's blind spots differ from the reviewer's:

- `orchestrate-gpt` — use from a Claude model; dispatches Sol, Terra, or Luna.
- `orchestrate-claude` — use from a GPT model; dispatches Opus 5 or Sonnet 5.

Each requires the calling agent to verify the resulting diff. The skills expect
`copilot` to be installed and authenticated.
