import {
  createClothingItem,
  parseColors,
  TAG_MESSAGES,
  type Category,
  type ClothingItem,
  type ItemFormValues,
} from '@/core';

import type { ClosetRepository } from './closet-repository';
import { STORED_IMAGE_EXTENSION, type ImageProcessor } from './image-processor';
import type { ImageStore } from './image-store';
import { discardQuietly, type TemporaryFiles } from './temporary-files';

export interface AddItemForm extends ItemFormValues {
  /** Temporary URI from the photo picker or camera, or null if none picked yet. */
  photoUri: string | null;
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
  noCategory: 'Choose a category.',
  noColors: 'Enter at least one color.',
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
  if (error.startsWith('imageUri ')) return CLOSET_ITEM_MESSAGES.noPhoto;
  if (error.startsWith('category ')) return CLOSET_ITEM_MESSAGES.noCategory;
  if (error === 'colors must be a non-empty array') return CLOSET_ITEM_MESSAGES.noColors;
  if (error === 'seasons must be a non-empty array') return CLOSET_ITEM_MESSAGES.noSeasons;
  if (error.startsWith('tags must have at most')) return TAG_MESSAGES.too_many;
  if (error.startsWith('tags ')) return CLOSET_ITEM_MESSAGES.badTags;
  return error;
}

/** Random URL-safe id. Local only; good enough until server ids arrive with sync. */
export function generateItemId(random: () => number = Math.random, now: () => number = Date.now): string {
  const rand = Array.from({ length: 12 }, () => Math.floor(random() * 36).toString(36)).join('');
  return `${now().toString(36)}-${rand}`;
}

/**
 * Validates form values into an item with both timestamps set to `now`.
 * Shared by add and edit. Errors are already user-facing and deduplicated.
 */
export function buildItemDraft(
  id: string,
  imageUri: string | null,
  values: ItemFormValues,
  now: Date,
): ItemFlowResult<{ item: ClothingItem }> {
  const draft = createClothingItem(
    {
      id,
      imageUri: imageUri ?? '',
      // A missing category is rejected by createClothingItem like any unknown one.
      category: values.category ?? ('' as Category),
      colors: parseColors(values.colorsText),
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
 * Validates the form, shrinks the photo and copies it into app storage, and
 * saves the item. Validation runs first so a rejected form does no work and
 * leaves no files behind. If saving fails after the copy, the copy this call
 * made is removed; no other file is touched (each copy has its own unique name).
 * After a successful save the picked photo's temporary copy is deleted too
 * (best effort); after a failure it is kept so the user can retry.
 */
export async function addClosetItem(form: AddItemForm, deps: AddItemDeps): Promise<AddItemResult> {
  const id = deps.newId();
  const draft = buildItemDraft(id, form.photoUri, form, (deps.now ?? (() => new Date()))());
  if (!draft.ok) return draft;

  const stored = await storePhoto(draft.item.imageUri, id, deps);
  if (!stored.ok) return stored;
  const { ref } = stored;

  const item: ClothingItem = { ...draft.item, imageUri: ref };
  try {
    await deps.repository.add(item);
  } catch {
    await deps.imageStore.remove(ref).catch(() => undefined);
    return { ok: false, errors: [CLOSET_ITEM_MESSAGES.saveFailed] };
  }
  await discardQuietly(deps.temporaryFiles, form.photoUri);
  return { ok: true, item };
}
