import type { AppearancePreference } from '@/core/appearance';

import { AppearanceSettings } from './appearance-settings';
import { MemoryAppearanceStore, type AppearanceStore } from './appearance-store';

/** A store whose load and save the test settles by hand. */
class ControlledStore implements AppearanceStore {
  saved: AppearancePreference[] = [];
  failSave = false;
  private resolveLoad!: (p: AppearancePreference) => void;
  private rejectLoad!: (e: Error) => void;
  loads = 0;
  private readonly loaded = new Promise<AppearancePreference>((resolve, reject) => {
    this.resolveLoad = resolve;
    this.rejectLoad = reject;
  });

  load(): Promise<AppearancePreference> {
    this.loads++;
    return this.loaded;
  }

  async save(preference: AppearancePreference): Promise<void> {
    if (this.failSave) throw new Error('disk full');
    this.saved.push(preference);
  }

  finishLoad(p: AppearancePreference) {
    this.resolveLoad(p);
  }

  failLoad() {
    this.rejectLoad(new Error('disk'));
  }
}

function track(settings: AppearanceSettings) {
  const seen: string[] = [];
  settings.subscribe(() => {
    const s = settings.getSnapshot();
    seen.push(`${s.preference}${s.ready ? '' : ' (waiting)'}`);
  });
  return seen;
}

describe('AppearanceSettings', () => {
  it('starts as System, not ready', () => {
    const settings = new AppearanceSettings(new MemoryAppearanceStore('dark'));
    expect(settings.getSnapshot()).toEqual({ preference: 'system', ready: false });
  });

  it('applies the saved preference once loaded', async () => {
    const settings = new AppearanceSettings(new MemoryAppearanceStore('dark'));
    const seen = track(settings);
    await settings.load();
    expect(settings.getSnapshot()).toEqual({ preference: 'dark', ready: true });
    // One change, straight to the saved value: no System frame before it.
    expect(seen).toEqual(['dark']);
  });

  it('reads the store once however often load is called', async () => {
    const store = new ControlledStore();
    const settings = new AppearanceSettings(store);
    void settings.load();
    void settings.load();
    store.finishLoad('light');
    await settings.load();
    expect(store.loads).toBe(1);
    expect(settings.getSnapshot().preference).toBe('light');
  });

  it('falls back to System and reports when the store cannot be read', async () => {
    const store = new ControlledStore();
    const errors: string[] = [];
    const settings = new AppearanceSettings(store, (message) => errors.push(message));
    const loading = settings.load();
    store.failLoad();
    await loading;
    expect(settings.getSnapshot()).toEqual({ preference: 'system', ready: true });
    expect(errors).toHaveLength(1);
  });

  it('a choice applies at once, is saved, and survives a restart', async () => {
    const store = new MemoryAppearanceStore();
    const settings = new AppearanceSettings(store);
    await settings.load();
    const seen = track(settings);

    const saving = settings.setPreference('dark');
    expect(settings.getSnapshot().preference).toBe('dark');
    await saving;
    expect(seen).toEqual(['dark']);

    const relaunched = new AppearanceSettings(store);
    await relaunched.load();
    expect(relaunched.getSnapshot().preference).toBe('dark');
  });

  it('notifies only on a real change', async () => {
    const settings = new AppearanceSettings(new MemoryAppearanceStore());
    await settings.load();
    const seen = track(settings);
    await settings.setPreference('system');
    await settings.setPreference('light');
    await settings.setPreference('light');
    expect(seen).toEqual(['light']);
  });

  it('keeps the choice for the session when saving fails', async () => {
    const store = new ControlledStore();
    const errors: string[] = [];
    const settings = new AppearanceSettings(store, (message) => errors.push(message));
    store.finishLoad('system');
    await settings.load();
    store.failSave = true;
    await expect(settings.setPreference('dark')).resolves.toBeUndefined();
    expect(settings.getSnapshot().preference).toBe('dark');
    expect(errors).toHaveLength(1);
  });

  it('after a timeout shows System, then applies a late load', async () => {
    const store = new ControlledStore();
    const settings = new AppearanceSettings(store);
    const seen = track(settings);
    const loading = settings.load();
    settings.stopWaiting();
    expect(settings.getSnapshot()).toEqual({ preference: 'system', ready: true });
    store.finishLoad('dark');
    await loading;
    expect(seen).toEqual(['system', 'dark']);
  });

  it('a late load never overwrites a choice made meanwhile', async () => {
    const store = new ControlledStore();
    const settings = new AppearanceSettings(store);
    const loading = settings.load();
    settings.stopWaiting();
    await settings.setPreference('light');
    store.finishLoad('dark');
    await loading;
    expect(settings.getSnapshot()).toEqual({ preference: 'light', ready: true });
    expect(store.saved).toEqual(['light']);
  });

  it('stops notifying after unsubscribe', async () => {
    const settings = new AppearanceSettings(new MemoryAppearanceStore());
    const listener = jest.fn();
    const unsubscribe = settings.subscribe(listener);
    unsubscribe();
    await settings.setPreference('dark');
    expect(listener).not.toHaveBeenCalled();
  });
});
