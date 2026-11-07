# Fetch B-roll

Tools: yt-dlp and ffmpeg. Setup only if missing: macOS
`brew install yt-dlp ffmpeg`; Windows `winget install yt-dlp.yt-dlp Gyan.FFmpeg`.

## Plan first

From the transcript, list every beat that needs cover: timestamp, topic, and
what should be on screen (a menu, a boss, a trailer moment, a web page).
Source preference: channels in `b-roll-channels.md`, then any other channel
with credit, then a website screenshot for single points.

## Find

```bash
yt-dlp "ytsearch8:<game> <topic>" --flat-playlist \
  --print "%(id)s | %(title)s | %(channel)s | %(uploader_id)s | %(duration_string)s | %(webpage_url)s"
```

To find the right moment inside a long video, read its chapters or auto
subtitles instead of downloading it:

```bash
yt-dlp --skip-download --print "%(chapters)j" <url>
yt-dlp --skip-download --write-auto-subs --sub-lang en --sub-format vtt -o "b-roll/tmp/%(id)s" <url>
```

Then search the `.vtt` for the topic.

## Download only the section

```bash
yt-dlp -S "res:1440,ext:mp4" --download-sections "*MM:SS-MM:SS" --force-keyframes-at-cuts \
  -o "b-roll/%(uploader_id)s/%(id)s_%(section_start)s-%(section_end)s.%(ext)s" <url>
```

- Add 3 s of buffer on each side of what you need. Never download the whole
  video.
- `res:1440` picks the best available up to 1440p. Use `res:1920` for a
  vertical timeline.
- `uploader_id` is the channel's `@handle`.

## Screenshots

For a single point (a stat, a price, a patch note, a post), screenshot the page
at timeline resolution with the browser tool available to you (the `test-web`
skill's playwright-cli, or the browser pane). Save to `screenshots/<slug>.png`.
Crop and zoom on the timeline, not in the file.

## Record sources

Append every asset to `b-roll/sources.md`:

```
| file | url | channel | official or community | section | credit |
```

Community footage gets `@handle` in a Lower Third Credit for the whole clip.
Official publisher, platform, and developer channels get `none`.
