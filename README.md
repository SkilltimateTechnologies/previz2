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

### Beats

A **beat** is one thing that changes — an argument made, a question answered, a reveal, a
decision. Standing up is not a beat. Cutting to a face is not a beat; it is coverage of
one. Beats sit between the screenplay and the shots, and every shot declares which beat it
covers and with what **purpose**: establish, statement, reaction, insert or punctuation.

That makes coverage checkable rather than assumed. The Shots screen is a beat sheet with
its shots nested under each beat, and it says plainly when a beat has no shot on it or a
shot points at a beat that does not exist.

**Eyeline** follows from beats: a character set to watch the speaker turns their head to
whoever drives the current beat. Which local axis comes out of a head differs between
rigs, so it is measured at load rather than assumed, and the turn is clamped to 66 degrees
so nobody breaks their neck. In Courtroom 3 the whole room — bench, bar, litigants and
twelve of the public — turns to whoever is talking.

Every shot carries two lines that do different jobs. **Action** is what physically
happens inside the shot — the line a storyboard artist draws from. **Intent** is why the
shot exists dramatically. The scene's beats must be covered across its shots, in order.

**Bake keyframes** writes the whole film out as animation keys. Every driver in the app is
already a pure function of timeline position, so baking is sampling: step each scene to t,
read the transforms, then discard the samples a straight line between their neighbours would
have predicted. A static object collapses to two keys; a handheld camera keeps roughly one
key every three frames because that motion is genuinely per-frame. Output is JSON — position
and rotation quaternions per character, prop and camera, plus focal, focus, and the cut list.

### Storage

Work is written to IndexedDB on a debounce and restored when you reopen, with a save
indicator in the toolbar and a warning if you leave with anything unwritten.

All of it goes through one adapter. Setting `window.PREVIZ_API` to an endpoint in front
of Turso makes the remote authoritative and leaves IndexedDB as the offline cache —
nothing above the adapter changes, and a failed sync degrades to *local only* rather
than losing the work.

`db/schema.ts` is the Drizzle schema. The shape rule is: **normalise what gets queried
across the film, keep as JSON what is only ever loaded whole.** Shots and beats are rows,
because coverage is a question you ask — which beats nobody shot, how much of the film is
reaction, every shot on one character. Blocking is a JSON column, because nobody queries
an individual wall and a scene's set loads as one unit. Reference images live in object
storage and the database holds keys.

### Into Blender

`blender/previz_import.py` is an addon. Install it, then **File ▸ Import ▸ Previz Keys**
and pick the baked JSON. It builds a collection per scene, a camera per setup with its
position, rotation, **animated focal length** and focus distance, empties for every
character and travelling prop, and a timeline marker per shot **bound to that shot's
camera** — so playback cuts between setups the way the previz does. Axis conversion from
three.js Y-up to Blender Z-up is handled, and every curve is set to linear because the
keys were reduced against linear interpolation.

### Exporting

Everything exportable is behind **Export** on the toolbar:

| | |
|---|---|
| This scene, all its cameras | `.glb` |
| Every scene in the film | `.glb` |
| This shot, its one camera | `.glb` |
| Every shot in the film | `.glb` |
| Cast in exports | blocks · leads posed · all posed |
| Shot list | `.json` |
| Baked keyframes | `.json` |
| Current play mode | `.mp4` |

**Every shot (.glb)** writes one file per shot, frozen at that moment: the set,
everyone on their marks facing the way they face, the lights, and the single camera that
shot is taken on. No animation — the moment, not the move. There is the same button for
one shot at a time in the shot inspector.

Files are named `project-SC1_02_The_bench_reading.glb` and open with File ▸ Import ▸
glTF 2.0. Inside, each is grouped SET / CAST / LIGHTS plus the camera, which carries its
focal length, focus distance, action and intent as custom properties.

Cast export three ways, cycled from the **Cast** chip. **Blocks** are oriented boxes with a
facing marker — the mark, the direction, whether the person is sitting. **Leads posed**
gives real mannequins in their actual pose for the principals and blocks for the crowd,
which is the default. **All posed** includes everyone.

The pose is baked on the CPU: every vertex is walked through the skeleton once and written
as a plain mesh. A skinned mesh plus its armature would arrive in Blender at bind pose
unless the animation came with it — and twenty-eight rigs would be unusable regardless.
For the courtroom that is about 47k vertices a shot for the leads, against 218k for
everyone.

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
