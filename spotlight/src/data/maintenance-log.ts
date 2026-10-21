import type { SqlDatabase } from './sql-database';

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
 * single statement with no BEGIN, so it is safe on the connection the closet
 * repository uses. If a call happens to run inside one of the repository's
 * transactions and that transaction rolls back, the mark is lost and the
 * task simply runs again next launch; tasks must be safe to repeat.
 */
export class SqliteMaintenanceLog implements MaintenanceLog {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async isDone(key: string): Promise<boolean> {
    return (await this.db.getFirstAsync('SELECT 1 AS done FROM maintenance WHERE key = ?', [key])) !== null;
  }

  async markDone(key: string, summary: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO maintenance (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, summary, this.now().toISOString()],
    );
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
