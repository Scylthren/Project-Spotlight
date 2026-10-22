import { DEFAULT_APPEARANCE, type AppearancePreference } from '@/core/appearance';

import type { AppearanceStore } from './appearance-store';

export interface AppearanceState {
  preference: AppearancePreference;
  /** True once the saved preference was read, failed to read, or the wait timed out. */
  ready: boolean;
}

/** How long the root layout waits (behind the splash) for the saved preference. */
export const APPEARANCE_LOAD_TIMEOUT_MS = 1000;

/**
 * The app's Appearance setting: loads the saved preference once, applies
 * changes at once and saves them in the background. A storage failure never
 * blocks the app: loading falls back to `'system'`, and a failed save keeps
 * the choice for this session. Shaped for `useSyncExternalStore`.
 */
export class AppearanceSettings {
  private state: AppearanceState = { preference: DEFAULT_APPEARANCE, ready: false };
  private readonly listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  /** Set once the user picks a value, so a late load never overwrites it. */
  private chosen = false;

  constructor(
    private readonly store: AppearanceStore,
    private readonly reportError: (message: string, error: unknown) => void = () => {},
  ) {}

  getSnapshot = (): AppearanceState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Reads the saved preference. Safe to call more than once; it reads once. */
  load = (): Promise<void> => {
    this.loading ??= this.store.load().then(
      (preference) => {
        if (this.chosen) this.update({ ready: true });
        else this.update({ preference, ready: true });
      },
      (error: unknown) => {
        this.reportError('Could not read the Appearance setting; using System.', error);
        this.update({ ready: true });
      },
    );
    return this.loading;
  };

  /**
   * Stops waiting for the saved preference (the load timed out). The app shows
   * the current preference; if the load finishes later it still applies,
   * unless the user picked a value meanwhile.
   */
  stopWaiting = (): void => {
    this.update({ ready: true });
  };

  /** Applies a choice now and saves it. Resolves after the save attempt; never rejects. */
  setPreference = async (preference: AppearancePreference): Promise<void> => {
    this.chosen = true;
    this.update({ preference });
    try {
      await this.store.save(preference);
    } catch (error) {
      this.reportError('Could not save the Appearance setting; it applies until the app restarts.', error);
    }
  };

  private update(patch: Partial<AppearanceState>): void {
    const next = { ...this.state, ...patch };
    if (next.preference === this.state.preference && next.ready === this.state.ready) return;
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
}
