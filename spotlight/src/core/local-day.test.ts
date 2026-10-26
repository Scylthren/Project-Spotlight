import { localDayKey } from './local-day';

describe('localDayKey', () => {
  it('uses the local calendar day, zero-padded', () => {
    expect(localDayKey(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
    expect(localDayKey(new Date(2026, 9, 26, 23, 59, 59))).toBe('2026-10-26');
    expect(localDayKey(new Date(2026, 9, 27, 0, 0, 0))).toBe('2026-10-27');
  });
});
