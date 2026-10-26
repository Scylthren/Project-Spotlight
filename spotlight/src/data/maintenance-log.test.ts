import { migrateClosetDatabase } from './closet-schema';
import { MemoryMaintenanceLog, SqliteMaintenanceLog, type MaintenanceLog } from './maintenance-log';
import { SqlSerialQueue } from './sql-serial-queue';
import { NodeSqlDatabase } from './testing/node-sql-database';
import { joinPath, makeTempDir, removeDir } from './testing/temp-dir';

const open: NodeSqlDatabase[] = [];
afterEach(() => {
  while (open.length) open.pop()!.close();
});

async function migrated(path?: string): Promise<NodeSqlDatabase> {
  const db = new NodeSqlDatabase(path);
  open.push(db);
  await migrateClosetDatabase(db);
  return db;
}

describe.each<[string, () => Promise<MaintenanceLog>]>([
  ['MemoryMaintenanceLog', async () => new MemoryMaintenanceLog()],
  ['SqliteMaintenanceLog', async () => new SqliteMaintenanceLog(await migrated())],
])('%s', (_, make) => {
  it('reports a task as pending until it is marked done', async () => {
    const log = await make();
    expect(await log.isDone('task-a')).toBe(false);
    await log.markDone('task-a', '{"n":1}');
    expect(await log.isDone('task-a')).toBe(true);
    expect(await log.isDone('task-b')).toBe(false);
  });

  it('marking done twice is fine', async () => {
    const log = await make();
    await log.markDone('task-a', 'first');
    await expect(log.markDone('task-a', 'second')).resolves.toBeUndefined();
    expect(await log.isDone('task-a')).toBe(true);
  });
});

describe('SqliteMaintenanceLog', () => {
  it('stores the key, summary, and time, and replaces them on a second mark', async () => {
    const db = await migrated();
    let now = new Date('2026-10-21T10:00:00.000Z');
    const log = new SqliteMaintenanceLog(db, () => now);
    await log.markDone('task-a', 'first');
    now = new Date('2026-10-22T10:00:00.000Z');
    await log.markDone('task-a', 'second');
    expect(await db.getAllAsync('SELECT * FROM maintenance', [])).toEqual([
      { key: 'task-a', value: 'second', updated_at: '2026-10-22T10:00:00.000Z' },
    ]);
  });

  it('remembers a finished task across a restart', async () => {
    const dir = makeTempDir('spotlight-maint-');
    try {
      const file = joinPath(dir, 'spotlight.db');
      const first = await migrated(file);
      await new SqliteMaintenanceLog(first).markDone('task-a', 'ok');
      first.close();
      open.length = 0;
      expect(await new SqliteMaintenanceLog(await migrated(file)).isDone('task-a')).toBe(true);
    } finally {
      while (open.length) open.pop()!.close();
      removeDir(dir);
    }
  });
});

describe('SqliteMaintenanceLog on the shared queue', () => {
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('a mark made while a repository transaction is open waits for it, so that transaction\'s rollback cannot lose it', async () => {
    const db = await migrated();
    const queue = new SqlSerialQueue();
    const log = new SqliteMaintenanceLog(db, undefined, queue);
    const gate = deferred();
    const failing = queue.transaction(db, async () => {
      await gate.promise;
      throw new Error('repository write failed');
    });
    const marked = log.markDone('task-a', 'ok');
    let markSettled = false;
    void marked.then(() => (markSettled = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(markSettled).toBe(false);
    gate.resolve();
    await expect(failing).rejects.toThrow('repository write failed');
    await marked;
    expect(await log.isDone('task-a')).toBe(true);
  });

  it('without the shared queue the same mark lands inside the transaction and is rolled back (why the app shares it)', async () => {
    const db = await migrated();
    const queue = new SqlSerialQueue();
    const log = new SqliteMaintenanceLog(db); // its own queue
    const gate = deferred();
    const failing = queue.transaction(db, async () => {
      await gate.promise;
      throw new Error('repository write failed');
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await log.markDone('task-a', 'ok');
    gate.resolve();
    await expect(failing).rejects.toThrow('repository write failed');
    expect(await log.isDone('task-a')).toBe(false);
  });
});
