# AI Configuration

Shared rules and skills for **Claude Code**, **GitHub Copilot**, **Pi**, and
**OpenAI Codex**, plus Claude Code settings, Pi packages and preferences, and
Yazi configuration.

## Publish

Run after cloning, pulling, or changing the configuration:

```bash
./scripts/update-config.sh
```

On Windows, run from PowerShell with symlink support:

```powershell
.\scripts\update-config-win.ps1
```

Or from Git Bash on Windows (forces real symlinks instead of copies):

```bash
./scripts/update-config-win.sh
```

Publishing is additive. Use `--clean` or Windows `-Clean` to clear managed
destinations first; this can delete files not owned by this repository.

## Contents

- `rules/` — shared instructions
- `skills/` — reusable skills: `agent/` are invoked by the model, `user/` only
  by slash command
- `claude/` — Claude Code settings merged into `~/.claude/settings.json`
- `pi/` — Pi packages, themes, and keybindings
- `yazi/` — Yazi file manager configuration, linked into its config directory
- `claude/settings.json` — Claude Code settings, merged into
  `~/.claude/settings.json` (other keys are kept; removed keys are not unset)
- `scripts/` — validation and publishing

These are the canonical sources; do not edit their published copies. Rules and
skills target every harness by default. Restrict one with `metadata.targets`
using any combination of `claude`, `copilot`, `pi`, and `codex`.

Pi includes additional modes, personas, tools, and UI features. Use `/help`,
`/rules`, and `/skills` to discover them.

Some skills depend on local tools that are not part of this repository (the
`herdr` workspace manager, the `revdiff` diff viewer, and the `sdtest` Stream
Deck harness); they explain what they need and stop when it is missing.

## License

MIT. See `LICENSE`.
