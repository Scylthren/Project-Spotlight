import { describeClosetRepositoryContract, makeColor, makeItem, makePhoto } from './closet-repository.contract';
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
    const item = makeItem({ colors: [makeColor('olive'), makeColor('cream', { hex: '#F4EEDD', source: 'auto' })], seasons: ['autumn', 'winter'] });

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
      colors: [makeColor('teal', { source: 'auto', hex: '#007F80' })],
      seasons: ['winter'],
      photos: [
        makePhoto('edited', { id: 'edited-new-front', path: 'closet-images/edited-2.jpg' }),
        makePhoto('edited', { sortOrder: 1, role: 'detail' }),
      ],
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

    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 2));

    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
    expect(await db.getAllAsync('SELECT * FROM clothing_items', [])).toEqual([
      {
        id: 'old-1',
        image_uri: 'closet-images/old-1-a.jpg',
        category: 'top',
        colors: '["navy"]',
        seasons: '["summer"]',
        created_at: '2025-12-01T00:00:00.000Z',
        updated_at: '2025-12-02T00:00:00.000Z',
      },
    ]);
    expect(await db.getAllAsync('SELECT * FROM item_tags', [])).toEqual([]);

    // The rest of the chain (photos, maintenance, colors) runs on the same database, as on a real device.
    await migrateClosetDatabase(db);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
    const repo = new SqliteClosetRepository(db);
    expect(await repo.list()).toEqual([
      {
        id: 'old-1',
        photos: [
          { id: 'old-1-front', role: 'front', path: 'closet-images/old-1-a.jpg', sortOrder: 0, isPrimary: true },
        ],
        category: 'top',
        colors: [{ paletteId: 'navy', hex: '#202A60', source: 'user' }],
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

  it('add is all or nothing: a failed photo row leaves no item, no photos, and no tags', async () => {
    const db = await openMigrated();
    const failing = new SqliteClosetRepository(failingOn(db, /INSERT INTO item_photos/));
    const photos = [makePhoto('item-1'), makePhoto('item-1', { sortOrder: 1, role: 'back' })];
    await expect(failing.add(makeItem({ photos, tags: ['emo'] }))).rejects.toThrow('disk I/O error');
    expect(await failing.list()).toEqual([]);
    expect(await failing.listTags()).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM item_photos', [])).toEqual([]);
  });

  it('update is all or nothing: a failed photo row keeps the old photo list', async () => {
    const db = await openMigrated();
    const original = makeItem({ photos: [makePhoto('item-1'), makePhoto('item-1', { sortOrder: 1, role: 'detail' })] });
    await new SqliteClosetRepository(db).add(original);
    const repo = new SqliteClosetRepository(failingOn(db, /INSERT INTO item_photos/));
    await expect(repo.update(makeItem({ colors: [makeColor('red')] }))).rejects.toThrow('disk I/O error');
    expect(await repo.get('item-1')).toEqual(original);
  });

  it('update is all or nothing: a failure keeps the old fields and tags', async () => {
    const db = await openMigrated();
    const original = makeItem({ tags: ['emo', 'work'] });
    await new SqliteClosetRepository(db).add(original);
    const repo = new SqliteClosetRepository(failingOn(db, /INSERT OR IGNORE INTO tags/));
    await expect(repo.update(makeItem({ colors: [makeColor('red')], tags: ['y2k'] }))).rejects.toThrow('disk I/O error');
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
    const RED: [number, string, string, string] = [0, 'red', '#C8102E', 'user'];
    const insertRow = async (
      id: string,
      category: string,
      seasons: string,
      photo: boolean,
      role = 'front',
      colors: [number, string, string, string][] = [RED],
    ) => {
      await db.runAsync(
        `INSERT INTO clothing_items (id, category, seasons, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, category, seasons, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
      );
      if (photo) {
        await db.runAsync(
          `INSERT INTO item_photos (id, item_id, role, storage_path, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)`,
          [`${id}-p`, id, role, 'a.jpg', 0, 1],
        );
      }
      for (const [rank, paletteId, hex, source] of colors) {
        await db.runAsync('INSERT INTO item_colors (item_id, rank, palette_id, hex, source) VALUES (?, ?, ?, ?, ?)', [
          id,
          rank,
          paletteId,
          hex,
          source,
        ]);
      }
    };
    await insertRow('bad-json', 'top', 'not json', true);
    await insertRow('bad-category', 'hat', '["summer"]', true);
    // A valid row whose photo set breaks the rules: no photos, or no front.
    await insertRow('no-photos', 'top', '["summer"]', false);
    await insertRow('no-front', 'top', '["summer"]', true, 'detail');
    // A valid row whose colors break the rules: none, an unknown palette id
    // (the table accepts any id), a lowercase hex, or no primary (rank 0).
    await insertRow('no-colors', 'top', '["summer"]', true, 'front', []);
    await insertRow('bad-color', 'top', '["summer"]', true, 'front', [[0, 'ultraviolet', '#5500FF', 'user']]);
    await insertRow('bad-hex', 'top', '["summer"]', true, 'front', [[0, 'red', '#c8102e', 'user']]);
    await insertRow('color-gap', 'top', '["summer"]', true, 'front', [[1, 'red', '#C8102E', 'user']]);

    expect((await repo.list()).map((i) => i.id)).toEqual(['good']);
    expect(await repo.get('bad-json')).toBeNull();
    expect(await repo.get('no-front')).toBeNull();
    expect(await repo.get('color-gap')).toBeNull();
    expect(corrupt.sort()).toEqual([
      'bad-category',
      'bad-color',
      'bad-hex',
      'bad-json',
      'bad-json',
      'color-gap',
      'color-gap',
      'no-colors',
      'no-front',
      'no-front',
      'no-photos',
    ]);
  });
});

describe('migrateClosetDatabase with function steps', () => {
  it('runs an async step and bumps the version', async () => {
    const db = new NodeSqlDatabase();
    open.push(db);
    await migrateClosetDatabase(db, [
      'CREATE TABLE t (x TEXT);',
      async (d) => {
        await d.runAsync('INSERT INTO t (x) VALUES (?)', ['from code']);
      },
    ]);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
    expect(await db.getAllAsync('SELECT x FROM t', [])).toEqual([{ x: 'from code' }]);
  });

  it('rolls back everything an async step did if it throws, and leaves no open transaction', async () => {
    const db = new NodeSqlDatabase();
    open.push(db);
    const steps = [
      'CREATE TABLE t (x TEXT);',
      async (d: SqlDatabase) => {
        await d.execAsync('CREATE TABLE u (y TEXT);');
        await d.runAsync('INSERT INTO t (x) VALUES (?)', ['partial']);
        throw new Error('step failed');
      },
    ];
    await expect(migrateClosetDatabase(db, steps)).rejects.toThrow('step failed');
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 1 });
    expect(await db.getAllAsync('SELECT x FROM t', [])).toEqual([]);
    expect(await db.getAllAsync("SELECT name FROM sqlite_master WHERE name = 'u'", [])).toEqual([]);
    await expect(db.execAsync('BEGIN; COMMIT;')).resolves.toBeUndefined();
  });
});

describe('migration 3: photos', () => {
  const V2_ITEMS = [
    ['old-a', 'closet-images/old-a-x1.jpg', 'top', '["navy"]', '["summer"]', '2025-11-01T00:00:00.000Z', '2025-11-03T00:00:00.000Z'],
    ['old-b', 'file:///abs/old-b.heic', 'shoes', '["red","white"]', '["winter","autumn"]', '2025-12-01T09:00:00+05:30', '2025-12-01T09:00:00+05:30'],
    ['old-c', 'closet-images/old-c-y2.jpg', 'dress', '["black"]', '["spring"]', '2025-12-05T00:00:00.000Z', '2025-12-06T00:00:00.000Z'],
  ];
  const V2_TAGS: [string, string, number][] = [
    ['old-a', 'work', 0],
    ['old-a', '90s', 1],
    ['old-c', 'emo', 0],
  ];

  /** A real version 2 database (items and tags written by v2 SQL), optionally in a file. */
  async function openAtVersion2(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 2));
    for (const row of V2_ITEMS) {
      await db.runAsync(
        `INSERT INTO clothing_items (id, image_uri, category, colors, seasons, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row,
      );
    }
    for (const name of ['90s', 'emo', 'work', 'unused']) {
      await db.runAsync('INSERT INTO tags (name) VALUES (?)', [name]);
    }
    for (const link of V2_TAGS) {
      await db.runAsync('INSERT INTO item_tags (item_id, tag_name, position) VALUES (?, ?, ?)', link);
    }
    return db;
  }

  async function columns(db: SqlDatabase, table: string): Promise<string[]> {
    return (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`, [])).map((c) => c.name);
  }

  async function tableNames(db: SqlDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      [],
    );
    return rows.map((r) => r.name);
  }

  const tagRows = (db: SqlDatabase) =>
    db.getAllAsync('SELECT item_id, tag_name, position FROM item_tags ORDER BY item_id, position', []);

  it('upgrades a real v2 file database: one front, primary photo per item, image_uri gone, tags and every field intact', async () => {
    const dir = makeTempDir('spotlight-v2-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      const v2 = await openAtVersion2(file);
      expect(await v2.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
      const tagsBefore = await tagRows(v2);
      expect(tagsBefore).toHaveLength(3);
      v2.close();
      open.length = 0;

      // Next launch with the version 3 app.
      const db = new NodeSqlDatabase(file);
      open.push(db);
      await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 3));
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 3 });

      expect(await columns(db, 'clothing_items')).toEqual(['id', 'category', 'colors', 'seasons', 'created_at', 'updated_at']);
      expect(await db.getAllAsync('SELECT COUNT(*) AS n FROM clothing_items', [])).toEqual([{ n: V2_ITEMS.length }]);
      expect(await db.getAllAsync('SELECT * FROM item_photos ORDER BY item_id', [])).toEqual(
        V2_ITEMS.map(([id, uri]) => ({
          id: `${id}-front`,
          item_id: id,
          role: 'front',
          storage_path: uri,
          sort_order: 0,
          is_primary: 1,
        })),
      );
      // The tag rows were not touched (no cascade from rebuilding clothing_items).
      expect(await tagRows(db)).toEqual(tagsBefore);

      // The rest of the chain (maintenance, colors) on the same file.
      await migrateClosetDatabase(db);
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
      expect(await tagRows(db)).toEqual(tagsBefore);
      const repo = new SqliteClosetRepository(db);
      const items = await repo.list();
      expect(items.map((i) => i.id)).toEqual(['old-c', 'old-b', 'old-a']);
      expect(await repo.get('old-a')).toEqual({
        id: 'old-a',
        photos: [{ id: 'old-a-front', role: 'front', path: 'closet-images/old-a-x1.jpg', sortOrder: 0, isPrimary: true }],
        category: 'top',
        colors: [{ paletteId: 'navy', hex: '#202A60', source: 'user' }],
        seasons: ['summer'],
        tags: ['work', '90s'],
        createdAt: '2025-11-01T00:00:00.000Z',
        updatedAt: '2025-11-03T00:00:00.000Z',
      });
      expect((await repo.get('old-b'))?.photos[0].path).toBe('file:///abs/old-b.heic');
      expect((await repo.get('old-b'))?.colors.map((c) => c.paletteId)).toEqual(['red', 'white']);
      expect((await repo.get('old-c'))?.tags).toEqual(['emo']);
      expect(await repo.listTags()).toEqual([
        { name: '90s', itemCount: 1 },
        { name: 'emo', itemCount: 1 },
        { name: 'unused', itemCount: 0 },
        { name: 'work', itemCount: 1 },
      ]);

      // Upgraded items take new angles like any other.
      const old = (await repo.get('old-a'))!;
      await repo.update({ ...old, photos: [...old.photos, makePhoto('old-a', { sortOrder: 1, role: 'back' })] });
      expect((await repo.get('old-a'))?.photos.map((p) => p.role)).toEqual(['front', 'back']);
    } finally {
      while (open.length) open.pop()!.close();
      removeDir(dir);
    }
  });

  it('a failure in migration 3 rolls back to an intact v2 database, and a later launch upgrades it', async () => {
    const db = await openAtVersion2();
    const tagsBefore = await tagRows(db);
    const itemsBefore = await db.getAllAsync('SELECT * FROM clothing_items ORDER BY id', []);
    const realStep = CLOSET_MIGRATIONS[2];
    if (typeof realStep !== 'function') throw new Error('migration 3 is expected to be a function step');

    // The real step runs to the end (table created, rows copied, column dropped), then the step fails.
    await expect(
      migrateClosetDatabase(db, [
        ...CLOSET_MIGRATIONS.slice(0, 2),
        async (d) => {
          await realStep(d);
          throw new Error('crash after the photo step');
        },
      ]),
    ).rejects.toThrow('crash after the photo step');

    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
    expect(await tableNames(db)).toEqual(['clothing_items', 'item_tags', 'tags']);
    expect(await columns(db, 'clothing_items')).toContain('image_uri');
    expect(await db.getAllAsync('SELECT * FROM clothing_items ORDER BY id', [])).toEqual(itemsBefore);
    expect(await tagRows(db)).toEqual(tagsBefore);
    await expect(db.execAsync('BEGIN; COMMIT;')).resolves.toBeUndefined();

    await migrateClosetDatabase(db);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
    expect(await new SqliteClosetRepository(db).list()).toHaveLength(V2_ITEMS.length);
  });

  it('a failing statement inside migration 3 also rolls back', async () => {
    const db = await openAtVersion2();
    const failing: SqlDatabase = {
      ...db,
      execAsync: async (source) => {
        if (source.includes('DROP COLUMN')) {
          // Run the step's SQL up to the DROP, then fail like a disk error would.
          await db.execAsync(source.slice(0, source.indexOf('ALTER TABLE')));
          throw new Error('disk I/O error');
        }
        await db.execAsync(source);
      },
      runAsync: (source, params) => db.runAsync(source, params),
      getAllAsync: (source, params) => db.getAllAsync(source, params),
      getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    };
    await expect(migrateClosetDatabase(failing)).rejects.toThrow('disk I/O error');
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 2 });
    expect(await tableNames(db)).toEqual(['clothing_items', 'item_tags', 'tags']);
    expect(await db.getAllAsync('SELECT COUNT(*) AS n FROM clothing_items', [])).toEqual([{ n: V2_ITEMS.length }]);
  });

  it('a fresh install reaches the latest version with the photo table and no image_uri', async () => {
    const db = await openMigrated();
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
    expect(await tableNames(db)).toEqual(['clothing_items', 'item_attributes', 'item_colors', 'item_photos', 'item_tags', 'maintenance', 'outfit_items', 'outfits', 'tags']);
    expect(await columns(db, 'clothing_items')).not.toContain('image_uri');
    expect(await columns(db, 'item_photos')).toEqual(['id', 'item_id', 'role', 'storage_path', 'sort_order', 'is_primary']);
    const indexes = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'item_photos' AND sql IS NOT NULL ORDER BY name",
      [],
    );
    expect(indexes.map((i) => i.name)).toEqual([
      'item_photos_by_item',
      'item_photos_one_back',
      'item_photos_one_front',
      'item_photos_one_primary',
    ]);
  });

  describe('item_photos constraints (raw SQL, bypassing the repository)', () => {
    async function seeded() {
      const db = await openMigrated();
      await new SqliteClosetRepository(db).add(
        makeItem({ photos: [makePhoto('item-1'), makePhoto('item-1', { sortOrder: 1, role: 'back' })] }),
      );
      const insert = (id: string, role: string, sortOrder: number, isPrimary: number, itemId = 'item-1') =>
        db.runAsync(
          'INSERT INTO item_photos (id, item_id, role, storage_path, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
          [id, itemId, role, 'x.jpg', sortOrder, isPrimary],
        );
      return { db, insert };
    }

    it('refuses a second front, back, or primary, a repeated position, and unknown values', async () => {
      const { db, insert } = await seeded();
      await expect(insert('p-front', 'front', 5, 0)).rejects.toThrow(/UNIQUE/);
      await expect(insert('p-back', 'back', 5, 0)).rejects.toThrow(/UNIQUE/);
      await expect(insert('p-primary', 'detail', 5, 1)).rejects.toThrow(/UNIQUE/);
      await expect(insert('p-order', 'detail', 1, 0)).rejects.toThrow(/UNIQUE/);
      await expect(insert('p-role', 'side', 5, 0)).rejects.toThrow(/CHECK/);
      await expect(insert('p-flag', 'detail', 5, 2)).rejects.toThrow(/CHECK/);
      await expect(insert('p-orphan', 'front', 0, 1, 'ghost')).rejects.toThrow(/FOREIGN KEY/);
      // Allowed: another detail in a free position.
      await insert('p-detail', 'detail', 2, 0);
      expect(await db.getAllAsync('SELECT COUNT(*) AS n FROM item_photos', [])).toEqual([{ n: 3 }]);
    });

    it('deleting an item in SQL cascades to its photos and leaves other items alone', async () => {
      const { db } = await seeded();
      await new SqliteClosetRepository(db).add(makeItem({ id: 'keep' }));
      await db.runAsync('DELETE FROM clothing_items WHERE id = ?', ['item-1']);
      expect(await db.getAllAsync('SELECT id, item_id FROM item_photos', [])).toEqual([
        { id: 'keep-photo-0', item_id: 'keep' },
      ]);
    });
  });
});

describe('migration 4: maintenance log', () => {
  const V3_ITEMS = [
    ['v3-a', 'top', '["navy"]', '["summer"]', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'],
    ['v3-b', 'shoes', '["red","white"]', '["winter"]', '2026-02-01T09:00:00+05:30', '2026-02-01T09:00:00+05:30'],
  ];
  const V3_PHOTOS = [
    ['v3-a-front', 'v3-a', 'front', 'closet-images/v3-a-x1.jpg', 0, 1],
    ['v3-a-back', 'v3-a', 'back', 'closet-images/v3-a-x2.jpg', 1, 0],
    ['v3-a-d1', 'v3-a', 'detail', 'closet-images/v3-a-x3.jpg', 2, 0],
    ['v3-b-front', 'v3-b', 'front', 'closet-images/v3-b-y1.jpg', 0, 1],
  ];
  const V3_TAGS: [string, string, number][] = [
    ['v3-a', 'work', 0],
    ['v3-a', 'emo', 1],
    ['v3-b', 'emo', 0],
  ];

  /** A real version 3 database: items, multi-angle photos, and tags written with v3 SQL. */
  async function openAtVersion3(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 3));
    for (const row of V3_ITEMS) {
      await db.runAsync(
        'INSERT INTO clothing_items (id, category, colors, seasons, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        row,
      );
    }
    for (const row of V3_PHOTOS) {
      await db.runAsync(
        'INSERT INTO item_photos (id, item_id, role, storage_path, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
        row,
      );
    }
    for (const name of ['emo', 'work', 'unused']) await db.runAsync('INSERT INTO tags (name) VALUES (?)', [name]);
    for (const link of V3_TAGS) {
      await db.runAsync('INSERT INTO item_tags (item_id, tag_name, position) VALUES (?, ?, ?)', link);
    }
    return db;
  }

  async function tableNames(db: SqlDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", []);
    return rows.map((r) => r.name);
  }

  /** Every row of every v3 table, to compare before and after. */
  async function snapshot(db: SqlDatabase) {
    return {
      items: await db.getAllAsync('SELECT * FROM clothing_items ORDER BY id', []),
      photos: await db.getAllAsync('SELECT * FROM item_photos ORDER BY id', []),
      tags: await db.getAllAsync('SELECT * FROM tags ORDER BY name', []),
      links: await db.getAllAsync('SELECT * FROM item_tags ORDER BY item_id, position', []),
    };
  }

  it('upgrades a real v3 file database: adds an empty maintenance table, items, photos, and tags intact', async () => {
    const dir = makeTempDir('spotlight-v3-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      const v3 = await openAtVersion3(file);
      expect(await v3.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 3 });
      const before = await snapshot(v3);
      expect(before.photos).toHaveLength(4);
      expect(before.links).toHaveLength(3);
      v3.close();
      open.length = 0;

      // Next launch with the version 4 app.
      const db = new NodeSqlDatabase(file);
      open.push(db);
      await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 4));
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 4 });
      expect(await tableNames(db)).toEqual(['clothing_items', 'item_photos', 'item_tags', 'maintenance', 'tags']);
      expect(await db.getAllAsync('SELECT * FROM maintenance', [])).toEqual([]);
      expect(await snapshot(db)).toEqual(before);

      // The rest of the chain (colors), then the repository reads every item.
      await migrateClosetDatabase(db);
      const repo = new SqliteClosetRepository(db);
      expect((await repo.list()).map((i) => [i.id, i.colors.map((c) => c.paletteId)])).toEqual([
        ['v3-b', ['red', 'white']],
        ['v3-a', ['navy']],
      ]);
      expect((await repo.get('v3-a'))?.photos.map((p) => [p.role, p.path, p.isPrimary])).toEqual([
        ['front', 'closet-images/v3-a-x1.jpg', true],
        ['back', 'closet-images/v3-a-x2.jpg', false],
        ['detail', 'closet-images/v3-a-x3.jpg', false],
      ]);
      expect((await repo.get('v3-a'))?.tags).toEqual(['work', 'emo']);
    } finally {
      while (open.length) open.pop()!.close();
      removeDir(dir);
    }
  });

  it('a failure in migration 4 rolls back to an intact v3 database, and a later launch upgrades it', async () => {
    const db = await openAtVersion3();
    const before = await snapshot(db);
    const realStep = CLOSET_MIGRATIONS[3];
    if (typeof realStep !== 'string') throw new Error('migration 4 is expected to be SQL');

    await expect(
      migrateClosetDatabase(db, [
        ...CLOSET_MIGRATIONS.slice(0, 3),
        async (d) => {
          await d.execAsync(realStep);
          throw new Error('crash after the maintenance step');
        },
      ]),
    ).rejects.toThrow('crash after the maintenance step');

    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 3 });
    expect(await tableNames(db)).toEqual(['clothing_items', 'item_photos', 'item_tags', 'tags']);
    expect(await snapshot(db)).toEqual(before);
    await expect(db.execAsync('BEGIN; COMMIT;')).resolves.toBeUndefined();

    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 4));
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 4 });
    expect(await snapshot(db)).toEqual(before);
  });

  it('a failing statement inside migration 4 also rolls back', async () => {
    const db = await openAtVersion3();
    const before = await snapshot(db);
    const failing: SqlDatabase = {
      execAsync: async (source) => {
        if (source.includes('CREATE TABLE maintenance')) {
          await db.execAsync(source.slice(0, source.indexOf('PRAGMA user_version')));
          throw new Error('disk I/O error');
        }
        await db.execAsync(source);
      },
      runAsync: (source, params) => db.runAsync(source, params),
      getAllAsync: (source, params) => db.getAllAsync(source, params),
      getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    };
    await expect(migrateClosetDatabase(failing)).rejects.toThrow('disk I/O error');
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 3 });
    expect(await tableNames(db)).not.toContain('maintenance');
    expect(await snapshot(db)).toEqual(before);
  });

  it('a fresh install reaches the latest version with the maintenance table', async () => {
    const db = await openMigrated();
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
    expect(CLOSET_SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
    const columns = await db.getAllAsync<{ name: string; notnull: number; pk: number }>('PRAGMA table_info(maintenance)', []);
    expect(columns.map((c) => [c.name, c.notnull, c.pk])).toEqual([
      ['key', 1, 1],
      ['value', 1, 0],
      ['updated_at', 1, 0],
    ]);
    await db.runAsync('INSERT INTO maintenance (key, value, updated_at) VALUES (?, ?, ?)', ['k', 'v', 't']);
    await expect(db.runAsync('INSERT INTO maintenance (key, value, updated_at) VALUES (?, ?, ?)', ['k', 'v2', 't'])).rejects.toThrow(
      /UNIQUE|PRIMARY KEY/,
    );
    await expect(db.runAsync('INSERT INTO maintenance (key, value, updated_at) VALUES (?, NULL, ?)', ['k2', 't'])).rejects.toThrow(
      /NOT NULL/,
    );
  });
});

describe('migration 5: palette colors', () => {
  /** v4 rows: [id, category, colors JSON, seasons, created_at, updated_at]. */
  const V4_ITEMS = [
    ['v4-a', 'top', '["navy","Light Blue","mustard","off white","Navy Blue","something weird"]', '["summer"]', '2026-03-01T00:00:00.000Z', '2026-03-02T00:00:00.000Z'],
    ['v4-b', 'shoes', '["off white","Navy Blue","navy","something weird"]', '["winter"]', '2026-03-03T00:00:00.000Z', '2026-03-03T00:00:00.000Z'],
    ['v4-c', 'dress', '["#000080","Gray"]', '["spring","autumn"]', '2026-03-04T09:00:00+05:30', '2026-03-04T09:00:00+05:30'],
    ['v4-d', 'accessory', '["KHAKI","maroon","olive-green","teal"]', '["autumn"]', '2026-03-05T00:00:00.000Z', '2026-03-06T00:00:00.000Z'],
    // Already unreadable at v4 (no colors, or broken JSON): kept, still unreadable.
    ['v4-empty', 'top', '[]', '["summer"]', '2026-03-07T00:00:00.000Z', '2026-03-07T00:00:00.000Z'],
    ['v4-broken', 'top', 'not json', '["summer"]', '2026-03-08T00:00:00.000Z', '2026-03-08T00:00:00.000Z'],
  ];
  const V4_PHOTOS: (string | number)[][] = [
    ['v4-a-front', 'v4-a', 'front', 'closet-images/v4-a-1.jpg', 0, 0],
    ['v4-a-back', 'v4-a', 'back', 'closet-images/v4-a-2.jpg', 1, 1],
    ['v4-a-d1', 'v4-a', 'detail', 'closet-images/v4-a-3.jpg', 2, 0],
    ['v4-b-front', 'v4-b', 'front', 'closet-images/v4-b-1.jpg', 0, 1],
    ['v4-c-front', 'v4-c', 'front', 'closet-images/v4-c-1.jpg', 0, 1],
    ['v4-d-front', 'v4-d', 'front', 'closet-images/v4-d-1.jpg', 0, 1],
    ['v4-empty-front', 'v4-empty', 'front', 'closet-images/v4-empty-1.jpg', 0, 1],
    ['v4-broken-front', 'v4-broken', 'front', 'closet-images/v4-broken-1.jpg', 0, 1],
  ];
  const V4_TAGS: [string, string, number][] = [
    ['v4-a', 'work', 0],
    ['v4-a', 'emo', 1],
    ['v4-b', 'emo', 0],
    ['v4-empty', 'work', 0],
  ];
  const MAINTENANCE_ROW = ['photo-metadata-v1', '8 photos checked', '2026-03-09T00:00:00.000Z'];

  /** Exactly what migration 5 must write, in item and rank order. */
  const EXPECTED_COLOR_ROWS = [
    ['v4-a', 0, 'navy', '#202A60'],
    ['v4-a', 1, 'sky-blue', '#87CEEB'],
    ['v4-a', 2, 'mustard', '#CDA434'],
    ['v4-b', 0, 'cream', '#F2EAD6'],
    ['v4-b', 1, 'navy', '#202A60'],
    ['v4-b', 2, 'white', '#FFFFFF'],
    ['v4-c', 0, 'navy', '#000080'],
    ['v4-c', 1, 'grey', '#808080'],
    ['v4-d', 0, 'tan', '#D2B48C'],
    ['v4-d', 1, 'burgundy', '#800020'],
    ['v4-d', 2, 'olive', '#6B6B35'],
  ].map(([item_id, rank, palette_id, hex]) => ({ item_id, rank, palette_id, hex, source: 'user' }));

  /** A real version 4 database: items with free-text colors, photos, tags, and a maintenance row, written with v4 SQL. */
  async function openAtVersion4(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 4));
    for (const row of V4_ITEMS) {
      await db.runAsync(
        'INSERT INTO clothing_items (id, category, colors, seasons, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        row,
      );
    }
    for (const row of V4_PHOTOS) {
      await db.runAsync(
        'INSERT INTO item_photos (id, item_id, role, storage_path, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
        row,
      );
    }
    for (const name of ['emo', 'work', 'unused']) await db.runAsync('INSERT INTO tags (name) VALUES (?)', [name]);
    for (const link of V4_TAGS) await db.runAsync('INSERT INTO item_tags (item_id, tag_name, position) VALUES (?, ?, ?)', link);
    await db.runAsync('INSERT INTO maintenance (key, value, updated_at) VALUES (?, ?, ?)', MAINTENANCE_ROW);
    return db;
  }

  async function tableNames(db: SqlDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", []);
    return rows.map((r) => r.name);
  }

  async function columns(db: SqlDatabase, table: string): Promise<string[]> {
    return (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`, [])).map((c) => c.name);
  }

  /** Every row of every v4 table. */
  async function snapshot(db: SqlDatabase) {
    return {
      items: await db.getAllAsync('SELECT * FROM clothing_items ORDER BY id', []),
      photos: await db.getAllAsync('SELECT * FROM item_photos ORDER BY id', []),
      tags: await db.getAllAsync('SELECT * FROM tags ORDER BY name', []),
      links: await db.getAllAsync('SELECT * FROM item_tags ORDER BY item_id, position', []),
      maintenance: await db.getAllAsync('SELECT * FROM maintenance ORDER BY key', []),
    };
  }

  const colorRows = (db: SqlDatabase) =>
    db.getAllAsync('SELECT item_id, rank, palette_id, hex, source FROM item_colors ORDER BY item_id, rank', []);

  /** The version 5 app's migrations (later ones are tested on their own). */
  const V5_MIGRATIONS = CLOSET_MIGRATIONS.slice(0, 5);

  async function openAtVersion5(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, V5_MIGRATIONS);
    return db;
  }

  it('upgrades a real v4 file database: item_colors exactly as mapped, colors column gone, photos, tags, and maintenance intact', async () => {
    const dir = makeTempDir('spotlight-v4-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      const v4 = await openAtVersion4(file);
      expect(await v4.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 4 });
      const before = await snapshot(v4);
      expect(before.photos).toHaveLength(V4_PHOTOS.length);
      expect(before.links).toHaveLength(V4_TAGS.length);
      v4.close();
      open.length = 0;

      // Next launch with the version 5 app.
      const db = await openAtVersion5(file);
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 5 });
      expect(CLOSET_SCHEMA_VERSION).toBeGreaterThanOrEqual(5);
      expect(await tableNames(db)).toEqual(['clothing_items', 'item_colors', 'item_photos', 'item_tags', 'maintenance', 'tags']);
      expect(await columns(db, 'clothing_items')).toEqual(['id', 'category', 'seasons', 'created_at', 'updated_at']);
      expect(await colorRows(db)).toEqual(EXPECTED_COLOR_ROWS);

      const after = await snapshot(db);
      // Items lost only their colors column; nothing else changed anywhere.
      expect(after.items).toEqual(before.items.map((row) => {
        const { colors: _, ...rest } = row as Record<string, unknown>;
        return rest;
      }));
      expect(after.photos).toEqual(before.photos);
      expect(after.tags).toEqual(before.tags);
      expect(after.links).toEqual(before.links);
      expect(after.maintenance).toEqual(before.maintenance);

      // The rest of the chain (name), then the repository reads every item.
      await migrateClosetDatabase(db);
      const corrupt: string[] = [];
      const repo = new SqliteClosetRepository(db, (id) => corrupt.push(id));
      expect(await repo.get('v4-a')).toEqual({
        id: 'v4-a',
        photos: [
          { id: 'v4-a-front', role: 'front', path: 'closet-images/v4-a-1.jpg', sortOrder: 0, isPrimary: false },
          { id: 'v4-a-back', role: 'back', path: 'closet-images/v4-a-2.jpg', sortOrder: 1, isPrimary: true },
          { id: 'v4-a-d1', role: 'detail', path: 'closet-images/v4-a-3.jpg', sortOrder: 2, isPrimary: false },
        ],
        category: 'top',
        colors: [
          { paletteId: 'navy', hex: '#202A60', source: 'user' },
          { paletteId: 'sky-blue', hex: '#87CEEB', source: 'user' },
          { paletteId: 'mustard', hex: '#CDA434', source: 'user' },
        ],
        seasons: ['summer'],
        tags: ['work', 'emo'],
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      });
      expect((await repo.list()).map((i) => i.id)).toEqual(['v4-d', 'v4-c', 'v4-b', 'v4-a']);
      expect(corrupt.sort()).toEqual(['v4-broken', 'v4-empty']);
      expect(await repo.listTags()).toEqual([
        { name: 'emo', itemCount: 2 },
        { name: 'unused', itemCount: 0 },
        { name: 'work', itemCount: 2 },
      ]);

      // A migrated item takes new colors like any other.
      const old = (await repo.get('v4-c'))!;
      await repo.update({ ...old, colors: [makeColor('grey'), makeColor('navy', { hex: '#000080' })] });
      expect((await repo.get('v4-c'))?.colors.map((c) => c.paletteId)).toEqual(['grey', 'navy']);

      // A second launch does nothing more.
      await migrateClosetDatabase(db);
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
    } finally {
      while (open.length) open.pop()!.close();
      removeDir(dir);
    }
  });

  async function expectIntactV4(db: SqlDatabase, before: Awaited<ReturnType<typeof snapshot>>): Promise<void> {
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 4 });
    expect(await tableNames(db)).toEqual(['clothing_items', 'item_photos', 'item_tags', 'maintenance', 'tags']);
    expect(await columns(db, 'clothing_items')).toContain('colors');
    expect(await snapshot(db)).toEqual(before);
    // No dangling transaction.
    await expect(db.execAsync('BEGIN; COMMIT;')).resolves.toBeUndefined();
  }

  it('a failure after the whole step ran rolls back to an intact v4 database, and a later launch upgrades it', async () => {
    const db = await openAtVersion4();
    const before = await snapshot(db);
    const realStep = CLOSET_MIGRATIONS[4];
    if (typeof realStep !== 'function') throw new Error('migration 5 is expected to be a function step');

    await expect(
      migrateClosetDatabase(db, [
        ...CLOSET_MIGRATIONS.slice(0, 4),
        async (d) => {
          await realStep(d);
          throw new Error('crash after the color step');
        },
      ]),
    ).rejects.toThrow('crash after the color step');
    await expectIntactV4(db, before);

    await migrateClosetDatabase(db, V5_MIGRATIONS);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 5 });
    expect(await colorRows(db)).toEqual(EXPECTED_COLOR_ROWS);
  });

  it('a failed color insert part-way through rolls back', async () => {
    const db = await openAtVersion4();
    const before = await snapshot(db);
    let inserts = 0;
    const failing: SqlDatabase = {
      execAsync: (source) => db.execAsync(source),
      runAsync: async (source, params) => {
        if (source.includes('INSERT INTO item_colors') && ++inserts === 5) throw new Error('disk I/O error');
        return db.runAsync(source, params);
      },
      getAllAsync: (source, params) => db.getAllAsync(source, params),
      getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    };
    await expect(migrateClosetDatabase(failing)).rejects.toThrow('disk I/O error');
    expect(inserts).toBe(5);
    await expectIntactV4(db, before);
  });

  it('a failing DROP COLUMN rolls back too', async () => {
    const db = await openAtVersion4();
    const before = await snapshot(db);
    const failing: SqlDatabase = {
      execAsync: async (source) => {
        if (source.includes('DROP COLUMN colors')) throw new Error('disk I/O error');
        await db.execAsync(source);
      },
      runAsync: (source, params) => db.runAsync(source, params),
      getAllAsync: (source, params) => db.getAllAsync(source, params),
      getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    };
    await expect(migrateClosetDatabase(failing)).rejects.toThrow('disk I/O error');
    await expectIntactV4(db, before);
  });

  it('a row count mismatch (a lost insert) refuses to finish and rolls back', async () => {
    const db = await openAtVersion4();
    const before = await snapshot(db);
    const failing: SqlDatabase = {
      execAsync: (source) => db.execAsync(source),
      // Pretends one insert worked when it wrote nothing.
      runAsync: async (source, params) =>
        source.includes('INSERT INTO item_colors') && params[0] === 'v4-d' && params[1] === 2
          ? { changes: 1 }
          : db.runAsync(source, params),
      getAllAsync: (source, params) => db.getAllAsync(source, params),
      getFirstAsync: (source, params) => db.getFirstAsync(source, params),
    };
    await expect(migrateClosetDatabase(failing)).rejects.toThrow(/color migration wrote 10 rows, expected 11/);
    await expectIntactV4(db, before);
  });

  it('a fresh install reaches version 5 with item_colors and no colors column', async () => {
    const db = await openAtVersion5();
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 5 });
    expect(await columns(db, 'clothing_items')).toEqual(['id', 'category', 'seasons', 'created_at', 'updated_at']);
    const info = await db.getAllAsync<{ name: string; type: string; notnull: number; pk: number }>('PRAGMA table_info(item_colors)', []);
    expect(info.map((c) => [c.name, c.type, c.notnull, c.pk])).toEqual([
      ['item_id', 'TEXT', 1, 1],
      ['rank', 'INTEGER', 1, 2],
      ['palette_id', 'TEXT', 1, 0],
      ['hex', 'TEXT', 1, 0],
      ['source', 'TEXT', 1, 0],
    ]);
    const foreignKeys = await db.getAllAsync<{ table: string; from: string; to: string; on_delete: string }>(
      'PRAGMA foreign_key_list(item_colors)',
      [],
    );
    expect(foreignKeys.map((f) => [f.table, f.from, f.to, f.on_delete])).toEqual([['clothing_items', 'item_id', 'id', 'CASCADE']]);
  });

  describe('item_colors constraints (raw SQL, bypassing the repository)', () => {
    async function seeded() {
      const db = await openMigrated();
      await new SqliteClosetRepository(db).add(makeItem({ colors: [makeColor('navy'), makeColor('white')] }));
      await new SqliteClosetRepository(db).add(makeItem({ id: 'other' }));
      const insert = (rank: number | null, paletteId: string | null, hex: string | null, source: string | null, itemId = 'item-1') =>
        db.runAsync('INSERT INTO item_colors (item_id, rank, palette_id, hex, source) VALUES (?, ?, ?, ?, ?)', [
          itemId,
          rank,
          paletteId,
          hex,
          source,
        ]);
      return { db, insert };
    }

    it('refuses an out-of-range or repeated rank, a repeated palette color, an unknown source, nulls, and orphans', async () => {
      const { db, insert } = await seeded();
      await expect(insert(3, 'red', '#C8102E', 'user')).rejects.toThrow(/CHECK/);
      await expect(insert(-1, 'red', '#C8102E', 'user')).rejects.toThrow(/CHECK/);
      await expect(insert(1, 'red', '#C8102E', 'user')).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
      await expect(insert(2, 'navy', '#202A60', 'auto')).rejects.toThrow(/UNIQUE/);
      await expect(insert(2, 'red', '#C8102E', 'guess')).rejects.toThrow(/CHECK/);
      await expect(insert(2, 'red', null, 'user')).rejects.toThrow(/NOT NULL/);
      await expect(insert(2, null, '#C8102E', 'user')).rejects.toThrow(/NOT NULL/);
      await expect(insert(null, 'red', '#C8102E', 'user')).rejects.toThrow(/NOT NULL/);
      await expect(insert(2, 'red', '#C8102E', null)).rejects.toThrow(/NOT NULL/);
      await expect(insert(0, 'red', '#C8102E', 'user', 'ghost')).rejects.toThrow(/FOREIGN KEY/);
      // Allowed: a third color in the free rank, and the same palette color on another item.
      await insert(2, 'red', '#C8102E', 'auto');
      await insert(1, 'navy', '#202A60', 'user', 'other');
      expect(await db.getAllAsync('SELECT COUNT(*) AS n FROM item_colors', [])).toEqual([{ n: 5 }]);
    });

    it('deleting an item in SQL cascades to its colors and leaves other items alone', async () => {
      const { db } = await seeded();
      await db.runAsync('DELETE FROM clothing_items WHERE id = ?', ['item-1']);
      expect(await db.getAllAsync('SELECT item_id, rank, palette_id FROM item_colors', [])).toEqual([
        { item_id: 'other', rank: 0, palette_id: 'black' },
      ]);
    });
  });

  describe('SqliteClosetRepository color writes', () => {
    it('add is all or nothing: a failed color row leaves no item, photos, colors, or tags', async () => {
      const db = await openMigrated();
      const repo = new SqliteClosetRepository(failingOn(db, /INSERT INTO item_colors/));
      await expect(repo.add(makeItem({ colors: [makeColor('navy'), makeColor('red')], tags: ['emo'] }))).rejects.toThrow(
        'disk I/O error',
      );
      expect(await repo.list()).toEqual([]);
      expect(await repo.listTags()).toEqual([]);
      expect(await db.getAllAsync('SELECT * FROM item_photos', [])).toEqual([]);
      expect(await db.getAllAsync('SELECT * FROM item_colors', [])).toEqual([]);
    });

    it('update is all or nothing: a failed color row keeps the old colors and fields', async () => {
      const db = await openMigrated();
      const original = makeItem({ colors: [makeColor('navy'), makeColor('white', { source: 'auto', hex: '#F4F4F2' })] });
      await new SqliteClosetRepository(db).add(original);
      const repo = new SqliteClosetRepository(failingOn(db, /INSERT INTO item_colors/));
      await expect(
        repo.update(makeItem({ category: 'shoes', colors: [makeColor('red')], updatedAt: '2026-02-01T00:00:00.000Z' })),
      ).rejects.toThrow('disk I/O error');
      expect(await repo.get('item-1')).toEqual(original);
    });

    it('remove deletes the color rows even on a connection without foreign keys', async () => {
      const db = await openMigrated();
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      const repo = new SqliteClosetRepository(db);
      await repo.add(makeItem({ colors: [makeColor('navy'), makeColor('red')] }));
      await repo.remove('item-1');
      expect(await db.getAllAsync('SELECT * FROM item_colors', [])).toEqual([]);
    });
  });
});

