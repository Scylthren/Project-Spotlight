/**
 * Rules for an item's set of photos (front, back, detail angles). Pure
 * functions, shared by the validator, the repository, and the add/edit forms.
 *
 * - Exactly one front photo. It is added first, can be retaken, but never removed.
 * - At most one back photo and at most `MAX_DETAIL_PHOTOS` detail photos,
 *   and at most `MAX_PHOTOS_PER_ITEM` photos in total.
 * - Exactly one photo is primary (shown in the grid). Any role may be
 *   primary. Removing the primary photo makes the front primary again.
 *
 * The editing helpers are generic, so the same rules apply to stored
 * `ItemPhoto`s and to the form's `PhotoDraft`s. They never mutate their input
 * and keep the order of the remaining photos.
 */
import { PHOTO_ROLES, type ItemPhoto, type PhotoRole } from './types';

export const MAX_PHOTOS_PER_ITEM = 4;
export const MAX_DETAIL_PHOTOS = 2;

/** Anything with an identity, a role, and a primary flag. */
export interface RoledPhoto {
  id: string;
  role: PhotoRole;
  isPrimary: boolean;
}

export type PhotoSetProblem = 'front_first' | 'role_full' | 'too_many' | 'front_required' | 'not_found';

export const PHOTO_MESSAGES: Readonly<Record<PhotoSetProblem, string>> = Object.freeze({
  front_first: 'Add the front photo first.',
  role_full: 'This item already has the most photos of that kind.',
  too_many: `An item can have at most ${MAX_PHOTOS_PER_ITEM} photos.`,
  front_required: 'The front photo can be retaken but not removed.',
  not_found: 'That photo is no longer in this item.',
});

export type PhotoSetResult<P> = { ok: true; photos: P[] } | { ok: false; problem: PhotoSetProblem };

/** Short label for a role, as shown in the form. */
export const PHOTO_ROLE_LABELS: Readonly<Record<PhotoRole, string>> = Object.freeze({
  front: 'Front',
  back: 'Back',
  detail: 'Detail (close-up)',
});

export function isPhotoRole(value: unknown): value is PhotoRole {
  return typeof value === 'string' && (PHOTO_ROLES as readonly string[]).includes(value);
}

function countRole(photos: readonly RoledPhoto[], role: PhotoRole): number {
  return photos.filter((p) => p.role === role).length;
}

const ROLE_LIMITS: Readonly<Record<PhotoRole, number>> = { front: 1, back: 1, detail: MAX_DETAIL_PHOTOS };

/** Why a photo with `role` cannot be added, or null if it can. */
function addProblem(photos: readonly RoledPhoto[], role: PhotoRole): PhotoSetProblem | null {
  const hasFront = countRole(photos, 'front') > 0;
  if (!hasFront && role !== 'front') return 'front_first';
  if (countRole(photos, role) >= ROLE_LIMITS[role]) return 'role_full';
  if (photos.length >= MAX_PHOTOS_PER_ITEM) return 'too_many';
  return null;
}

/**
 * Roles a new photo may have, in `PHOTO_ROLES` order: only 'front' while
 * there is no front photo, then whichever of back and detail still fit.
 */
export function allowedNewRoles(photos: readonly RoledPhoto[]): PhotoRole[] {
  return PHOTO_ROLES.filter((role) => addProblem(photos, role) === null);
}

/**
 * Appends `photo` with its role. The first photo (the front) becomes primary;
 * any later photo is added as not primary, whatever `photo.isPrimary` says.
 */
export function addPhoto<P extends RoledPhoto>(photos: readonly P[], photo: P): PhotoSetResult<P> {
  const problem = addProblem(photos, photo.role);
  if (problem) return { ok: false, problem };
  return { ok: true, photos: [...photos, { ...photo, isPrimary: photos.length === 0 }] };
}

/**
 * Retakes the photo `id`: `next` takes its place, role, and primary flag.
 * `next` should have a new id (a different image is a different photo).
 */
export function replacePhoto<P extends RoledPhoto>(photos: readonly P[], id: string, next: P): PhotoSetResult<P> {
  const index = photos.findIndex((p) => p.id === id);
  if (index < 0) return { ok: false, problem: 'not_found' };
  const old = photos[index];
  const copy = [...photos];
  copy[index] = { ...next, role: old.role, isPrimary: old.isPrimary };
  return { ok: true, photos: copy };
}

