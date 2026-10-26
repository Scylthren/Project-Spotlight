import type { SqlDatabase } from './sql-database';

/**
 * Runs database work one task at a time, and transactions inside
 * BEGIN/COMMIT. Repositories that share a connection must share one queue
 * (the closet and the outfit repositories do, see `closet-services.tsx`):
 * with separate queues a second repository could BEGIN inside the first
 * one's transaction, or a read could see a half-written row.
 *
 * Not re-entrant: never call a queued method (or `run`/`transaction`) from
 * inside a task; it would wait behind the task that waits for it.
 */
export class SqlSerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /** Runs `task` after every earlier task has settled. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Queued, and inside BEGIN/COMMIT; rolls back and rethrows on error. */
  transaction<T>(db: SqlDatabase, work: () => Promise<T>): Promise<T> {
    return this.run(async () => {
      await db.execAsync('BEGIN;');
      try {
        const value = await work();
        await db.execAsync('COMMIT;');
        return value;
      } catch (error) {
        await db.execAsync('ROLLBACK;').catch(() => undefined);
        throw error;
      }
    });
  }
}

const QUEUES = new WeakMap<object, SqlSerialQueue>();

/**
 * The one queue for a database connection, created on first use. Everything
 * that uses the connection (the repositories, the maintenance log, photo
 * references) takes its queue from here, so nothing overlaps.
 */
export function sqlQueueFor(connection: object): SqlSerialQueue {
  let queue = QUEUES.get(connection);
  if (!queue) {
    queue = new SqlSerialQueue();
    QUEUES.set(connection, queue);
  }
  return queue;
}
