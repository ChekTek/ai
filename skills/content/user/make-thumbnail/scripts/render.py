#!/usr/bin/env python3
"""Fill assets/template.svg and rasterize it to a 1280x720 PNG with resvg.

Standard library only. Text is measured by reading advance widths straight
from the bundled TTF so the colored blocks fit without Pillow or fontTools.

Example:
  render.py --bg bg.jpg --character hero.png \\
    --title "Enshrouded Let's Play" --subtitle "& Alan Knight" --out thumb.png
"""

import argparse
import base64
import mimetypes
import os
import shutil
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
TEMPLATE = os.path.join(ASSETS, "template.svg")
FONT_DIR = os.path.join(ASSETS, "fonts")
FONT = os.path.join(FONT_DIR, "Anton-Regular.ttf")

W, H = 1280, 720

# Accent candidates for the title block, with their hue in degrees. The one
# whose hue is farthest from the background's dominant hue wins.
ACCENTS = {"red": ("#d7261b", 5), "teal": ("#3f9f8c", 165)}
DARK = "#262626"   # dark gray, not black, for boxes, text and the drop block
LIGHT = "#ffffff"


# --- font metrics -----------------------------------------------------------

class Font:
    """Advance widths and vertical metrics from a TrueType file."""

    def __init__(self, path):
        with open(path, "rb") as f:
            data = f.read()
        self.data = data
        num_tables = struct.unpack(">H", data[4:6])[0]
        self.tables = {}
        for i in range(num_tables):
            off = 12 + 16 * i
            tag = data[off:off + 4].decode("latin1")
            toff, tlen = struct.unpack(">II", data[off + 8:off + 16])
            self.tables[tag] = (toff, tlen)

        head = self.tables["head"][0]
        self.upem = struct.unpack(">H", data[head + 18:head + 20])[0]

        hhea = self.tables["hhea"][0]
        self.ascent, self.descent = struct.unpack(">hh", data[hhea + 4:hhea + 8])
        num_h = struct.unpack(">H", data[hhea + 34:hhea + 36])[0]

        hmtx = self.tables["hmtx"][0]
        self.advances = [
            struct.unpack(">H", data[hmtx + 4 * i:hmtx + 4 * i + 2])[0]
            for i in range(num_h)
        ]

        # Cap height from OS/2 (version 2+); fall back to a typical ratio.
        self.cap_height = int(self.upem * 0.72)
        if "OS/2" in self.tables:
            os2 = self.tables["OS/2"][0]
            version = struct.unpack(">H", data[os2:os2 + 2])[0]
            if version >= 2:
                self.cap_height = struct.unpack(">h", data[os2 + 88:os2 + 90])[0]

        self.cmap = self._read_cmap()

    def _read_cmap(self):
        data = self.data
        cmap = self.tables["cmap"][0]
        count = struct.unpack(">H", data[cmap + 2:cmap + 4])[0]
        mapping = {}
        for i in range(count):
            pid, eid, sub_off = struct.unpack(">HHI", data[cmap + 4 + 8 * i:cmap + 12 + 8 * i])
            sub = cmap + sub_off
            fmt = struct.unpack(">H", data[sub:sub + 2])[0]
            if fmt == 4:
                mapping.update(self._cmap4(sub))
            elif fmt == 12:
                mapping.update(self._cmap12(sub))
        return mapping

    def _cmap4(self, sub):
        data = self.data
        seg_x2 = struct.unpack(">H", data[sub + 6:sub + 8])[0]
        segs = seg_x2 // 2
        ends = sub + 14
        starts = ends + seg_x2 + 2
        deltas = starts + seg_x2
        range_offs = deltas + seg_x2
        mapping = {}
        for s in range(segs):
            end = struct.unpack(">H", data[ends + 2 * s:ends + 2 * s + 2])[0]
            start = struct.unpack(">H", data[starts + 2 * s:starts + 2 * s + 2])[0]
            delta = struct.unpack(">h", data[deltas + 2 * s:deltas + 2 * s + 2])[0]
            ro_addr = range_offs + 2 * s
            range_off = struct.unpack(">H", data[ro_addr:ro_addr + 2])[0]
            for c in range(start, min(end, 0xFFFE) + 1):
                if range_off == 0:
                    g = (c + delta) & 0xFFFF
                else:
                    addr = ro_addr + range_off + 2 * (c - start)
                    g = struct.unpack(">H", data[addr:addr + 2])[0]
                    if g:
                        g = (g + delta) & 0xFFFF
                if g:
                    mapping[c] = g
        return mapping

    def _cmap12(self, sub):
        data = self.data
        n = struct.unpack(">I", data[sub + 12:sub + 16])[0]
        mapping = {}
        for i in range(n):
            start, end, gid = struct.unpack(">III", data[sub + 16 + 12 * i:sub + 28 + 12 * i])
            for c in range(start, end + 1):
                mapping[c] = gid + (c - start)
        return mapping

    def width(self, text, size, letter_spacing=0.0):
        units = 0
        for ch in text:
            g = self.cmap.get(ord(ch), 0)
            units += self.advances[min(g, len(self.advances) - 1)]
        return units * size / self.upem + letter_spacing * max(len(text) - 1, 0)

    def cap(self, size):
        return self.cap_height * size / self.upem


