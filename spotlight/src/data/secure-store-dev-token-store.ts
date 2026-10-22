import * as SecureStore from 'expo-secure-store';

import type { DevTokenStore } from './dev-token-store';

/** Keychain (iOS) / Keystore-encrypted storage (Android) key for the dev token. */
export const DEV_TOKEN_KEY = 'spotlight.dev-token';

/**
 * `DevTokenStore` backed by expo-secure-store. iOS: readable only while the
 * device is unlocked and never synced to another device or restored from a
 * backup. Android: excluded from Auto Backup by the expo-secure-store config
 * plugin. Not available on web (calls reject; the Me tab shows that).
 */
export class SecureStoreDevTokenStore implements DevTokenStore {
  private readonly options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  };

  async get(): Promise<string | null> {
    const value = await SecureStore.getItemAsync(DEV_TOKEN_KEY, this.options);
    return value ? value : null;
  }

  async set(token: string): Promise<void> {
    await SecureStore.setItemAsync(DEV_TOKEN_KEY, token, this.options);
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(DEV_TOKEN_KEY, this.options);
  }
}
