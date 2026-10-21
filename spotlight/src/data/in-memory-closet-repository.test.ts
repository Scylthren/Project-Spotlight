import { describeClosetRepositoryContract, makeColor, makeItem } from './closet-repository.contract';
import { InMemoryClosetRepository } from './in-memory-closet-repository';

describeClosetRepositoryContract('InMemoryClosetRepository', async () => new InMemoryClosetRepository());

describe('InMemoryClosetRepository', () => {
  it('can be seeded and does not share the seed objects', async () => {
    const seed = makeItem();
    const repo = new InMemoryClosetRepository([seed]);
    seed.colors.push(makeColor('red'));
    seed.colors[0].source = 'auto';
    expect(await repo.get('item-1')).toEqual(makeItem());
  });
});
