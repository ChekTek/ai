# AI Configuration

Shared rules and skills for **Claude Code**, **GitHub Copilot**, **Pi**, and
**OpenAI Codex**, plus Pi packages and preferences.

## Publish

Run after cloning, pulling, or changing the configuration:

```bash
./scripts/update-config.sh
```

On Windows, run from PowerShell with symlink support:

```powershell
.\scripts\update-config-win.ps1
```

Publishing is additive. Use `--clean` or Windows `-Clean` to clear managed
destinations first; this can delete files not owned by this repository.

## Contents

- `rules/` — shared instructions
- `skills/` — reusable skills
- `pi/` — Pi packages, themes, and keybindings
- `scripts/` — validation and publishing

These are the canonical sources; do not edit their published copies. Rules and
skills target every harness by default. Restrict one with `metadata.targets`
using any combination of `claude`, `copilot`, `pi`, and `codex`.

Pi includes additional modes, personas, tools, model integrations, and UI
features. Use `/help`, `/rules`, and `/skills` to discover them.
