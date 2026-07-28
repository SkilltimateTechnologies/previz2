# Previz Stage

A browser-based previsualisation tool: paste prose, get blocked 3D scenes you can direct.

Single self-contained HTML file. Open `index.html` in a browser — no build, no install.
A Mixamo-rigged character is embedded in the file, so it works offline.

## The pipeline

Six stages, each editable before it feeds the next.

| Stage | Role | Output |
|---|---|---|
| 1 · Story | — | Prose in |
| 2 · Screenplay | The Writer | Master-scene format; headings define the sets |
| 3 · World | The Production Designer | Evidence-led bible — every choice traced to a line in the text |
| 4 · Locations | The Location Scout | Unique places, with recce photographs attached |
| 5 · Scenes | The Designer & AD | Every scene: set, marks, and what physically happens |
| 6 · Shots | The Director & DP | Every shot: its action, its framing, and why it exists |
| 7 · Stage | — | Framing solved, scenes loaded, yours to change |

Each stage reads **its own scene's text**, not a truncated copy of the whole script,
so scene 40 is blocked from scene 40. Blocking also names the physical beats and places
a prop for every object the action touches; those beats then travel to coverage, so the
DP knows what is happening and not just who is standing where.

**Locations are parsed from the scene headings**, so a place the film returns to is one
set built once rather than a fresh guess each time. Drop photographs of the real place
on a location and they are sent to the designer as vision input — a set built from a
written description is plausible, a set built from photographs is accurate. The scout
can also read the photographs and write the note for you.

The Locations step asks for photographs but never requires them, and each location shows
what its set will actually be built from: **Photographs** (measured off the real place),
**Researched** (built to how this kind of place usually is), **Your note**, or **Nothing**.
The button carries the same honesty — it reads "Block from your photographs" or "Block
from the bible alone" depending on the weakest location, so nobody is surprised by an
invented set.

Locations hold two kinds of image and the prompt tells them apart. **Photographs** of the
real place are evidence — geometry, openings, materials, light are taken from them.
**Concept stills**, generated through a connected image service, are look development —
palette, clutter and mood only, explicitly not geometry. A generated image made from your
own bible contains no information the bible did not already have, and generated interiors
are rarely Euclidean; treating the two the same is how a set ends up confidently wrong.

Every shot carries two lines that do different jobs. **Action** is what physically
happens inside the shot — the line a storyboard artist draws from. **Intent** is why the
shot exists dramatically. The scene's beats must be covered across its shots, in order.

**Bake keyframes** writes the whole film out as animation keys. Every driver in the app is
already a pure function of timeline position, so baking is sampling: step each scene to t,
read the transforms, then discard the samples a straight line between their neighbours would
have predicted. A static object collapses to two keys; a handheld camera keeps roughly one
key every three frames because that motion is genuinely per-frame. Output is JSON — position
and rotation quaternions per character, prop and camera, plus focal, focus, and the cut list.

### Into Blender

`blender/previz_import.py` is an addon. Install it, then **File ▸ Import ▸ Previz Keys**
and pick the baked JSON. It builds a collection per scene, a camera per setup with its
position, rotation, **animated focal length** and focus distance, empties for every
character and travelling prop, and a timeline marker per shot **bound to that shot's
camera** — so playback cuts between setups the way the previz does. Axis conversion from
three.js Y-up to Blender Z-up is handled, and every curve is set to linear because the
keys were reduced against linear interpolation.

### Exporting shots

**Export every shot (.glb)** writes one file per shot, frozen at that moment: the set,
everyone on their marks facing the way they face, the lights, and the single camera that
shot is taken on. No animation — the moment, not the move. There is the same button for
one shot at a time in the shot inspector.

Files are named `project-SC1_02_The_bench_reading.glb` and open with File ▸ Import ▸
glTF 2.0. Inside, each is grouped SET / CAST / LIGHTS plus the camera, which carries its
focal length, focus distance, action and intent as custom properties.

Cast are oriented blocks with a facing marker rather than mannequins — a director needs
the mark, the direction and whether the person is sitting; nobody needs a figure they are
going to replace.

The Shots screen is editable: size, lens, height, move and duration write straight back,
and changing the framing re-solves that camera and reloads the scene. Exports to JSON.

**Framing is computed, not generated.** The DP prompt is forbidden from returning
coordinates. It says *MCU, low, her left, 50mm*; `solveFraming` turns that into metres.
When a room is too small for the requested distance, the solver swings toward profile
before crossing the line, then widens the lens to hold the shot size rather than losing it.

Generation runs against the Claude API from the page. If it is unavailable the app
falls back to a hand-authored example so all six stages stay walkable.

## The stage

- **Navigation** — drag orbits, right-drag pans, scroll zooms to cursor, `F` frames selection,
  double-click sets the pivot
- **Gizmo** — `W` move, `E` rotate, `R` scale. Modes disable themselves when animation
  would overwrite them (a follow camera cannot be hand-aimed)
- **Cameras** — focal length on a 36mm gauge, handheld shake, static/follow/rail,
  per-camera focus distance and aperture. Live camera draws red, others hide
- **Cast** — Mixamo rig, locomotion retimed to path speed. Leads get unique colours,
  background shares one neutral
- **Paths** — characters *and* props travel. Draggable points, speed, arc for anything thrown
- **Lights** — placeable practicals and spots, seven film gels, shadows off by default
- **Sets** — parametric walls with true boolean openings: door, window, arch, round, breach
- **Look** — ACES tone mapping, exposure, contrast, saturation, grain, vignette,
  depth of field from the depth buffer
- **Shots** — filmstrip of rendered frames, inspector with intent, and a shot-level chat
  that emits diffs rather than regenerations
- **Export** — deterministic frame-stepped MP4 via WebCodecs at 24fps, 1280×720.
  Shot, scene, or the whole film

Undo covers every edit (`Ctrl+Z` / `Ctrl+Shift+Z`).

## Two worked examples

- **Return Ticket** — 4 scenes, 16 shots, 51s. A railway platform used twice so the
  outbound and return frames rhyme
- **Rooms** — 5 scenes, 17 shots, 54s. One continuous third-floor flat; the kitchen
  appears twice at different hours

## Known limits

- Characters are mannequins. Final imagery is expected to come from a generative pass
  downstream, guided by this blocking
- Sitting is a **pose**, not a clip: the rig's hip and knee bones are driven directly,
  with the bend direction measured at load rather than assumed, so it works on an
  imported rig too. Lying down still needs an imported clip
- Built for shorts. Feature length needs a locations/cast registry, per-scene screenplay
  parsing, and persistence — see the notes in the repo issues

## Licensing note

The embedded character is Mixamo's Xbot, as shipped in the three.js examples.
Fine for productions; Mixamo clips are **not** redistributable as a stock library.
For a shippable asset library use CC0 sources (Quaternius, Kenney, Poly Haven)
or a commercial licence (ActorCore, Truebones).
