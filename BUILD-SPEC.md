# Previz Stage — Build Specification

**Audience:** an engineering agent implementing this end to end.
**Status:** the client exists and works. This document is about giving it a spine.

---

## 1. What exists, and what is wrong with it

`index.html` is a working previsualisation tool: ~5,700 lines of vanilla three.js in a
single self-contained file. It has a seven-stage AI pipeline, a 3D stage with solved
camera framing, beats and coverage checking, and export to glTF, MP4 and JSON.

Three things make it a prototype rather than a product, and they are the whole job:

1. **The Anthropic API key is not handled at all.** The browser calls
   `api.anthropic.com` directly. This works only in a sandbox that injects credentials.
   In any real deployment it either does not work or leaks a key.
2. **Nothing is shared.** Work lives in one browser's IndexedDB. No accounts, no
   projects belonging to anyone, no second device.
3. **A 3.9 MB character is base64-embedded in the source.** 93% of the file, re-sent on
   every load and re-committed on every change.

Everything else in this document follows from those three.

---

## 2. Non-goals

State these plainly so nobody spends a week on them.

- **Do not port the stage to React Three Fiber.** It is imperative three.js by design —
  a render loop, a transform gizmo, direct scene-graph mutation. Wrapping it in a
  declarative renderer is weeks of work for a worse result. Mount it into React through
  a ref and leave it alone.
- **Do not normalise the blocking data.** Set pieces, cast marks and practical lights
  are loaded and written as one unit. See §5.
- **Do not build real-time multiplayer.** Sharing links and comments (M6) cover the
  actual need. CRDTs are not on this list.
- **Do not put reference images in the database.**

---

## 3. Architecture

```
                    ┌──────────────────────────────┐
   browser          │  Next.js 15 (App Router)     │        Railway
                    │                              │
  ┌──────────┐      │  /app        React shell     │
  │  stage   │◄────►│  /stage      three.js module │
  │ three.js │      │  /api/*      route handlers  │───────► Turso (libSQL)
  └──────────┘      │                              │           via Drizzle
       │            └──────────────┬───────────────┘
       │                           │
       │  presigned PUT            │  server-side key
       ▼                           ▼
   Cloudflare R2              Anthropic API
   (references, frames)       (pipeline stages)
```

**One deployable.** Next.js route handlers are the API. A separate Express service buys
nothing here and doubles the deploy surface.

**The stage stays vanilla.** `/stage/index.js` exports `mountStage(el, opts)` returning a
handle. React owns the page; the stage owns its canvas.

---

## 4. Stack

| | choice | why |
|---|---|---|
| Framework | Next.js 15, App Router, React 19 | one deploy, route handlers are the API |
| Language | TypeScript, `strict: true` | except `/stage`, see §9 |
| DB | Turso (libSQL) | already chosen |
| ORM | Drizzle | typed, migrations are files you can read |
| Auth | Better Auth | email/password, sessions, no third party needed |
| Objects | Cloudflare R2, S3 API | presigned PUT, cheap egress |
| 3D | three.js `0.160.0`, pinned | the stage is written against this exact version |
| Styling | plain CSS, as now | the stage's CSS is hand-tuned; do not introduce Tailwind into it |
| Hosting | Railway | already chosen |

**Pin three.js exactly.** The stage depends on `applyBoneTransform`, `CapsuleGeometry`
and `Box3Helper` behaviour. A minor bump has broken these before.

---

## 5. Data model

`db/schema.ts` is written and is the source of truth. Do not redesign it. The shape rule,
stated once so it is not undone by accident:

> **Normalise what gets queried across the film. Keep as JSON what is only ever loaded
> whole.**

**Rows** — `projects`, `documents`, `places`, `characters`, `assets`, `scenes`, `beats`,
`cameras`, `shots`, `revisions`, `comments`.

Shots and beats are rows because coverage is a *question*: which beats nobody shot, how
much of the film is reaction, every shot on one character, which scenes share a standing
set. Those are JavaScript scans today and must be SQL at feature length. The four queries
are in the schema file as comments; each index exists to serve one of them.

