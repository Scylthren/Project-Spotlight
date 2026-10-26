import type { SqlDatabase } from './sql-database';
import { SqlSerialQueue } from './sql-serial-queue';

/**
 * Read-only check of whether any closet item still uses a stored photo.
 * Maintenance code uses it to avoid restoring a photo whose item was deleted.
 *
 * Implementations: `SetPhotoReferences` (tests) and `SqlitePhotoReferences`.
 */
export interface PhotoReferences {
  /** True if some item's photo has `ref` (e.g. `closet-images/a-x1.jpg`) as its stored path. */
  isReferenced(ref: string): Promise<boolean>;
}

/**
 * `PhotoReferences` over the `item_photos` table. A single read; never
 * writes. Runs through the connection's shared `SqlSerialQueue`, so it never
 * reads a half-written item from inside a repository's open transaction
 * (it waits for the commit). Pass the queue the repositories use. Not for
 * use inside a queued task (the queue is not re-entrant).
 */
export class SqlitePhotoReferences implements PhotoReferences {
  constructor(
    private readonly db: SqlDatabase,
    private readonly queue: SqlSerialQueue = new SqlSerialQueue(),
  ) {}

  isReferenced(ref: string): Promise<boolean> {
    return this.queue.run(
      async () => (await this.db.getFirstAsync('SELECT 1 AS used FROM item_photos WHERE storage_path = ? LIMIT 1', [ref])) !== null,
    );
  }
}

/** Mock `PhotoReferences` over a set of refs. `failNext` simulates a database error. */
export class SetPhotoReferences implements PhotoReferences {
  readonly refs: Set<string>;
  failNext: Error | null = null;

  constructor(refs: Iterable<string> = []) {
    this.refs = new Set(refs);
  }

  async isReferenced(ref: string): Promise<boolean> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    return this.refs.has(ref);
  }
}
