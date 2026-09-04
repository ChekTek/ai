# pi-copy-code-blocks

Renders code blocks as theme-colored cards in Pi's fullscreen transcript. Each
card has a padded header and footer showing the language name (`ts` renders as
`typescript`, `md` as `markdown`) on the left and a clickable `|copy|` button on
the right, so long snippets can be copied from either end. Activating either
button copies only the code block contents, without
the Markdown fence, and leaves the stored message and model context unchanged.

## Requirements

- Pi fullscreen mode (`"tuiMode": "fullscreen"` in `settings.json` or
  `pi --tui-mode fullscreen`)
- OSC 8 hyperlink support in the terminal

Regular TUI mode cannot support the link because the terminal, rather than Pi,
handles hyperlink activation there.

## Install

This repository's update scripts publish it automatically. To install just this
package from a checkout:

```bash
pi install /absolute/path/to/ai/pi/packages/copy-code-blocks
```

Then start a new Pi session or run `/reload`.

## Compatibility note

Pi's public extension API can transform rendered Markdown, but it does not
currently expose a code-block renderer or a handler for activated transcript
links. The extension uses small runtime hooks into Pi's Markdown renderer and
the fullscreen TUI's URL handler, while relying on Pi's public clipboard helper
for the actual copy. If Pi changes either internal interface, the cards may
require an update.
