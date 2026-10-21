import { CLOSET_ITEM_MESSAGES } from './add-closet-item';
import { makeItem } from './closet-repository.contract';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import { deleteClosetItem } from './delete-closet-item';
import { InMemoryClosetRepository } from './in-memory-closet-repository';
import { MemoryImageStore } from './memory-image-store';

const REF = 'closet-images/item-1-abc.jpg';
const OTHER_REF = 'closet-images/other-def.jpg';

function setup() {
  const item = makeItem({ imageUri: REF });
  const other = makeItem({ id: 'other', imageUri: OTHER_REF });
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

  it('a second delete of the same item is reported, not repeated', async () => {
    const { deps } = setup();
    expect(await deleteClosetItem('item-1', deps)).toEqual({ ok: true });
    expect(await deleteClosetItem('item-1', deps)).toEqual({
      ok: false,
      errors: [CLOSET_ITEM_MESSAGES.notFound],
    });
  });
});
