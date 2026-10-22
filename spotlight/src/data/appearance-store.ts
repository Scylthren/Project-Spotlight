import { DEFAULT_APPEARANCE, type AppearancePreference } from '@/core/appearance';

/**
 * Where the Appearance setting is kept between launches. A device setting,
 * not closet data: it is not part of the closet database.
 *
 * `load` resolves the saved preference, or `'system'` when none was saved or
 * the saved value is unreadable. Either method may reject on a storage
 * failure; callers fall back to `'system'` and keep the app usable.
 *
 * Implementations: `MemoryAppearanceStore` (the mock, tests) and
 * `KvAppearanceStore` (expo-sqlite's key-value store).
 */
export interface AppearanceStore {
  load(): Promise<AppearancePreference>;
  save(preference: AppearancePreference): Promise<void>;
}

/** Mock `AppearanceStore`: keeps the preference in memory for the store's lifetime. */
export class MemoryAppearanceStore implements AppearanceStore {
  private preference: AppearancePreference;

  constructor(initial: AppearancePreference = DEFAULT_APPEARANCE) {
    this.preference = initial;
  }

  async load(): Promise<AppearancePreference> {
    return this.preference;
  }

  async save(preference: AppearancePreference): Promise<void> {
    this.preference = preference;
  }
}
