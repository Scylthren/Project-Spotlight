import { migrateClosetDatabase } from './closet-schema';
import { MemoryMaintenanceLog, SqliteMaintenanceLog, type MaintenanceLog } from './maintenance-log';
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
