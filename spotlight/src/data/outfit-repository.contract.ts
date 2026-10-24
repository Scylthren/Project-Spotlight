/**
 * Shared behaviour tests for every `OutfitRepository` (see outfit-repository.ts).
 * Run by in-memory-outfit-repository.test.ts and sqlite-outfit-repository.test.ts.
 */
import type { LookRating, Occasion, SavedLook } from '@/core';
import { makeSavedLook, piece } from '@/core/testing/saved-look-fixtures';

import { OutfitRepositoryError, type OutfitRepository } from './outfit-repository';

export async function expectOutfitError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(OutfitRepositoryError);
  expect((error as OutfitRepositoryError).code).toBe(code);
}

export function describeOutfitRepositoryContract(name: string, create: () => Promise<OutfitRepository>): void {
  describe(`${name} (OutfitRepository contract)`, () => {
    let repo: OutfitRepository;
    beforeEach(async () => {
      repo = await create();
    });

    it('starts empty, and get returns null for an unknown id', async () => {
      expect(await repo.list()).toEqual([]);
      expect(await repo.get('nope')).toBeNull();
    });

    it('saves a look and reads it back with every field and its pieces in order', async () => {
      const look = makeSavedLook({
        rating: 'up',
        occasion: 'night-out',
        pieces: [piece('dress-1', 'dress'), piece('coat', 'outerwear'), piece('shoes-1', 'shoes'), piece('bag', 'accessory')],
      });
      expect(await repo.save(look)).toEqual({ look, created: true });
      expect(await repo.get(look.id)).toEqual(look);
      expect(await repo.list()).toEqual([look]);
    });

    it('saves a look with no model and an empty request', async () => {
      const look = makeSavedLook({ model: null, request: '' });
      await repo.save(look);
      expect(await repo.get(look.id)).toEqual(look);
    });

    it('lists newest first by instant, ties by id', async () => {
      const a = makeSavedLook({ id: 'a', createdAt: '2026-10-01T00:00:00.000Z', pieces: [piece('t1', 'top')] });
      const b = makeSavedLook({ id: 'b', createdAt: '2026-10-03T00:00:00.000Z', pieces: [piece('t2', 'top')] });
      const c = makeSavedLook({ id: 'c', createdAt: '2026-10-03T02:00:00.000+02:00', pieces: [piece('t3', 'top')] });
      const d = makeSavedLook({ id: 'd', createdAt: '2026-10-02T23:00:00.000-05:00', pieces: [piece('t4', 'top')] });
      for (const look of [a, b, c, d]) await repo.save(look);
      expect((await repo.list()).map((l) => l.id)).toEqual(['d', 'b', 'c', 'a']);
    });

    it('saving the same set of pieces twice keeps one entry and returns the first unchanged', async () => {
      const first = makeSavedLook({ id: 'first', occasion: 'work' });
      await repo.save(first);
      const again = makeSavedLook({
        id: 'second',
        request: 'Something else',
        pieces: [...first.pieces].reverse(),
        createdAt: '2026-10-25T00:00:00.000Z',
      });
      expect(await repo.save(again)).toEqual({ look: first, created: false });
      expect(await repo.list()).toEqual([first]);
    });

    it('a different set with an existing id is a duplicate and stores nothing', async () => {
      await repo.save(makeSavedLook());
      await expectOutfitError(repo.save(makeSavedLook({ pieces: [piece('other', 'dress')] })), 'duplicate');
      expect(await repo.list()).toHaveLength(1);
    });

    it('rejects an invalid look and stores nothing', async () => {
      await expectOutfitError(repo.save(makeSavedLook({ pieces: [] })), 'invalid');
      await expectOutfitError(repo.save(makeSavedLook({ rationale: '' })), 'invalid');
      await expectOutfitError(repo.save({ ...makeSavedLook(), occasion: 'party' as Occasion }), 'invalid');
      expect(await repo.list()).toEqual([]);
    });

    it('sets and clears the rating and the occasion, changing nothing else', async () => {
      const look = makeSavedLook();
      await repo.save(look);
      await repo.setRating(look.id, 'down');
      await repo.setOccasion(look.id, 'travel');
      expect(await repo.get(look.id)).toEqual({ ...look, rating: 'down', occasion: 'travel' });
      await repo.setRating(look.id, null);
      await repo.setOccasion(look.id, null);
      expect(await repo.get(look.id)).toEqual(look);
    });

    it('rating or occasion on an unknown look is not_found; unknown values are invalid', async () => {
      await expectOutfitError(repo.setRating('nope', 'up'), 'not_found');
      await expectOutfitError(repo.setOccasion('nope', 'work'), 'not_found');
      await repo.save(makeSavedLook());
      await expectOutfitError(repo.setRating('look-1', 'meh' as LookRating), 'invalid');
      await expectOutfitError(repo.setOccasion('look-1', 'Work' as Occasion), 'invalid');
      expect((await repo.get('look-1'))?.rating).toBeNull();
    });

    it('removes a look; removing it again is not_found; the set can then be saved again', async () => {
      const look = makeSavedLook();
      await repo.save(look);
      await repo.remove(look.id);
      expect(await repo.get(look.id)).toBeNull();
      await expectOutfitError(repo.remove(look.id), 'not_found');
      expect(await repo.save(makeSavedLook({ id: 'new' }))).toMatchObject({ created: true });
    });

    it('removeLooksWithNoPiecesIn deletes only looks with no piece left (D5)', async () => {
      const kept = makeSavedLook({ id: 'kept' });
      const onlyShoesLeft = makeSavedLook({ id: 'shoes-left', pieces: [piece('gone-top', 'top'), piece('shoes-1', 'shoes')] });
      const empty = makeSavedLook({ id: 'empty', pieces: [piece('gone-top', 'top'), piece('gone-bottom', 'bottom')] });
      for (const look of [kept, onlyShoesLeft, empty]) await repo.save(look);
      expect(await repo.removeLooksWithNoPiecesIn(new Set(['top-1', 'shoes-1']))).toEqual(['empty']);
      expect((await repo.list()).map((l) => l.id).sort()).toEqual(['kept', 'shoes-left']);
      expect(await repo.removeLooksWithNoPiecesIn(new Set(['top-1', 'shoes-1']))).toEqual([]);
    });

    it('returns copies', async () => {
      const look = makeSavedLook();
      const saved = (await repo.save(look)).look;
      saved.pieces.push(piece('x', 'top'));
      const listed = (await repo.list())[0];
      listed.pieces[0].itemId = 'changed';
      look.pieces.pop();
      expect(await repo.get('look-1')).toEqual(makeSavedLook());
    });

    it('handles many looks', async () => {
      const looks: SavedLook[] = Array.from({ length: 300 }, (_, i) =>
        makeSavedLook({
          id: `look-${String(i).padStart(3, '0')}`,
          pieces: [piece(`top-${i}`, 'top'), piece('bottom-1', 'bottom')],
          createdAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
        }),
      );
      for (const look of looks) await repo.save(look);
      const listed = await repo.list();
      expect(listed).toHaveLength(300);
      expect(listed[0].id).toBe('look-299');
      expect(await repo.removeLooksWithNoPiecesIn(new Set(['bottom-1']))).toEqual([]);
    });
  });
}
