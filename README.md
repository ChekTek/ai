# AI Configuration

Shareable AI agent configuration — coding instructions and skills — that works
across **Claude Code**, the **GitHub Copilot VS Code Extension**, and Copilot
surfaces that read Copilot-native user customizations.

The `.claude` folder is the source of truth. The update scripts publish it in the
native formats each agent expects.

## Add To Repository

```bash
# One-time setup: add the remote
git remote add config https://github.com/ChekTek/ai.git

# Pull the config folder (run this anytime you want updates).
git fetch config main && git checkout config/main -- .claude
```

After the first pull, you can just invoke `/update-ai` in your agent to fetch the
latest config instead of running the commands by hand.

## User Setup

To use this config globally (for every project), run the update script for your
platform. The scripts publish:

- Claude rules and skills to `~/.claude`
- Copilot skills to `~/.copilot/skills`
- Copilot instruction and prompt files to your VS Code user prompts folder

Rules in `.claude/rules` are converted to `*.instructions.md` files, with
`paths` converted to Copilot's `applyTo`. Skills in `.claude/skills` are linked
as Copilot skills and converted to `*.prompt.md` slash commands where possible.

The scripts are additive: existing non-link files and non-generated prompt files
are left untouched. Generated Copilot files include a marker and are refreshed on
subsequent runs. They have no dependencies and resolve the repo path
automatically, so you can run them from anywhere and keep this clone wherever you
want it to live permanently.

Set `COPILOT_USER_PROMPTS_DIR` to override the Copilot instruction/prompt output
folder if you use a different VS Code profile or editor build.

### macOS / Linux

```bash
./scripts/update-config.sh
```

### Windows (PowerShell)

Run from an elevated PowerShell (Administrator) or with Developer Mode enabled so
that creating symlinks is permitted:

```powershell
.\scripts\update-config-win.ps1
```

Re-run the script anytime (for example after `git pull`) to pick up new rules and
skills — existing links are refreshed and your own config is left untouched.

## Copilot Agent Orchestration

The `orchestrate-copilot` skill lets the current agent act as the coordinator
while GitHub Copilot CLI models perform suitable repository work. It is model
aware: a Claude orchestrator delegates to the GPT models (Sol, Terra, Luna),
and a GPT orchestrator delegates to the Claude models (Opus 5, Sonnet 5), so
the worker always comes from a different model family than the reviewer. It
matches the model tier to task difficulty, delegates through Copilot's
programmatic CLI, and requires independent validation before reporting
completion.

Agents can load the skill automatically for delegation and orchestration tasks,
or you can invoke it explicitly:

```text
/orchestrate-copilot implement the requested change and verify it
```

The skill expects both `claude` and `copilot` to be installed and authenticated.
Run the platform update script above after pulling changes to install it at user
scope on a new machine.
