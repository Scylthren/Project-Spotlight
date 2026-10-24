import { makeSavedLook, piece } from '@/core/testing/saved-look-fixtures';

import { CLOSET_ITEM_MESSAGES } from './add-closet-item';
import { makeItem, makePhoto } from './closet-repository.contract';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import { deleteClosetItem, removeEmptyLooks } from './delete-closet-item';
import { InMemoryOutfitRepository } from './in-memory-outfit-repository';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { MemoryImageStore } from './memory-image-store';

const REF = 'closet-images/item-1-abc.jpg';
const OTHER_REF = 'closet-images/other-def.jpg';

function setup() {
  const item = makeItem({ photos: [makePhoto('item-1', { path: REF })] });
  const other = makeItem({ id: 'other', photos: [makePhoto('other', { path: OTHER_REF })] });
  const repository = new InMemoryClosetRepository([item, other]);
  const imageStore = new MemoryImageStore();
  imageStore.files.set(REF, 'file:///a.jpg');
  imageStore.files.set(OTHER_REF, 'file:///b.jpg');
  const onCleanupError = jest.fn();
  return { item, other, repository, imageStore, onCleanupError, deps: { repository, imageStore, onCleanupError } };
}

function withRemove(repo: ClosetRepository, remove: ClosetRepository['remove']): ClosetRepository {
  return {
    list: () => repo.list(),
    get: (id) => repo.get(id),
    add: (item) => repo.add(item),
    update: (item) => repo.update(item),
    remove,
    listTags: () => repo.listTags(),
    deleteTag: (name) => repo.deleteTag(name),
  };
}

