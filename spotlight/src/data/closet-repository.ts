import type { ClothingItem, TagSummary } from '@/core';

/**
 * Storage for the user's closet. Implementations: `InMemoryClosetRepository`
 * (tests, mock) and `SqliteClosetRepository` (on-device).
 *
 * Contract (enforced by `closet-repository.contract.ts`):
 * - `list()` returns items newest first (createdAt instant descending, then id ascending).
 * - `get()` returns null for an unknown id.
 * - `add()` rejects an item that fails `validateClothingItem` (code 'invalid')
 *   or whose id already exists (code 'duplicate'), and stores nothing.
 * - `update()` replaces the item with the same id. It rejects an invalid item
 *   (code 'invalid') or an unknown id (code 'not_found') and changes nothing.
 *   It keeps the stored `createdAt` (so list order is stable) and stores the
 *   caller's `updatedAt`; callers set `updatedAt` from their clock.
 * - `remove()` deletes the item. An unknown id is an error (code 'not_found')
 *   so callers can tell "already gone" apart from success.
 * - Returned items are copies; mutating them does not change stored data.
 *
 * Tags (user-defined labels, see core/tags.ts):
 * - Items round-trip their `tags` in order. Saving an item (add or update)
 *   with a tag that is not on the saved list adds it to the list.
 * - The saved list is reusable: a tag stays on it when no item uses it any
 *   more (after an edit or a delete), until `deleteTag` removes it.
 * - `listTags()` returns every saved tag with the number of items using it,
 *   sorted by name (`compareTagNames`).
 * - `deleteTag(name)` takes raw input (normalized first), removes the tag from
 *   the list and from every item, and leaves everything else on those items,
 *   including `updatedAt`, unchanged: removing a label from the list is not
 *   an edit of the item. Unknown tag: code 'not_found'.
 */
export interface ClosetRepository {
  list(): Promise<ClothingItem[]>;
  get(id: string): Promise<ClothingItem | null>;
  add(item: ClothingItem): Promise<void>;
  update(item: ClothingItem): Promise<void>;
  remove(id: string): Promise<void>;
  listTags(): Promise<TagSummary[]>;
  deleteTag(name: string): Promise<void>;
}

export type ClosetRepositoryErrorCode = 'invalid' | 'duplicate' | 'not_found';

export class ClosetRepositoryError extends Error {
  constructor(
    readonly code: ClosetRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClosetRepositoryError';
  }
}

/**
 * Newest first by the instant in createdAt (so `+05:30` offsets sort
 * correctly), ties broken by id ascending so the order is deterministic.
 */
export function compareNewestFirst(a: ClothingItem, b: ClothingItem): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function cloneItem(item: ClothingItem): ClothingItem {
  return { ...item, colors: [...item.colors], seasons: [...item.seasons], tags: [...item.tags] };
}
