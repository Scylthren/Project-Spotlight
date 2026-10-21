/**
 * TEST-ONLY `SqlDatabase` over Node's built-in `node:sqlite` (Node >= 22.13,
 * no npm dependency). Lets Jest run the repository's real SQL. Never import
 * this from app code: Metro cannot bundle `node:` modules.
 */
import type { SqlDatabase, SqlValue } from '../sql-database';

interface NodeStatement {
  run(...params: SqlValue[]): { changes: number | bigint };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
}

interface NodeDatabaseSync {
  exec(source: string): void;
  prepare(source: string): NodeStatement;
  close(): void;
}

type NodeSqliteModule = { DatabaseSync: new (path: string) => NodeDatabaseSync };

function loadNodeSqlite(): NodeSqliteModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:sqlite') as NodeSqliteModule;
  } catch (cause) {
    throw new Error(
      `SQLite repository tests need Node's built-in node:sqlite (Node >= 22.13). Running ${process.version}.`,
      { cause },
    );
  }
}

/** Rows from node:sqlite have a null prototype; copy them so toEqual behaves. */
function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export class NodeSqlDatabase implements SqlDatabase {
  private readonly db: NodeDatabaseSync;

  /** `path` is a file path, or ':memory:' for a throwaway database. */
  constructor(path: string = ':memory:') {
    const { DatabaseSync } = loadNodeSqlite();
    this.db = new DatabaseSync(path);
  }

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }> {
    const { changes } = this.db.prepare(source).run(...params);
    return { changes: Number(changes) };
  }

  async getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]> {
    return this.db.prepare(source).all(...params).map((row) => plain<T>(row));
  }

  async getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null> {
    const row = this.db.prepare(source).get(...params);
    return row === undefined ? null : plain<T>(row);
  }

  close(): void {
    this.db.close();
  }
}
