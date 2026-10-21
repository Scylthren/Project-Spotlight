import {
  addPhoto,
  allowedNewRoles,
  applyPickedPhoto,
  draftsFromPhotos,
  hasPhotoChanges,
  isPhotoRole,
  makePrimary,
  MAX_PHOTOS_PER_ITEM,
  photoSetProblems,
  primaryPhoto,
  removePhoto,
  replacePhoto,
  type ItemPhoto,
  type PhotoDraft,
  type PhotoRole,
  type RoledPhoto,
} from '@/core';

const photo = (id: string, role: PhotoRole, isPrimary = false): RoledPhoto => ({ id, role, isPrimary });
const front = photo('f', 'front', true);

/** Builds a set by adding photos one at a time through `addPhoto`. */
function build(...rest: RoledPhoto[]): RoledPhoto[] {
  let photos: RoledPhoto[] = [];
  for (const p of [front, ...rest]) {
    const result = addPhoto(photos, p);
    if (!result.ok) throw new Error(result.problem);
    photos = result.photos;
  }
  return photos;
}

describe('addPhoto and allowedNewRoles', () => {
  it('requires the front photo first, and makes it primary', () => {
    expect(allowedNewRoles([])).toEqual(['front']);
    expect(addPhoto([], photo('b', 'back'))).toEqual({ ok: false, problem: 'front_first' });
    expect(addPhoto([], photo('d', 'detail'))).toEqual({ ok: false, problem: 'front_first' });
    expect(addPhoto([], photo('f', 'front', false))).toEqual({ ok: true, photos: [front] });
  });

  it('then offers back and detail, never a second front', () => {
    expect(allowedNewRoles([front])).toEqual(['back', 'detail']);
    expect(addPhoto([front], photo('f2', 'front'))).toEqual({ ok: false, problem: 'role_full' });
  });

  it('adds later photos as not primary, at the end, without mutating the input', () => {
    const input = [front];
    const result = addPhoto(input, photo('b', 'back', true));
    expect(result).toEqual({ ok: true, photos: [front, photo('b', 'back', false)] });
    expect(input).toEqual([front]);
  });

  it('allows one back and two details, so at most four photos', () => {
    const withBack = build(photo('b', 'back'));
    expect(allowedNewRoles(withBack)).toEqual(['detail']);
    expect(addPhoto(withBack, photo('b2', 'back'))).toEqual({ ok: false, problem: 'role_full' });

    const twoDetails = build(photo('d1', 'detail'), photo('d2', 'detail'));
    expect(allowedNewRoles(twoDetails)).toEqual(['back']);
    expect(addPhoto(twoDetails, photo('d3', 'detail'))).toEqual({ ok: false, problem: 'role_full' });

    const full = build(photo('b', 'back'), photo('d1', 'detail'), photo('d2', 'detail'));
    expect(full).toHaveLength(MAX_PHOTOS_PER_ITEM);
    expect(allowedNewRoles(full)).toEqual([]);
    expect(photoSetProblems(full)).toEqual([]);
  });

  it('refuses a fifth photo even if the roles alone would fit', () => {
    // Not reachable through addPhoto with today's limits; guards the total if limits change.
    const four = [front, photo('a', 'detail'), photo('b', 'back'), photo('c', 'detail')];
    expect(addPhoto(four, photo('x', 'detail'))).toEqual({ ok: false, problem: 'role_full' });
    expect(photoSetProblems([...four, photo('x', 'detail')])).toContain('photos must have at most 4 entries');
  });
});

describe('removePhoto', () => {
  it('never removes the front photo', () => {
    expect(removePhoto(build(photo('b', 'back')), 'f')).toEqual({ ok: false, problem: 'front_required' });
  });

  it('removes another photo and keeps the order of the rest', () => {
    const photos = build(photo('d1', 'detail'), photo('b', 'back'), photo('d2', 'detail'));
    const result = removePhoto(photos, 'b');
    expect(result.ok && result.photos.map((p) => p.id)).toEqual(['f', 'd1', 'd2']);
    expect(result.ok && primaryPhoto(result.photos)?.id).toBe('f');
  });

  it('removing the primary photo makes the front primary', () => {
    const made = makePrimary(build(photo('b', 'back'), photo('d', 'detail')), 'b');
    if (!made.ok) throw new Error('makePrimary failed');
    const result = removePhoto(made.photos, 'b');
    expect(result).toEqual({ ok: true, photos: [front, photo('d', 'detail', false)] });
  });

  it('reports an unknown id', () => {
    expect(removePhoto([front], 'nope')).toEqual({ ok: false, problem: 'not_found' });
  });

  it('frees the role again', () => {
    const result = removePhoto(build(photo('b', 'back')), 'b');
    expect(result.ok && allowedNewRoles(result.photos)).toEqual(['back', 'detail']);
  });
});

describe('makePrimary and primaryPhoto', () => {
  it('moves the primary flag to exactly one photo of any role', () => {
    const photos = build(photo('b', 'back'), photo('d', 'detail'));
    const result = makePrimary(photos, 'd');
    expect(result.ok && result.photos.filter((p) => p.isPrimary).map((p) => p.id)).toEqual(['d']);
    expect(result.ok && photoSetProblems(result.photos)).toEqual([]);
    expect(result.ok && primaryPhoto(result.photos)?.id).toBe('d');
    expect(makePrimary(photos, 'nope')).toEqual({ ok: false, problem: 'not_found' });
  });

  it('falls back to the front, then the first photo, then null', () => {
    expect(primaryPhoto([photo('d', 'detail'), photo('f', 'front')])?.id).toBe('f');
    expect(primaryPhoto([photo('d', 'detail'), photo('b', 'back')])?.id).toBe('d');
    expect(primaryPhoto([])).toBeNull();
  });
});

