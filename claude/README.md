# Claude Code settings

`settings.json` holds the Claude Code settings this repo manages. Publishing
merges it into `~/.claude/settings.json`: every top-level key here replaces the
same key there, and every other key is left untouched. Removing a key from this
file does not remove it from the published settings; delete it there by hand.
