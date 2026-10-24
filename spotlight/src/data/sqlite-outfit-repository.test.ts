import { makeSavedLook, piece } from '@/core/testing/saved-look-fixtures';

import { makeItem } from './closet-repository.contract';
import { CLOSET_MIGRATIONS, CLOSET_SCHEMA_VERSION, migrateClosetDatabase } from './closet-schema';
import { describeOutfitRepositoryContract } from './outfit-repository.contract';
import { SqlSerialQueue } from './sql-serial-queue';
import { SqliteClosetRepository } from './sqlite-closet-repository';
import { SqliteOutfitRepository } from './sqlite-outfit-repository';
import { NodeSqlDatabase } from './testing/node-sql-database';
import { joinPath, makeTempDir, removeDir } from './testing/temp-dir';

const open: NodeSqlDatabase[] = [];

async function openMigrated(path?: string): Promise<NodeSqlDatabase> {
  const db = new NodeSqlDatabase(path);
  open.push(db);
  await migrateClosetDatabase(db);
  return db;
}

function closeAll(): void {
  while (open.length) open.pop()!.close();
}

afterEach(closeAll);

describeOutfitRepositoryContract('SqliteOutfitRepository (node:sqlite)', async () => {
  return new SqliteOutfitRepository(await openMigrated());
});

describe('SqliteOutfitRepository persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTempDir('spotlight-looks-');
  });
  afterEach(() => {
    closeAll();
    removeDir(dir);
  });

  it('a saved look, its rating and occasion survive closing and reopening the database (app restart)', async () => {
    const file = joinPath(dir, 'spotlight.db');
    const first = await openMigrated(file);
    const repo = new SqliteOutfitRepository(first);
    const look = makeSavedLook();
    await repo.save(look);
    await repo.setRating(look.id, 'up');
    await repo.setOccasion(look.id, 'date');
    await repo.save(makeSavedLook({ id: 'deleted', pieces: [piece('dress-1', 'dress')] }));
    await repo.remove('deleted');
    closeAll();

    const second = await openMigrated(file);
    const reopened = new SqliteOutfitRepository(second);
    expect(await reopened.list()).toEqual([{ ...look, rating: 'up', occasion: 'date' }]);
    // A duplicate save after the restart still keeps one entry.
    expect(await reopened.save(makeSavedLook({ id: 'again' }))).toMatchObject({ created: false, look: { id: 'look-1' } });
  });

  it('a cleared rating stays cleared after a restart', async () => {
    const file = joinPath(dir, 'spotlight.db');
    const repo = new SqliteOutfitRepository(await openMigrated(file));
    await repo.save(makeSavedLook({ rating: 'down' }));
    await repo.setRating('look-1', null);
    closeAll();
    expect((await new SqliteOutfitRepository(await openMigrated(file)).get('look-1'))?.rating).toBeNull();
  });
});

describe('saved looks and closet deletions (D5)', () => {
  it('deleting a closet item keeps the look and its piece row; the look goes once no piece is left', async () => {
    const db = await openMigrated();
    const queue = new SqlSerialQueue();
    const closet = new SqliteClosetRepository(db, undefined, queue);
    const looks = new SqliteOutfitRepository(db, queue);
    await closet.add(makeItem({ id: 'top-1', category: 'top' }));
    await closet.add(makeItem({ id: 'bottom-1', category: 'bottom' }));
    const look = makeSavedLook({ pieces: [piece('top-1', 'top'), piece('bottom-1', 'bottom')] });
    await looks.save(look);

    await closet.remove('top-1');
    expect(await looks.get('look-1')).toEqual(look);
    expect(await looks.removeLooksWithNoPiecesIn(new Set((await closet.list()).map((i) => i.id)))).toEqual([]);

    await closet.remove('bottom-1');
    expect(await looks.removeLooksWithNoPiecesIn(new Set((await closet.list()).map((i) => i.id)))).toEqual(['look-1']);
    expect(await looks.list()).toEqual([]);
    expect(await db.getAllAsync('SELECT * FROM outfit_items', [])).toEqual([]);
  });

  it('a look whose items were all deleted before the Lookbook opened is still removed', async () => {
    const db = await openMigrated();
    const looks = new SqliteOutfitRepository(db);
    await looks.save(makeSavedLook());
    expect(await looks.removeLooksWithNoPiecesIn(new Set())).toEqual(['look-1']);
  });
});