**JSON column** — `scenes.blocking`, holding props, cast marks and practical lights.
Nobody queries an individual wall. Shredding 52 props into 52 rows buys joins and nothing
else.

**Object storage** — reference photographs and rendered frames. `assets` holds R2 keys,
never bytes.

### Two scopes, and the line between them

This is the rule most likely to be got wrong, because the wrong version works fine until
someone opens a second project.

**Machine scope** — belongs to the user and follows them everywhere: API keys, which
image endpoint, which TTS endpoint, which model runs which pipeline stage. In the client
these live in `SETTINGS`; on the server they belong to the user or the organisation.

**Project scope** — belongs to one film: character voices, the fallback voice, how closely
generation holds the blocking, output resolution, how many references travel, how the cast
exports. In the client these live in `PROJ` and are saved and restored with the project.

The test is simple: **could this value be meaningless in another project?** A voice
assigned to *Judge Murthy* is meaningless in a film he is not in — it would follow the user
across and silently apply to nobody. A fal key is meaningful everywhere.

Schema-wise: machine scope goes on `users`; project scope goes in a `settings` JSON column
on `projects`.

### Migrations

Drizzle Kit. Generated migrations are committed. `drizzle-kit push` is forbidden outside
local development — it silently drops columns.

---

## 6. API

All routes under `/api`. JSON in, JSON out. Auth by session cookie except where noted.

### Conventions

- Errors: `{ error: { code, message } }` with a real HTTP status. Never 200 with an error
  body.
- Codes are stable strings: `unauthorized`, `not_found`, `conflict`, `rate_limited`,
  `validation_failed`, `upstream_failed`.
- Every request body is validated with Zod at the boundary. A handler must never see an
  unvalidated shape.
- Mutations return the updated resource, so the client never needs a second round trip.

### Routes

```
POST   /api/auth/*                     Better Auth handlers

GET    /api/projects                   list, owner-scoped
POST   /api/projects                   create; body { name, from?: 'blank' | example slug }
GET    /api/projects/:id               full project: documents, places, characters,
                                       scenes with blocking, beats, cameras, shots
PUT    /api/projects/:id               whole-project write. Body carries `updatedAt`;
                                       mismatch → 409 conflict (see §6.1)
DELETE /api/projects/:id

PATCH  /api/scenes/:id                 partial: name, timeOfDay, look, light, blocking
POST   /api/scenes/:id/shots           create
PATCH  /api/shots/:id                  partial
DELETE /api/shots/:id
PATCH  /api/beats/:id
PATCH  /api/cameras/:id

GET    /api/projects/:id/coverage      the SQL report: uncovered beats, orphan shots,
                                       purpose breakdown, runtime by scene

POST   /api/assets/sign                { projectId, ownerKind, ownerId, kind,
                                         contentType, bytes } → { key, url, headers }
POST   /api/assets                     register a completed upload → asset row
DELETE /api/assets/:id

POST   /api/ai/:stage                  screenplay | world | scout | casting | blocking |
                                       coverage  — see §7

GET    /api/share/:token               public, no auth: a frozen revision
POST   /api/share/:token/comments      public, no auth, rate limited by IP
```

### 6.1 Concurrency

Two tabs will happen. `PUT /api/projects/:id` requires the `updatedAt` the client last
read. On mismatch return `409` with the current server state; the client shows *"this
project changed elsewhere"* and offers to reload. **Do not merge.** Silent merging of a
scene graph produces results nobody can reason about.

`PATCH` routes are last-write-wins per row and need no version check.

### 6.2 Write strategy

M2 ships whole-project `PUT` — simple and correct. A courtroom project is roughly 400 KB
of JSON, which is fine on a debounce.

Move to per-scene `PATCH` when a project exceeds ~2 MB, not before. Premature granularity
here costs correctness.

---

## 7. The AI proxy — read this section twice

**The Anthropic key lives in the server environment and is never sent to the browser. It
must not appear in any `NEXT_PUBLIC_` variable, any client bundle, or any response body.**
This is the single most important rule in the document.

### Route

