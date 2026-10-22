import { FONT_LOAD_TIMEOUT_MS, isFontGateOpen } from './font-gate';

describe('isFontGateOpen', () => {
  it('stays closed only while fonts are still loading within the timeout', () => {
    expect(isFontGateOpen({ loaded: false, error: null, timedOut: false })).toBe(false);
  });

  it('opens when loaded, on error, or on timeout', () => {
    expect(isFontGateOpen({ loaded: true, error: null, timedOut: false })).toBe(true);
    expect(isFontGateOpen({ loaded: false, error: new Error('boom'), timedOut: false })).toBe(true);
    expect(isFontGateOpen({ loaded: false, error: null, timedOut: true })).toBe(true);
  });

  it('has a bounded timeout', () => {
    expect(FONT_LOAD_TIMEOUT_MS).toBeGreaterThan(0);
    expect(FONT_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });
});
