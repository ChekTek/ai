# Transcription

Two transcripts of the A-roll: Resolve's (fast, word timings, drives the cut)
and whisper.cpp large-v3 (slower, more accurate, verifies the cut).

## whisper.cpp: start first, runs in the background

Setup only if `whisper-cli` is missing:

- macOS: `brew install whisper-cpp`
- Windows: download the latest release zip from
  https://github.com/ggml-org/whisper.cpp/releases and put `whisper-cli` on
  PATH.

Model, once (3.1 GB): download
https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
to `~/.cache/whisper-cpp/ggml-large-v3.bin`.

Extract 16 kHz mono audio, then run detached:

```bash
ffmpeg -y -i "<a-roll>" -vn -ac 1 -ar 16000 -c:a pcm_s16le transcripts/a-roll.wav
nohup whisper-cli -m ~/.cache/whisper-cpp/ggml-large-v3.bin -f transcripts/a-roll.wav \
  -l en -ml 1 -sow -oj -of transcripts/whisper > transcripts/whisper.log 2>&1 &
```

`-ml 1 -sow` gives one word per segment with timestamps in
`transcripts/whisper.json`. Expect roughly real time on Apple Silicon. Check
the log later; do not wait for it. One run per A-roll file.

## Resolve

```python
clip.TranscribeAudio()                      # MediaPoolItem; poll project.GetTranscribeAudioStatus()
t = clip.GetTranscription()                 # {language, segments: [{start, end, text, speaker, words: [{start, end, text}]}]}
```

Timecodes are `HH:MM:SS:FF` relative to the clip's start timecode; `(...)`
marks silence. Convert to frames with the clip's fps. Save the result to
`transcripts/resolve.json`.

## Using both

- Cut from Resolve's words plus ffmpeg for exact gaps:
  `ffmpeg -i transcripts/a-roll.wav -af silencedetect=noise=-35dB:d=0.6 -f null -`
- When whisper finishes, align the two by time. Where words differ within a
  second of a cut, whisper wins: re-check that the cut is in silence and that a
  removed retake really was a repeat.
- Use whisper's text for anything quoted on screen or used as a search query.
