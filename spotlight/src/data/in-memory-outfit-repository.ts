import {
  cloneSavedLook,
  compareSavedLooksNewestFirst,
  isLookRating,
  isOccasion,
  looksWithNoPiecesLeft,
  savedLookKey,
  validateSavedLook,
  type LookRating,
  type Occasion,
  type SavedLook,
} from '@/core';

import { OutfitRepositoryError, type OutfitRepository } from './outfit-repository';

const keyOf = (look: SavedLook) => savedLookKey(look.pieces.map((p) => p.itemId));

/** Mock `OutfitRepository` for tests and previews. Data lives only in memory. */
export class InMemoryOutfitRepository implements OutfitRepository {
  private readonly looks = new Map<string, SavedLook>();

  constructor(initial: SavedLook[] = []) {
    for (const look of initial) this.looks.set(look.id, cloneSavedLook(look));
  }

  async list(): Promise<SavedLook[]> {
    return [...this.looks.values()].map(cloneSavedLook).sort(compareSavedLooksNewestFirst);
  }

  async get(id: string): Promise<SavedLook | null> {
    const look = this.looks.get(id);
    return look ? cloneSavedLook(look) : null;
  }

  async save(look: SavedLook): Promise<{ look: SavedLook; created: boolean }> {
    const errors = validateSavedLook(look);
    if (errors.length > 0) throw new OutfitRepositoryError('invalid', errors.join('; '));
    const key = keyOf(look);
    const same = [...this.looks.values()].find((l) => keyOf(l) === key);
    if (same) return { look: cloneSavedLook(same), created: false };
    if (this.looks.has(look.id)) throw new OutfitRepositoryError('duplicate', `look ${look.id} already exists`);
    this.looks.set(look.id, cloneSavedLook(look));
    return { look: cloneSavedLook(look), created: true };
  }

  async setRating(id: string, rating: LookRating | null): Promise<void> {
    if (rating !== null && !isLookRating(rating)) throw new OutfitRepositoryError('invalid', 'unknown rating');
    this.stored(id).rating = rating;
  }

  async setOccasion(id: string, occasion: Occasion | null): Promise<void> {
    if (occasion !== null && !isOccasion(occasion)) throw new OutfitRepositoryError('invalid', 'unknown occasion');
    this.stored(id).occasion = occasion;
  }

  async remove(id: string): Promise<void> {
    if (!this.looks.delete(id)) throw new OutfitRepositoryError('not_found', `look ${id} does not exist`);
  }

  async removeLooksWithNoPiecesIn(closetIds: ReadonlySet<string>): Promise<string[]> {
    const ids = looksWithNoPiecesLeft([...this.looks.values()].sort(compareSavedLooksNewestFirst), closetIds);
    for (const id of ids) this.looks.delete(id);
    return ids;
  }

  private stored(id: string): SavedLook {
    const look = this.looks.get(id);
    if (!look) throw new OutfitRepositoryError('not_found', `look ${id} does not exist`);
    return look;
  }
}
