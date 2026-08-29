# pi-package-toggle

A pi package that adds `/packages`, an in-session command to switch installed
pi packages and auto-discovered local extensions on and off without
uninstalling them. Pi itself only offers `pi remove` (uninstall) and
`pi config` (a separate TUI outside the session); this brings the toggles
in-session.

## Install

Published automatically by this repo's update-config scripts along with the
rest of `pi/packages/`; the entry point is the sibling `package-toggle.ts`
stub. There is deliberately no `pi` manifest in `package.json` — pi's
published-directory loader would try to load the manifest paths directly,
while `pi install` still auto-discovers the conventional `extensions/`
directory. To use it standalone outside this repo, install it as a pi package:

```bash
pi install /absolute/path/to/this/repo/pi/packages/package-toggle
```

## Usage

- `/packages` — interactive picker over settings package entries (`pkg`) and
  auto-discovered local extensions (`ext`). Selecting one flips it; Esc
  finishes and offers a `/reload` so changes take effect immediately.
- `/packages list` — print everything and its state (also works in
  non-interactive modes).
- `/packages off <name>` / `/packages on <name>` — flip one item by package
  source, extension path, or bare file name, e.g. `/packages off npm:@foo/bar`
  or `/packages off web-tools`.

## How it works

Switching a package off rewrites its `packages` entry in the owning settings
file (`~/.pi/agent/settings.json` or `.pi/settings.json`) to the object form
with `autoload: false` and empty resource lists, so pi loads nothing from it
while `pi list` still shows it. Switching it back on restores the original
entry.

Entries that already had resource filters are preserved across the round trip
in a stash file next to the settings (`package-toggle-stash.json` in
`~/.pi/agent/` or `.pi/`).

Local extensions auto-discovered from `~/.pi/agent/extensions/` or
`.pi/extensions/` are toggled with `+path`/`-path` override patterns in the
owning settings' `extensions` array — the same mechanism `pi config` uses, so
the two stay interchangeable.

## Notes

- Toggling project-scope entries requires the project to be trusted.
- If the same package appears in both scopes, pi lets the project entry win;
  toggle the scope you actually want (both are listed).
- Changes take effect on `/reload` or the next pi start.
