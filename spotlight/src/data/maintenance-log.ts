import type { SqlDatabase } from './sql-database';
import { SqlSerialQueue } from './sql-serial-queue';

/**
 * Records which one-time maintenance tasks have finished, so each runs until
 * it succeeds once and then never again. Keys name a task and never change
 * once shipped (a changed task gets a new key).
 *
 * Implementations: `MemoryMaintenanceLog` (tests) and `SqliteMaintenanceLog`.
 */
export interface MaintenanceLog {
  isDone(key: string): Promise<boolean>;
  /** Marks `key` finished, with a short summary. Calling it again replaces the summary. */
  markDone(key: string, summary: string): Promise<void>;
}

/**
 * `MaintenanceLog` over the `maintenance` table (migration 4). Each call is a
 * single statement run through the connection's shared `SqlSerialQueue`, so
 * it never lands inside a repository's open transaction (where a rollback
 * would lose the mark). Pass the queue the repositories use; the default is
 * a private one, fine only when nothing else writes to the connection.
 * Tasks must still be safe to repeat (the app can stop before the mark).
 *
 * Not for use inside a queued task (`SqlSerialQueue` is not re-entrant);
 * the photo metadata backfill calls it from outside any.
 */
export class SqliteMaintenanceLog implements MaintenanceLog {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => Date = () => new Date(),
    private readonly queue: SqlSerialQueue = new SqlSerialQueue(),
  ) {}

  isDone(key: string): Promise<boolean> {
    return this.queue.run(
      async () => (await this.db.getFirstAsync('SELECT 1 AS done FROM maintenance WHERE key = ?', [key])) !== null,
    );
  }

  markDone(key: string, summary: string): Promise<void> {
    return this.queue.run(async () => {
      await this.db.runAsync(
        `INSERT INTO maintenance (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, summary, this.now().toISOString()],
      );
    });
  }
}

/** Mock `MaintenanceLog`. `failNext` simulates a database error. */
export class MemoryMaintenanceLog implements MaintenanceLog {
  readonly done = new Map<string, string>();
  failNext: Error | null = null;

  private takeFailure(): void {
    if (!this.failNext) return;
    const error = this.failNext;
    this.failNext = null;
    throw error;
  }

  async isDone(key: string): Promise<boolean> {
    this.takeFailure();
    return this.done.has(key);
  }

  async markDone(key: string, summary: string): Promise<void> {
    this.takeFailure();
    this.done.set(key, summary);
  }
}
