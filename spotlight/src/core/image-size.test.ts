import { fitWithinMaxEdge, MAX_STORED_IMAGE_EDGE, needsDownscale } from '@/core';

describe('fitWithinMaxEdge', () => {
  it('uses 1600px as the default limit', () => {
    expect(MAX_STORED_IMAGE_EDGE).toBe(1600);
  });

  it('scales a landscape photo so the width is 1600', () => {
    expect(fitWithinMaxEdge({ width: 4032, height: 3024 })).toEqual({ width: 1600, height: 1200 });
  });

  it('scales a portrait photo so the height is 1600', () => {
    expect(fitWithinMaxEdge({ width: 3024, height: 4032 })).toEqual({ width: 1200, height: 1600 });
  });

  it('scales a square photo to 1600 x 1600', () => {
    expect(fitWithinMaxEdge({ width: 3000, height: 3000 })).toEqual({ width: 1600, height: 1600 });
  });

  it('never upscales a photo that is already small', () => {
    expect(fitWithinMaxEdge({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(fitWithinMaxEdge({ width: 1, height: 1 })).toEqual({ width: 1, height: 1 });
    expect(needsDownscale({ width: 800, height: 600 })).toBe(false);
  });

  it('leaves a photo whose longest edge is exactly 1600 unchanged', () => {
    expect(fitWithinMaxEdge({ width: 1600, height: 900 })).toEqual({ width: 1600, height: 900 });
    expect(fitWithinMaxEdge({ width: 900, height: 1600 })).toEqual({ width: 900, height: 1600 });
    expect(needsDownscale({ width: 1600, height: 1600 })).toBe(false);
    expect(needsDownscale({ width: 1601, height: 1600 })).toBe(true);
  });

  it('rounds the short edge and keeps it at least 1px', () => {
    expect(fitWithinMaxEdge({ width: 4000, height: 2999 })).toEqual({ width: 1600, height: 1200 });
    expect(fitWithinMaxEdge({ width: 10_000, height: 1 })).toEqual({ width: 1600, height: 1 });
    expect(fitWithinMaxEdge({ width: 1, height: 10_000 })).toEqual({ width: 1, height: 1600 });
  });

  it('respects a custom limit', () => {
    expect(fitWithinMaxEdge({ width: 1000, height: 500 }, 100)).toEqual({ width: 100, height: 50 });
  });

  it('rejects sizes that are not positive finite numbers', () => {
    expect(() => fitWithinMaxEdge({ width: 0, height: 10 })).toThrow(/width/);
    expect(() => fitWithinMaxEdge({ width: 10, height: -1 })).toThrow(/height/);
    expect(() => fitWithinMaxEdge({ width: Number.NaN, height: 10 })).toThrow(/width/);
    expect(() => fitWithinMaxEdge({ width: 10, height: 10 }, 0)).toThrow(/maxEdge/);
  });
});
