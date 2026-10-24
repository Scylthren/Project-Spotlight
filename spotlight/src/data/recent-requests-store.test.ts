/**
 * Runs the real `KvRecentRequestsStore` over the real `expo-sqlite/kv-store`
 * code on Node's built-in `node:sqlite`, like `kv-appearance-store.test.ts`.
 */
import { SQLiteStorage } from 'expo-sqlite/kv-store';

import { KvAppearanceStore, SETTINGS_DATABASE_NAME } from './kv-appearance-store';
import {
  createKvRecentRequestsStore,
  KvRecentRequestsStore,
  MemoryRecentRequestsStore,
  RECENT_REQUESTS_KEY,
  type RecentRequestsStore,
} from './recent-requests-store';
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
      throw new Error('the store must use the async API');
    },
  };
});

const storages: SQLiteStorage[] = [];

function launch(): SQLiteStorage {
  const storage = new SQLiteStorage(SETTINGS_DATABASE_NAME);
  storages.push(storage);
  return storage;
}

beforeEach(() => {
  mockSqlite.dir = makeTempDir('spotlight-recents-');
  mockSqlite.opened = [];
});

afterEach(async () => {
  while (storages.length) await storages.pop()!.closeAsync();
  removeDir(mockSqlite.dir);
});

function describeStore(name: string, make: () => RecentRequestsStore) {
  describe(`${name} (RecentRequestsStore contract)`, () => {
    it('starts empty', async () => {
      expect(await make().load()).toEqual([]);
    });

    it('keeps the last 5, newest first, without repeats', async () => {
      const store = make();
      for (const text of ['For summer', 'emo vibes', 'First date', 'Job interview', 'Rainy day', 'for SUMMER']) await store.add(text);
      expect(await store.load()).toEqual(['for SUMMER', 'Rainy day', 'Job interview', 'First date', 'emo vibes']);
    });

    it('add returns the new list', async () => {
      const store = make();
      await store.add('a');
      expect(await store.add('b')).toEqual(['b', 'a']);
    });
  });
}

describeStore('MemoryRecentRequestsStore', () => new MemoryRecentRequestsStore());
describeStore('KvRecentRequestsStore (expo-sqlite kv-store on node:sqlite)', () => new KvRecentRequestsStore(launch()));

describe('KvRecentRequestsStore', () => {
  it('keeps the list across a restart', async () => {
    await new KvRecentRequestsStore(launch()).add('emo vibes');
    await storages.pop()!.closeAsync();
    expect(await new KvRecentRequestsStore(launch()).load()).toEqual(['emo vibes']);
  });

  it('stores a JSON list under its own key, next to the Appearance setting', async () => {
    const storage = launch();
    await new KvAppearanceStore(storage).save('dark');
    await new KvRecentRequestsStore(storage).add('a');
    expect((await storage.getAllKeysAsync()).sort()).toEqual(['appearance', RECENT_REQUESTS_KEY]);
    expect(await storage.getItemAsync(RECENT_REQUESTS_KEY)).toBe('["a"]');
    expect(await new KvAppearanceStore(storage).load()).toBe('dark');
  });

  it('reads a damaged value as empty, and the next add replaces it', async () => {
    const storage = launch();
    await storage.setItemAsync(RECENT_REQUESTS_KEY, '{oops');
    const store = new KvRecentRequestsStore(storage);
    expect(await store.load()).toEqual([]);
    expect(await store.add('b')).toEqual(['b']);
  });

  it('the app store uses the settings database, opened on first use', async () => {
    const store = createKvRecentRequestsStore();
    expect(mockSqlite.opened).toEqual([]);
    await store.add('x');
    expect(mockSqlite.opened).toEqual([SETTINGS_DATABASE_NAME]);
  });

  it('shares one settings connection with the Appearance store (one database open)', async () => {
    await jest.isolateModulesAsync(async () => {
      const appearance = jest.requireActual('./kv-appearance-store');
      const recents = jest.requireActual('./recent-requests-store');
      expect(appearance.settingsStorage()).toBe(appearance.settingsStorage());
      const appearanceStore = appearance.createKvAppearanceStore();
      const recentStore = recents.createKvRecentRequestsStore();
      await appearanceStore.save('dark');
      await recentStore.add('emo vibes');
      expect(mockSqlite.opened).toEqual([SETTINGS_DATABASE_NAME]);
      expect(await appearanceStore.load()).toBe('dark');
      expect(await recentStore.load()).toEqual(['emo vibes']);
      await appearance.settingsStorage().closeAsync();
    });
  });

  it('rejects when storage fails, so the screen can carry on without recents', async () => {
    const failing = {
      getItemAsync: async () => {
        throw new Error('disk');
      },
      setItemAsync: async () => {
        throw new Error('disk');
      },
    };
    await expect(new KvRecentRequestsStore(failing).load()).rejects.toThrow('disk');
    await expect(new KvRecentRequestsStore(failing).add('a')).rejects.toThrow('disk');
  });
});

describe('MemoryRecentRequestsStore', () => {
  it('can start from a list (cleaned like a stored one)', async () => {
    expect(await new MemoryRecentRequestsStore(['a', 'A', ' b ']).load()).toEqual(['a', 'b']);
  });
});
