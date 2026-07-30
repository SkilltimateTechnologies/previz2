import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/* ---------------------------------------------------------------------------
   Previz Stage — Turso / libSQL schema

   Shape rule: normalise what gets queried across the film, keep as JSON what is
   only ever loaded whole.

   Shots and beats are rows because coverage is a question you ask — which beats
   have no shot on them, every shot on this character, how much of the film is
   reaction. At feature length that has to be SQL, not a scan.

   Blocking is JSON because nobody queries an individual wall. A scene's set,
   cast marks and lights load and save as one unit, and shredding fifty-two
   props into fifty-two rows buys nothing.
--------------------------------------------------------------------------- */

const now = sql`(unixepoch())`;

export const projects = sqliteTable('projects', {
  id:        text('id').primaryKey(),
  ownerId:   text('owner_id').notNull(),
  name:      text('name').notNull(),
  slug:      text('slug').notNull(),
  aspect:    real('aspect').notNull().default(1.7778),
  fps:       integer('fps').notNull().default(24),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, t => ({
  byOwner: index('projects_owner').on(t.ownerId),
  slugOnce: uniqueIndex('projects_owner_slug').on(t.ownerId, t.slug),
}));

/* The written spine. One row per project; it is small and always read together. */
export const documents = sqliteTable('documents', {
  projectId:    text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  story:        text('story').notNull().default(''),
  screenplay:   text('screenplay').notNull().default(''),
  world:        text('world').notNull().default(''),
  worldSources: text('world_sources', { mode: 'json' }).$type<Source[]>().default([]),
  updatedAt:    integer('updated_at').notNull().default(now),
});

/* ---- the bible: places and cast exist once, above the scenes ---- */

export const places = sqliteTable('places', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  notes:     text('notes').notNull().default(''),
  research:  text('research').notNull().default(''),
  sources:   text('sources', { mode: 'json' }).$type<Source[]>().default([]),
  updatedAt: integer('updated_at').notNull().default(now),
}, t => ({
  byProject: index('places_project').on(t.projectId),
  nameOnce:  uniqueIndex('places_project_name').on(t.projectId, t.name),
}));

export const characters = sqliteTable('characters', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  colorIdx:  integer('color_idx'),
  notes:     text('notes').notNull().default(''),
  research:  text('research').notNull().default(''),
  sources:   text('sources', { mode: 'json' }).$type<Source[]>().default([]),
  updatedAt: integer('updated_at').notNull().default(now),
}, t => ({
  byProject: index('characters_project').on(t.projectId),
  nameOnce:  uniqueIndex('characters_project_name').on(t.projectId, t.name),
}));

/* Reference images live in object storage, never in the database. A recce set
   is tens of megabytes and libSQL is the wrong place for it. */
export const assets = sqliteTable('assets', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['place', 'character', 'shot'] }).notNull(),
  ownerId:   text('owner_id').notNull(),
  kind:      text('kind', { enum: ['photograph', 'concept', 'frame'] }).notNull(),
  key:       text('key').notNull(),          // R2 object key
  width:     integer('width'),
  height:    integer('height'),
  bytes:     integer('bytes'),
  sortIdx:   integer('sort_idx').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
}, t => ({
  byOwner: index('assets_owner').on(t.ownerKind, t.ownerId),
}));

/* ---- scenes ---- */

export const scenes = sqliteTable('scenes', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  idx:       integer('idx').notNull(),
  name:      text('name').notNull(),
  timeOfDay: text('time_of_day').notNull().default(''),
  placeId:   text('place_id').references(() => places.id, { onDelete: 'set null' }),
  notes:     text('notes').notNull().default(''),
  look:      text('look', { mode: 'json' }).$type<Look>(),
  light:     text('light', { mode: 'json' }).$type<Record<string, unknown>>(),
  env:       text('env', { mode: 'json' }).$type<Record<string, unknown>>(),

  /* set pieces, cast marks and practical lights: loaded and written as one unit */
  blocking:  text('blocking', { mode: 'json' }).$type<Blocking>(),

  updatedAt: integer('updated_at').notNull().default(now),
}, t => ({
  byProject: index('scenes_project').on(t.projectId, t.idx),
  byPlace:   index('scenes_place').on(t.placeId),
}));

