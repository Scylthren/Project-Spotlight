import {
  createClothingItem,
  TAG_MESSAGES,
  type Category,
  type ClothingItem,
  type ItemFormValues,
  type PhotoDraft,
} from '@/core';

import type { ClosetRepository } from './closet-repository';
import { STORED_IMAGE_EXTENSION, type ImageProcessor } from './image-processor';
import type { ImageStore } from './image-store';
import { discardQuietly, type TemporaryFiles } from './temporary-files';

export interface AddItemForm extends ItemFormValues {
  /**
   * The photos in display order, all newly picked or taken (temporary
   * files). Empty if none was picked yet.
   */
  photos: PhotoDraft[];
}

export interface AddItemDeps {
  repository: ClosetRepository;
  imageStore: ImageStore;
  imageProcessor: ImageProcessor;
  temporaryFiles: TemporaryFiles;
  newId: () => string;
  now?: () => Date;
}

export type ItemFlowResult<T> = ({ ok: true } & T) | { ok: false; errors: string[] };
export type AddItemResult = ItemFlowResult<{ item: ClothingItem }>;

/** User-facing messages for the add, edit, and delete flows. */
export const CLOSET_ITEM_MESSAGES = {
  noPhoto: 'Take or choose a photo first.',
  badPhotos: 'These photos cannot be saved together. Remove one and try again.',
  staleItem: 'This item changed since you opened it. Go back and open it again.',
  noCategory: 'Choose a category.',
  noColors: 'Choose at least one color.',
  badColors: 'These colors cannot be saved. Choose them again.',
  noSeasons: 'Choose at least one season.',
  badTags: 'Some tags could not be used. Remove them and add them again.',
  processFailed: 'Could not prepare this photo. Try again, or use a different photo.',
  copyFailed: 'Could not save the photo on this device. Check free space and try again.',
  saveFailed: 'Could not save the item. Please try again.',
  notFound: 'This item is no longer in your closet.',
  deleteFailed: 'Could not delete the item. Please try again.',
} as const;
export const ADD_ITEM_MESSAGES = CLOSET_ITEM_MESSAGES;

/** Maps `createClothingItem` errors to user-facing text. Unknown errors pass through. */
export function toUserMessage(error: string): string {
  if (error === 'photos must include exactly one front photo') return CLOSET_ITEM_MESSAGES.noPhoto;
  if (error.startsWith('photos')) return CLOSET_ITEM_MESSAGES.badPhotos;
  if (error.startsWith('category ')) return CLOSET_ITEM_MESSAGES.noCategory;
  if (error === 'colors must be a non-empty array') return CLOSET_ITEM_MESSAGES.noColors;
  if (error.startsWith('colors')) return CLOSET_ITEM_MESSAGES.badColors;
  if (error === 'seasons must be a non-empty array') return CLOSET_ITEM_MESSAGES.noSeasons;
  if (error.startsWith('tags must have at most')) return TAG_MESSAGES.too_many;
  if (error.startsWith('tags ')) return CLOSET_ITEM_MESSAGES.badTags;
  return error;
}

/** Random URL-safe id for items and photos. Local only; good enough until server ids arrive with sync. */
export function generateItemId(random: () => number = Math.random, now: () => number = Date.now): string {
  const rand = Array.from({ length: 12 }, () => Math.floor(random() * 36).toString(36)).join('');
  return `${now().toString(36)}-${rand}`;
}

/**
 * Validates form values into an item with both timestamps set to `now`.
 * Shared by add and edit. A picked draft's path is its temporary URI until
 * the flow stores it. Errors are already user-facing and deduplicated.
 */
export function buildItemDraft(
  id: string,
  photos: readonly PhotoDraft[],
  values: ItemFormValues,
  now: Date,
): ItemFlowResult<{ item: ClothingItem }> {
  const draft = createClothingItem(
    {
      id,
      photos: photos.map((p) => ({
        id: p.id,
        role: p.role,
        isPrimary: p.isPrimary,
        path: p.kind === 'stored' ? p.path : p.uri,
      })),
      // A missing category is rejected by createClothingItem like any unknown one.
      category: values.category ?? ('' as Category),
      colors: values.colors,
      seasons: values.seasons,
      tags: values.tags,
    },
    now,
  );
  return draft.ok ? draft : { ok: false, errors: [...new Set(draft.errors.map(toUserMessage))] };
}