`POST /api/ai/:stage`

The client sends **stage inputs**, never a raw prompt:

```jsonc
{
  "projectId": "…",
  "sceneIdx": 2,                       // where the stage needs it
  "images": ["asset_id", "asset_id"]   // asset ids, NOT data URLs
}
```

The server:

1. Checks the session and that the project belongs to the caller.
2. Loads the inputs that stage needs **from the database**, not from the request.
3. Assembles the system prompt from `lib/ai/prompts.ts` (ported verbatim from the current
   `SYS_*` constants — they are tuned, do not paraphrase them).
4. Resolves `images` to R2 objects and sends them as base64 or signed URL image blocks.
5. Calls Anthropic with the key from `process.env.ANTHROPIC_API_KEY`.
6. Validates the response against the stage's Zod schema. Invalid JSON → one retry with
   the parse error appended → then `502 upstream_failed`.
7. Writes the result to the database and returns it.

**Why the server loads the inputs:** it makes prompt injection through a doctored request
body impossible, and it means the stored artefact and the generated one cannot drift.

### Web search

The `world`, `scout` and `casting` stages pass the `web_search_20250305` tool. Capture the
`web_search_tool_result` blocks and persist the URLs to `sources`. The client displays
them; it does not fetch them.

### Quota and rate limiting

- Per user per day, in the database, configurable per plan.
- `429 rate_limited` with `retryAfter` seconds.
- Log every call: user, stage, model, input and output tokens, latency, ok/failed. This is
  the only way to reason about cost later.

### Streaming

Not in M4. Stages take 5–30 seconds and a progress label is enough. Add streaming only
for the screenplay stage, and only if it measurably helps.

---

## 8. Assets

**Never proxy image bytes through the app server.**

```
client → POST /api/assets/sign   → { key, url, headers }
client → PUT  <presigned R2 url> → 200
client → POST /api/assets        → asset row
```

- Accept `image/jpeg`, `image/png`, `image/webp` only.
- Max 8 MB per file, enforced at signing time from the declared `bytes` and again by R2.
- Downscale client-side to 1024 px on the long edge before upload, as the current
  `readPhoto()` already does.
- Serve through a `/api/assets/:id/raw` redirect to a short-lived signed GET, so
  permissions are checked. Do not make the bucket public.
- Deleting a project deletes its objects. Do this in a background job, not in the request.

---

## 9. Porting the stage

`index.html` becomes:

```
/stage
  index.js          mountStage(el, { project, api, onDirty }) → handle
  scene.js          scene graph, props, characters, lights
  camera.js         solver, framing, film camera
  pipeline.js       stage inputs → api.ai(stage, inputs)
  timeline.js       shots, beats, playback, export
  ui/               panels, all existing CSS
/public/assets
  xbot.glb          the extracted character
```

### Rules

- **`/stage` stays JavaScript, not TypeScript.** It is 5,700 lines of working code.
  Converting it invites a rewrite. Add `// @ts-check` and JSDoc types at the module
  boundary only.
- **Extract the character first.** `xbot.glb` → `/public/assets/`, loaded with
  `GLTFLoader`. This alone takes the source from 4.2 MB to ~280 KB.
- **Keep the storage adapter.** `storePut` / `storeGet` already exist and already fall
  back to IndexedDB. Point them at the API; do not replace the call sites.
- **Preserve determinism.** Every driver in the stage is a pure function of timeline
  position — that is what makes scrubbing, thumbnails and MP4 export agree. Nothing may
  accumulate state across frames.
- **Do not reformat `/stage` files.** A whitespace-only diff over 5,700 lines destroys
  the ability to review real changes.

### The handle

```js
const stage = mountStage(el, { project, api, onDirty });
stage.loadProject(project);
stage.getState();          // serialisable, matches the API shape
stage.on('dirty', fn);
stage.destroy();
```

React renders the shell. The stage owns everything inside its canvas.

---

## 10. Environment

