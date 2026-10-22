import { SQLiteStorage } from 'expo-sqlite/kv-store';

import { parseAppearancePreference, type AppearancePreference } from '@/core/appearance';

import type { AppearanceStore } from './appearance-store';

/** The part of expo-sqlite's `SQLiteStorage` this store uses. */
export interface KeyValueStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** Its own small database, apart from the closet database and expo-sqlite's default store. */
export const SETTINGS_DATABASE_NAME = 'spotlight-settings.db';
export const APPEARANCE_KEY = 'appearance';

/** Real `AppearanceStore`: one key in expo-sqlite's key-value store. */
export class KvAppearanceStore implements AppearanceStore {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<AppearancePreference> {
    return parseAppearancePreference(await this.storage.getItemAsync(APPEARANCE_KEY));
  }

  async save(preference: AppearancePreference): Promise<void> {
    await this.storage.setItemAsync(APPEARANCE_KEY, preference);
  }
}

/** The app's store. Opening the database waits for the first `load` or `save`. */
export function createKvAppearanceStore(): KvAppearanceStore {
  return new KvAppearanceStore(new SQLiteStorage(SETTINGS_DATABASE_NAME));
}
