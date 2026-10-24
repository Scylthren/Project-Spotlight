import { makeSavedLook, piece } from '@/core/testing/saved-look-fixtures';

import { InMemoryOutfitRepository } from './in-memory-outfit-repository';
import { LOOKBOOK_MESSAGES, LookbookStore, lookKeyOf, styleLookToSave, type LookToSave } from './lookbook-store';
import { OutfitRepositoryError } from './outfit-repository';

const NOW = new Date('2026-10-24T12:00:00.000Z');

function setup(initial = [] as ReturnType<typeof makeSavedLook>[]) {
  const repository = new InMemoryOutfitRepository(initial);
  let n = 0;
  const store = new LookbookStore({ repository, newId: () => `id-${++n}`, now: () => NOW });
  return { repository, store };
}

const toSave = (extra: Partial<LookToSave> = {}): LookToSave => ({
  request: 'Emo vibes',
  rationale: 'All dark.',
  pieces: [piece('top-1', 'top'), piece('bottom-1', 'bottom')],
  model: 'claude-haiku-5-5',
  ...extra,
});

describe('LookbookStore', () => {
  it('loads saved looks newest first', async () => {
    const older = makeSavedLook({ id: 'old', createdAt: '2026-10-01T00:00:00.000Z', pieces: [piece('a', 'top')] });
    const newer = makeSavedLook({ id: 'new' });
    const { store } = setup([older, newer]);
    expect(store.getSnapshot().status).toBe('idle');
    await store.load();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', looks: [newer, older] });
  });

  it('load with the closet ids deletes looks with no piece left (D5) before reading', async () => {
    const kept = makeSavedLook({ id: 'kept' });
    const empty = makeSavedLook({ id: 'empty', pieces: [piece('gone', 'dress')] });
    const { store, repository } = setup([kept, empty]);
    await store.load(new Set(['top-1']));
    expect(store.getSnapshot().looks.map((l) => l.id)).toEqual(['kept']);
    expect(await repository.get('empty')).toBeNull();
  });

  it('a failed read shows failed', async () => {
    const { store, repository } = setup();
    repository.list = () => Promise.reject(new Error('locked'));
    await store.load();
    expect(store.getSnapshot().status).toBe('failed');
  });

  it('Save stores the look with request, rationale, pieces, model and no rating or occasion', async () => {
    const { store, repository } = setup();
    await store.load();
    const saved = await store.save(toSave());
    const expected = {
      id: 'id-1',
      request: 'Emo vibes',
      rationale: 'All dark.',
      pieces: [piece('top-1', 'top'), piece('bottom-1', 'bottom')],
      rating: null,
      occasion: null,
      createdAt: NOW.toISOString(),
      model: 'claude-haiku-5-5',
    };
    expect(saved).toEqual(expected);
    expect(await repository.list()).toEqual([expected]);
    expect(store.findByItems(['bottom-1', 'top-1'])).toEqual(expected);
  });

  it('saving the same look twice (double tap, or the same pieces later) keeps one entry', async () => {
    const { store, repository } = setup();
    await store.load();
    const [a, b] = await Promise.all([store.save(toSave()), store.save(toSave())]);
    expect(a).toEqual(b);
    await store.save(toSave({ request: 'Other request', pieces: [piece('bottom-1', 'bottom'), piece('top-1', 'top')] }));
    expect(await repository.list()).toHaveLength(1);
    expect(store.getSnapshot().looks).toHaveLength(1);
  });

  it('saving before the Lookbook was loaded still keeps one entry', async () => {
    const existing = makeSavedLook({ id: 'old', pieces: [piece('top-1', 'top'), piece('bottom-1', 'bottom')] });
    const { store, repository } = setup([existing]);
    expect(await store.save(toSave())).toEqual(existing);
    expect(await repository.list()).toEqual([existing]);
  });

  describe('thumbs on Results (rating a look saves it)', () => {
    it('rating an unsaved look saves it with that rating and no occasion', async () => {
      const { store, repository } = setup();
      await store.load();
      const saved = await store.rateUnsavedOrSaved(toSave(), 'down');
      expect(saved).toMatchObject({ rating: 'down', occasion: null });
      expect(await repository.list()).toEqual([saved]);
    });

    it('tapping the same thumb again clears the rating and keeps the look saved', async () => {
      const { store, repository } = setup();
      await store.load();
      await store.rateUnsavedOrSaved(toSave(), 'up');
      const cleared = await store.rateUnsavedOrSaved(toSave(), 'up');
      expect(cleared).toMatchObject({ rating: null });
      expect(await repository.list()).toEqual([cleared]);
    });

    it('the other thumb replaces the rating', async () => {
      const { store } = setup();
      await store.load();
      await store.rateUnsavedOrSaved(toSave(), 'up');
      expect(await store.rateUnsavedOrSaved(toSave(), 'down')).toMatchObject({ rating: 'down' });
    });

    it('two quick taps on one thumb set it and then clear it (writes run in order)', async () => {
      const { store, repository } = setup();
      await store.load();
      await Promise.all([store.rateUnsavedOrSaved(toSave(), 'up'), store.rateUnsavedOrSaved(toSave(), 'up')]);
      expect((await repository.list()).map((l) => l.rating)).toEqual([null]);
    });

    it('a look saved earlier but not loaded yet takes the tapped rating', async () => {
      const existing = makeSavedLook({ id: 'old', rating: 'up', pieces: [piece('top-1', 'top'), piece('bottom-1', 'bottom')] });
      const { store, repository } = setup([existing]);
      expect(await store.rateUnsavedOrSaved(toSave(), 'down')).toMatchObject({ id: 'old', rating: 'down' });
      expect(await repository.list()).toEqual([{ ...existing, rating: 'down' }]);
    });
  });

  it('rate and toggleOccasion on a saved look (Lookbook): set, replace, clear', async () => {
    const look = makeSavedLook();
    const { store, repository } = setup([look]);
    await store.load();
    await store.rate('look-1', 'up');
    await store.toggleOccasion('look-1', 'work');
    expect(await repository.get('look-1')).toMatchObject({ rating: 'up', occasion: 'work' });
    await store.toggleOccasion('look-1', 'date');
    expect(store.findById('look-1')?.occasion).toBe('date');
    await store.toggleOccasion('look-1', 'date');
    await store.rate('look-1', 'up');
    expect(await repository.get('look-1')).toEqual(look);
  });

  it('a failed write keeps the state and names the look in the error; the next write clears it', async () => {
    const look = makeSavedLook();
    const { store, repository } = setup([look]);
    await store.load();
    const setRating = repository.setRating.bind(repository);
    repository.setRating = () => Promise.reject(new Error('disk'));
    expect(await store.rate('look-1', 'up')).toBeNull();
    expect(store.getSnapshot().error).toEqual({ key: lookKeyOf(look), text: LOOKBOOK_MESSAGES.updateFailed });
    expect(store.findById('look-1')?.rating).toBeNull();
    repository.setRating = setRating;
    await store.rate('look-1', 'up');
    expect(store.getSnapshot().error).toBeNull();

    repository.save = () => Promise.reject(new Error('disk'));
    expect(await store.save(toSave({ pieces: [piece('dress-1', 'dress')] }))).toBeNull();
    expect(store.getSnapshot().error).toEqual({ key: '["dress-1"]', text: LOOKBOOK_MESSAGES.saveFailed });
  });

  it('remove deletes the look; an already deleted look counts as done; a failure keeps it', async () => {
    const a = makeSavedLook({ id: 'a' });
    const b = makeSavedLook({ id: 'b', pieces: [piece('x', 'dress')] });
    const { store, repository } = setup([a, b]);
    await store.load();
    expect(await store.remove('a')).toBe(true);
    expect(store.getSnapshot().looks.map((l) => l.id)).toEqual(['b']);

    await repository.remove('b');
    expect(await store.remove('b')).toBe(true);
    expect(store.getSnapshot().looks).toEqual([]);

    const c = makeSavedLook({ id: 'c' });
    await repository.save(c);
    await store.load();
    repository.remove = () => Promise.reject(new OutfitRepositoryError('invalid', 'locked'));
    expect(await store.remove('c')).toBe(false);
    expect(store.getSnapshot().error?.text).toBe(LOOKBOOK_MESSAGES.deleteFailed);
    expect(store.findById('c')).not.toBeNull();
  });

  it('notifies subscribers', async () => {
    const { store } = setup();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    await store.load();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await store.save(toSave());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('styleLookToSave', () => {
  it('keeps the request, rationale, model and every piece with its category, in order', () => {
    const look = {
      rationale: 'Why.',
      model: 'stub',
      pieces: [
        { id: 'd', category: 'dress' as const, item: null },
        { id: 's', category: 'shoes' as const, item: null },
      ],
    };
    expect(styleLookToSave('first date', look)).toEqual({
      request: 'first date',
      rationale: 'Why.',
      model: 'stub',
      pieces: [piece('d', 'dress'), piece('s', 'shoes')],
    });
  });
});
