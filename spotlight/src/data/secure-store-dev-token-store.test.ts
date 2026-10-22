import * as SecureStore from 'expo-secure-store';

import { DEV_TOKEN_KEY, SecureStoreDevTokenStore } from './secure-store-dev-token-store';

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});

const TOKEN = '5a'.repeat(32);
const DEVICE_ONLY = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

describe('SecureStoreDevTokenStore', () => {
  it('stores the token under one key, readable only on this unlocked device', async () => {
    const store = new SecureStoreDevTokenStore();
    expect(await store.get()).toBeNull();
    await store.set(TOKEN);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(DEV_TOKEN_KEY, TOKEN, DEVICE_ONLY);
    expect(await store.get()).toBe(TOKEN);
    expect(SecureStore.getItemAsync).toHaveBeenLastCalledWith(DEV_TOKEN_KEY, DEVICE_ONLY);
    await store.clear();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(DEV_TOKEN_KEY, DEVICE_ONLY);
    expect(await store.get()).toBeNull();
  });

  it('uses a key secure-store accepts', () => {
    expect(DEV_TOKEN_KEY).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('treats an empty stored value as no token', async () => {
    await SecureStore.setItemAsync(DEV_TOKEN_KEY, '');
    expect(await new SecureStoreDevTokenStore().get()).toBeNull();
  });

  it('passes storage errors to the caller (the tagger and the Me tab handle them)', async () => {
    jest.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error('unavailable'));
    await expect(new SecureStoreDevTokenStore().get()).rejects.toThrow('unavailable');
  });
});
