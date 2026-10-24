import { addRecentRequest, parseRecentRequests } from '@/core/recent-requests';

import { settingsStorage, type KeyValueStorage } from './kv-appearance-store';

/**
 * The Style screen's recent requests (last 5, newest first), on the phone
 * only. `add` returns the new list. Both methods may reject when storage
 * fails; the screen then carries on without recents.
 */
export interface RecentRequestsStore {
  load(): Promise<string[]>;
  add(text: string): Promise<string[]>;
}

/** In memory, for tests. */
export class MemoryRecentRequestsStore implements RecentRequestsStore {
  private list: string[];

  constructor(initial: readonly string[] = []) {
    this.list = parseRecentRequests(JSON.stringify(initial));
  }

  async load(): Promise<string[]> {
    return [...this.list];
  }

  async add(text: string): Promise<string[]> {
    this.list = addRecentRequest(this.list, text);
    return [...this.list];
  }
}

export const RECENT_REQUESTS_KEY = 'style-recent-requests';

/** Real store: one JSON list under one key of the settings key-value store. */
export class KvRecentRequestsStore implements RecentRequestsStore {
  constructor(private readonly storage: KeyValueStorage) {}

  async load(): Promise<string[]> {
    return parseRecentRequests(await this.storage.getItemAsync(RECENT_REQUESTS_KEY));
  }

  async add(text: string): Promise<string[]> {
    const list = addRecentRequest(await this.load(), text);
    await this.storage.setItemAsync(RECENT_REQUESTS_KEY, JSON.stringify(list));
    return list;
  }
}

/** The app's store, on the same settings connection as the Appearance setting (`settingsStorage`). Opens on first use. */
export function createKvRecentRequestsStore(): KvRecentRequestsStore {
  return new KvRecentRequestsStore(settingsStorage());
}
