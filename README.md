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
| 8 · The Cut | — | The approved shots as pictures, in order, at their real lengths |

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

### Approval, and the cut

Each shot is **rough**, **framed** or **approved**. Approving a shot locks the camera it
is taken on, so a signed-off frame cannot drift. Whole scenes can be approved from their
header row in the shots table.

Approval is a real gate rather than a label: **generation refuses an unapproved shot**,
and **The Cut** only opens once every shot is approved — a generated image costs money and
blocking you are still changing is not worth spending it on.

The Cut plays the film as pictures: every shot end to end at its own length, a scrubbable
track showing each shot sized by its duration, and a slate carrying the shot number, its
framing and its line. Shots without a generated image fall back to their blocking and say
so, so the cut works before you have spent anything.

Shots can be added from the beat they should cover — **+ shot** or **+ reaction** on any
beat row. A new shot is framed by the solver from that beat's speaker, so it arrives
pointing at the right person from a sensible place, and everything after it retimes.

### Visuals

**Visuals** on the toolbar opens the generation step: scene tabs across the top, every shot
in the scene as a card showing the blocking and the generated image side by side, and
Generate or Regenerate on each. There is a Generate this scene for the whole tab, and a
Generate this shot in the shot inspector.

It runs on `fal-ai/nano-banana-2/edit`, which takes several reference images and reasons
about what to change and what to preserve. So the references are **sent**, not described:

- **Image 1** is always the blocking render, at 1024. The prompt names its job — camera
  position, lens, framing, and where every person stands, how they are posed and who they
  are looking at.
- **Then the location photographs**, told to supply architecture, materials, wear and the
  quality of the light, and told that where they disagree with image 1 about a surface the
  photograph wins, but image 1 always decides the camera and the layout.
- **Then a sheet per character actually in that shot**, named, for face, build, hair and
  wardrobe, and to keep them the same person across every shot.

Because the model follows instructions rather than a denoising strength, the control is
**how closely to hold the blocking** — Exact tells it not to move the camera or anyone in
frame, Loose lets it re-frame. Resolution is 1K, 2K or 4K, and the reference count is
capped where you want it. Each card says how many images it will send and whose, and the
exact prompt is visible before you spend anything.

### Settings

**Dashboard ▸ Settings**, in three tabs.

**Keys** — Claude, Kimi, GPT/Codex and fal.ai, each with a light showing whether it is set.
Every key stays in this browser and goes only to the service it belongs to. That also means
nothing is shared between machines; for a deployed build they belong behind your own API,
see BUILD-SPEC section 7.

**Models** — each pipeline stage picks its own provider and model, because the stages do
not ask the same thing:

| stage | what it actually demands |
|---|---|
| Screenplay | long-form prose and format discipline; the longest single output |
| World bible | research and the restraint to say what is unsettled — **uses web search** |
| Location research | measurements of how a real place is built, without inventing one — **web search** |
| Character sheets | concrete physical description grounded in a place and a job — **web search** |
| Blocking | strict JSON full of numbers, and spatial sense; the stage most sensitive to a weak model |
| Coverage | directorial judgement inside a rigid schema |
| Shot chat | small fast edits; latency over depth |

Assign a stage to a provider without web search and it says so, plainly: that stage will
answer from memory and cite nothing. Model names are text fields with a default rather than
a list, because they move faster than this file does.

**Images** — the fal endpoint. Nano Banana 2 Edit is the default because it accepts several
references and reasons about what to preserve.

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

### Dialogue

The screenplay is parsed once into cue, parenthetical and line, so what is said survives
into the shots instead of being discarded at the scene split. Beats carry the line;
a shot inherits the line of the beat it covers and can override it.

The line appears on the board, in the table under the action, on the card and in the shot
inspector, and travels into the glb and the exported shot list. Where a line is long
against the shot's duration the table offers a length in the seconds cell — roughly two
and a half words a second plus a moment either side — which you can click to accept.

The Shots screen has three views. **Table** is the default — one row per shot, grouped under
its beat, with every field editable in place: purpose, size, lens, height, side, move and
duration as dropdowns, name and action as text. It reads as a shot list a 1st AD would
work from, and a beat nobody covered shows in red across the row. **Board** is the storyboard: rendered frames in a grid at three densities, each with its
slate, its line and its action, and clicking a frame opens that shot on the stage.
**Cards** gives one shot
the full width for writing action and intent.

Each shot carries a **status** — rough, framed or locked. Rough means it exists but the
framing is not decided; framed means the camera is where you want it; locked means leave
it alone, **and locking a shot locks the camera it is taken on**, so the document and the
stage cannot disagree. The header counts them, so you can see at a glance how much of the
film is settled.

Rows select by clicking the box in the first column, with shift-click taking the run
between. A bar appears offering purpose, status and size across the whole selection, and
delete, which retimes the shots that follow. Escape clears.

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
