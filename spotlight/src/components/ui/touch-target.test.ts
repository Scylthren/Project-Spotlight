import { sizes } from '@/theme';

import { hitSlopFor, touchArea } from './touch-target';

describe('hitSlopFor', () => {
  it('grows a 36 pt chip to 44 pt, split evenly', () => {
    expect(hitSlopFor({ height: 36 })).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
  });

  it('rounds odd gaps up so the area never falls short', () => {
    const slop = hitSlopFor({ height: 41, width: 27 });
    expect(touchArea({ height: 41, width: 27 }, slop).height).toBeGreaterThanOrEqual(44);
    expect(touchArea({ height: 41, width: 27 }, slop).width).toBeGreaterThanOrEqual(44);
  });

  it('adds nothing to controls already at or above the minimum', () => {
    expect(hitSlopFor({ height: 52, width: 44 })).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  it('uses the theme minimum, 44 pt', () => {
    expect(sizes.minTouchTarget).toBe(44);
  });
});