```
DATABASE_URL=libsql://…                 # Turso
DATABASE_AUTH_TOKEN=…
BETTER_AUTH_SECRET=…                    # 32+ random bytes
BETTER_AUTH_URL=https://…
ANTHROPIC_API_KEY=…                     # server only, never NEXT_PUBLIC_
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_BUCKET=previz
SEED_ADMIN_EMAIL=admin@skilltimate.studio
SEED_ADMIN_PASSWORD=…                   # development seed only, see §11
```

`.env.example` is committed with every key and no values. `.env` is git-ignored.

**CI check:** fail the build if any file matches `NEXT_PUBLIC_.*(KEY|SECRET|TOKEN)`.

---

## 11. Seed

`pnpm db:seed` creates:

- **Admin user** — `admin@skilltimate.studio`, role `admin`, password taken from
  `SEED_ADMIN_PASSWORD`, hashed by Better Auth (argon2id). The value is `Demo@12345` for
  local development.
- The three worked examples as read-only template projects: *Two Signatures*, *Return
  Ticket*, *Rooms*.

### Rules about that password

- **It is a development seed and nothing else.** The seed must refuse to run against a
  non-local `DATABASE_URL` unless `ALLOW_REMOTE_SEED=1` is set explicitly.
- **Never committed.** It lives in `.env`, and `.env.example` carries the key with an
  empty value.
- **Never stored in plaintext.** Better Auth hashes it; the database holds the hash.
- **Development convenience.** When `NODE_ENV !== 'production'`, the sign-in form
  pre-fills the seed email and password so the developer is not retyping them all day.
  This is gated on the environment in the component, not hidden with CSS, and the values
  come from a dev-only endpoint that returns `404` outside development.
- **Because of that pre-fill, `mustChangePassword` is set only outside development.**
  Forcing a change on an account whose whole purpose is a one-click local login is theatre;
  forcing it anywhere real is not.
- Staging and production get a generated password, printed once to the deploy log and never
  persisted, with `mustChangePassword: true` and no pre-fill.
- **CI must fail** if `Demo@12345` appears anywhere outside `BUILD-SPEC.md` and a
  development-only fixture.

---

## 12. Milestones

Each has acceptance criteria that are testable, not descriptive. A milestone is not done
until someone else can run the check.

### M0 — Skeleton

Next.js 15 app, TypeScript strict, Drizzle wired to Turso, schema migrated, seed script,
`.env.example`, CI running typecheck, lint and the secret-leak check.

**Done when:** `pnpm db:migrate && pnpm db:seed` runs against a fresh Turso database and
`admin@skilltimate.studio` can be found in the `users` table with a hash, not a password.

### M1 — Auth and projects

Better Auth email/password. Sign in, sign out, session. Project list, create, rename,
delete, all owner-scoped. Forced password change on the seeded admin.

**Done when:** a second user cannot read or write the first user's projects, verified by a
test that asserts `404` and not `403` on a foreign project id. *(404 rather than 403: do
not confirm the existence of resources the caller cannot see.)*

### M2 — The stage, on real data

Character extracted to `/public/assets`. Stage mounted in a React page. Project loads from
`GET /api/projects/:id`, saves through the existing adapter to `PUT`, with the 409 path
handled.

**Done when:** open a project, move a camera, reload the page, and the camera is where it
was left. And: open the same project in two tabs, save in both, and the second gets a
conflict dialogue rather than silently winning.

### M3 — Assets

Presigned upload, asset rows, signed reads. Reference photographs on places and
characters, uploaded and displayed.

**Done when:** a 6 MB JPEG dropped on a location appears as a thumbnail, is stored in R2
at ≤1024 px, and is not reachable by an unauthenticated GET on the bucket.

### M4 — The pipeline

All seven stages through `/api/ai/:stage`. Prompts ported verbatim. Zod validation, one
retry, quota, call logging. Web search on world, scout and casting, with sources
persisted.

**Done when:** a pasted story produces blocked 3D scenes end to end, **and** grepping the
client bundle for `ANTHROPIC` and for `sk-ant` returns nothing.

### M5 — Deliverables

Printable storyboard, CSV shot list with in/out timecode, SRT subtitles, bulk frame zip.
The existing glTF, MP4 and JSON exports keep working.