# --- images -----------------------------------------------------------------

def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])


def png_has_alpha(path):
    with open(path, "rb") as f:
        head = f.read(26)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return False
    color_type = head[25]
    return color_type in (4, 6)


def href_for(path, embed):
    if not embed:
        return os.path.abspath(path)
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        return "data:%s;base64,%s" % (mime, base64.b64encode(f.read()).decode("ascii"))


def esc(text):
    return (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


# --- background analysis ----------------------------------------------------

def decode_png_rgba(path):
    """Decode a non-interlaced 8-bit RGBA PNG (what resvg writes)."""
    import zlib
    with open(path, "rb") as f:
        data = f.read()
    pos, idat = 8, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            w, h = struct.unpack(">II", body[:8])
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    raw = zlib.decompress(idat)
    bpp, stride = 4, w * 4
    rows, prev = [], bytearray(stride)
    for y in range(h):
        off = y * (stride + 1)
        ftype = raw[off]
        line = bytearray(raw[off + 1:off + 1 + stride])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if ftype == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ftype == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ftype == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif ftype == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        rows.append(line)
        prev = line
    return w, h, rows


def analyze_background(bg_path, resvg, text_fraction=0.55):
    """Mean luminance (0-1) and dominant hue (degrees, or None) of the part
    of the background that sits behind the title block."""
    import math
    import tempfile
    tmp = tempfile.mkdtemp()
    svg = os.path.join(tmp, "bg.svg")
    png = os.path.join(tmp, "bg.png")
    with open(svg, "w", encoding="utf-8") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
                'width="1280" height="720"><image xlink:href="%s" width="1280" height="720" '
                'preserveAspectRatio="xMidYMid slice"/></svg>' % esc(os.path.abspath(bg_path)))
    subprocess.run([resvg, "--width", "64", "--height", "36", svg, png], check=True,
                   stdout=subprocess.DEVNULL)
    w, h, rows = decode_png_rgba(png)
    shutil.rmtree(tmp, ignore_errors=True)

    lum_sum, hx, hy, n = 0.0, 0.0, 0.0, 0
    for row in rows:
        for x in range(int(w * text_fraction)):
            r, g, b = (row[4 * x] / 255, row[4 * x + 1] / 255, row[4 * x + 2] / 255)
            lum_sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
            mx, mn = max(r, g, b), min(r, g, b)
            sat = 0 if mx == 0 else (mx - mn) / mx
            if mx > mn:
                if mx == r:
                    hue = 60 * (((g - b) / (mx - mn)) % 6)
                elif mx == g:
                    hue = 60 * ((b - r) / (mx - mn) + 2)
                else:
                    hue = 60 * ((r - g) / (mx - mn) + 4)
                # weight by saturation so gray pixels do not vote
                hx += sat * math.cos(math.radians(hue))
                hy += sat * math.sin(math.radians(hue))
            n += 1
    strength = math.hypot(hx, hy) / n
    hue = math.degrees(math.atan2(hy, hx)) % 360 if strength > 0.08 else None
    return lum_sum / n, hue


def subject_bbox(char_path, resvg):
    """Fractional bounding box (x0, y0, x1, y1) of the opaque pixels in the
    character PNG, measured on a small resvg render so any PNG flavor works."""
    import tempfile
    cw, ch = png_size(char_path)
    sw = 160
    sh = max(1, round(ch * sw / cw))
    tmp = tempfile.mkdtemp()
    svg = os.path.join(tmp, "c.svg")
    png = os.path.join(tmp, "c.png")
    with open(svg, "w", encoding="utf-8") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
                'width="%d" height="%d"><image xlink:href="%s" width="%d" height="%d"/></svg>'
                % (sw, sh, esc(os.path.abspath(char_path)), sw, sh))
    subprocess.run([resvg, svg, png], check=True, stdout=subprocess.DEVNULL)
    w, h, rows = decode_png_rgba(png)
    shutil.rmtree(tmp, ignore_errors=True)
    x0, y0, x1, y1 = w, h, -1, -1
    for y, row in enumerate(rows):
        for x in range(w):
            if row[4 * x + 3] > 40:
                x0, x1 = min(x0, x), max(x1, x)
                y0, y1 = min(y0, y), max(y1, y)
    if x1 < 0:
        return 0.0, 0.0, 1.0, 1.0
    return x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h