describe('deleteClosetItem', () => {
  it('removes the row and then its photo, leaving other items alone', async () => {
    const { other, repository, imageStore, deps } = setup();
    const order: string[] = [];
    const tracked = withRemove(repository, async (id) => {
      order.push(`row:${id}`);
      await repository.remove(id);
    });
    const remove = imageStore.remove.bind(imageStore);
    imageStore.remove = async (ref) => {
      order.push(`file:${ref}`);
      await remove(ref);
    };

    expect(await deleteClosetItem('item-1', { ...deps, repository: tracked })).toEqual({ ok: true });
    expect(order).toEqual(['row:item-1', `file:${REF}`]);
    expect(await repository.list()).toEqual([other]);
    expect([...imageStore.files.keys()]).toEqual([OTHER_REF]);
  });

  it('still deletes the item if the photo cannot be removed, and reports the stray file', async () => {
    const { repository, imageStore, deps, onCleanupError } = setup();
    const cleanupError = new Error('EBUSY');
    imageStore.failNextRemove = cleanupError;

    expect(await deleteClosetItem('item-1', deps)).toEqual({ ok: true });
    expect(await repository.get('item-1')).toBeNull();
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError, REF);
    expect(imageStore.files.has(REF)).toBe(true);
  });

  it('if removing the row fails, keeps the item and its photo', async () => {
    const { item, repository, imageStore, deps } = setup();
    const broken = withRemove(repository, async () => {
      throw new Error('disk I/O error');
    });
    const result = await deleteClosetItem('item-1', { ...deps, repository: broken });

    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.deleteFailed] });
    expect(await repository.get('item-1')).toEqual(item);
    expect(imageStore.files.has(REF)).toBe(true);
  });

  it('reports not found for an unknown id and touches nothing', async () => {
    const { repository, imageStore, deps } = setup();
    expect(await deleteClosetItem('missing', deps)).toEqual({
      ok: false,
      errors: [CLOSET_ITEM_MESSAGES.notFound],
    });
    expect(await repository.list()).toHaveLength(2);
    expect(imageStore.files.size).toBe(2);
  });

  it('reports not found if the row vanished before remove, and keeps the photo', async () => {
    const { repository, imageStore, deps } = setup();
    const racing = withRemove(repository, async () => {
      throw new ClosetRepositoryError('not_found', 'gone');
    });
    const result = await deleteClosetItem('item-1', { ...deps, repository: racing });
    expect(result).toEqual({ ok: false, errors: [CLOSET_ITEM_MESSAGES.notFound] });
    expect(imageStore.files.has(REF)).toBe(true);
  });

  it('deletes every photo file of an item with several angles, after the row', async () => {
    const { other, repository, imageStore, deps } = setup();
    const refs = ['closet-images/multi-f.jpg', 'closet-images/multi-b.jpg', 'closet-images/multi-d.jpg'];
    await repository.add(
      makeItem({
        id: 'multi',
        photos: [
          makePhoto('multi', { path: refs[0] }),
          makePhoto('multi', { sortOrder: 1, role: 'back', path: refs[1] }),
          makePhoto('multi', { sortOrder: 2, role: 'detail', path: refs[2] }),
        ],
      }),
    );
    for (const ref of refs) imageStore.files.set(ref, 'file:///x.jpg');
    const order: string[] = [];
    const tracked = withRemove(repository, async (id) => {
      order.push(`row:${id}`);
      await repository.remove(id);
    });
    const remove = imageStore.remove.bind(imageStore);
    imageStore.remove = async (ref) => {
      order.push(`file:${ref}`);
      await remove(ref);
    };

    expect(await deleteClosetItem('multi', { ...deps, repository: tracked })).toEqual({ ok: true });
    expect(order).toEqual(['row:multi', ...refs.map((r) => `file:${r}`)]);
    expect(await repository.get('multi')).toBeNull();
    expect((await repository.list()).map((i) => i.id)).toContain(other.id);
    expect([...imageStore.files.keys()].sort()).toEqual([OTHER_REF, REF].sort());
  });

  it('if one photo file cannot be deleted, still deletes the others and reports only that one', async () => {
    const { repository, imageStore, deps, onCleanupError } = setup();
    const refs = ['closet-images/m-f.jpg', 'closet-images/m-d.jpg'];
    await repository.add(
      makeItem({
        id: 'm',
        photos: [makePhoto('m', { path: refs[0] }), makePhoto('m', { sortOrder: 1, role: 'detail', path: refs[1] })],
      }),
    );
    for (const ref of refs) imageStore.files.set(ref, 'file:///x.jpg');
    const cleanupError = new Error('EBUSY');
    imageStore.failNextRemove = cleanupError;

    expect(await deleteClosetItem('m', deps)).toEqual({ ok: true });
    expect(onCleanupError.mock.calls).toEqual([[cleanupError, refs[0]]]);
    expect(imageStore.files.has(refs[0])).toBe(true);
    expect(imageStore.files.has(refs[1])).toBe(false);
  });

  it('a second delete of the same item is reported, not repeated', async () => {
    const { deps } = setup();
    expect(await deleteClosetItem('item-1', deps)).toEqual({ ok: true });
    expect(await deleteClosetItem('item-1', deps)).toEqual({
      ok: false,
      errors: [CLOSET_ITEM_MESSAGES.notFound],
    });
  });
});

describe('deleteClosetItem and saved looks (D5)', () => {
  it('keeps a look that still has a piece, and deletes a look with none left', async () => {
    const { deps } = setup();
    const withOther = makeSavedLook({ id: 'with-other', pieces: [piece('item-1', 'top'), piece('other', 'top')] });
    const onlyThis = makeSavedLook({ id: 'only-this', pieces: [piece('item-1', 'top')] });
    const outfits = new InMemoryOutfitRepository([withOther, onlyThis]);

    expect(await deleteClosetItem('item-1', { ...deps, outfits })).toEqual({ ok: true });
    expect(await outfits.list()).toEqual([withOther]);
  });

  it('a failing look cleanup never fails the item delete', async () => {
    const { deps, repository } = setup();
    const outfits = new InMemoryOutfitRepository();
    outfits.removeLooksWithNoPiecesIn = () => Promise.reject(new Error('disk full'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(await deleteClosetItem('item-1', { ...deps, outfits })).toEqual({ ok: true });
      expect(await repository.get('item-1')).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('removeEmptyLooks returns the deleted ids', async () => {
    const { repository } = setup();
    const outfits = new InMemoryOutfitRepository([makeSavedLook({ pieces: [piece('gone', 'dress')] })]);
    expect(await removeEmptyLooks(repository, outfits)).toEqual(['look-1']);
  });
});