**Done when:** a producer can be handed a PDF, a 1st AD a CSV, and an editor an SRT,
none of them opening the app.

### M5b — Generation

Image and voice generation behind the server proxy, per-shot and per-scene, with an
activity log recording what was made, what failed and why, and what it cost.

**Done when:** a scene generation that dies at shot five of eight leaves a readable record
of the four that succeeded and the reason the fifth stopped — and a second attempt does not
regenerate the four.

### M6 — Sign-off

Revisions freeze a project. Share links reach a read-only board with no account. Frame
comments, resolve, approve. Activity trail.

**Done when:** a logged-out browser can open a share link, comment on shot 7, and the
owner sees it attributed and timestamped.

---

## 13. What "high standards" means here

Concretely, so it can be checked:

- **TypeScript strict everywhere except `/stage`.** No `any` at a module boundary. `as`
  only with a comment saying why the compiler cannot know.
- **Zod at every boundary** — request bodies, AI responses, environment. Parse, do not
  cast.
- **No secret in a client bundle.** Enforced in CI, not by convention.
- **Every index has a stated reason.** If a query does not exist for it, drop it.
- **Errors are values.** No swallowed `catch`. If a failure is genuinely ignorable, the
  catch block says why in a comment.
- **Tests where the cost of being wrong is high**, not everywhere. Specifically: the
  camera solver's framing maths, the coverage report, the concurrency path, permission
  scoping. These have all had real bugs — a 4× error in shot sizing survived weeks
  because nothing checked it against optics.
- **Migrations are files.** No `push` outside local.
- **Commits explain why.** A commit that says "fix bug" is a defect.
- **Every destructive action is undoable.** Reorder, trim, delete, and anything that
  removes generated work. This was got wrong once: an editing timeline shipped with no
  undo, which is a safety regression rather than a missing feature.
- **Ask which scope a value belongs to before adding it.** See §5.

---

## 14. Things already learned, so they are not relearned

These cost real time in the prototype. They are listed because an agent rebuilding this
will hit each of them.

- **Measure the rig, never assume it.** Bone naming, axis convention, unit scale and joint
  bend direction all vary between exporters. Every assumption made about the bundled
  character turned out wrong on it. Where a value can be measured at load, measure it.
- **Anything that moves must be a pure function of timeline position.** Accumulating
  frame deltas is why the preview and the render disagree in most tools.
- **Hit testing must follow whatever changes what is on screen.** Culled walls and
  standing-height capsules on seated people both produced clicks landing on the wrong
  object.
- **`SIZE_FRAC` is subject height over frame height.** A close-up is a 0.70 m frame on a
  1.75 m person — a ratio of **2.5**, not 0.88. Getting this wrong put every solved camera
  four times too far back.
- **The control that hides a thing cannot live inside the thing.**
- **A value that names a character cannot be a global preference.** Voices were stored
  globally and would have followed the user into a film those characters are not in.
- **Deleting a thing must clean up what only it referenced.** Removing a shot left its
  camera in the scene forever — exported, listed, belonging to nothing. Prune only what the
  deletion orphaned; a camera someone placed deliberately is not rubbish.
- **A check that cannot fail is worse than no check.** A verification script shipped that
  reported success on a file with two missing functions, because its own comment stripper
  was swallowing the file. Watch a check fail on purpose before trusting it.
- **A stubbed DOM is not a DOM.** Building elements with `div.innerHTML` silently drops
  `<tr>`, `<td>` and `<tbody>`; a proxy-based test harness cannot see that, because it
  never parses HTML.

---

## 15. Open questions for the product owner

Do not guess these.

1. **Plans and quota.** What does a free tier get? AI calls per day, projects, storage?
2. **Team accounts** — are projects owned by a user or an organisation? This changes the
   schema and is expensive to retrofit. Decide before M1.
3. **Template projects** — should users be able to publish their own?
4. **Retention** — how long do deleted projects and their R2 objects survive?
5. **Region** — Turso and R2 placement. The user base is India and Mexico; a single US
   region will be felt.
