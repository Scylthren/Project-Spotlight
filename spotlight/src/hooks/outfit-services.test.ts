import { RemoteOutfitGenerator } from '@/ai/remote-outfit-generator';
import { InMemoryDevTokenStore } from '@/data/dev-token-store';

import { MockOutfitGenerator } from '@/ai/outfit-generator';
import { closetItem } from '@/ai/testing/outfit-fixtures';

import { createOutfitGenerator, styleOutfitGenerator } from './outfit-services';

describe('createOutfitGenerator', () => {
  it('gives the remote generator by default (the session token store)', () => {
    expect(createOutfitGenerator()).toBeInstanceOf(RemoteOutfitGenerator);
  });

  it('uses the token store and URL it is given', async () => {
    const generator = createOutfitGenerator(new InMemoryDevTokenStore(null), null);
    expect(await generator.generate({ request: 'x', items: [] })).toEqual({ ok: false, failure: 'not-configured' });
  });
});

describe('styleOutfitGenerator (slice 2)', () => {
  it('is the mock in demo mode: no network, stub looks with an accessory, after a short wait', async () => {
    jest.useFakeTimers();
    try {
      const generator = styleOutfitGenerator();
      expect(generator).toBeInstanceOf(MockOutfitGenerator);
      const closet = [closetItem('t', 'top'), closetItem('b', 'bottom'), closetItem('s', 'shoes'), closetItem('a', 'accessory')];
      const pending = generator.generate({ request: 'x', items: closet });
      await jest.advanceTimersByTimeAsync(1200);
      const outcome = await pending;
      expect(outcome).toMatchObject({ ok: true, stub: true });
      if (outcome.ok) expect(outcome.outfits[0].itemIds).toEqual(['t', 'b', 's', 'a']);
    } finally {
      jest.useRealTimers();
    }
  });
});
