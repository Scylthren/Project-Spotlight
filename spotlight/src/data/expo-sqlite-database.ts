import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlDatabase } from './sql-database';

/**
 * expo-sqlite's database already has the methods `SqlDatabase` needs. This
 * function is a typed identity: it fails to compile if expo-sqlite's API
 * drifts away from our interface.
 */
export function asSqlDatabase(db: SQLiteDatabase): SqlDatabase {
  return db;
}