describe('shared queue', () => {
  it('the closet and outfit repositories on one connection never interleave transactions', async () => {
    const db = await openMigrated();
    const queue = new SqlSerialQueue();
    const closet = new SqliteClosetRepository(db, undefined, queue);
    const looks = new SqliteOutfitRepository(db, queue);
    const writes: Promise<unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      writes.push(closet.add(makeItem({ id: `item-${i}` })));
      writes.push(looks.save(makeSavedLook({ id: `look-${i}`, pieces: [piece(`item-${i}`, 'top')] })));
    }
    await expect(Promise.all(writes)).resolves.toHaveLength(40);
    expect(await closet.list()).toHaveLength(20);
    expect(await looks.list()).toHaveLength(20);
  });

  it('separate queues can collide (why the app shares one)', async () => {
    const db = await openMigrated();
    const closet = new SqliteClosetRepository(db);
    const looks = new SqliteOutfitRepository(db);
    const results = await Promise.allSettled([
      closet.add(makeItem({ id: 'a' })),
      looks.save(makeSavedLook({ pieces: [piece('a', 'top')] })),
    ]);
    expect(results.some((r) => r.status === 'rejected')).toBe(true);
  });
});

describe('unreadable rows', () => {
  it('a row with a bad occasion, rating, or a gap in positions is skipped and reported', async () => {
    const db = await openMigrated();
    const corrupt: string[] = [];
    const repo = new SqliteOutfitRepository(db, undefined, (id) => corrupt.push(id));
    await repo.save(makeSavedLook({ id: 'good' }));
    await repo.save(makeSavedLook({ id: 'bad-occasion', pieces: [piece('x1', 'top')] }));
    await repo.save(makeSavedLook({ id: 'gap', pieces: [piece('x2', 'top'), piece('x3', 'bottom')] }));
    await repo.save(makeSavedLook({ id: 'no-pieces', pieces: [piece('x4', 'top')] }));
    await db.runAsync("UPDATE outfits SET occasion = 'party' WHERE id = 'bad-occasion'", []);
    await db.runAsync("UPDATE outfit_items SET position = 5 WHERE outfit_id = 'gap' AND position = 0", []);
    await db.runAsync("DELETE FROM outfit_items WHERE outfit_id = 'no-pieces'", []);

    expect((await repo.list()).map((l) => l.id)).toEqual(['good']);
    expect(corrupt.sort()).toEqual(['bad-occasion', 'gap', 'no-pieces']);
    expect(await repo.get('gap')).toBeNull();
    // Unreadable looks are never deleted by the D5 cleanup.
    expect(await repo.removeLooksWithNoPiecesIn(new Set())).toEqual(['good']);
    expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM outfits', [])).toEqual({ n: 3 });
  });

  it('the table refuses an unknown rating and a repeated item or position', async () => {
    const db = await openMigrated();
    await new SqliteOutfitRepository(db).save(makeSavedLook());
    await expect(db.runAsync("UPDATE outfits SET rating = 'meh'", [])).rejects.toThrow();
    await expect(
      db.runAsync("INSERT INTO outfit_items (outfit_id, item_id, category, position) VALUES ('look-1', 'top-1', 'top', 7)", []),
    ).rejects.toThrow();
    await expect(
      db.runAsync("INSERT INTO outfit_items (outfit_id, item_id, category, position) VALUES ('look-1', 'new', 'top', 0)", []),
    ).rejects.toThrow();
  });
});

