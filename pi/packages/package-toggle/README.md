# pi-package-toggle

A pi package that adds `/packages`, an in-session command to switch installed
pi packages on and off without uninstalling them. Pi itself only offers
`pi remove` (uninstall) and `pi config` (per-resource toggles); there is no
whole-package switch — this fills that gap.

## Install

```bash
pi install /absolute/path/to/this/repo/pi/packages/package-toggle
```

Or straight from git once merged:

```bash
pi install git:github.com/ChekTek/ai@main   # loads the whole repo; prefer the local path
```

## Usage

- `/packages` — interactive picker. Selecting a package flips it; Esc finishes
  and offers a `/reload` so changes take effect immediately.
- `/packages list` — print packages and their state (also works in
  non-interactive modes).
- `/packages off <source>` / `/packages on <source>` — flip one package by its
  source string, e.g. `/packages off npm:@foo/bar`.

## How it works

Switching a package off rewrites its `packages` entry in the owning settings
file (`~/.pi/agent/settings.json` or `.pi/settings.json`) to the object form
with `autoload: false` and empty resource lists, so pi loads nothing from it
while `pi list` still shows it. Switching it back on restores the original
entry.

Entries that already had resource filters are preserved across the round trip
in a stash file next to the settings (`package-toggle-stash.json` in
`~/.pi/agent/` or `.pi/`).

## Notes

- Toggling project-scope entries requires the project to be trusted.
- If the same package appears in both scopes, pi lets the project entry win;
  toggle the scope you actually want (both are listed).
- Changes take effect on `/reload` or the next pi start.
