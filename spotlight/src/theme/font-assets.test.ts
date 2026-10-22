import { FONT_ASSETS } from './font-assets';
import { FONT_FAMILIES } from './typography';

describe('FONT_ASSETS', () => {
  it('registers a font file for every family the theme uses, and nothing else', () => {
    expect(Object.keys(FONT_ASSETS).sort()).toEqual([...FONT_FAMILIES].sort());
    for (const asset of Object.values(FONT_ASSETS)) expect(asset).toBeDefined();
  });
});
