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
| 4 · Blocking | The Designer & AD | Sets built, actors on marks. No cameras yet |
| 5 · Coverage | The Director & DP | Shots described — size, height, side, lens, intent |
| 6 · Stage | — | Framing solved, scenes loaded, yours to change |

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
- No seated or lying clips in the bundled rig — background figures who sit are
  simplified box mannequins by design. Import Mixamo GLBs to remove this
- Built for shorts. Feature length needs a locations/cast registry, per-scene screenplay
  parsing, and persistence — see the notes in the repo issues

## Licensing note

The embedded character is Mixamo's Xbot, as shipped in the three.js examples.
Fine for productions; Mixamo clips are **not** redistributable as a stock library.
For a shippable asset library use CC0 sources (Quaternius, Kenney, Poly Haven)
or a commercial licence (ActorCore, Truebones).
