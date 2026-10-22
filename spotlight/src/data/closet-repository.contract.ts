/**
 * Shared behavior every `ClosetRepository` must have. Not a test file itself:
 * each implementation's test calls `describeClosetRepositoryContract`.
 */
import { paletteColor, type ClothingItem, type ItemColor, type ItemPhoto, type PaletteId } from '@/core';

import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';

/** A photo for `itemId`. Its id is derived from the item id and position, so ids differ across items. */
export function makePhoto(itemId: string, overrides: Partial<ItemPhoto> = {}): ItemPhoto {
  const sortOrder = overrides.sortOrder ?? 0;
  return {
    id: `${itemId}-photo-${sortOrder}`,
    role: 'front',
    path: `closet-images/${itemId}-${sortOrder}.jpg`,
    sortOrder,
    isPrimary: sortOrder === 0,
    ...overrides,
  };
}

/** A palette color as the user would pick it (reference hex, source 'user'), unless overridden. */
export function makeColor(paletteId: PaletteId, overrides: Partial<ItemColor> = {}): ItemColor {
  return { paletteId, hex: paletteColor(paletteId)!.hex, source: 'user', ...overrides };
}

/** An item with one front, primary photo and one color (black), unless overridden. */
export function makeItem(overrides: Partial<ClothingItem> = {}): ClothingItem {
  const id = overrides.id ?? 'item-1';
  return {
    id,
    photos: [makePhoto(id)],
    category: 'top',
    colors: [makeColor('black')],
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
        colors: [makeColor('navy'), makeColor('cream', { hex: '#F4EEDD', source: 'auto' })],
        seasons: ['spring', 'autumn'],
        category: 'outerwear',
        photos: [makePhoto('item-1', { path: 'file:///var/mobile/x/closet-images/item-1.heic' })],
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
      await expectRepoError(repo.add(makeItem({ colors: [makeColor('red')] })), 'duplicate');
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
      item.colors.push(makeColor('red'));
      item.colors[0].hex = '#000000';
      const fetched = await repo.get('item-1');
      fetched!.colors.push(makeColor('pink'));
      fetched!.colors[0].source = 'auto';
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
          photos: [makePhoto('item-1', { id: 'new-front', path: 'closet-images/item-1-new.jpg' })],
          category: 'outerwear',
          colors: [makeColor('green'), makeColor('grey')],
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
        await repo.update(makeItem({ id: 'a', colors: [makeColor('red')], updatedAt: '2026-05-01T00:00:00.000Z' }));
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
        await repo.update(makeItem({ colors: [makeColor('red')], updatedAt: '2026-02-01T00:00:00.000Z' }));
        expect(await repo.get('Item-1')).toEqual(other);
      });

      it('copies its input, so later mutation does not change stored data', async () => {
        await repo.add(makeItem());
        const edited = makeItem({ colors: [makeColor('red')] });
        await repo.update(edited);
        edited.colors.push(makeColor('white'));
        edited.colors[0].hex = '#000000';
        expect((await repo.get('item-1'))?.colors).toEqual([makeColor('red')]);
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
        const b = makeItem({ id: 'b', tags: ['90s'], colors: [makeColor('red')] });
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

    describe('name', () => {
      it('round-trips a name via get and list; an unnamed item has no name key', async () => {
        const named = makeItem({ id: 'named', name: 'Black band hoodie' });
        const unnamed = makeItem({ id: 'unnamed', createdAt: '2026-01-14T10:00:00.000Z' });
        await repo.add(named);
        await repo.add(unnamed);
        expect(await repo.get('named')).toEqual(named);
        expect(await repo.list()).toEqual([named, unnamed]);
        expect('name' in (await repo.get('unnamed'))!).toBe(false);
      });

      it('update adds, changes, and removes the name', async () => {
        await repo.add(makeItem());
        await repo.update(makeItem({ name: 'Sky tee' }));
        expect((await repo.get('item-1'))?.name).toBe('Sky tee');
        await repo.update(makeItem({ name: 'Sky blue tee' }));
        expect((await repo.get('item-1'))?.name).toBe('Sky blue tee');
        await repo.update(makeItem());
        expect(await repo.get('item-1')).toEqual(makeItem());
      });

      it('rejects an invalid name with code invalid and stores nothing', async () => {
        for (const name of ['', '  padded ', 'a'.repeat(61)]) {
          await expectRepoError(repo.add(makeItem({ name })), 'invalid');
        }
        expect(await repo.list()).toEqual([]);
        await repo.add(makeItem({ name: 'Kept' }));
        await expectRepoError(repo.update(makeItem({ name: '' })), 'invalid');
        expect((await repo.get('item-1'))?.name).toBe('Kept');
      });
    });

    describe('colors', () => {
      const three = (): ItemColor[] => [
        makeColor('red', { hex: '#B5122B', source: 'auto' }),
        makeColor('navy'),
        makeColor('white', { source: 'auto', hex: '#F4F4F2' }),
      ];

      it('round-trips up to three colors in order, with palette id, hex, and source, via get and list', async () => {
        const item = makeItem({ colors: three() });
        await repo.add(item);
        expect(await repo.get('item-1')).toEqual(item);
        expect(await repo.list()).toEqual([item]);
        expect((await repo.get('item-1'))?.colors.map((c) => [c.paletteId, c.hex, c.source])).toEqual([
          ['red', '#B5122B', 'auto'],
          ['navy', '#202A60', 'user'],
          ['white', '#F4F4F2', 'auto'],
        ]);
      });

      it('keeps each item\'s colors separate; a palette color may be on many items', async () => {
        const a = makeItem({ id: 'a', colors: three() });
        const b = makeItem({ id: 'b', colors: [makeColor('navy'), makeColor('red')] });
        await repo.add(a);
        await repo.add(b);
        expect((await repo.get('a'))?.colors).toEqual(a.colors);
        expect((await repo.get('b'))?.colors).toEqual(b.colors);
      });

      it('update replaces the color list: new primary, removed, added, and source-only changes', async () => {
        await repo.add(makeItem({ colors: three() }));
        const reordered = [makeColor('navy'), makeColor('red', { hex: '#B5122B', source: 'user' }), makeColor('teal')];
        await repo.update(makeItem({ colors: reordered, updatedAt: '2026-02-01T00:00:00.000Z' }));
        expect((await repo.get('item-1'))?.colors).toEqual(reordered);
        await repo.update(makeItem({ colors: [makeColor('teal')], updatedAt: '2026-02-02T00:00:00.000Z' }));
        expect((await repo.get('item-1'))?.colors).toEqual([makeColor('teal')]);
      });

      it('rejects rule violations with code invalid and stores nothing', async () => {
        const bad: unknown[][] = [
          [],
          [...three(), makeColor('teal')],
          [makeColor('navy'), makeColor('navy', { source: 'auto' })],
          [{ ...makeColor('navy'), paletteId: 'ultraviolet' }],
          [{ ...makeColor('navy'), paletteId: 'Navy' }],
          [makeColor('navy', { hex: '#202a60' })],
          [makeColor('navy', { hex: '#FFF' })],
          [makeColor('navy', { hex: 'navy' })],
          [{ ...makeColor('navy'), source: 'guess' }],
          [{ paletteId: 'navy', source: 'user' }],
          ['navy'],
          [null],
        ];
        for (const colors of bad) await expectRepoError(repo.add(makeItem({ colors: colors as ItemColor[] })), 'invalid');
        expect(await repo.list()).toEqual([]);

        const original = makeItem({ colors: three() });
        await repo.add(original);
        for (const colors of bad) {
          await expectRepoError(repo.update(makeItem({ colors: colors as ItemColor[] })), 'invalid');
        }
        expect(await repo.get('item-1')).toEqual(original);
      });

      it('remove deletes the colors, so a new item with the same id starts with only its own', async () => {
        await repo.add(makeItem({ colors: three() }));
        await repo.remove('item-1');
        await repo.add(makeItem());
        expect((await repo.get('item-1'))?.colors).toEqual([makeColor('black')]);
      });
    });

    describe('photos', () => {
      const fullSet = (itemId: string): ItemPhoto[] => [
        makePhoto(itemId, { sortOrder: 0, role: 'front', isPrimary: false }),
        makePhoto(itemId, { sortOrder: 1, role: 'detail' }),
        makePhoto(itemId, { sortOrder: 2, role: 'back', isPrimary: true }),
        makePhoto(itemId, { sortOrder: 3, role: 'detail', path: 'file:///absolute/x.jpg' }),
      ];

      it('round-trips up to four photos in order, with every field, via get and list', async () => {
        const item = makeItem({ photos: fullSet('item-1') });
        await repo.add(item);
        expect(await repo.get('item-1')).toEqual(item);
        expect(await repo.list()).toEqual([item]);
        expect((await repo.get('item-1'))?.photos.map((p) => p.role)).toEqual(['front', 'detail', 'back', 'detail']);
      });

      it('keeps each item\'s photos separate', async () => {
        const a = makeItem({ id: 'a', photos: fullSet('a') });
        const b = makeItem({ id: 'b' });
        await repo.add(a);
        await repo.add(b);
        expect((await repo.get('a'))?.photos).toEqual(a.photos);
        expect((await repo.get('b'))?.photos).toEqual(b.photos);
      });

      it('update replaces the photo list: adds, removes, reorders, and moves primary', async () => {
        await repo.add(makeItem({ photos: fullSet('item-1') }));
        const photos = [
          makePhoto('item-1', { sortOrder: 0, id: 'item-1-photo-2', role: 'back', isPrimary: false }),
          makePhoto('item-1', { sortOrder: 1, id: 'item-1-photo-0', role: 'front', isPrimary: true }),
          makePhoto('item-1', { sortOrder: 2, id: 'brand-new', role: 'detail', isPrimary: false }),
        ];
        await repo.update(makeItem({ photos, updatedAt: '2026-02-01T00:00:00.000Z' }));
        expect((await repo.get('item-1'))?.photos).toEqual(photos);
      });

      it('rejects rule violations with code invalid and stores nothing', async () => {
        const front = makePhoto('item-1');
        const bad: ItemPhoto[][] = [
          [],
          [makePhoto('item-1', { role: 'back' })],
          [front, makePhoto('item-1', { sortOrder: 1, role: 'front' })],
          [front, makePhoto('item-1', { sortOrder: 1, role: 'back' }), makePhoto('item-1', { sortOrder: 2, role: 'back' })],
          [front, ...[1, 2, 3].map((i) => makePhoto('item-1', { sortOrder: i, role: 'detail' }))],
          [{ ...front, isPrimary: false }],
          [front, makePhoto('item-1', { sortOrder: 1, role: 'detail', isPrimary: true })],
          [{ ...front, sortOrder: 1 }],
          [front, { ...makePhoto('item-1', { sortOrder: 1, role: 'detail' }), id: front.id }],
          [{ ...front, role: 'side' as never }],
          [{ ...front, path: ' ' }],
        ];
        for (const photos of bad) await expectRepoError(repo.add(makeItem({ photos })), 'invalid');
        expect(await repo.list()).toEqual([]);

        const original = makeItem();
        await repo.add(original);
        for (const photos of bad) await expectRepoError(repo.update(makeItem({ photos })), 'invalid');
        expect(await repo.get('item-1')).toEqual(original);
      });

      it('rejects a photo id that another item uses, on add and update, and stores nothing', async () => {
        const a = makeItem({ id: 'a' });
        await repo.add(a);
        const stolen = [makePhoto('b', { id: a.photos[0].id })];
        await expectRepoError(repo.add(makeItem({ id: 'b', photos: stolen })), 'invalid');
        expect(await repo.get('b')).toBeNull();

        const b = makeItem({ id: 'b' });
        await repo.add(b);
        await expectRepoError(repo.update(makeItem({ id: 'b', photos: stolen })), 'invalid');
        expect(await repo.get('b')).toEqual(b);
        expect(await repo.get('a')).toEqual(a);
      });

      it('an item may keep its own photo ids across updates', async () => {
        const item = makeItem({ photos: fullSet('item-1') });
        await repo.add(item);
        const edited = { ...item, colors: [makeColor('red')], updatedAt: '2026-02-01T00:00:00.000Z' };
        await repo.update(edited);
        expect(await repo.get('item-1')).toEqual(edited);
      });

      it('remove deletes the photos, so their ids and the item id can be used again', async () => {
        await repo.add(makeItem({ photos: fullSet('item-1') }));
        await repo.remove('item-1');
        // A freed photo id can go to another item...
        const other = makeItem({ id: 'other', photos: [makePhoto('other', { id: 'item-1-photo-3' })] });
        await repo.add(other);
        // ...and a new item with the old id starts with only its own photos.
        await repo.add(makeItem());
        expect(await repo.get('other')).toEqual(other);
        expect((await repo.get('item-1'))?.photos).toEqual([makePhoto('item-1')]);
      });

      it('returns copies of photos', async () => {
        const item = makeItem();
        await repo.add(item);
        item.photos[0].path = 'mutated-after-add';
        (await repo.get('item-1'))!.photos[0].isPrimary = false;
        (await repo.list())[0].photos.push(makePhoto('item-1', { sortOrder: 1, role: 'back' }));
        expect(await repo.get('item-1')).toEqual(makeItem());
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
        const again = makeItem({ colors: [makeColor('white')] });
        await repo.add(again);
        expect(await repo.list()).toEqual([again]);
      });
    });
  });
}
