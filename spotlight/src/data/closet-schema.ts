import { legacyColorsToItemColors } from '@/core';

import type { SqlDatabase } from './sql-database';

export const CLOSET_DATABASE_NAME = 'spotlight.db';

/**
 * One schema step: SQL statements, or an async function for steps that need
 * code (data conversion, checks). Either way the runner wraps it, and the
 * version bump, in one transaction. A function must use only `db` and must
 * not BEGIN, COMMIT, or ROLLBACK itself.
 */
export type ClosetMigration = string | ((db: SqlDatabase) => Promise<void>);

/**
 * Migration 3: an item's photos move to their own table (one row per angle),
 * and each existing item's single photo becomes its front, primary photo.
 *
 * `image_uri` is dropped with ALTER TABLE ... DROP COLUMN (SQLite >= 3.35.0;
 * expo-sqlite 57 bundles 3.50.3 on iOS and Android, see
 * sqlite-version.test.ts). The table is NOT rebuilt by create/copy/drop/rename:
 * with foreign keys on, dropping clothing_items would cascade-delete every
 * item_tags row.
 *
 * Constraints back up the rules in core/photo-set.ts: one front, one back at
 * most, one primary, and unique positions per item. Detail and total limits
 * are checked by the repository only. The role CHECK lists today's roles; a
 * new role means rebuilding item_photos, which is safe because no table
 * references it.
 *
 * Gate 2's background-removed cutout is per photo, so it belongs here:
 * `ALTER TABLE item_photos ADD COLUMN cutout_path TEXT` (nullable), not a
 * column on clothing_items.
 */
const ITEM_PHOTOS_SQL = `CREATE TABLE item_photos (
     id TEXT PRIMARY KEY NOT NULL,
     item_id TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('front', 'back', 'detail')),
     storage_path TEXT NOT NULL,
     sort_order INTEGER NOT NULL,
     is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1))
   );
   CREATE UNIQUE INDEX item_photos_by_item ON item_photos (item_id, sort_order);
   CREATE UNIQUE INDEX item_photos_one_primary ON item_photos (item_id) WHERE is_primary = 1;
   CREATE UNIQUE INDEX item_photos_one_front ON item_photos (item_id) WHERE role = 'front';
   CREATE UNIQUE INDEX item_photos_one_back ON item_photos (item_id) WHERE role = 'back';
   INSERT INTO item_photos (id, item_id, role, storage_path, sort_order, is_primary)
     SELECT id || '-front', id, 'front', image_uri, 0, 1 FROM clothing_items;
   ALTER TABLE clothing_items DROP COLUMN image_uri;`;

async function migrateToItemPhotos(db: SqlDatabase): Promise<void> {
  await db.execAsync(ITEM_PHOTOS_SQL);
  // Refuse to finish (and roll back) if any item ended up without its photo.
  const row = await db.getFirstAsync<{ missing: number }>(
    `SELECT COUNT(*) AS missing FROM clothing_items c
      WHERE NOT EXISTS (SELECT 1 FROM item_photos p WHERE p.item_id = c.id AND p.role = 'front' AND p.is_primary = 1)`,
    [],
  );
  const missing = Number(row?.missing ?? 0);
  if (missing !== 0) throw new Error(`photo migration left ${missing} items without a front photo`);
}

/**
 * Migration 5: an item's colors move from free-text JSON (`clothing_items.colors`,
 * e.g. '["navy","off white"]') to palette colors in their own table, one row
 * per color, rank 0 = primary.
 *
 * Each legacy name is mapped to a palette color by `legacyColorsToItemColors`
 * (core/legacy-colors.ts: exact name, synonym, then fuzzy; a hex by CIEDE2000),
 * as source 'user'. A row whose JSON is unreadable or holds no usable name gets
 * no colors; it was already unreadable (the repository skips it) and stays so.
 *
 * Like migration 3, `colors` is dropped with ALTER TABLE ... DROP COLUMN, not a
 * table rebuild (dropping clothing_items would cascade-delete every
 * item_tags and item_photos row).
 *
 * `palette_id` has no CHECK against the palette, so adding a palette color
 * never needs a table rebuild; the repository validates ids.
 */
const ITEM_COLORS_SQL = `CREATE TABLE item_colors (
     item_id TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
     rank INTEGER NOT NULL CHECK (rank BETWEEN 0 AND 2),
     palette_id TEXT NOT NULL,
     hex TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('auto', 'user')),
     PRIMARY KEY (item_id, rank),
     UNIQUE (item_id, palette_id)
   );`;

async function migrateToItemColors(db: SqlDatabase): Promise<void> {
  await db.execAsync(ITEM_COLORS_SQL);
  const rows = await db.getAllAsync<{ id: string; colors: string }>('SELECT id, colors FROM clothing_items', []);
  let expected = 0;
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.colors);
    } catch {
      parsed = undefined;
    }
    for (const [rank, color] of legacyColorsToItemColors(parsed).entries()) {
      await db.runAsync('INSERT INTO item_colors (item_id, rank, palette_id, hex, source) VALUES (?, ?, ?, ?, ?)', [
        row.id,
        rank,
        color.paletteId,
        color.hex,
        color.source,
      ]);
      expected++;
    }
  }
  // Refuse to finish (and roll back) if any color row went missing.
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM item_colors', []);
  if (Number(count?.n ?? 0) !== expected) {
    throw new Error(`color migration wrote ${String(count?.n)} rows, expected ${expected}`);
  }
  await db.execAsync('ALTER TABLE clothing_items DROP COLUMN colors;');
}