/* One thing that changes. Standing up is not a beat. */
export const beats = sqliteTable('beats', {
  id:        text('id').primaryKey(),
  sceneId:   text('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  idx:       integer('idx').notNull(),
  text:      text('text').notNull(),
  speakerId: text('speaker_id').references(() => characters.id, { onDelete: 'set null' }),
  affects:   text('affects', { mode: 'json' }).$type<string[]>().default([]),
}, t => ({
  byScene: index('beats_scene').on(t.sceneId, t.idx),
}));

export const cameras = sqliteTable('cameras', {
  id:       text('id').primaryKey(),
  sceneId:  text('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  name:     text('name').notNull(),
  pos:      text('pos', { mode: 'json' }).$type<Vec3>().notNull(),
  quat:     text('quat', { mode: 'json' }).$type<Quat>(),
  lookAt:   text('look_at', { mode: 'json' }).$type<Vec3>(),
  focal:    real('focal').notNull().default(35),
  focus:    real('focus').notNull().default(4),
  aperture: real('aperture').notNull().default(0),
  shake:    real('shake').notNull().default(0.26),
  mode:     text('mode', { enum: ['static', 'follow', 'rail'] }).notNull().default('static'),
  targetId: text('target_id').references(() => characters.id, { onDelete: 'set null' }),
  railA:    text('rail_a', { mode: 'json' }).$type<Vec3>(),
  railB:    text('rail_b', { mode: 'json' }).$type<Vec3>(),
  locked:   integer('locked', { mode: 'boolean' }).notNull().default(false),
}, t => ({
  byScene: index('cameras_scene').on(t.sceneId),
}));

/* The row that earns its normalisation: everything you report on lives here. */
export const shots = sqliteTable('shots', {
  id:        text('id').primaryKey(),
  sceneId:   text('scene_id').notNull().references(() => scenes.id, { onDelete: 'cascade' }),
  idx:       integer('idx').notNull(),
  beatId:    text('beat_id').references(() => beats.id, { onDelete: 'set null' }),
  cameraId:  text('camera_id').references(() => cameras.id, { onDelete: 'set null' }),
  subjectId: text('subject_id').references(() => characters.id, { onDelete: 'set null' }),
  watchingId:text('watching_id').references(() => characters.id, { onDelete: 'set null' }),

  name:      text('name').notNull().default(''),
  purpose:   text('purpose', {
               enum: ['establish', 'statement', 'reaction', 'insert', 'punctuation'],
             }).notNull().default('statement'),
  action:    text('action').notNull().default(''),
  intent:    text('intent').notNull().default(''),

  size:      text('size', { enum: ['ECU', 'CU', 'MCU', 'MED', 'MLS', 'WIDE'] }),
  height:    text('height', { enum: ['low', 'eye', 'high'] }).default('eye'),
  side:      integer('side').notNull().default(1),
  angle:     integer('angle').notNull().default(32),
  lens:      integer('lens').notNull().default(50),
  move:      text('move', { enum: ['static', 'follow', 'rail'] }).notNull().default('static'),

  t0:        real('t0').notNull().default(0),
  t1:        real('t1').notNull().default(3),
  thumbKey:  text('thumb_key'),               // R2 key for the rendered frame
}, t => ({
  byScene:   index('shots_scene').on(t.sceneId, t.idx),
  byBeat:    index('shots_beat').on(t.beatId),
  bySubject: index('shots_subject').on(t.subjectId),
  byPurpose: index('shots_purpose').on(t.sceneId, t.purpose),
}));

/* ---------------------------------------------------------------------------
   Why the shots table looks like this

   These are the questions the app already asks in JavaScript and will not be
   able to at feature length:

     -- beats nobody shot
     SELECT b.* FROM beats b
     LEFT JOIN shots s ON s.beat_id = b.id
     WHERE b.scene_id = ? AND s.id IS NULL;

     -- how much of the film is reaction
     SELECT purpose, COUNT(*), SUM(t1 - t0) FROM shots
     JOIN scenes ON scenes.id = shots.scene_id
     WHERE scenes.project_id = ? GROUP BY purpose;

     -- every shot on one character, across the film
     SELECT scenes.idx, shots.* FROM shots
     JOIN scenes ON scenes.id = shots.scene_id
     WHERE shots.subject_id = ? ORDER BY scenes.idx, shots.idx;

     -- scenes that share a standing set
     SELECT places.name, COUNT(*) FROM scenes
     JOIN places ON places.id = scenes.place_id
     WHERE scenes.project_id = ? GROUP BY places.id HAVING COUNT(*) > 1;
--------------------------------------------------------------------------- */

/* ---- for the sign-off layer, when it comes ---- */

export const revisions = sqliteTable('revisions', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  label:     text('label').notNull(),           // "v3"
  status:    text('status', { enum: ['draft', 'review', 'approved'] }).notNull().default('draft'),
  snapshot:  text('snapshot', { mode: 'json' }),// whole project, frozen
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull().default(now),
}, t => ({
  byProject: index('revisions_project').on(t.projectId, t.createdAt),
}));

export const comments = sqliteTable('comments', {
  id:         text('id').primaryKey(),
  projectId:  text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revisionId: text('revision_id').references(() => revisions.id, { onDelete: 'cascade' }),
  shotId:     text('shot_id').references(() => shots.id, { onDelete: 'cascade' }),
  author:     text('author').notNull(),          // a client need not have an account
  body:       text('body').notNull(),
  resolved:   integer('resolved', { mode: 'boolean' }).notNull().default(false),
  createdAt:  integer('created_at').notNull().default(now),
}, t => ({
  byShot:    index('comments_shot').on(t.shotId),
  byProject: index('comments_project').on(t.projectId, t.createdAt),
}));

/* ---- types ---- */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Source = { url: string; title: string };
export type Look = {
  exposure: number; contrast: number; sat: number;
  vig: number; grain: number; ca: number;
};
export type Blocking = {
  props: unknown[];     // set pieces with transforms, wall openings, travel paths
  cast:  unknown[];     // marks: position, facing, pose, seat height, gait, path, watch
  lights: unknown[];    // practicals
};

export type Project   = typeof projects.$inferSelect;
export type Scene     = typeof scenes.$inferSelect;
export type Shot      = typeof shots.$inferSelect;
export type Beat      = typeof beats.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type Place     = typeof places.$inferSelect;