describe('replacePhoto (retake)', () => {
  it('keeps the position, role, and primary flag of the retaken photo', () => {
    const made = makePrimary(build(photo('b', 'back'), photo('d', 'detail')), 'b');
    if (!made.ok) throw new Error('makePrimary failed');
    const result = replacePhoto(made.photos, 'b', photo('b2', 'detail', false));
    expect(result.ok && result.photos).toEqual([
      photo('f', 'front', false),
      photo('b2', 'back', true),
      photo('d', 'detail', false),
    ]);
  });

  it('can retake the front, which stays the front', () => {
    const result = replacePhoto([front], 'f', photo('f2', 'detail'));
    expect(result).toEqual({ ok: true, photos: [photo('f2', 'front', true)] });
  });

  it('reports an unknown id', () => {
    expect(replacePhoto([front], 'nope', photo('x', 'front'))).toEqual({ ok: false, problem: 'not_found' });
  });
});

describe('photoSetProblems', () => {
  it('gives one message for an empty set', () => {
    expect(photoSetProblems([])).toEqual(['photos must include exactly one front photo']);
  });

  it('reports each broken rule', () => {
    expect(photoSetProblems([photo('b', 'back', true)])).toEqual(['photos must include exactly one front photo']);
    expect(photoSetProblems([front, photo('f2', 'front')])).toEqual(['photos must include exactly one front photo']);
    expect(photoSetProblems([front, photo('b1', 'back'), photo('b2', 'back')])).toEqual([
      'photos must include at most one back photo',
    ]);
    expect(photoSetProblems([front, photo('d1', 'detail'), photo('d2', 'detail'), photo('d3', 'detail')])).toEqual([
      'photos must include at most 2 detail photos',
    ]);
    expect(photoSetProblems([photo('f', 'front')])).toEqual(['photos must have exactly one primary photo']);
    expect(photoSetProblems([front, photo('b', 'back', true)])).toEqual(['photos must have exactly one primary photo']);
  });

  it('accepts a primary of any role', () => {
    expect(photoSetProblems([photo('f', 'front'), photo('d', 'detail', true)])).toEqual([]);
  });
});

describe('isPhotoRole', () => {
  it('accepts only known roles', () => {
    expect(isPhotoRole('front')).toBe(true);
    expect(isPhotoRole('detail')).toBe(true);
    expect(isPhotoRole('Front')).toBe(false);
    expect(isPhotoRole('side')).toBe(false);
    expect(isPhotoRole(1)).toBe(false);
  });
});

describe('form drafts', () => {
  const stored: ItemPhoto[] = [
    { id: 'p1', role: 'front', path: 'closet-images/a.jpg', sortOrder: 0, isPrimary: false },
    { id: 'p2', role: 'back', path: 'closet-images/b.jpg', sortOrder: 1, isPrimary: true },
  ];

  it('draftsFromPhotos keeps id, role, primary, and path, in order', () => {
    expect(draftsFromPhotos(stored)).toEqual([
      { kind: 'stored', id: 'p1', role: 'front', isPrimary: false, path: 'closet-images/a.jpg' },
      { kind: 'stored', id: 'p2', role: 'back', isPrimary: true, path: 'closet-images/b.jpg' },
    ]);
  });

  it('hasPhotoChanges is false for untouched drafts and true for any photo edit', () => {
    const drafts = draftsFromPhotos(stored);
    expect(hasPhotoChanges(stored, drafts)).toBe(false);

    const retake = applyPickedPhoto(drafts, { kind: 'retake', id: 'p1' }, { id: 'n', uri: 'file:///cache/n.jpg' });
    expect(retake.ok && hasPhotoChanges(stored, retake.photos)).toBe(true);

    const added = applyPickedPhoto(drafts, { kind: 'add', role: 'detail' }, { id: 'n', uri: 'file:///cache/n.jpg' });
    expect(added.ok && hasPhotoChanges(stored, added.photos)).toBe(true);

    const removed = removePhoto(drafts, 'p2');
    expect(removed.ok && hasPhotoChanges(stored, removed.photos)).toBe(true);

    const primary = makePrimary(drafts, 'p1');
    expect(primary.ok && hasPhotoChanges(stored, primary.photos)).toBe(true);

    expect(hasPhotoChanges(stored, [...drafts].reverse())).toBe(true);
  });

  it('applyPickedPhoto adds with the requested role, or retakes and reports the replaced draft', () => {
    const empty: PhotoDraft[] = [];
    const first = applyPickedPhoto(empty, { kind: 'add', role: 'front' }, { id: 'a', uri: 'file:///cache/a.jpg' });
    expect(first).toEqual({
      ok: true,
      replaced: null,
      photos: [{ kind: 'picked', id: 'a', uri: 'file:///cache/a.jpg', role: 'front', isPrimary: true }],
    });
    if (!first.ok) return;

    const retake = applyPickedPhoto(first.photos, { kind: 'retake', id: 'a' }, { id: 'b', uri: 'file:///cache/b.jpg' });
    expect(retake).toEqual({
      ok: true,
      replaced: first.photos[0],
      photos: [{ kind: 'picked', id: 'b', uri: 'file:///cache/b.jpg', role: 'front', isPrimary: true }],
    });

    expect(applyPickedPhoto(empty, { kind: 'add', role: 'back' }, { id: 'x', uri: 'u' })).toEqual({
      ok: false,
      problem: 'front_first',
    });
    expect(applyPickedPhoto(empty, { kind: 'retake', id: 'gone' }, { id: 'x', uri: 'u' })).toEqual({
      ok: false,
      problem: 'not_found',
    });
  });
});
