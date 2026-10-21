/**
 * The subset of expo-sqlite's async `SQLiteDatabase` API that the app uses.
 * Depending on this instead of expo-sqlite directly lets tests run the real
 * SQL against Node's built-in `node:sqlite` (see `testing/node-sql-database.ts`).
 * `expo-sqlite-database.ts` checks at compile time that expo-sqlite satisfies it.
 */
export type SqlValue = string | number | null;

export interface SqlDatabase {
  /** Runs one or more statements without parameters (schema, pragmas). */
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlValue[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
}
