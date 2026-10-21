/**
 * Shared behavior every `ClosetRepository` must have. Not a test file itself:
 * each implementation's test calls `describeClosetRepositoryContract`.
 */
import type { ClothingItem } from '@/core';

import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';

export function makeItem(overrides: Partial<ClothingItem> = {}): ClothingItem {
  return {
    id: 'item-1',
    imageUri: 'closet-images/item-1.jpg',
    category: 'top',
    colors: ['black'],
    seasons: ['summer'],
    tags: [],
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

async function expectRepoError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ClosetRepositoryError);
  expect((error as ClosetRepositoryError).code).toBe(code);
}

export function describeClosetRepositoryContract(
  name: string,
  createRepository: () => Promise<ClosetRepository>,
): void {
  describe(`ClosetRepository contract: ${name}`, () => {
    let repo: ClosetRepository;

    beforeEach(async () => {
      repo = await createRepository();
    });

    it('starts empty', async () => {
      expect(await repo.list()).toEqual([]);
      expect(await repo.get('missing')).toBeNull();
    });

    it('round-trips every field of an added item', async () => {
      const item = makeItem({
        colors: ['navy', 'off-white'],
        seasons: ['spring', 'autumn'],
        category: 'outerwear',
        imageUri: 'file:///var/mobile/x/closet-images/item-1.heic',
        updatedAt: '2026-01-16T00:00:00.000Z',
      });
      await repo.add(item);
      expect(await repo.get('item-1')).toEqual(item);
      expect(await repo.list()).toEqual([item]);
    });

    it('lists newest first by instant, ties by id ascending', async () => {
      const older = makeItem({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' });
      // 09:00+05:30 is 03:30Z: later than `older`, earlier than `newer`.
      const offset = makeItem({ id: 'offset', createdAt: '2026-01-02T09:00:00+05:30' });
      const newer = makeItem({ id: 'new', createdAt: '2026-01-02T04:00:00.000Z' });
      const tieB = makeItem({ id: 'tie-b', createdAt: '2026-01-03T00:00:00.000Z' });
      const tieA = makeItem({ id: 'tie-a', createdAt: '2026-01-03T00:00:00.000Z' });
      for (const item of [offset, tieB, older, newer, tieA]) await repo.add(item);
      expect((await repo.list()).map((i) => i.id)).toEqual([
        'tie-a',
        'tie-b',
        'new',
        'offset',
        'old',
      ]);
    });

    it('rejects a duplicate id and keeps the original', async () => {
      const original = makeItem();
      await repo.add(original);
      await expectRepoError(repo.add(makeItem({ colors: ['red'] })), 'duplicate');
      expect(await repo.list()).toEqual([original]);
    });

    it('rejects an invalid item and stores nothing', async () => {
      await expectRepoError(repo.add(makeItem({ colors: [] })), 'invalid');
      await expectRepoError(repo.add({ ...makeItem(), category: 'hat' } as never), 'invalid');
      expect(await repo.list()).toEqual([]);
    });

    it('returns copies, so callers cannot mutate stored data', async () => {
      const item = makeItem();
      await repo.add(item);
      item.colors.push('mutated-after-add');
      const fetched = await repo.get('item-1');
      fetched!.colors.push('mutated-after-get');
      (await repo.list())[0].seasons.push('winter');
      expect(await repo.get('item-1')).toEqual(makeItem());
    });

    it('treats ids as exact strings', async () => {
      await repo.add(makeItem({ id: 'Item-1' }));
      expect(await repo.get('item-1')).toBeNull();
      expect(await repo.get("Item-1' OR '1'='1")).toBeNull();
      expect((await repo.get('Item-1'))?.id).toBe('Item-1');
    });

    describe('update', () => {
      it('replaces the editable fields, keeps createdAt, and stores the new updatedAt', async () => {
        await repo.add(makeItem());
        const edited = makeItem({
          imageUri: 'closet-images/item-1-new.jpg',
          category: 'outerwear',
          colors: ['green', 'grey'],
          seasons: ['winter', 'autumn'],
          // A caller cannot rewrite history: createdAt is ignored.
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2026-03-01T08:30:00.000Z',
        });
        await repo.update(edited);
        const expected = { ...edited, createdAt: makeItem().createdAt };
        expect(await repo.get('item-1')).toEqual(expected);
        expect(await repo.list()).toEqual([expected]);
      });

      it('does not change list order (sorted by createdAt)', async () => {
        await repo.add(makeItem({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }));
        await repo.add(makeItem({ id: 'b', createdAt: '2026-01-02T00:00:00.000Z' }));
        await repo.update(makeItem({ id: 'a', colors: ['red'], updatedAt: '2026-05-01T00:00:00.000Z' }));
        expect((await repo.list()).map((i) => i.id)).toEqual(['b', 'a']);
      });

      it('rejects an unknown id with not_found and stores nothing', async () => {
        await expectRepoError(repo.update(makeItem({ id: 'ghost' })), 'not_found');
        expect(await repo.list()).toEqual([]);
      });

      it('rejects an invalid item and keeps the stored one unchanged', async () => {
        const original = makeItem();
        await repo.add(original);
        await expectRepoError(repo.update(makeItem({ seasons: [] })), 'invalid');
        await expectRepoError(repo.update({ ...makeItem(), category: 'hat' } as never), 'invalid');
        await expectRepoError(repo.update(makeItem({ updatedAt: 'yesterday' })), 'invalid');
        expect(await repo.get('item-1')).toEqual(original);
      });

      it('only touches the item with that exact id', async () => {
        const other = makeItem({ id: 'Item-1' });
        await repo.add(makeItem());
        await repo.add(other);
        await repo.update(makeItem({ colors: ['red'], updatedAt: '2026-02-01T00:00:00.000Z' }));
        expect(await repo.get('Item-1')).toEqual(other);
      });

      it('copies its input, so later mutation does not change stored data', async () => {
        await repo.add(makeItem());
        const edited = makeItem({ colors: ['red'] });
        await repo.update(edited);
        edited.colors.push('mutated');
        expect((await repo.get('item-1'))?.colors).toEqual(['red']);
      });
    });

    describe('tags', () => {
      it('round-trips tags in order, and an item without tags has an empty list', async () => {
        const tagged = makeItem({ id: 'tagged', tags: ['work', '90s', 'office casual'] });
        const plain = makeItem({ id: 'plain' });
        await repo.add(tagged);
        await repo.add(plain);
        expect(await repo.get('tagged')).toEqual(tagged);
        expect(await repo.get('plain')).toEqual(plain);
        expect((await repo.list()).find((i) => i.id === 'tagged')).toEqual(tagged);
      });

      it('starts with no saved tags', async () => {
        expect(await repo.listTags()).toEqual([]);
      });

      it('saving an item with new tags adds them to the list, sorted, with usage counts', async () => {
        await repo.add(makeItem({ id: 'a', tags: ['emo', '90s'] }));
        await repo.add(makeItem({ id: 'b', tags: ['90s'] }));
        await repo.update(makeItem({ id: 'b', tags: ['90s', 'work'] }));
        expect(await repo.listTags()).toEqual([
          { name: '90s', itemCount: 2 },
          { name: 'emo', itemCount: 1 },
          { name: 'work', itemCount: 1 },
        ]);
      });

      it('keeps unused tags on the list after an edit or a delete', async () => {
        await repo.add(makeItem({ id: 'a', tags: ['emo'] }));
        await repo.add(makeItem({ id: 'b', tags: ['work'] }));
        await repo.update(makeItem({ id: 'a', tags: [] }));
        await repo.remove('b');
        expect(await repo.listTags()).toEqual([
          { name: 'emo', itemCount: 0 },
          { name: 'work', itemCount: 0 },
        ]);
        // A later item reuses the same tag rather than creating a second one.
        await repo.add(makeItem({ id: 'c', tags: ['emo'] }));
        expect(await repo.listTags()).toEqual([
          { name: 'emo', itemCount: 1 },
          { name: 'work', itemCount: 0 },
        ]);
      });

      it('update replaces the tag list (removes, adds, and reorders)', async () => {
        await repo.add(makeItem({ tags: ['a', 'b', 'c'] }));
        await repo.update(makeItem({ tags: ['c', 'd'], updatedAt: '2026-02-01T00:00:00.000Z' }));
        expect((await repo.get('item-1'))?.tags).toEqual(['c', 'd']);
      });

      it('deleteTag removes the tag from the list and every item, leaving the rest of each item alone', async () => {
        const a = makeItem({ id: 'a', tags: ['emo', '90s'], updatedAt: '2026-01-20T00:00:00.000Z' });
        const b = makeItem({ id: 'b', tags: ['90s'], colors: ['red'] });
        const c = makeItem({ id: 'c', tags: ['work'] });
        for (const item of [a, b, c]) await repo.add(item);

        await repo.deleteTag('90s');

        expect(await repo.get('a')).toEqual({ ...a, tags: ['emo'] });
        expect(await repo.get('b')).toEqual({ ...b, tags: [] });
        expect(await repo.get('c')).toEqual(c);
        expect(await repo.listTags()).toEqual([
          { name: 'emo', itemCount: 1 },
          { name: 'work', itemCount: 1 },
        ]);
      });

      it('deleteTag normalizes its input, deletes unused tags, and rejects unknown ones', async () => {
        await repo.add(makeItem({ tags: ['office casual'] }));
        await repo.update(makeItem({ tags: [] }));
        await repo.deleteTag('  Office   CASUAL ');
        expect(await repo.listTags()).toEqual([]);
        await expectRepoError(repo.deleteTag('office casual'), 'not_found');
        await expectRepoError(repo.deleteTag('ghost'), 'not_found');
        await expectRepoError(repo.deleteTag("x' OR '1'='1"), 'not_found');
      });

      it('a deleted tag can be created again by saving an item', async () => {
        await repo.add(makeItem({ tags: ['emo'] }));
        await repo.deleteTag('emo');
        await repo.update(makeItem({ tags: ['emo'], updatedAt: '2026-02-01T00:00:00.000Z' }));
        expect(await repo.listTags()).toEqual([{ name: 'emo', itemCount: 1 }]);
      });

      it('rejects un-normalized, duplicate, or too many tags and stores nothing', async () => {
        await expectRepoError(repo.add(makeItem({ tags: ['EMO'] })), 'invalid');
        await expectRepoError(repo.add(makeItem({ tags: ['emo', 'emo'] })), 'invalid');
        await expectRepoError(
          repo.add(makeItem({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) })),
          'invalid',
        );
        expect(await repo.list()).toEqual([]);
        expect(await repo.listTags()).toEqual([]);
        await repo.add(makeItem({ tags: ['emo'] }));
        await expectRepoError(repo.update(makeItem({ tags: [' work'] })), 'invalid');
        expect((await repo.get('item-1'))?.tags).toEqual(['emo']);
        expect(await repo.listTags()).toEqual([{ name: 'emo', itemCount: 1 }]);
      });

      it('a rejected duplicate add does not add its tags to the list', async () => {
        await repo.add(makeItem({ tags: ['emo'] }));
        await expectRepoError(repo.add(makeItem({ tags: ['work'] })), 'duplicate');
        expect(await repo.listTags()).toEqual([{ name: 'emo', itemCount: 1 }]);
        expect((await repo.get('item-1'))?.tags).toEqual(['emo']);
      });

      it('an update of an unknown id does not add its tags to the list', async () => {
        await expectRepoError(repo.update(makeItem({ id: 'ghost', tags: ['work'] })), 'not_found');
        expect(await repo.listTags()).toEqual([]);
      });

      it('returns copies of tags', async () => {
        const item = makeItem({ tags: ['emo'] });
        await repo.add(item);
        item.tags.push('mutated');
        (await repo.get('item-1'))!.tags.push('mutated');
        (await repo.list())[0].tags.push('mutated');
        (await repo.listTags())[0].itemCount = 99;
        expect((await repo.get('item-1'))?.tags).toEqual(['emo']);
        expect(await repo.listTags()).toEqual([{ name: 'emo', itemCount: 1 }]);
      });

      it('removing an item frees its tags, so a new item with the same id starts clean', async () => {
        await repo.add(makeItem({ tags: ['emo', 'work'] }));
        await repo.remove('item-1');
        await repo.add(makeItem());
        expect((await repo.get('item-1'))?.tags).toEqual([]);
      });

      it('handles concurrent writes without losing any', async () => {
        await Promise.all([
          repo.add(makeItem({ id: 'a', tags: ['emo'] })),
          repo.add(makeItem({ id: 'b', tags: ['emo', 'work'] })),
          repo.add(makeItem({ id: 'c', tags: ['90s'] })),
        ]);
        await Promise.all([repo.deleteTag('work'), repo.update(makeItem({ id: 'c', tags: ['90s', 'y2k'] }))]);
        expect((await repo.list()).map((i) => [i.id, i.tags])).toEqual([
          ['a', ['emo']],
          ['b', ['emo']],
          ['c', ['90s', 'y2k']],
        ]);
        expect((await repo.listTags()).map((t) => t.name)).toEqual(['90s', 'emo', 'y2k']);
      });
    });

    describe('remove', () => {
      it('deletes only the given item', async () => {
        const keep = makeItem({ id: 'keep' });
        await repo.add(makeItem());
        await repo.add(keep);
        await repo.remove('item-1');
        expect(await repo.get('item-1')).toBeNull();
        expect(await repo.list()).toEqual([keep]);
      });

      it('rejects an unknown id with not_found, including a second remove', async () => {
        await expectRepoError(repo.remove('missing'), 'not_found');
        await repo.add(makeItem());
        await repo.remove('item-1');
        await expectRepoError(repo.remove('item-1'), 'not_found');
        await expectRepoError(repo.remove("item-1' OR '1'='1"), 'not_found');
      });

      it('frees the id so it can be added again', async () => {
        await repo.add(makeItem());
        await repo.remove('item-1');
        const again = makeItem({ colors: ['white'] });
        await repo.add(again);
        expect(await repo.list()).toEqual([again]);
      });
    });
  });
}