/** Removes the photo `id`. Refuses the front photo. If it was primary, the front becomes primary. */
export function removePhoto<P extends RoledPhoto>(photos: readonly P[], id: string): PhotoSetResult<P> {
  const target = photos.find((p) => p.id === id);
  if (!target) return { ok: false, problem: 'not_found' };
  if (target.role === 'front') return { ok: false, problem: 'front_required' };
  const rest = photos.filter((p) => p.id !== id);
  return {
    ok: true,
    photos: target.isPrimary ? rest.map((p) => ({ ...p, isPrimary: p.role === 'front' })) : rest,
  };
}

/** Makes the photo `id` the only primary one. */
export function makePrimary<P extends RoledPhoto>(photos: readonly P[], id: string): PhotoSetResult<P> {
  if (!photos.some((p) => p.id === id)) return { ok: false, problem: 'not_found' };
  return { ok: true, photos: photos.map((p) => ({ ...p, isPrimary: p.id === id })) };
}

/** The primary photo; failing that the front, then the first; null if there are none. */
export function primaryPhoto<P extends RoledPhoto>(photos: readonly P[]): P | null {
  return photos.find((p) => p.isPrimary) ?? photos.find((p) => p.role === 'front') ?? photos[0] ?? null;
}

/**
 * Rule violations of a complete set (what may be saved), as messages that
 * start with "photos ". Empty means the set is valid. Assumes every role is
 * a known one (the item validator checks that first).
 */
export function photoSetProblems(photos: readonly RoledPhoto[]): string[] {
  // One message for "no photos at all": the front photo is what is missing.
  if (photos.length === 0) return ['photos must include exactly one front photo'];
  const errors: string[] = [];
  if (countRole(photos, 'front') !== 1) errors.push('photos must include exactly one front photo');
  if (countRole(photos, 'back') > 1) errors.push('photos must include at most one back photo');
  if (countRole(photos, 'detail') > MAX_DETAIL_PHOTOS) {
    errors.push(`photos must include at most ${MAX_DETAIL_PHOTOS} detail photos`);
  }
  if (photos.length > MAX_PHOTOS_PER_ITEM) errors.push(`photos must have at most ${MAX_PHOTOS_PER_ITEM} entries`);
  if (photos.filter((p) => p.isPrimary).length !== 1) errors.push('photos must have exactly one primary photo');
  return errors;
}

/**
 * A photo in an add or edit form before saving: either one already stored
 * with the item, or one just picked or taken (a temporary file).
 */
export type PhotoDraft =
  | (RoledPhoto & { kind: 'stored'; path: string })
  | (RoledPhoto & { kind: 'picked'; uri: string });

/** The form's starting photos for a stored item. */
export function draftsFromPhotos(photos: readonly ItemPhoto[]): PhotoDraft[] {
  return photos.map((p) => ({ kind: 'stored', id: p.id, role: p.role, isPrimary: p.isPrimary, path: p.path }));
}

/** What a pick is for: a new photo with `role`, or retaking the draft `id`. */
export type PhotoTarget = { kind: 'add'; role: PhotoRole } | { kind: 'retake'; id: string };

/**
 * Applies a picked photo to the form's drafts: adds it with `target.role`,
 * or retakes the draft `target.id`. `replaced` is the draft that was retaken.
 */
export function applyPickedPhoto(
  drafts: readonly PhotoDraft[],
  target: PhotoTarget,
  picked: { id: string; uri: string },
): { ok: true; photos: PhotoDraft[]; replaced: PhotoDraft | null } | { ok: false; problem: PhotoSetProblem } {
  if (target.kind === 'add') {
    const draft: PhotoDraft = { kind: 'picked', id: picked.id, uri: picked.uri, role: target.role, isPrimary: false };
    const result = addPhoto(drafts, draft);
    return result.ok ? { ...result, replaced: null } : result;
  }
  const replaced = drafts.find((d) => d.id === target.id) ?? null;
  const draft: PhotoDraft = { kind: 'picked', id: picked.id, uri: picked.uri, role: 'front', isPrimary: false };
  const result = replacePhoto(drafts, target.id, draft);
  return result.ok ? { ...result, replaced } : result;
}

/**
 * True if saving `drafts` would change the stored `photos`: a new pick, a
 * removed photo, a different order, role, or primary photo.
 */
export function hasPhotoChanges(photos: readonly ItemPhoto[], drafts: readonly PhotoDraft[]): boolean {
  if (photos.length !== drafts.length) return true;
  return drafts.some((d, i) => {
    const p = photos[i];
    return d.kind !== 'stored' || d.id !== p.id || d.path !== p.path || d.role !== p.role || d.isPrimary !== p.isPrimary;
  });
}
