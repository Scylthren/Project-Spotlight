/**
 * Runs the real `KvAppearanceStore` over the real `expo-sqlite/kv-store`
 * code, with expo-sqlite's native `openDatabaseAsync` replaced by Node's
 * built-in `node:sqlite` (files in a temp folder).
 */
import { SQLiteStorage } from 'expo-sqlite/kv-store';

import { APPEARANCE_PREFERENCES } from '@/core/appearance';

import { MemoryAppearanceStore, type AppearanceStore } from './appearance-store';
import {
  APPEARANCE_KEY,
  createKvAppearanceStore,
  KvAppearanceStore,
  SETTINGS_DATABASE_NAME,
} from './kv-appearance-store';
import { makeTempDir, removeDir } from './testing/temp-dir';

const mockSqlite = { dir: '', opened: [] as string[] };

jest.mock('expo-sqlite', () => {
  const { openNodeExpoDatabase } = jest.requireActual('./testing/node-expo-sqlite');
  const { joinPath } = jest.requireActual('./testing/temp-dir');
  return {
    openDatabaseAsync: async (name: string) => {
      mockSqlite.opened.push(name);
      return openNodeExpoDatabase(joinPath(mockSqlite.dir, name));
    },
    openDatabaseSync: () => {
      throw new Error('the appearance store must use the async API');
    },
  };
});

const storages: SQLiteStorage[] = [];

/** A fresh `SQLiteStorage` on the database file, like a new app launch. */
function launch(name = SETTINGS_DATABASE_NAME): SQLiteStorage {
  const storage = new SQLiteStorage(name);
  storages.push(storage);
  return storage;
}

beforeEach(() => {
  mockSqlite.dir = makeTempDir('spotlight-settings-');
  mockSqlite.opened = [];
});

afterEach(async () => {
  while (storages.length) await storages.pop()!.closeAsync();
  removeDir(mockSqlite.dir);
});

function describeAppearanceStore(name: string, make: () => AppearanceStore) {
  describe(`${name} (AppearanceStore contract)`, () => {
    it('loads System when nothing was saved', async () => {
      expect(await make().load()).toBe('system');
    });

    it('loads what was saved last', async () => {
      const store = make();
      for (const preference of APPEARANCE_PREFERENCES) {
        await store.save(preference);
        expect(await store.load()).toBe(preference);
      }
      await store.save('dark');
      await store.save('light');
      expect(await store.load()).toBe('light');
    });
  });
}

describeAppearanceStore('MemoryAppearanceStore', () => new MemoryAppearanceStore());
describeAppearanceStore('KvAppearanceStore (expo-sqlite kv-store on node:sqlite)', () => new KvAppearanceStore(launch()));

describe('MemoryAppearanceStore', () => {
  it('can start from a given preference', async () => {
    expect(await new MemoryAppearanceStore('dark').load()).toBe('dark');
  });
});

describe('KvAppearanceStore', () => {
  it('keeps the preference across a restart', async () => {
    await new KvAppearanceStore(launch()).save('dark');
    await storages.pop()!.closeAsync();

    expect(await new KvAppearanceStore(launch()).load()).toBe('dark');
  });

  it('reads an unknown stored value as System', async () => {
    const storage = launch();
    await storage.setItemAsync(APPEARANCE_KEY, 'sepia');
    expect(await new KvAppearanceStore(storage).load()).toBe('system');
  });

  it('stores the plain preference string under one key', async () => {
    const storage = launch();
    await new KvAppearanceStore(storage).save('light');
    expect(await storage.getAllKeysAsync()).toEqual([APPEARANCE_KEY]);
    expect(await storage.getItemAsync(APPEARANCE_KEY)).toBe('light');
  });

  it('the app store uses its own settings database, opened on first use', async () => {
    const store = createKvAppearanceStore();
    expect(mockSqlite.opened).toEqual([]);
    await store.save('dark');
    expect(mockSqlite.opened).toEqual([SETTINGS_DATABASE_NAME]);
    expect(await new KvAppearanceStore(launch()).load()).toBe('dark');
  });

  it('rejects when storage fails, so the caller can fall back', async () => {
    const failing = {
      getItemAsync: async () => {
        throw new Error('disk');
      },
      setItemAsync: async () => {
        throw new Error('disk');
      },
    };
    await expect(new KvAppearanceStore(failing).load()).rejects.toThrow('disk');
    await expect(new KvAppearanceStore(failing).save('dark')).rejects.toThrow('disk');
  });
});
