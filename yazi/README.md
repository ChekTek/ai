# Yazi configuration

Makes Yazi the hub for browsing, editing, and git in one terminal tab. Requires
`fresh` and `lazygit` on `PATH`.

- `yazi.toml` — opens text and code files in `fresh`.
- `keymap.toml` — `g` `l` runs `lazygit` in the current directory.
- `init.lua` — a left-click (tap) on a file's preview opens the file.

Publishing links each file except this README into Yazi's config directory:
`YAZI_CONFIG_HOME` when set, otherwise `~/.config/yazi` (or
`$XDG_CONFIG_HOME/yazi`) on Unix and `%AppData%\yazi\config` on Windows.
Existing files that are not links into this repository are left alone, and
clean mode removes only this repository's links.

`init.lua` wraps Yazi's built-in `Preview:click`; recheck it after upgrading
Yazi.
