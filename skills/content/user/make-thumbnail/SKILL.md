---
name: make-thumbnail
description: "Assemble a 1280x720 YouTube thumbnail from a background photo, a character cutout, and IGN-style title text: zoomed blurred background, white sticker outline on the character, red or teal title block and a subtitle block, colors picked for contrast. SVG template plus resvg; no generated imagery."
argument-hint: "[background] [character] [title] [subtitle]"
compatibility: "Requires python3 and resvg (brew install resvg). Background removal uses macOS 14+ Vision, or rembg elsewhere."
disable-model-invocation: true
---

# Make Thumbnail

Fill `assets/template.svg` with the user's images and text, rasterize it with
`scripts/render.py`, show the PNG, and iterate. Never generate or inpaint
imagery; the only model involved is background segmentation of the character.

## Inputs

Collect all four before rendering. Ask for any that is missing or ambiguous;
do not guess a title or pick an image the user did not name.

1. **Background**: a photo or screenshot. It is zoomed and blurred, so
   resolution and composition barely matter, but its color drives the
   palette (see Color rules).
2. **Character**: a PNG with transparency, or any image to cut out. Game key
   art from press kits is often already transparent.
3. **Title**: the big colored-block text. Up to three lines; wrapping is
   automatic, or force a break with a newline.
4. **Subtitle**: the small block under the title (series, game, or
   "Before You Buy"). Optional.

## Steps

1. If the character image has no alpha channel, cut it out:

   ```bash
   scripts/remove-bg.sh character.jpg character.png
   ```

   On macOS this compiles `remove-bg.swift` once (Vision foreground mask)
   and caches the binary under `~/.cache/make-thumbnail`. Elsewhere it uses
   `rembg`. Look at the result; if the mask clipped part of the subject,
   tell the user rather than retouching it yourself.

2. Render:

   ```bash
   scripts/render.py --bg bg.jpg --character character.png \
     --title "Enshrouded Let's Play" --subtitle "& Alan Knight" --out thumb.png
   ```

   The script prints the background reading and the colors it chose.

   This writes `thumb.svg` beside `thumb.png`. The SVG embeds both images
   as data URIs so it is self-contained and opens in Inkscape or a browser
   for manual tweaks; pass `--link` to reference the files by path instead.
   The PNG always uses the bundled font; for the SVG to show it in other
   apps, install `assets/fonts/Anton-Regular.ttf` once (double-click it).

3. Show the PNG to the user and adjust with flags, re-rendering each time:

   | Flag | Default | Use |
   | --- | --- | --- |
   | `--char-height` | 880 | height of the visible subject (transparent margins ignored); width follows, capped at 62% of the frame |
   | `--char-x`, `--char-y` | 16 px past the right edge, 80 px past the bottom | move the character |
   | `--text-left`, `--text-y`, `--text-width` | 56, 360, 700 | position and max width of the title block |
   | `--accent` | auto | `red` or `teal` to override the hue rule |
   | `--sub` | auto | `light` or `dark` to override the brightness rule |
   | `--blur`, `--saturate`, `--zoom` | 22, 1.35, 1.25 | background look |
   | `--dim` | 0.35 | darkening behind the text (fades out to the right) |
   | `--outline` | 10 | white outline thickness |

   Common fixes: a wide character overlapping the title wants a smaller
   `--text-width` or larger `--char-x`; a bright background wants more
   `--dim`; a four-line title should be shortened, not shrunk.

## Reference examples

Look at both before judging a render; they are the target look, made with
the default flags.

- `assets/examples/red-on-cool.jpg`: gray-blue background, so the red
  block and a white subtitle box.
- `assets/examples/teal-on-warm.jpg`: red background, so the teal block
  and a white subtitle box (the overlay keeps it dark).

## Color rules

Both rules read the blurred background behind the title block (left 55%)
and exist to keep contrast high. Override them only when the user asks.

- **Title block**: red (`#d7261b`) or teal (`#3f9f8c`), whichever hue is
  farther from the background's dominant hue. Teal and blue backgrounds get
  red; red, orange and yellow backgrounds get teal. A gray background gets
  red. Title text is always white, and a dark gray block sits 12 px behind
  the colored one.
- **Subtitle block**: on a dark background, dark gray text on white; on a
  light background, white text on dark gray. "Dark" means the luminance
  after the dim overlay is below 0.5. Dark gray is `#262626`, never pure
  black.

## Style notes

- Title block inset 28 px from the subtitle like IGN. All text is uppercase
  Anton, bundled in `assets/fonts` under the Open Font License.
- Character: a 10 px white outline with a soft drop shadow, filling the right
  half and bleeding off the bottom edge like a sticker. Keep the face in the
  right third and clear of the title.
- Palette and padding live at the top of `scripts/render.py`; the filter
  chains live in `assets/template.svg`. Change them there when the
  user wants a different house style rather than hand-editing one output.