def pick_accent(hue):
    """The accent whose hue is farthest from the background's; red for gray."""
    if hue is None:
        return "red"
    def distance(h):
        d = abs(h - hue) % 360
        return min(d, 360 - d)
    return max(ACCENTS, key=lambda name: distance(ACCENTS[name][1]))


# --- title block ------------------------------------------------------------

def wrap(font, text, size, max_width, max_lines):
    """Greedy word wrap. Returns None when the text cannot fit."""
    lines = []
    for forced in text.split("\n"):
        words = forced.split()
        line = ""
        for word in words:
            trial = (line + " " + word).strip()
            if line and font.width(trial, size) > max_width:
                lines.append(line)
                line = word
            else:
                line = trial
        if line:
            lines.append(line)
    if len(lines) > max_lines:
        return None
    if any(font.width(line, size) > max_width for line in lines):
        return None
    return lines


def fit_title(font, text, max_width, max_lines, start=118, floor=60):
    size = start
    while size >= floor:
        lines = wrap(font, text, size, max_width, max_lines)
        if lines:
            return size, lines
        size -= 4
    return floor, wrap(font, text, floor, max_width * 10, 99)


def title_block(font, title, subtitle, left, max_width, anchor_y, accent, sub_light):
    """Return SVG for the title block and the subtitle block under it."""
    title = title.upper().strip()
    subtitle = subtitle.upper().strip()
    accent_color = ACCENTS[accent][0]
    sub_bg, sub_fg = (LIGHT, DARK) if sub_light else (DARK, LIGHT)

    inset = 28            # subtitle starts this far right of the title block
    small = 44            # subtitle font size
    small_pad_x, small_pad_y = 18, 12
    small_spacing = 2.0
    big_pad_x, big_pad_y = 28, 22
    line_gap = 0.08       # extra gap between title lines, in em
    drop = 12             # offset of the dark block behind the title block

    size, lines = fit_title(font, title, max_width - 2 * big_pad_x, 3)
    cap = font.cap(size)
    line_h = cap + size * line_gap
    red_w = max(font.width(l, size) for l in lines) + 2 * big_pad_x
    red_h = len(lines) * line_h - size * line_gap + 2 * big_pad_y

    sub_w = sub_h = 0
    if subtitle:
        sub_w = font.width(subtitle, small, small_spacing) + 2 * small_pad_x
        sub_h = font.cap(small) + 2 * small_pad_y
    red_w = max(red_w, inset + sub_w + 12)

    top = anchor_y - (red_h + sub_h) / 2
    y = top
    out = []

    out.append(f'    <rect x="{left + drop:.1f}" y="{y + drop:.1f}" width="{red_w:.1f}" height="{red_h:.1f}" fill="{DARK}"/>')
    out.append(f'    <rect x="{left:.1f}" y="{y:.1f}" width="{red_w:.1f}" height="{red_h:.1f}" fill="{accent_color}"/>')
    baseline = y + big_pad_y + cap
    for line in lines:
        out.append(f'    <text x="{left + big_pad_x:.1f}" y="{baseline:.1f}" font-size="{size}" fill="{LIGHT}">{esc(line)}</text>')
        baseline += line_h
    y += red_h

    if subtitle:
        out.append(f'    <rect x="{left + inset:.1f}" y="{y:.1f}" width="{sub_w:.1f}" height="{sub_h:.1f}" fill="{sub_bg}"/>')
        out.append(f'    <text x="{left + inset + small_pad_x:.1f}" y="{y + small_pad_y + font.cap(small):.1f}" '
                   f'font-size="{small}" letter-spacing="{small_spacing}" fill="{sub_fg}">{esc(subtitle)}</text>')

    return "\n".join(out)