describe('migration 6: item name', () => {
  /** A real version 5 database (no name column) with one readable item, written with v5 SQL. */
  async function openAtVersion5(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 5));
    await db.runAsync(
      'INSERT INTO clothing_items (id, category, seasons, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      ['v5-a', 'shoes', '["winter"]', '2026-04-01T00:00:00.000Z', '2026-04-02T00:00:00.000Z'],
    );
    await db.runAsync(
      'INSERT INTO item_photos (id, item_id, role, storage_path, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
      ['v5-a-front', 'v5-a', 'front', 'closet-images/v5-a-1.jpg', 0, 1],
    );
    await db.runAsync('INSERT INTO item_colors (item_id, rank, palette_id, hex, source) VALUES (?, ?, ?, ?, ?)', [
      'v5-a',
      0,
      'red',
      '#C8102E',
      'user',
    ]);
    await db.runAsync('INSERT INTO tags (name) VALUES (?)', ['work']);
    await db.runAsync('INSERT INTO item_tags (item_id, tag_name, position) VALUES (?, ?, ?)', ['v5-a', 'work', 0]);
    return db;
  }

  const V5_ITEM = {
    id: 'v5-a',
    photos: [{ id: 'v5-a-front', role: 'front', path: 'closet-images/v5-a-1.jpg', sortOrder: 0, isPrimary: true }],
    category: 'shoes',
    colors: [{ paletteId: 'red', hex: '#C8102E', source: 'user' }],
    seasons: ['winter'],
    tags: ['work'],
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
  };

  async function columnInfo(db: SqlDatabase) {
    const rows = await db.getAllAsync<{ name: string; type: string; notnull: number; dflt_value: unknown }>(
      'PRAGMA table_info(clothing_items)',
      [],
    );
    return rows.map((c) => [c.name, c.type, c.notnull, c.dflt_value]);
  }

  it('upgrades a real v5 file database: adds a nullable name column, and existing items load with no name', async () => {
    const dir = makeTempDir('spotlight-v5-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      const v5 = await openAtVersion5(file);
      expect(await v5.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 5 });
      v5.close();
      open.length = 0;

      // Next launch with the current app (version 6 or later).
      const db = await openMigrated(file);
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
      expect(CLOSET_SCHEMA_VERSION).toBeGreaterThanOrEqual(6);
      expect(await columnInfo(db)).toEqual([
        ['id', 'TEXT', 1, null],
        ['category', 'TEXT', 1, null],
        ['seasons', 'TEXT', 1, null],
        ['created_at', 'TEXT', 1, null],
        ['updated_at', 'TEXT', 1, null],
        ['name', 'TEXT', 0, null],
      ]);
      expect(await db.getAllAsync('SELECT id, name FROM clothing_items', [])).toEqual([{ id: 'v5-a', name: null }]);

      const repo = new SqliteClosetRepository(db);
      const loaded = await repo.get('v5-a');
      expect(loaded).toEqual(V5_ITEM);
      expect('name' in loaded!).toBe(false);
      expect(await repo.list()).toEqual([V5_ITEM]);

      // A migrated item takes a name like any other, and keeps it after a restart.
      await repo.update({ ...loaded!, name: 'Red boots', updatedAt: '2026-05-01T00:00:00.000Z' });
      db.close();
      open.length = 0;
      const reopened = await openMigrated(file);
      expect((await new SqliteClosetRepository(reopened).get('v5-a'))?.name).toBe('Red boots');
      expect(await reopened.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
    } finally {
      while (open.length) open.pop()!.close();
      removeDir(dir);
    }
  });

  it('a failure in migration 6 rolls back to an intact v5 database, and a later launch upgrades it', async () => {
    const db = await openAtVersion5();
    const realStep = CLOSET_MIGRATIONS[5];
    if (typeof realStep !== 'string') throw new Error('migration 6 is expected to be SQL');
    await expect(
      migrateClosetDatabase(db, [...CLOSET_MIGRATIONS.slice(0, 5), `${realStep}\nSELECT * FROM no_such_table;`]),
    ).rejects.toThrow(/no_such_table/);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 5 });
    expect((await columnInfo(db)).map(([name]) => name)).not.toContain('name');
    await expect(db.execAsync('BEGIN; COMMIT;')).resolves.toBeUndefined();

    await migrateClosetDatabase(db);
    expect(await new SqliteClosetRepository(db).get('v5-a')).toEqual(V5_ITEM);
  });

  it('a stored empty or untrimmed name makes the row unreadable (the repository never writes one)', async () => {
    const db = await openAtVersion5();
    await migrateClosetDatabase(db);
    const corrupt: string[] = [];
    const repo = new SqliteClosetRepository(db, (id) => corrupt.push(id));
    for (const name of ['', ' padded ']) {
      await db.runAsync('UPDATE clothing_items SET name = ? WHERE id = ?', [name, 'v5-a']);
      expect(await repo.get('v5-a')).toBeNull();
    }
    expect(corrupt).toEqual(['v5-a', 'v5-a']);
  });
});

