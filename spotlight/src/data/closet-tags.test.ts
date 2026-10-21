import { makeItem } from './closet-repository.contract';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import { deleteSavedTag, loadSavedTags, TAG_LIST_MESSAGES } from './closet-tags';
import { InMemoryClosetRepository } from './in-memory-closet-repository';

function withTags(repo: ClosetRepository, overrides: Partial<ClosetRepository>): ClosetRepository {
  return {
    list: () => repo.list(),
    get: (id) => repo.get(id),
    add: (item) => repo.add(item),
    update: (item) => repo.update(item),
    remove: (id) => repo.remove(id),
    listTags: () => repo.listTags(),
    deleteTag: (name) => repo.deleteTag(name),
    ...overrides,
  };
}

describe('loadSavedTags', () => {
  it('returns the saved list', async () => {
    const repo = new InMemoryClosetRepository([makeItem({ tags: ['emo'] })]);
    expect(await loadSavedTags(repo)).toEqual({ ok: true, tags: [{ name: 'emo', itemCount: 1 }] });
  });

  it('turns a failure into a user-facing error', async () => {
    const repo = withTags(new InMemoryClosetRepository(), {
      listTags: async () => {
        throw new Error('disk I/O error');
      },
    });
    expect(await loadSavedTags(repo)).toEqual({ ok: false, errors: [TAG_LIST_MESSAGES.loadFailed] });
  });
});

describe('deleteSavedTag', () => {
  it('removes the tag from the list and from items, without bumping updatedAt', async () => {
    const item = makeItem({ tags: ['emo', '90s'] });
    const repo = new InMemoryClosetRepository([item]);
    expect(await deleteSavedTag('emo', repo)).toEqual({ ok: true });
    expect(await repo.get('item-1')).toEqual({ ...item, tags: ['90s'] });
    expect(await repo.listTags()).toEqual([{ name: '90s', itemCount: 1 }]);
  });

  it('reports an already deleted tag', async () => {
    expect(await deleteSavedTag('ghost', new InMemoryClosetRepository())).toEqual({
      ok: false,
      errors: [TAG_LIST_MESSAGES.notFound],
    });
  });

  it('reports other failures', async () => {
    const repo = withTags(new InMemoryClosetRepository(), {
      deleteTag: async () => {
        throw new Error('disk I/O error');
      },
    });
    expect(await deleteSavedTag('emo', repo)).toEqual({ ok: false, errors: [TAG_LIST_MESSAGES.deleteFailed] });
    const notFound = withTags(new InMemoryClosetRepository(), {
      deleteTag: async () => {
        throw new ClosetRepositoryError('not_found', 'gone');
      },
    });
    expect(await deleteSavedTag('emo', notFound)).toEqual({ ok: false, errors: [TAG_LIST_MESSAGES.notFound] });
  });
});