/**
 * Downscales and re-encodes a picked photo, then copies the result into app
 * storage as a `.jpg`. Returns the stored ref, or a user-facing error. If
 * processing fails nothing is stored. The processed temporary JPEG is
 * deleted after the copy, whether or not the copy worked (a retry processes
 * the photo again). The picked source photo is not touched here.
 */
export async function storePhoto(
  sourceUri: string,
  itemId: string,
  deps: { imageStore: ImageStore; imageProcessor: ImageProcessor; temporaryFiles: TemporaryFiles },
): Promise<ItemFlowResult<{ ref: string }>> {
  let processedUri: string;
  try {
    processedUri = (await deps.imageProcessor.prepareForStorage(sourceUri)).uri;
  } catch {
    return { ok: false, errors: [CLOSET_ITEM_MESSAGES.processFailed] };
  }
  try {
    return { ok: true, ref: await deps.imageStore.save(processedUri, itemId, STORED_IMAGE_EXTENSION) };
  } catch {
    return { ok: false, errors: [CLOSET_ITEM_MESSAGES.copyFailed] };
  } finally {
    await discardQuietly(deps.temporaryFiles, processedUri);
  }
}

/**
 * Stores every picked draft in `photos` (see `storePhoto`), one at a time,
 * and returns photo id -> stored ref. If any photo fails, the copies this
 * call already made are removed and nothing stays stored. Stored drafts are
 * skipped.
 */
export async function storePickedPhotos(
  photos: readonly PhotoDraft[],
  itemId: string,
  deps: { imageStore: ImageStore; imageProcessor: ImageProcessor; temporaryFiles: TemporaryFiles },
): Promise<ItemFlowResult<{ refs: Map<string, string> }>> {
  const refs = new Map<string, string>();
  for (const photo of photos) {
    if (photo.kind !== 'picked') continue;
    const stored = await storePhoto(photo.uri, itemId, deps);
    if (!stored.ok) {
      await removeQuietly(deps.imageStore, refs.values());
      return stored;
    }
    refs.set(photo.id, stored.ref);
  }
  return { ok: true, refs };
}

/** Removes refs this flow created and no longer needs. Failures leave a stray file only. */
export async function removeQuietly(imageStore: ImageStore, refs: Iterable<string>): Promise<void> {
  for (const ref of [...refs]) await imageStore.remove(ref).catch(() => undefined);
}

/** Deletes the picker's temporary copy of every picked draft (best effort). */
export async function discardPicked(temporaryFiles: TemporaryFiles, photos: readonly PhotoDraft[]): Promise<void> {
  for (const photo of photos) if (photo.kind === 'picked') await discardQuietly(temporaryFiles, photo.uri);
}

/** `item` with each photo path replaced by its stored ref, where there is one. */
export function withStoredPaths(item: ClothingItem, refs: ReadonlyMap<string, string>): ClothingItem {
  return { ...item, photos: item.photos.map((p) => ({ ...p, path: refs.get(p.id) ?? p.path })) };
}

/**
 * Validates the form, shrinks each photo and copies it into app storage, and
 * saves the item. Validation runs first so a rejected form does no work and
 * leaves no files behind. If storing any photo fails, or saving fails after
 * the copies, every copy this call made is removed; no other file is touched
 * (each copy has its own unique name). After a successful save the picked
 * photos' temporary copies are deleted too (best effort); after a failure
 * they are kept so the user can retry.
 */
export async function addClosetItem(form: AddItemForm, deps: AddItemDeps): Promise<AddItemResult> {
  const id = deps.newId();
  const draft = buildItemDraft(id, form.photos, form, (deps.now ?? (() => new Date()))());
  if (!draft.ok) return draft;
  // A new item has no stored photos yet; a stored draft here is a stale form.
  if (form.photos.some((p) => p.kind !== 'picked')) return { ok: false, errors: [CLOSET_ITEM_MESSAGES.badPhotos] };

  const stored = await storePickedPhotos(form.photos, id, deps);
  if (!stored.ok) return stored;

  const item = withStoredPaths(draft.item, stored.refs);
  try {
    await deps.repository.add(item);
  } catch {
    await removeQuietly(deps.imageStore, stored.refs.values());
    return { ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] };
  }
  await discardPicked(deps.temporaryFiles, form.photos);
  return { ok: true, item };
}
