/**
 * Migration 3 uses ALTER TABLE ... DROP COLUMN, which needs SQLite 3.35.0 or
 * newer. Tests run on node:sqlite; the app runs on the SQLite that
 * expo-sqlite compiles from its vendored source on iOS and Android (both
 * build `vendor/sqlite3/sqlite3.c`, or `vendor/sqlcipher` when SQLCipher is
 * turned on). This fails if an SDK or Node upgrade ever ships an older one.
 */
import { NodeSqlDatabase } from './testing/node-sql-database';

const MIN = [3, 35, 0];

function atLeast(version: string, min: number[]): boolean {
  const parts = version.split('.').map(Number);
  for (let i = 0; i < min.length; i++) {
    if ((parts[i] ?? 0) !== min[i]) return (parts[i] ?? 0) > min[i];
  }
  return true;
}

function vendoredVersion(variant: 'sqlite3' | 'sqlcipher'): string {
  // Typed locally: the app's tsconfig deliberately does not load Node's types (see testing/temp-dir.ts).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('node:fs') as { readFileSync(path: string, encoding: 'utf8'): string };
  const path = require('node:path') as { dirname(p: string): string; join(...parts: string[]): string };
  /* eslint-enable @typescript-eslint/no-require-imports */
  const resolve = (require as unknown as { resolve(id: string): string }).resolve;
  // The package only exports package.json, so find the vendor folder next to it.
  const root = path.dirname(resolve('expo-sqlite/package.json'));
  const header = path.join(root, 'vendor', variant, 'sqlite3.h');
  const match = /#define SQLITE_VERSION\s+"([\d.]+)"/.exec(fs.readFileSync(header, 'utf8'));
  if (!match) throw new Error(`no SQLITE_VERSION in ${header}`);
  return match[1];
}

describe('SQLite versions support DROP COLUMN (>= 3.35.0)', () => {
  it('compares versions numerically', () => {
    expect(atLeast('3.35.0', MIN)).toBe(true);
    expect(atLeast('3.50.3', MIN)).toBe(true);
    expect(atLeast('3.34.9', MIN)).toBe(false);
    expect(atLeast('3.9.0', MIN)).toBe(false);
  });

  it('node:sqlite (tests)', async () => {
    const db = new NodeSqlDatabase();
    try {
      const row = await db.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v', []);
      expect(atLeast(row!.v, MIN)).toBe(true);
    } finally {
      db.close();
    }
  });

  it.each(['sqlite3', 'sqlcipher'] as const)("expo-sqlite's vendored %s (iOS and Android)", (variant) => {
    const version = vendoredVersion(variant);
    expect(atLeast(version, MIN)).toBe(true);
  });
});
