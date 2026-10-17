# DaVinci Resolve Scripting

Use the DaVinci Resolve MCP: `get_whats_new` once per session,
`search_scripting_api` and `get_scripting_api` for signatures, `run_script` to
execute Python with `resolve` and `project` injected (sandboxed, no files;
`run_script_unsafe` only when a script must touch files). Without the MCP, use
the `DaVinciResolveScript` module shipped with Resolve.

Timecodes are `HH:MM:SS:FF`. Frames = seconds x fps. The timeline starts at
`tl.GetStartFrame()` (01:00:00:00 by default).

## Project and timeline

```python
mp = project.GetMediaPool()
tl = mp.CreateEmptyTimeline(name); project.SetCurrentTimeline(tl)
tl.SetSettings({"useCustomSettings": "1", "timelineResolutionWidth": "2560",
                "timelineResolutionHeight": "1440", "timelineFrameRate": "<a-roll fps>"})
clips = mp.ImportMedia([paths])
tl.AddTrack("video"); tl.AddTrack("audio")        # until V3 and A3 exist
```

## Cutting: no trim or razor API, so build the timeline from kept ranges

```python
mp.AppendToTimeline([{"mediaPoolItem": clip, "startFrame": s, "endFrame": e,
                      "trackIndex": 1, "recordFrame": pos}, ...])
```

`startFrame` and `endFrame` are source frames from the clip's first frame;
`recordFrame` is the timeline frame. Append A-roll ranges in order. B-roll uses
`trackIndex` 2 with a `recordFrame`; create A2 first and confirm where its
audio landed with `GetItemListInTrack("audio", 2)`. To change a cut, `tl.DeleteClips(items, rippleDelete)` and re-append.

## Zooms (A-roll video items)

```python
item.SetProperty("ZoomX", 1.15); item.SetProperty("ZoomY", 1.15)   # punch-in, 1.0 = 100 %
item.SetProperty("DynamicZoomEnabled", True)                        # slow zoom
item.SetProperty("DynamicZoomEase", resolve.DYNAMIC_ZOOM_EASE_IN_AND_OUT)
```

The API cannot set the dynamic zoom rectangles. Check the direction once with
stills at the clip's start and end; if it zooms out, leave a marker.

## Audio

```python
tl.NormalizeAudioLevel(a_roll_audio_items, {"normalizationMode": "ITU-R BS.1770-4",
    "targetLoudness": -14, "setLevelMode": resolve.NORMALIZE_AUDIO_SET_LEVEL_INDEPENDENT})
audio_item.SetProperty("AudioVolume", -28.0)     # on the audio item, not the video item
tl.GetItemListInTrack("audio", 2)                # items per track
```

## Credits, quotes, blur: a Fusion comp on the B-roll clip

Titles from `InsertFusionTitleIntoTimeline` always last 5 s and cannot be
trimmed by script, so build the overlay inside the B-roll clip's own comp; it
then spans the clip exactly.

```python
comp = item.AddFusionComp()
mi, mo = comp.FindTool("MediaIn1"), comp.FindTool("MediaOut1")
tp = comp.AddTool("TextPlus", -32768, -32768)
for k, v in STYLE.items(): tp.SetInput(k, v)       # style table below
mg = comp.AddTool("Merge", -32768, -32768)
mg.ConnectInput("Background", mi); mg.ConnectInput("Foreground", tp)
mo.ConnectInput("Input", mg)
# quote: blur the B-roll first
blur = comp.AddTool("Blur", -32768, -32768); blur.SetInput("XBlurSize", 25)
blur.ConnectInput("Input", mi); mg.ConnectInput("Background", blur)
```

Do not zoom a clip that carries an overlay; the overlay scales with it. Point
inputs take `{1: x, 2: y, 3: 0.0}`.

Shared style (Impact, thick black outline, hard black shadow):

```python
SHARED = {"Font": "Impact", "Style": "Regular",
  "Enabled2": 1, "ElementShape2": 1, "Thickness2": 0.14, "JoinStyle2": 1, "Red2": 0, "Green2": 0, "Blue2": 0,
  "Enabled3": 1, "ElementShape3": 0, "Softness3": 0, "Red3": 0, "Green3": 0, "Blue3": 0,
  "Offset3": {1: 0.006, 2: -0.006, 3: 0.0}}
LOWER_THIRD = SHARED | {"StyledText": "@handle", "Size": 0.065,
  "Red1": 0.98, "Green1": 0.78, "Blue1": 0.12,
  "HorizontalLeftCenterRight": -1, "VerticalTopCenterBottom": -1,
  "Center": {1: 0.06, 2: 0.10, 3: 0.0}, "AngleZ": -2.5}
QUOTE_CARD = SHARED | {"StyledText": "“Quote.”\n— Source", "Size": 0.075,
  "Red1": 1, "Green1": 1, "Blue1": 1, "Thickness2": 0.12,
  "LayoutType": 1, "LayoutWidth": 0.8, "LayoutHeight": 0.6, "Wrap": 1,
  "Center": {1: 0.5, 2: 0.5, 3: 0.0}, "Offset3": {1: 0.007, 2: -0.007, 3: 0.0}}
```

The same two looks exist as Effects Library titles for manual use:
`templates/Lower Third Credit.setting` and `templates/Quote Card.setting`. If
they are missing from `<Fusion Templates>/Edit/Titles/Video Edit Skill/`, copy
them there (`resolve.Fusion().MapPath("Templates:")` gives the folder; macOS
`~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Templates/`,
Windows `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Templates\`).
Keep the `.setting` files and the style table in sync.

## Markers and stills

```python
tl.AddMarker(frame, "Red", "Review: <what>", "<why>", 1)
album = project.GetGallery().GetCurrentStillAlbum()
resolve.OpenPage("color"); tl.SetCurrentTimecode(tc); still = tl.GrabStill()
album.ExportStills([still], folder, prefix, "png"); album.DeleteStills(album.GetStills())
resolve.OpenPage("edit")
```

## Render (used by edit-and-export-video)

```python
project.LoadRenderPreset("YouTube - 1440p")       # GetRenderPresetList() for others
project.SetRenderSettings({"TargetDir": exports_dir, "CustomName": name,
    "SelectAllFrames": True, "FormatWidth": w, "FormatHeight": h})
job = project.AddRenderJob(); project.StartRendering([job])
project.GetRenderJobStatus(job)                    # poll until JobStatus == "Complete"
```
