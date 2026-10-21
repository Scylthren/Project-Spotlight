import { CLOSET_ITEM_MESSAGES, type ItemFlowResult } from './add-closet-item';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import { warnCleanupError } from './edit-closet-item';
import type { ImageStore } from './image-store';

export interface DeleteItemDeps {
  repository: ClosetRepository;
  imageStore: ImageStore;
  /** Called when the photo could not be deleted. The item is still deleted. */
  onCleanupError?: (error: unknown, ref: string) => void;
}

export type DeleteItemResult = ItemFlowResult<object>;

/**
 * Deletes an item. The row goes first, then the photo: if the photo cannot be
 * deleted the item is still gone and a stray file is left (reported through
 * `onCleanupError`). The reverse order could leave an item with no photo.
 */
export async function deleteClosetItem(id: string, deps: DeleteItemDeps): Promise<DeleteItemResult> {
  let imageRef: string;
  try {
    const existing = await deps.repository.get(id);
    if (!existing) return { ok: false, errors: [CLOSET_ITEM_MESSAGES.notFound] };
    imageRef = existing.imageUri;
    await deps.repository.remove(id);
  } catch (error) {
    const notFound = error instanceof ClosetRepositoryError && error.code === 'not_found';
    return { ok: false, errors: [notFound ? CLOSET_ITEM_MESSAGES.notFound : CLOSET_ITEM_MESSAGES.deleteFailed] };
  }

  await deps.imageStore
    .remove(imageRef)
    .catch((e: unknown) => (deps.onCleanupError ?? warnCleanupError)(e, imageRef));
  return { ok: true };
}
