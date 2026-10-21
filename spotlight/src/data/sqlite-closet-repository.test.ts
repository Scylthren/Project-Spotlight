import { describeClosetRepositoryContract, makeItem } from './closet-repository.contract';
import {
  CLOSET_MIGRATIONS,
  CLOSET_SCHEMA_VERSION,
  DatabaseOpenError,
  NewerDatabaseError,
  describeDatabaseError,
  migrateClosetDatabase,
} from './closet-schema';
import { SqliteClosetRepository } from './sqlite-closet-repository';
import type { SqlDatabase, SqlValue } from './sql-database';
import { NodeSqlDatabase } from './testing/node-sql-database';
import { joinPath, makeTempDir, removeDir } from './testing/temp-dir';

const open: NodeSqlDatabase[] = [];

async function openMigrated(path?: string): Promise<NodeSqlDatabase> {
  const db = new NodeSqlDatabase(path);
  open.push(db);
  await migrateClosetDatabase(db);
  return db;
}

afterEach(() => {
  while (open.length) open.pop()!.close();
});

describeClosetRepositoryContract('SqliteClosetRepository (node:sqlite)', async () => {
  return new SqliteClosetRepository(await openMigrated());
});

describe('SqliteClosetRepository persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir('spotlight-closet-');
  });
  afterEach(() => {
    while (open.length) open.pop()!.close();
    removeDir(dir);
  });

  it('keeps items after the database is closed and reopened (app restart)', async () => {
    const file = joinPath(dir, 'spotlight.db');
    const item = makeItem({ colors: ['olive'], seasons: ['autumn', 'winter'] });

    const first = await openMigrated(file);
    await new SqliteClosetRepository(first).add(item);
    first.close();
    open.length = 0;

    // Second launch: migrations run again and must not drop data.
    const second = await openMigrated(file);
    expect(await new SqliteClosetRepository(second).list()).toEqual([item]);
  });

  it('keeps edits and deletions after a restart', async () => {
    const file = joinPath(dir, 'spotlight.db');
    const first = await openMigrated(file);
    const repo = new SqliteClosetRepository(first);
    await repo.add(makeItem({ id: 'edited' }));
    await repo.add(makeItem({ id: 'deleted' }));
    const edited = makeItem({
      id: 'edited',
      colors: ['teal'],
      seasons: ['winter'],
      imageUri: 'closet-images/edited-2.jpg',
      updatedAt: '2026-04-01T00:00:00.000Z',
    });
    await repo.update(edited);
    await repo.remove('deleted');
    first.close();
    open.length = 0;

    const second = await openMigrated(file);
    const reopened = new SqliteClosetRepository(second);
    expect(await reopened.list()).toEqual([edited]);
    expect(await reopened.get('deleted')).toBeNull();
  });
});

describe('migrateClosetDatabase', () => {
  it('sets user_version and is idempotent', async () => {
    const db = await openMigrated();
    await migrateClosetDatabase(db);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({
      user_version: CLOSET_SCHEMA_VERSION,
    });
  });

  it('refuses a database from a newer app version', async () => {
    const db = new NodeSqlDatabase();
    open.push(db);
    await db.execAsync(`PRAGMA user_version = ${CLOSET_SCHEMA_VERSION + 1}`);
    await expect(migrateClosetDatabase(db)).rejects.toThrow(/newer than this app/);
    await expect(migrateClosetDatabase(db)).rejects.toBeInstanceOf(NewerDatabaseError);
  });

  it('rolls back a failed step, stays at the previous version, and leaves no open transaction', async () => {
    const db = new NodeSqlDatabase();
    open.push(db);
    const migrations = [
      'CREATE TABLE first_step (x TEXT);',
      // Creates a table, then fails: the table must not survive.
      'CREATE TABLE second_step (y TEXT); INSERT INTO no_such_table VALUES (1);',
    ];
    await expect(migrateClosetDatabase(db, migrations)).rejects.toThrow(/no_such_table/);

    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      [],
    );
    expect(tables.map((t) => t.name)).toEqual(['first_step']);
    // A dangling transaction would make this BEGIN fail.
    await expect(db.execAsync('BEGIN; COMMIT;')).resolves.toBeUndefined();

    // A fixed migration list then completes from where it stopped.
    await migrateClosetDatabase(db, [migrations[0], 'CREATE TABLE second_step (y TEXT);']);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
  });

  it('uses the real migration list by default', () => {
    expect(CLOSET_SCHEMA_VERSION).toBe(CLOSET_MIGRATIONS.length);
  });
});

