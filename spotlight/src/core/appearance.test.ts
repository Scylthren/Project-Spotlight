import {
  APPEARANCE_LABELS,
  APPEARANCE_PREFERENCES,
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  nativeColorSchemeOverride,
  parseAppearancePreference,
  resolveAppearance,
} from './appearance';

describe('appearance preference', () => {
  it('offers Light, Dark and System in that order, defaulting to System', () => {
    expect(APPEARANCE_PREFERENCES).toEqual(['light', 'dark', 'system']);
    expect(APPEARANCE_PREFERENCES.map((p) => APPEARANCE_LABELS[p])).toEqual(['Light', 'Dark', 'System']);
    expect(DEFAULT_APPEARANCE).toBe('system');
  });

  it('recognises only the three exact values', () => {
    for (const p of APPEARANCE_PREFERENCES) expect(isAppearancePreference(p)).toBe(true);
    for (const v of ['Dark', 'LIGHT', ' dark', '', 'auto', 'unspecified', null, undefined, 1, {}]) {
      expect(isAppearancePreference(v)).toBe(false);
    }
  });
});

describe('parseAppearancePreference', () => {
  it('reads the stored values', () => {
    expect(parseAppearancePreference('light')).toBe('light');
    expect(parseAppearancePreference('dark')).toBe('dark');
    expect(parseAppearancePreference('system')).toBe('system');
  });

  it('treats a missing or unknown value as System', () => {
    for (const v of [null, undefined, '', 'Dark', 'sepia', '"dark"', 42, true]) {
      expect(parseAppearancePreference(v)).toBe('system');
    }
  });
});

describe('resolveAppearance', () => {
  it('Light and Dark ignore the system scheme', () => {
    for (const system of ['light', 'dark', 'unspecified', null, undefined]) {
      expect(resolveAppearance('light', system)).toBe('light');
      expect(resolveAppearance('dark', system)).toBe('dark');
    }
  });

  it('System follows the OS scheme', () => {
    expect(resolveAppearance('system', 'dark')).toBe('dark');
    expect(resolveAppearance('system', 'light')).toBe('light');
  });

  it('System falls back to light when the OS reports nothing', () => {
    expect(resolveAppearance('system', 'unspecified')).toBe('light');
    expect(resolveAppearance('system', null)).toBe('light');
    expect(resolveAppearance('system', undefined)).toBe('light');
  });
});

describe('nativeColorSchemeOverride', () => {
  it('forces Light and Dark, and clears the override for System', () => {
    expect(nativeColorSchemeOverride('light')).toBe('light');
    expect(nativeColorSchemeOverride('dark')).toBe('dark');
    expect(nativeColorSchemeOverride('system')).toBe('unspecified');
  });
});
