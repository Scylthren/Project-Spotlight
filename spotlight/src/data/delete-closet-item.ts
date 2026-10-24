import { CLOSET_ITEM_MESSAGES, type ItemFlowResult } from './add-closet-item';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';
import { warnCleanupError } from './edit-closet-item';
import type { ImageStore } from './image-store';
import type { OutfitRepository } from './outfit-repository';

export interface DeleteItemDeps {
  repository: ClosetRepository;
  imageStore: ImageStore;
  /** Called for each photo that could not be deleted. The item is still deleted. */
  onCleanupError?: (error: unknown, ref: string) => void;
  /**
   * Saved looks (D5): looks keep a deleted piece, but a look with no piece
   * left is deleted here. Best effort: a failure never fails the item delete
   * (the Lookbook repeats the cleanup when it loads).
   */
  outfits?: OutfitRepository;
}

export type DeleteItemResult = ItemFlowResult<object>;

/**
 * Deletes an item. The row (with its photo list) goes first, then every photo
 * file: if a file cannot be deleted the item is still gone, the other files
 * are still deleted, and a stray file is left (reported through
 * `onCleanupError`). The reverse order could leave an item with no photos.
 */
export async function deleteClosetItem(id: string, deps: DeleteItemDeps): Promise<DeleteItemResult> {
  let imageRefs: string[];
  try {
    const existing = await deps.repository.get(id);
    if (!existing) return { ok: false, errors: [CLOSET_ITEM_MESSAGES.notFound] };
    imageRefs = existing.photos.map((p) => p.path);
    await deps.repository.remove(id);
  } catch (error) {
    const notFound = error instanceof ClosetRepositoryError && error.code === 'not_found';
    return { ok: false, errors: [notFound ? CLOSET_ITEM_MESSAGES.notFound : CLOSET_ITEM_MESSAGES.deleteFailed] };
  }

  if (deps.outfits) await removeEmptyLooks(deps.repository, deps.outfits);

  for (const ref of imageRefs) {
    await deps.imageStore.remove(ref).catch((e: unknown) => (deps.onCleanupError ?? warnCleanupError)(e, ref));
  }
  return { ok: true };
}

/** Deletes saved looks with no piece left in the closet (D5). Never throws. */
export async function removeEmptyLooks(closet: ClosetRepository, outfits: OutfitRepository): Promise<string[]> {
  try {
    const ids = new Set((await closet.list()).map((item) => item.id));
    return await outfits.removeLooksWithNoPiecesIn(ids);
  } catch (error) {
    console.warn('Could not tidy saved looks', error);
    return [];
  }
}
