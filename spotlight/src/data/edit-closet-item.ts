import { hasDetailChanges, hasPhotoChanges, type ClothingItem, type ItemFormValues, type PhotoDraft } from '@/core';

import {
  buildItemDraft,
  CLOSET_ITEM_MESSAGES,
  discardPicked,
  removeQuietly,
  storePickedPhotos,
  withStoredPaths,
  type ItemFlowResult,
} from './add-closet-item';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import type { ImageProcessor } from './image-processor';
import type { ImageStore } from './image-store';
import type { TemporaryFiles } from './temporary-files';

export interface EditItemForm extends ItemFormValues {
  /**
   * The photos in display order: the item's stored ones that are kept
   * (`kind: 'stored'`), and newly picked or taken ones (`kind: 'picked'`).
   */
  photos: PhotoDraft[];
}

export interface EditItemDeps {
  repository: ClosetRepository;
  imageStore: ImageStore;
  imageProcessor: ImageProcessor;
  temporaryFiles: TemporaryFiles;
  now?: () => Date;
  /** Called when an old photo could not be deleted. The edit still succeeded. */
  onCleanupError?: (error: unknown, ref: string) => void;
}

/**
 * On success, `item` is the stored item. `changed` is false when the form
 * matched the stored item, in which case nothing was written (and `updatedAt`
 * was not bumped). Both cases are a successful save for the UI.
 */
export type EditItemResult = ItemFlowResult<{ item: ClothingItem; changed: boolean }>;

export function warnCleanupError(error: unknown, ref: string): void {
  console.warn(`Could not delete image ${ref}; leaving a stray file.`, error);
}

/** True if every stored draft is one of `existing`'s photos, unchanged in path. */
function storedDraftsMatch(existing: ClothingItem, photos: readonly PhotoDraft[]): boolean {
  return photos.every(
    (d) => d.kind !== 'stored' || existing.photos.some((p) => p.id === d.id && p.path === d.path),
  );
}

/**
 * Saves edits to an existing item. Keeps `createdAt`, sets `updatedAt` to now.
 * If the photos and the fields match the stored item (see `hasPhotoChanges`
 * and `hasDetailChanges`), nothing is written and `changed` is false.
 *
 * Photo changes, in an order where a failure never leaves the item without
 * its photos:
 * 1. Shrink and re-encode each newly picked photo, then copy it to a new,
 *    unique file. Only picked photos are processed and written; kept photos
 *    are not touched. If any step fails, the copies made so far are removed
 *    and nothing changed.
 * 2. Update the row and its photo list. If that fails, delete only the new
 *    copies; the old photos and the stored item are untouched.
 * 3. Delete the files of removed or retaken photos. If that fails, the edit
 *    stands and a stray file is left behind (reported through `onCleanupError`).
 * 4. Delete the picked photos' temporary copies (best effort). On any failure
 *    above they are kept so the user can retry.
 */
export async function editClosetItem(
  id: string,
  form: EditItemForm,
  deps: EditItemDeps,
): Promise<EditItemResult> {
  let existing: ClothingItem | null;
  try {
    existing = await deps.repository.get(id);
  } catch {
    return { ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] };
  }
  if (!existing) return { ok: false, errors: [CLOSET_ITEM_MESSAGES.notFound] };

  const now = (deps.now ?? (() => new Date()))();
  const draft = buildItemDraft(id, form.photos, form, now);
  if (!draft.ok) return draft;
  const photosChanged = hasPhotoChanges(existing.photos, form.photos);
  if (!photosChanged && !hasDetailChanges(existing, draft.item)) {
    return { ok: true, item: existing, changed: false };
  }
  // A kept photo that is not (or no longer) on the stored item: the form is stale.
  if (!storedDraftsMatch(existing, form.photos)) return { ok: false, errors: [CLOSET_ITEM_MESSAGES.staleItem] };

  const stored = await storePickedPhotos(form.photos, id, deps);
  if (!stored.ok) return stored;

  const item: ClothingItem = { ...withStoredPaths(draft.item, stored.refs), createdAt: existing.createdAt };
  try {
    await deps.repository.update(item);
  } catch (error) {
    await removeQuietly(deps.imageStore, stored.refs.values());
    const notFound = error instanceof ClosetRepositoryError && error.code === 'not_found';
    return { ok: false, errors: [notFound ? CLOSET_ITEM_MESSAGES.notFound : CLOSET_ITEM_MESSAGES.saveFailed] };
  }

  // Old files are matched to kept photos by path; this relies on stored paths being unique (random suffix per save).
  const kept = new Set(item.photos.map((p) => p.path));
  for (const old of existing.photos) {
    if (kept.has(old.path)) continue;
    await deps.imageStore
      .remove(old.path)
      .catch((e: unknown) => (deps.onCleanupError ?? warnCleanupError)(e, old.path));
  }
  await discardPicked(deps.temporaryFiles, form.photos);
  return { ok: true, item, changed: true };
}
