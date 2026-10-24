import type { LookRating, Occasion, SavedLook } from '@/core';

/**
 * Storage for saved looks (the Lookbook, Gate 3 slice 4). A sibling of
 * `ClosetRepository`, not part of it: looks reference closet items by id
 * only and outlive them (D5), and the closet contract stays as it is.
 * Implementations: `InMemoryOutfitRepository` (tests, mock) and
 * `SqliteOutfitRepository` (on-device, same database file as the closet).
 *
 * Contract (enforced by `outfit-repository.contract.ts`):
 * - `list()` returns looks newest first (createdAt instant descending, then id ascending).
 * - `get()` returns null for an unknown id.
 * - `save()` rejects a look that fails `validateSavedLook` (code 'invalid')
 *   and stores nothing. A look with the same set of pieces as a saved one
 *   (`savedLookKey`) is not stored again: the saved one is returned
 *   unchanged with `created: false`. Reusing an existing id for a different
 *   set is 'duplicate'.
 * - `setRating` and `setOccasion` change only that field (null clears it);
 *   unknown id: 'not_found'; a value outside the lists: 'invalid'.
 * - `remove()` deletes the look; unknown id: 'not_found'.
 * - `removeLooksWithNoPiecesIn(closetIds)` deletes every look none of whose
 *   pieces is in `closetIds` (D5) and returns their ids.
 * - Pieces round-trip in order with their categories. They are not tied to
 *   the closet: deleting a closet item never deletes a piece row.
 * - Returned looks are copies; mutating them does not change stored data.
 */
export interface OutfitRepository {
  list(): Promise<SavedLook[]>;
  get(id: string): Promise<SavedLook | null>;
  save(look: SavedLook): Promise<{ look: SavedLook; created: boolean }>;
  setRating(id: string, rating: LookRating | null): Promise<void>;
  setOccasion(id: string, occasion: Occasion | null): Promise<void>;
  remove(id: string): Promise<void>;
  removeLooksWithNoPiecesIn(closetIds: ReadonlySet<string>): Promise<string[]>;
}

export type OutfitRepositoryErrorCode = 'invalid' | 'duplicate' | 'not_found';

export class OutfitRepositoryError extends Error {
  constructor(
    readonly code: OutfitRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OutfitRepositoryError';
  }
}