/**
 * Migration 7: item attributes (Gate 2, D6): type, pattern, material, fit,
 * formality. One row per attribute that has a value; an item with none has
 * no rows, so existing items load with no attributes. `source` is 'auto'
 * (suggested from the photo) or 'user', like colors.
 *
 * `name` and `value` have no CHECK against the lists in
 * core/item-attributes.ts, so adding an attribute or a value never needs a
 * table rebuild; the repository validates them (a bad row makes the item
 * unreadable, like a bad color).
 */
const ITEM_ATTRIBUTES_SQL = `CREATE TABLE item_attributes (
     item_id TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     value TEXT NOT NULL,
     source TEXT NOT NULL CHECK (source IN ('auto', 'user')),
     PRIMARY KEY (item_id, name)
   );`;

/**
 * Ordered migrations. Index i upgrades user_version i to i + 1. Never edit a
 * shipped migration; append a new one.
 */
export const CLOSET_MIGRATIONS: readonly ClosetMigration[] = [
  `CREATE TABLE clothing_items (
     id TEXT PRIMARY KEY NOT NULL,
     image_uri TEXT NOT NULL,
     category TEXT NOT NULL,
     colors TEXT NOT NULL,
     seasons TEXT NOT NULL,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );`,
  // 2: user-defined style tags. `name` is the normalized tag (lowercase,
  // trimmed, single spaces; see core/tags.ts), so the primary key is the
  // case-insensitive uniqueness rule. Existing items start with no tags.
  // `position` keeps each item's tags in the order the user added them.
  // Deleting an item or a tag removes its links (needs PRAGMA foreign_keys,
  // turned on by migrateClosetDatabase for every connection).
  `CREATE TABLE tags (
     name TEXT PRIMARY KEY NOT NULL
   );
   CREATE TABLE item_tags (
     item_id TEXT NOT NULL REFERENCES clothing_items(id) ON DELETE CASCADE,
     tag_name TEXT NOT NULL REFERENCES tags(name) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     PRIMARY KEY (item_id, tag_name)
   );
   CREATE INDEX item_tags_by_tag ON item_tags (tag_name);`,
  // 3: photos per angle. See ITEM_PHOTOS_SQL.
  migrateToItemPhotos,
  // 4: one-time maintenance tasks (see maintenance-log.ts). One row per
  // finished task: `key` names the task and never changes once shipped,
  // `value` is a short summary, `updated_at` an ISO timestamp. A task with no
  // row has not finished and runs again on the next launch.
  `CREATE TABLE maintenance (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );`,
  // 5: palette colors per item. See ITEM_COLORS_SQL.
  migrateToItemColors,
  // 6: the optional item name (Gate 1.5). NULL means no name, so existing
  // items load unnamed; the repository never writes an empty string.
  `ALTER TABLE clothing_items ADD COLUMN name TEXT;`,
  // 7: item attributes (Gate 2). See ITEM_ATTRIBUTES_SQL.
  ITEM_ATTRIBUTES_SQL,
];

export const CLOSET_SCHEMA_VERSION = CLOSET_MIGRATIONS.length;

/** Thrown when the database was written by a newer app version. */
export class NewerDatabaseError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(`closet database version ${found} is newer than this app (${supported})`);
    this.name = 'NewerDatabaseError';
  }
}

/**
 * Prepares a newly opened connection and brings the database up to the latest
 * version. Safe to call on every launch; call it on every connection.
 * First turns on foreign key enforcement (a per-connection SQLite setting,
 * off by default, and ignored inside a transaction), which the tag and photo
 * tables' ON DELETE CASCADE relies on.
 * Each step and its version bump run in one transaction: if a step fails it
 * is rolled back, the database stays at the previous version, and the error
 * is rethrown. `migrations` is injectable for tests only.
 */
export async function migrateClosetDatabase(
  db: SqlDatabase,
  migrations: readonly ClosetMigration[] = CLOSET_MIGRATIONS,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  if (current > migrations.length) throw new NewerDatabaseError(current, migrations.length);
  for (let version = current; version < migrations.length; version++) {
    await db.execAsync('BEGIN;');
    try {
      const step = migrations[version];
      if (typeof step === 'string') {
        await db.execAsync(`${step}\nPRAGMA user_version = ${version + 1};`);
      } else {
        await step(db);
        await db.execAsync(`PRAGMA user_version = ${version + 1};`);
      }
      await db.execAsync('COMMIT;');
    } catch (error) {
      // Leave no open transaction behind, or every later write would join it.
      await db.execAsync('ROLLBACK;').catch(() => undefined);
      throw error;
    }
  }
}

/**
 * Wraps a failure from opening or migrating the database, so the app's
 * database error screen can tell it apart from unrelated render errors.
 */
export class DatabaseOpenError extends Error {
  constructor(readonly original: unknown) {
    super(original instanceof Error ? original.message : String(original));
    this.name = 'DatabaseOpenError';
  }
}

/** User-facing text for a database that failed to open or migrate. */
export function describeDatabaseError(error: unknown): { title: string; detail: string } {
  if (error instanceof DatabaseOpenError) error = error.original;
  if (error instanceof NewerDatabaseError) {
    return {
      title: 'Please update Spotlight',
      detail:
        'Your closet was saved by a newer version of the app. Update the app to open it. Nothing was changed.',
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    title: 'Could not open your closet',
    detail: `The closet database failed to open, so nothing was changed. Restart the app to try again. (${message})`,
  };
}