describe('migration 8: saved looks', () => {
  /** A real version 7 database (no outfit tables) with one item, written with v7 SQL. */
  async function openAtVersion7(path?: string): Promise<NodeSqlDatabase> {
    const db = new NodeSqlDatabase(path);
    open.push(db);
    await migrateClosetDatabase(db, CLOSET_MIGRATIONS.slice(0, 7));
    await new SqliteClosetRepository(db).add(makeItem({ id: 'v7-item', name: 'Old coat', category: 'outerwear' }));
    await db.runAsync("INSERT INTO item_attributes (item_id, name, value, source) VALUES ('v7-item', 'fit', 'regular', 'user')", []);
    return db;
  }

  it('upgrades a real v7 file database: empty outfit tables, the closet intact, and looks can be saved', async () => {
    const dir = makeTempDir('spotlight-v7-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      const v7 = await openAtVersion7(file);
      expect(await v7.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 7 });
      const before = await new SqliteClosetRepository(v7).list();
      closeAll();

      const db = await openMigrated(file);
      expect(CLOSET_SCHEMA_VERSION).toBe(8);
      expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 8 });
      const outfitColumns = await db.getAllAsync<{ name: string; type: string; notnull: number; pk: number }>(
        'PRAGMA table_info(outfits)',
        [],
      );
      expect(outfitColumns.map((c) => [c.name, c.type, c.notnull, c.pk])).toEqual([
        ['id', 'TEXT', 1, 1],
        ['item_key', 'TEXT', 1, 0],
        ['request', 'TEXT', 1, 0],
        ['rationale', 'TEXT', 1, 0],
        ['rating', 'TEXT', 0, 0],
        ['occasion', 'TEXT', 0, 0],
        ['created_at', 'TEXT', 1, 0],
        ['model', 'TEXT', 0, 0],
      ]);
      const itemColumns = await db.getAllAsync<{ name: string; notnull: number; pk: number }>('PRAGMA table_info(outfit_items)', []);
      expect(itemColumns.map((c) => [c.name, c.notnull, c.pk])).toEqual([
        ['outfit_id', 1, 1],
        ['item_id', 1, 0],
        ['category', 1, 0],
        ['position', 1, 2],
      ]);
      // D5: no foreign key from a piece to the closet, only to its look.
      const keys = await db.getAllAsync<{ table: string; from: string; on_delete: string }>('PRAGMA foreign_key_list(outfit_items)', []);
      expect(keys.map((k) => [k.table, k.from, k.on_delete])).toEqual([['outfits', 'outfit_id', 'CASCADE']]);
      expect(await db.getAllAsync('SELECT * FROM outfits', [])).toEqual([]);

      const closet = new SqliteClosetRepository(db);
      expect(await closet.list()).toEqual(before);
      const looks = new SqliteOutfitRepository(db);
      const look = makeSavedLook({ pieces: [piece('v7-item', 'outerwear')] });
      await looks.save(look);
      // Deleting the item in SQL keeps the look's piece row.
      await closet.remove('v7-item');
      expect(await looks.get('look-1')).toEqual(look);
    } finally {
      closeAll();
      removeDir(dir);
    }
  });

  it('a failure in migration 8 rolls back to an intact v7 database, and a later launch upgrades it', async () => {
    const db = await openAtVersion7();
    const realStep = CLOSET_MIGRATIONS[7];
    if (typeof realStep !== 'string') throw new Error('migration 8 is expected to be SQL');
    await expect(
      migrateClosetDatabase(db, [...CLOSET_MIGRATIONS.slice(0, 7), `${realStep}\nSELECT * FROM no_such_table;`]),
    ).rejects.toThrow(/no_such_table/);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 7 });
    expect(
      await db.getAllAsync("SELECT name FROM sqlite_master WHERE name IN ('outfits', 'outfit_items', 'outfit_items_by_item')", []),
    ).toEqual([]);

    await migrateClosetDatabase(db);
    expect(await db.getFirstAsync('PRAGMA user_version', [])).toEqual({ user_version: 8 });
    expect((await new SqliteClosetRepository(db).get('v7-item'))?.name).toBe('Old coat');
  });

  it('a fresh install reaches version 8 with both tables and the item index', async () => {
    const db = await openMigrated();
    const names = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name LIKE 'outfit%' ORDER BY name",
      [],
    );
    expect(names.map((n) => n.name)).toEqual(expect.arrayContaining(['outfit_items', 'outfit_items_by_item', 'outfits']));
  });
});
