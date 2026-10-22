import { pickColorScheme } from './scheme';

describe('pickColorScheme', () => {
  it('prefers the local override, then the Appearance setting, then the system', () => {
    expect(pickColorScheme({ override: 'dark', appearance: 'light', system: 'light' })).toBe('dark');
    expect(pickColorScheme({ override: 'light', appearance: 'dark', system: 'dark' })).toBe('light');
    expect(pickColorScheme({ override: null, appearance: 'dark', system: 'light' })).toBe('dark');
    expect(pickColorScheme({ override: null, appearance: null, system: 'dark' })).toBe('dark');
    expect(pickColorScheme({ override: null, appearance: null, system: null })).toBe('light');
  });
});
