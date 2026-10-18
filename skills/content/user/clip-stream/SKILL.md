---
name: clip-stream
description: "Turn a live stream's talking-head recording into up to six vertical short clips in DaVinci Resolve: transcribe, propose clip subjects, let the user choose, then edit each chosen clip with B-roll the edit-video way. Stops before export for review."
argument-hint: "[source folder, notes, or clip subjects]"
compatibility: "Same requirements as edit-video."
disable-model-invocation: true
---

# Clip Stream

Find the shareable moments in a stream recording, then cut each one into its
own vertical timeline. Do not export.

This skill reuses the `edit-video` skill's references. Read its
`references/editing-rules.md` before cutting, and the others when the step
needs them:

- `references/transcribe.md` — Resolve and whisper.cpp transcription and setup
- `references/fetch-b-roll.md` — finding, downloading, and crediting B-roll
- `references/resolve-scripting.md` — the Resolve API recipes and title styles

## Sources

1. The talking-head recording of the stream in the current directory is the
   A-roll. A Markdown file there with notes, timestamps, or subjects is the
   brief; follow it. Anything else provided is B-roll or music.
2. If the user named a location, use that instead.
3. If neither exists, ask where the recording is. Do not go looking.

Work beside the sources in `transcripts/`, `clips/`, `b-roll/`,
`screenshots/`, and `exports/`.

## Timelines

One timeline per clip, named `clip-NN-<slug>`, 1080x1920 at the A-roll's frame
rate. The user's instructions override this.

Tracks: V1/A1 A-roll, V2/A2 B-roll, V3 titles, A3 music. Landscape A-roll and
B-roll fill the vertical frame (center crop); see "Vertical timelines" in
`resolve-scripting.md`.

## Steps

1. **Start whisper.cpp** on the whole recording in the background. A long
   stream takes a while; it finishes while you work.
2. **Set up Resolve**: project, import the recording.
3. **Transcribe in Resolve** and save the full transcript.
4. **Find clip subjects**: read the whole transcript. A subject is a complete
   thought: it has a setup, a point, and a payoff, and it stands on its own
   without the stream around it. It is not a hype moment; a reaction or a
   laugh only qualifies when the thought around it is complete. A subject
   comes in two shapes:
   - A moment: one stretch that already holds the whole thought.
   - A topic: a thought spread across the stream, started, left, and
     returned to. Collect every stretch and join them into one clip. Keep
     stream order unless another order reads better as one thought; never
     reorder inside a stretch, and drop the parts that repeat.

   Expect most subjects to be topics. Track them while reading so the later
   mentions are not missed. Either shape needs a hook in its first sentence
   and 20 to 90 s of speech once pauses are cut. Propose between 1 and 6,
   best first, and never pad the list. For each: working title, moment or
   topic, the thought in one sentence, the hook sentence quoted from the
   transcript, every source timecode range in play order, and the estimated
   length after cuts. Write the list to `clips/plan.md`.

5. **Choice gate**: ask which subjects to pursue, up to 6. Wait for the
   answer and record it in `clips/plan.md`.
6. **Cut each chosen clip**, in the user's order:
   - Create its timeline and build it from the kept ranges per
     `editing-rules.md`. Open on the hook: no lead-in, no greeting, no
     reading of chat. Drop sentences that only make sense on stream.
   - Treat the whole clip as "the first 30 seconds": cut to B-roll or a zoom
     every 3 to 6 s, polish every cut.
   - B-roll per `fetch-b-roll.md`, downloaded for a vertical timeline, placed
     on V2 with credits and quotes.
   - Audio per `editing-rules.md`. Music only if it was supplied.
   - When the clip is built, say so in one line and continue with the next.
7. **Verify with whisper**: when the whisper transcript is ready, compare it
   with Resolve's inside every clip's ranges. Where they disagree near a cut,
   fix the cut. Use whisper's wording for anything quoted or searched.
8. **Rules check**: walk every clip against `editing-rules.md`.
9. **Markers**: add a red timeline marker at anything uncertain: weak B-roll
   match, a cut that may need context, missing credit.
10. **Report**: for each clip the timeline name, subject, length, and markers
    to review, plus `b-roll/sources.md`. Do not export.
