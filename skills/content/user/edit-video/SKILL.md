---
name: edit-video
description: "Edit a talking-head video in DaVinci Resolve: transcribe, cut silence and retakes, add B-roll, zooms, quotes and credits, level the audio. Stops before export for review."
argument-hint: "[source folder, timeline name, or notes]"
compatibility: "Requires DaVinci Resolve Studio with the DaVinci Resolve MCP, ffmpeg, yt-dlp, and whisper.cpp (the references explain setup)."
disable-model-invocation: true
---

# Edit Video

Turn the A-roll into a finished timeline in DaVinci Resolve, then stop for
review. Do not export;

Read `references/editing-rules.md` before cutting. Read the others when the
step needs them, not before:

- `references/transcribe.md` — Resolve and whisper.cpp transcription and setup
- `references/fetch-b-roll.md` — finding, downloading, and crediting B-roll
- `references/resolve-scripting.md` — the Resolve API recipes and title styles

## Sources

1. Video files in the current directory are the sources: the talking-head
   footage is A-roll; anything else provided is B-roll or music. A Markdown
   file there with an outline, script, or notes is the brief; follow it.
2. If the user named a location, use that instead.
3. If neither exists, ask where the source material is. Do not go looking.

Work beside the sources in `transcripts/`, `b-roll/`, `screenshots/`, and
`exports/`.

## Timeline

2560x1440 for landscape, 1080x1920 when the A-roll is vertical, at the
A-roll's frame rate. The user's instructions override this.

Tracks: V1/A1 A-roll, V2/A2 B-roll, V3 titles, A3 music.

## Steps

1. **Start whisper.cpp** on the A-roll audio in the background. It finishes
   while you work.
2. **Set up Resolve**: project, timeline settings, import sources, tracks.
3. **Transcribe in Resolve** and pull the word timings.
4. **Cut the A-roll**: silences, false starts, retakes. Build the timeline
   from the kept ranges.
5. **Review gate**: report the before and after length, the number of cuts,
   and what was removed. Wait for approval before continuing.
6. **B-roll and zooms**: plan every 5 to 10 second beat from the transcript,
   fetch B-roll, place it on V2, add credits, quotes, and zooms.
7. **Audio**: normalize A-roll, set B-roll and music levels. Music only if it
   was supplied.
8. **Verify with whisper**: when the whisper transcript is ready, compare it
   with Resolve's. Where they disagree near a cut, fix the cut. Use whisper's
   wording for anything quoted or searched.
9. **Rules check**: walk the timeline against `editing-rules.md`. Give the
   first 30 seconds a second, careful pass.
10. **Markers**: add a red timeline marker at anything uncertain: weak B-roll
    match, ambiguous retake, missing credit.
11. **Report**: what changed, markers to review, and `b-roll/sources.md`.
    Do not export.
