import { RemoteOutfitGenerator } from '@/ai/remote-outfit-generator';
import { InMemoryDevTokenStore } from '@/data/dev-token-store';

import { MockOutfitGenerator } from '@/ai/outfit-generator';

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

describe('styleOutfitGenerator (slice 3)', () => {
  it('is the remote generator (real looks from the generate-outfits function)', () => {
    expect(styleOutfitGenerator()).toBeInstanceOf(RemoteOutfitGenerator);
  });

  it('is not the demo mock any more', () => {
    expect(styleOutfitGenerator()).not.toBeInstanceOf(MockOutfitGenerator);
  });
});
