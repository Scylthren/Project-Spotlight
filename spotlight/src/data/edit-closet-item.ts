import { hasDetailChanges, type ClothingItem, type ItemFormValues } from '@/core';

import { buildItemDraft, CLOSET_ITEM_MESSAGES, storePhoto, type ItemFlowResult } from './add-closet-item';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import type { ImageProcessor } from './image-processor';
import type { ImageStore } from './image-store';
import { discardQuietly, type TemporaryFiles } from './temporary-files';

export interface EditItemForm extends ItemFormValues {
  /** Temporary URI of a newly picked or taken photo, or null to keep the current one. */
  newPhotoUri: string | null;
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

/**
 * Saves edits to an existing item. Keeps `createdAt`, sets `updatedAt` to now.
 * If no photo was picked and the fields match the stored item (see
 * `hasDetailChanges`), nothing is written and `changed` is false.
 *
 * Photo replacement order, so a failure never leaves the item without a photo:
 * 1. Shrink and re-encode the new photo, then copy it to a new, unique file.
 *    If either step fails, nothing changed.
 * 2. Update the row. If that fails, delete only the new copy; the old photo
 *    and the stored item are untouched.
 * 3. Delete the old photo. If that fails, the edit stands and a stray file
 *    is left behind (reported through `onCleanupError`).
 * 4. Delete the picked photo's temporary copy (best effort). On any failure
 *    above it is kept so the user can retry.
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
  const draft = buildItemDraft(id, form.newPhotoUri ?? existing.imageUri, form, now);
  if (!draft.ok) return draft;
  if (form.newPhotoUri === null && !hasDetailChanges(existing, draft.item)) {
    return { ok: true, item: existing, changed: false };
  }

  let newRef: string | null = null;
  if (form.newPhotoUri !== null) {
    const stored = await storePhoto(form.newPhotoUri, id, deps);
    if (!stored.ok) return stored;
    newRef = stored.ref;
  }

  const item: ClothingItem = {
    ...draft.item,
    imageUri: newRef ?? existing.imageUri,
    createdAt: existing.createdAt,
  };
  try {
    await deps.repository.update(item);
  } catch (error) {
    if (newRef !== null) await deps.imageStore.remove(newRef).catch(() => undefined);
    const notFound = error instanceof ClosetRepositoryError && error.code === 'not_found';
    return { ok: false, errors: [notFound ? CLOSET_ITEM_MESSAGES.notFound : CLOSET_ITEM_MESSAGES.saveFailed] };
  }

  if (newRef !== null && existing.imageUri !== newRef) {
    const oldRef = existing.imageUri;
    await deps.imageStore.remove(oldRef).catch((e: unknown) => (deps.onCleanupError ?? warnCleanupError)(e, oldRef));
  }
  await discardQuietly(deps.temporaryFiles, form.newPhotoUri);
  return { ok: true, item, changed: true };
}
