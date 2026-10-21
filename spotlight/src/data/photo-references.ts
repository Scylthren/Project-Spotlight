import type { SqlDatabase } from './sql-database';

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

/** `PhotoReferences` over the `item_photos` table. A single read; never writes. */
export class SqlitePhotoReferences implements PhotoReferences {
  constructor(private readonly db: SqlDatabase) {}

  async isReferenced(ref: string): Promise<boolean> {
    return (await this.db.getFirstAsync('SELECT 1 AS used FROM item_photos WHERE storage_path = ? LIMIT 1', [ref])) !== null;
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
