import { makeSavedLook } from '@/core/testing/saved-look-fixtures';

import { InMemoryOutfitRepository } from './in-memory-outfit-repository';
import { describeOutfitRepositoryContract } from './outfit-repository.contract';

describeOutfitRepositoryContract('InMemoryOutfitRepository', async () => new InMemoryOutfitRepository());

describe('InMemoryOutfitRepository', () => {
  it('can be seeded and does not share the seed objects', async () => {
    const seed = makeSavedLook();
    const repo = new InMemoryOutfitRepository([seed]);
    seed.pieces.pop();
    seed.rating = 'up';
    expect(await repo.get('look-1')).toEqual(makeSavedLook());
  });
});
