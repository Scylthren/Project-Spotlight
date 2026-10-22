/**
 * TEST-ONLY stand-in for the part of expo-sqlite's async `SQLiteDatabase`
 * that `expo-sqlite/kv-store` (`SQLiteStorage`) calls, over Node's built-in
 * `node:sqlite`. Lets Jest run the real key-value store code by mocking
 * `openDatabaseAsync`. Never import this from app code.
 */
type Param = string | number | null;

interface NodeStatement {
  run(...params: Param[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: Param[]): unknown[];
  get(...params: Param[]): unknown;
}

interface NodeDatabaseSync {
  exec(source: string): void;
  prepare(source: string): NodeStatement;
  close(): void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => NodeDatabaseSync };

const plain = (row: unknown) => (row === undefined ? null : { ...(row as object) });

export interface NodeExpoDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: Param[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync(source: string, ...params: Param[]): Promise<unknown>;
  getAllAsync(source: string, ...params: Param[]): Promise<unknown[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  withExclusiveTransactionAsync(task: (tx: NodeExpoDatabase) => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export function openNodeExpoDatabase(path: string): NodeExpoDatabase {
  const db = new DatabaseSync(path);
  const self: NodeExpoDatabase = {
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, ...params) {
      const { changes, lastInsertRowid } = db.prepare(source).run(...params);
      return { changes: Number(changes), lastInsertRowId: Number(lastInsertRowid) };
    },
    async getFirstAsync(source, ...params) {
      return plain(db.prepare(source).get(...params));
    },
    async getAllAsync(source, ...params) {
      return db.prepare(source).all(...params).map(plain);
    },
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async withExclusiveTransactionAsync(task) {
      await self.withTransactionAsync(() => task(self));
    },
    async closeAsync() {
      db.close();
    },
  };
  return self;
}
