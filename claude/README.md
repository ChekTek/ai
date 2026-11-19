# Claude Code settings

`settings.json` holds the Claude Code settings this repo manages. Publishing
merges it into `~/.claude/settings.json`. Objects merge recursively; arrays
and scalar values here replace matching values there. Other keys stay.
Removing a key from this file does not remove it from the published settings;
delete it there by hand.

`statusline-command.mjs` is the status line script referenced by the
`statusLine` key. Publishing links it to `~/.claude/statusline-command.mjs`.
It uses Node.js to show the model, effort level, and Git branch. A `*` marks
changes anywhere in the repository, including untracked files. Git is optional;
without it, only the model and effort level appear.