# --- main -------------------------------------------------------------------

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--bg", required=True, help="background image (any format resvg reads)")
    p.add_argument("--character", required=True, help="transparent PNG of the character")
    p.add_argument("--title", required=True, help="main title; use a newline to force a line break")
    p.add_argument("--subtitle", default="", help="small line below the title")
    p.add_argument("--out", required=True, help="output PNG; the filled SVG is written beside it")
    p.add_argument("--char-x", type=float, help="left edge of the visible subject (default: 16 px past the right frame edge)")
    p.add_argument("--char-y", type=float, help="top edge of the visible subject (default: 80 px past the bottom)")
    p.add_argument("--char-height", type=float, default=880, help="visible subject height in px (default 880)")
    p.add_argument("--text-left", type=float, default=56, help="left edge of the title block")
    p.add_argument("--text-width", type=float, default=700, help="max title block width")
    p.add_argument("--text-y", type=float, default=360, help="vertical center of the title block")
    p.add_argument("--blur", type=float, default=22, help="background blur stdDeviation")
    p.add_argument("--saturate", type=float, default=1.35, help="background saturation multiplier")
    p.add_argument("--zoom", type=float, default=1.25, help="background zoom")
    p.add_argument("--dim", type=float, default=0.35, help="overlay darkness behind the text, 0-1")
    p.add_argument("--outline", type=float, default=10, help="white outline thickness in px")
    p.add_argument("--accent", choices=["auto"] + list(ACCENTS), default="auto",
                   help="title block color; auto picks the hue farthest from the background")
    p.add_argument("--sub", choices=["auto", "light", "dark"], default="auto",
                   help="subtitle box; auto uses light on a dark background and dark on a light one")
    p.add_argument("--link", action="store_true", help="link images by path instead of embedding them")
    a = p.parse_args()

    for path in (a.bg, a.character):
        if not os.path.isfile(path):
            sys.exit(f"missing file: {path}")
    if not png_has_alpha(a.character):
        sys.exit(f"{a.character} has no transparency; run scripts/remove-bg.sh on it first")

    resvg = shutil.which("resvg")
    if not resvg:
        sys.exit("resvg is not installed. Install it with: brew install resvg")

    font = Font(FONT)
    cw, ch = png_size(a.character)
    # Size and place the visible subject, not the PNG's canvas, so transparent
    # margins around a cutout do not shrink it.
    fx0, fy0, fx1, fy1 = subject_bbox(a.character, resvg)
    sub_h = a.char_height
    sub_w = sub_h * (cw * (fx1 - fx0)) / (ch * (fy1 - fy0))
    if a.char_x is None and sub_w > W * 0.62:
        # wide subjects: cap the width so the title keeps room
        sub_w = W * 0.62
        sub_h = sub_w * (ch * (fy1 - fy0)) / (cw * (fx1 - fx0))
    char_h = sub_h / (fy1 - fy0)
    char_w = cw * char_h / ch
    # subject right edge 16 px past the frame, bottom 80 px past it
    sub_x = a.char_x if a.char_x is not None else W - sub_w + 16
    sub_y = a.char_y if a.char_y is not None else H - sub_h + 80
    char_x = sub_x - fx0 * char_w
    char_y = sub_y - fy0 * char_h

    lum, hue = analyze_background(a.bg, resvg)
    # the overlay darkens the text side, so judge brightness after it
    lum *= 1 - a.dim
    accent = pick_accent(hue) if a.accent == "auto" else a.accent
    sub_light = (lum < 0.5) if a.sub == "auto" else (a.sub == "light")
    hue_text = "gray" if hue is None else f"hue {hue:.0f}"
    print(f"background: luminance {lum:.2f}, {hue_text} -> accent {accent}, "
          f"subtitle {'light' if sub_light else 'dark'}")

    block = title_block(font, a.title, a.subtitle, a.text_left, a.text_width, a.text_y, accent, sub_light)

    with open(TEMPLATE, encoding="utf-8") as f:
        svg = f.read()
    fills = {
        "BG_HREF": esc(href_for(a.bg, not a.link)),
        "CHAR_HREF": esc(href_for(a.character, not a.link)),
        "CHAR_X": f"{char_x:.1f}", "CHAR_Y": f"{char_y:.1f}",
        "CHAR_W": f"{char_w:.1f}", "CHAR_H": f"{char_h:.1f}",
        "BLUR": str(a.blur), "SATURATE": str(a.saturate), "BG_ZOOM": str(a.zoom),
        "DIM_LEFT": str(a.dim), "DIM_RIGHT": str(round(a.dim * 0.4, 3)),
        "OUTLINE": str(a.outline),
        "TITLE_BLOCK": block,
    }
    for key, value in fills.items():
        svg = svg.replace("{{" + key + "}}", value)

    svg_path = os.path.splitext(a.out)[0] + ".svg"
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg)
    print(svg_path)

    subprocess.run(
        [resvg, "--use-fonts-dir", FONT_DIR, "--font-family", "Anton",
         "--width", str(W), "--height", str(H), svg_path, a.out],
        check=True,
    )
    print(a.out)


if __name__ == "__main__":
    main()
