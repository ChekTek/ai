---
name: edit-and-export-video
description: "Run the edit-video workflow, then render the finished timeline to exports/ and report when it is done."
argument-hint: "[source folder, timeline name, or notes]"
compatibility: "Same requirements as edit-video."
disable-model-invocation: true
---

# Edit and Export Video

1. Follow the `edit-video` skill in full.
2. Render with the recipe under "Render" in the edit-video skill's
   `references/resolve-scripting.md`: the YouTube preset at timeline
   resolution, to `exports/<timeline name>.mp4` beside the sources.
3. Wait for the render to finish. Confirm the file exists and that its ffprobe
   duration matches the timeline, then report the path, the duration, and any
   review markers left on the timeline.