describe('migration 7: item attributes', () => {
  /** A real version 6 database (no item_attributes table) with one named item, written with v6 SQL. */
  async function openAtVersion6(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 6));
    await db.runAsync(
      'INSERT INTO clothing_items (id, name, category, seasons, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['v6-a', 'Old coat', 'outerwear', '["winter"]', '2026-05-01T00:00:00.000Z', '2026-05-02T00:00:00.000Z'],
    );
    await db.runAsync(
      'INSERT INTO item_photos (id, item_id, role, storage_path, sort_order, is_primary) VALUES (?, ?, ?, ?, ?, ?)',
      ['v6-a-front', 'v6-a', 'front', 'closet-images/v6-a-1.jpg', 0, 1],
    );
    await db.runAsync('INSERT INTO item_colors (item_id, rank, palette_id, hex, source) VALUES (?, ?, ?, ?, ?)', [
      'v6-a',
      0,
      'camel',
      '#C19A6B',
      'auto',
    ]);
    return db;
  }

  const V6_ITEM = {
    id: 'v6-a',
    name: 'Old coat',
    photos: [{ id: 'v6-a-front', role: 'front', path: 'closet-images/v6-a-1.jpg', sortOrder: 0, isPrimary: true }],
    category: 'outerwear',
    colors: [{ paletteId: 'camel', hex: '#C19A6B', source: 'auto' }],
    seasons: ['winter'],
    tags: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
  };

  it('upgrades a real v6 file database: old items load with no attributes, and take them after', async () => {
    const dir = makeTempDir('spotlight-v6-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      const v6 = await openAtVersion6(file);
      expect(await v6.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 6 });
      v6.close();
      open.length = 0;

      const db = await openMigrated(file);
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: CLOSET_SCHEMA_VERSION });
      expect(CLOSET_SCHEMA_VERSION).toBeGreaterThanOrEqual(7);
      const columns = await db.getAllAsync<{ name: string; type: string; notnull: number; pk: number }>(
        'PRAGMA table_info(item_attributes)',
        [],
      );
      expect(columns.map((c) => [c.name, c.type, c.notnull, c.pk])).toEqual([
        ['item_id', 'TEXT', 1, 1],
        ['name', 'TEXT', 1, 2],
        ['value', 'TEXT', 1, 0],
        ['source', 'TEXT', 1, 0],
      ]);
      expect(await db.getAllAsync('SELECT * FROM item_attributes', [])).toEqual([]);

      const repo = new SqliteClosetRepository(db);
      const loaded = await repo.get('v6-a');
      expect(loaded).toEqual(V6_ITEM);
      expect('attributes' in loaded!).toBe(false);
      expect(await repo.list()).toEqual([V6_ITEM]);

      const attributes = {
        type: { value: 'Trench coat', source: 'user' as const },
        material: { value: 'wool' as const, source: 'auto' as const },
      };
      await repo.update({ ...loaded!, attributes, updatedAt: '2026-06-01T00:00:00.000Z' });
      db.close();
      open.length = 0;
      const reopened = await openMigrated(file);
      expect((await new SqliteClosetRepository(reopened).get('v6-a'))?.attributes).toEqual(attributes);
    } finally {
      while (open.length) open.pop()!.close();
      removeDir(dir);
    }
  });

  it('a failure in migration 7 rolls back to an intact v6 database, and a later launch upgrades it', async () => {
    const db = await openAtVersion6();
    const realStep = CLOSET_MIGRATIONS[6];
    if (typeof realStep !== 'string') throw new Error('migration 7 is expected to be SQL');
    await expect(
      migrateClosetDatabase(db, [...CLOSET_MIGRATIONS.slice(0, 6), `${realStep}\nSELECT * FROM no_such_table;`]),
    ).rejects.toThrow(/no_such_table/);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 6 });
    expect(await db.getAllAsync("SELECT name FROM sqlite_master WHERE name = 'item_attributes'", [])).toEqual([]);

    await migrateClosetDatabase(db);
    expect(await new SqliteClosetRepository(db).get('v6-a')).toEqual(V6_ITEM);
  });

  it('a stored row outside the lists, with an unknown name, or with a bad type makes the item unreadable', async () => {
    const db = await openAtVersion6();
    await migrateClosetDatabase(db);
    const corrupt: string[] = [];
    const repo = new SqliteClosetRepository(db, (id) => corrupt.push(id));
    const bad: [string, string][] = [
      ['pattern', 'paisley'],
      ['sleeve', 'long'],
      ['type', ''],
      ['type', ' padded '],
      ['type', 'x'.repeat(31)],
      ['formality', 'smart casual'],
    ];
    for (const [name, value] of bad) {
      await db.runAsync('INSERT INTO item_attributes (item_id, name, value, source) VALUES (?, ?, ?, ?)', [
        'v6-a',
        name,
        value,
        'auto',
      ]);
      expect(await repo.get('v6-a')).toBeNull();
      expect(await repo.list()).toEqual([]);
      await db.runAsync('DELETE FROM item_attributes WHERE item_id = ?', ['v6-a']);
    }
    expect(corrupt).toHaveLength(bad.length * 2);
    expect(await repo.get('v6-a')).toEqual(V6_ITEM);
  });

  it('the table refuses an unknown source, and deleting the item removes its rows', async () => {
    const db = await openAtVersion6();
    await migrateClosetDatabase(db);
    await expect(
      db.runAsync('INSERT INTO item_attributes (item_id, name, value, source) VALUES (?, ?, ?, ?)', [
        'v6-a',
        'fit',
        'slim',
        'guess',
      ]),
    ).rejects.toThrow(/CHECK/);
    const repo = new SqliteClosetRepository(db);
    const item = (await repo.get('v6-a'))!;
    await repo.update({ ...item, attributes: { fit: { value: 'slim', source: 'user' } } });
    await repo.remove('v6-a');
    expect(await db.getAllAsync('SELECT * FROM item_attributes', [])).toEqual([]);
  });
});