describe('migration 2: tags', () => {
  const V1_ROW = [
    'old-1',
    'closet-images/old-1-a.jpg',
    'top',
    '["navy"]',
    '["summer"]',
    '2025-12-01T00:00:00.000Z',
    '2025-12-02T00:00:00.000Z',
  ];

  async function openAtVersion1(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 1));
    await db.runAsync(
      `INSERT INTO clothing_items (id, image_uri, category, colors, seasons, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      V1_ROW,
    );
    return db;
  }

  it('upgrades a version 1 database with items: they keep every field and get no tags', async () => {
    const db = await openAtVersion1();
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });

    await migrateClosetDatabase(db);

    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
    const repo = new SqliteClosetRepository(db);
    expect(await repo.list()).toEqual([
      {
        id: 'old-1',
        imageUri: 'closet-images/old-1-a.jpg',
        category: 'top',
        colors: ['navy'],
        seasons: ['summer'],
        tags: [],
        createdAt: '2025-12-01T00:00:00.000Z',
        updatedAt: '2025-12-02T00:00:00.000Z',
      },
    ]);
    expect(await repo.listTags()).toEqual([]);
    // The upgraded item can be tagged like any other.
    await repo.update({ ...(await repo.get('old-1'))!, tags: ['90s'] });
    expect((await repo.get('old-1'))?.tags).toEqual(['90s']);
  });

  it('upgrades a file database across a restart', async () => {
    const dir = makeTempDir('spotlight-upgrade-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      (await openAtVersion1(file)).close();
      open.length = 0;
      const db = await openMigrated(file);
      expect((await new SqliteClosetRepository(db).get('old-1'))?.tags).toEqual([]);
    } finally {
      while (open.length) open.pop()!.close();
      removeDir(dir);
    }
  });

  it('a failed tag migration leaves version 1 and its rows intact', async () => {
    const db = await openAtVersion1();
    await expect(
      migrateClosetDatabase(db, [CLOSET_MIGRATIONS[0], `${CLOSET_MIGRATIONS[1]}\nSELECT * FROM no_such_table;`]),
    ).rejects.toThrow(/no_such_table/);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      [],
    );
    expect(tables.map((t) => t.name)).toEqual(['clothing_items']);
    expect(await db.getAllAsync('SELECT id FROM clothing_items', [])).toEqual([{ id: 'old-1' }]);
  });

  it('turns on foreign keys for the connection', async () => {
    const db = await openMigrated();
    expect(await db.getFirstAsync('PRAGMA foreign_keys', [])).toEqual({ foreign_keys: 1 });
  });

  it('cascades: deleting an item or a tag in SQL removes their links', async () => {
    const db = await openMigrated();
    const repo = new SqliteClosetRepository(db);
    await repo.add(makeItem({ id: 'a', tags: ['emo', 'work'] }));
    await repo.add(makeItem({ id: 'b', tags: ['emo'] }));

    // Raw deletes that bypass the repository's own link cleanup.
    await db.runAsync('DELETE FROM clothing_items WHERE id = ?', ['a']);
    expect(await db.getAllAsync('SELECT item_id, tag_name FROM item_tags ORDER BY item_id, tag_name', [])).toEqual([
      { item_id: 'b', tag_name: 'emo' },
    ]);
    await db.runAsync('DELETE FROM tags WHERE name = ?', ['emo']);
    expect(await db.getAllAsync('SELECT * FROM item_tags', [])).toEqual([]);
    expect((await repo.get('b'))?.tags).toEqual([]);
  });

  it('refuses links to a missing item or tag', async () => {
    const db = await openMigrated();
    await expect(
      db.runAsync('INSERT INTO item_tags (item_id, tag_name, position) VALUES (?, ?, ?)', ['ghost', 'x', 0]),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});

/** Wraps a database so the first statement matching `pattern` fails. */
function failingOn(db: SqlDatabase, pattern: RegExp): SqlDatabase {
  let failed = false;
  return {
    execAsync: (source) => db.execAsync(source),
    getAllAsync: (source, params) => db.getAllAsync(source, params),
    getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    runAsync: async (source: string, params: SqlValue[]) => {
      if (!failed && pattern.test(source)) {
        failed = true;
        throw new Error('disk I/O error');
      }
      return db.runAsync(source, params);
    },
  };
}

describe('SqliteClosetRepository transactions', () => {
  it('add is all or nothing: a failed tag link leaves no item and no new tags', async () => {
    const db = await openMigrated();
    const repo = new SqliteClosetRepository(failingOn(db, /INSERT INTO item_tags/));
    await expect(repo.add(makeItem({ tags: ['emo', 'work'] }))).rejects.toThrow('disk I/O error');
    expect(await repo.list()).toEqual([]);
    expect(await repo.listTags()).toEqual([]);
    // No transaction was left open, and the repository still works.
    await repo.add(makeItem({ tags: ['emo'] }));
    expect((await repo.get('item-1'))?.tags).toEqual(['emo']);
  });

  it('update is all or nothing: a failure keeps the old fields and tags', async () => {
    const db = await openMigrated();
    const original = makeItem({ tags: ['emo', 'work'] });
    await new SqliteClosetRepository(db).add(original);
    const repo = new SqliteClosetRepository(failingOn(db, /INSERT OR IGNORE INTO tags/));
    await expect(repo.update(makeItem({ colors: ['red'], tags: ['y2k'] }))).rejects.toThrow('disk I/O error');
    expect(await repo.get('item-1')).toEqual(original);
    expect((await repo.listTags()).map((t) => t.name)).toEqual(['emo', 'work']);
  });

  it('deleteTag is all or nothing', async () => {
    const db = await openMigrated();
    const original = makeItem({ tags: ['emo'] });
    await new SqliteClosetRepository(db).add(original);
    const repo = new SqliteClosetRepository(failingOn(db, /DELETE FROM tags/));
    await expect(repo.deleteTag('emo')).rejects.toThrow('disk I/O error');
    expect(await repo.get('item-1')).toEqual(original);
    expect(await repo.listTags()).toEqual([{ name: 'emo', itemCount: 1 }]);
  });

  it('a failed call does not block later calls in the queue', async () => {
    const db = await openMigrated();
    const repo = new SqliteClosetRepository(db);
    const results = await Promise.allSettled([
      repo.remove('missing'),
      repo.add(makeItem()),
      repo.deleteTag('ghost'),
      repo.get('item-1'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);
    expect((results[3] as PromiseFulfilledResult<unknown>).value).toEqual(makeItem());
  });
});

describe('describeDatabaseError', () => {
  it('asks the user to update for a newer database', () => {
    expect(describeDatabaseError(new NewerDatabaseError(3, 1)).title).toBe('Please update Spotlight');
    expect(describeDatabaseError(new DatabaseOpenError(new NewerDatabaseError(3, 1))).title).toBe(
      'Please update Spotlight',
    );
  });

  it('includes the underlying message otherwise', () => {
    const { title, detail } = describeDatabaseError(new Error('disk I/O error'));
    expect(title).toBe('Could not open your closet');
    expect(detail).toContain('disk I/O error');
    expect(describeDatabaseError('weird').detail).toContain('weird');
    const wrapped = new DatabaseOpenError(new Error('database is locked'));
    expect(wrapped.message).toBe('database is locked');
    expect(describeDatabaseError(wrapped).detail).toContain('database is locked');
  });
});

describe('SqliteClosetRepository corrupt rows', () => {
  it('skips rows that are not valid items and reports their ids', async () => {
    const db = await openMigrated();
    const corrupt: string[] = [];
    const repo = new SqliteClosetRepository(db, (id) => corrupt.push(id));
    await repo.add(makeItem({ id: 'good' }));
    await db.runAsync(
      `INSERT INTO clothing_items (id, image_uri, category, colors, seasons, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['bad-json', 'a.jpg', 'top', 'not json', '["summer"]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
    );
    await db.runAsync(
      `INSERT INTO clothing_items (id, image_uri, category, colors, seasons, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['bad-category', 'a.jpg', 'hat', '["red"]', '["summer"]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
    );

    expect((await repo.list()).map((i) => i.id)).toEqual(['good']);
    expect(await repo.get('bad-json')).toBeNull();
    expect(corrupt.sort()).toEqual(['bad-category', 'bad-json', 'bad-json']);
  });
});
