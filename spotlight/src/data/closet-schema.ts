import type { SqlDatabase } from './sql-database';

export const CLOSET_DATABASE_NAME = 'spotlight.db';

/**
 * Ordered migrations. Index i upgrades user_version i to i + 1. Never edit a
 * shipped migration; append a new one.
 */
export const CLOSET_MIGRATIONS: readonly string[] = [
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
 * off by default, and ignored inside a transaction), which the tag tables'
 * ON DELETE CASCADE relies on.
 * Each step and its version bump run in one transaction: if a step fails it
 * is rolled back, the database stays at the previous version, and the error
 * is rethrown. `migrations` is injectable for tests only.
 */
export async function migrateClosetDatabase(
  db: SqlDatabase,
  migrations: readonly string[] = CLOSET_MIGRATIONS,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  const current = row?.user_version ?? 0;
  if (current > migrations.length) throw new NewerDatabaseError(current, migrations.length);
  for (let version = current; version < migrations.length; version++) {
    await db.execAsync('BEGIN;');
    try {
      await db.execAsync(`${migrations[version]}\nPRAGMA user_version = ${version + 1};`);
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
