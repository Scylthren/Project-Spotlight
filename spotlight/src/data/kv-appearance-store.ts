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

let sharedSettingsStorage: SQLiteStorage | null = null;

/**
 * The one connection to the settings database for the whole app session,
 * created on first use (the database itself opens on the first read or
 * write). Every settings store (Appearance, the Style screen's recent
 * requests) shares it, so two connections never write the same file.
 */
export function settingsStorage(): SQLiteStorage {
  sharedSettingsStorage ??= new SQLiteStorage(SETTINGS_DATABASE_NAME);
  return sharedSettingsStorage;
}

/** The app's store, on the shared settings connection. Opening the database waits for the first `load` or `save`. */
export function createKvAppearanceStore(): KvAppearanceStore {
  return new KvAppearanceStore(settingsStorage());
}
