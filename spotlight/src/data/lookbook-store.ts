/**
 * Saved looks shared by Results (Save, thumbs) and the Looks tab (Gate 3
 * slice 4), held outside React like `StyleSession`. Subscribe with
 * `subscribe`/`getSnapshot` (useSyncExternalStore).
 *
 * Rules:
 * - Saving a set of pieces that is already saved keeps the one entry (the
 *   repository enforces it; Results shows "Saved").
 * - Rating a look on Results that is not saved yet saves it with that rating
 *   and no occasion (human decision 2026-10-24). Tapping the same thumb again
 *   clears the rating; the look stays saved.
 * - Ratings are only stored (D6). The occasion is picked by the user (D11).
 * - Every write runs one after another, each reading the state the previous
 *   one left, so two quick taps on a thumb set it and then clear it.
 * - `load(closetIds)` first deletes looks with no piece left (D5), then reads.
 */
import {
  nextOccasion,
  nextRating,
  savedLookKey,
  type LookRating,
  type Occasion,
  type SavedLook,
  type SavedLookPiece,
} from '@/core';

import { generateItemId } from './add-closet-item';
import { OutfitRepositoryError, type OutfitRepository } from './outfit-repository';
import type { StyleLook } from './style-session';

/** A look as Results has it, before it is saved. */
export interface LookToSave {
  request: string;
  rationale: string;
  pieces: SavedLookPiece[];
  model: string | null;
}

export type LookbookStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface LookbookSnapshot {
  readonly status: LookbookStatus;
  /** Newest first. */
  readonly looks: readonly SavedLook[];
  /** The last write that failed: which look (`savedLookKey` of its pieces) and what to say. Cleared by the next write to it. */
  readonly error: { readonly key: string; readonly text: string } | null;
}

export const LOOKBOOK_MESSAGES = {
  saveFailed: 'Could not save this look. Try again.',
  updateFailed: 'Could not change this look. Try again.',
  deleteFailed: 'Could not delete this look. Try again.',
  loadFailed: 'Could not load your saved looks.',
} as const;

export interface LookbookStoreDeps {
  repository: OutfitRepository;
  newId?: () => string;
  now?: () => Date;
}

export function lookKeyOf(look: Pick<SavedLook, 'pieces'>): string {
  return savedLookKey(look.pieces.map((p) => p.itemId));
}

export class LookbookStore {
  private snapshot: LookbookSnapshot = { status: 'idle', looks: [], error: null };
  private readonly listeners = new Set<() => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(private readonly deps: LookbookStoreDeps) {
    this.newId = deps.newId ?? (() => generateItemId());
    this.now = deps.now ?? (() => new Date());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LookbookSnapshot => this.snapshot;

  /** The saved look with these pieces, if any. */
  findByItems(itemIds: readonly string[]): SavedLook | null {
    const key = savedLookKey(itemIds);
    return this.snapshot.looks.find((look) => lookKeyOf(look) === key) ?? null;
  }

  findById(id: string): SavedLook | null {
    return this.snapshot.looks.find((look) => look.id === id) ?? null;
  }

  /**
   * Reads every saved look. With `closetIds`, first deletes looks with no
   * piece in the closet (D5); a failed cleanup still reads.
   */
  load(closetIds?: ReadonlySet<string>): Promise<void> {
    return this.enqueue(async () => {
      if (this.snapshot.status !== 'ready') this.set({ status: 'loading' });
      if (closetIds) {
        await this.deps.repository.removeLooksWithNoPiecesIn(closetIds).catch((error: unknown) => {
          console.warn('Could not tidy saved looks', error);
        });
      }
      try {
        this.set({ status: 'ready', looks: await this.deps.repository.list() });
      } catch {
        this.set({ status: 'failed' });
      }
    });
  }

  /** Saves a look (Save on Results). Already saved: nothing changes. Resolves the saved look, or null on failure. */
  save(input: LookToSave): Promise<SavedLook | null> {
    return this.enqueue(() => this.saveNow(input, null));
  }

  /** A thumb on Results: saves an unsaved look with that rating; on a saved one sets or clears it. */
  rateUnsavedOrSaved(input: LookToSave, tapped: LookRating): Promise<SavedLook | null> {
    return this.enqueue(async () => {
      const saved = this.findByItems(input.pieces.map((p) => p.itemId));
      if (saved) return this.rateNow(saved.id, tapped);
      const created = await this.saveNow(input, tapped);
      // Saved earlier but not loaded yet (the repository kept the old entry):
      // the user saw it unsaved, so the tapped rating is what they meant.
      if (created && created.rating !== tapped) return this.setRatingNow(created, tapped);
      return created;
    });
  }

  /** A thumb on a saved look (the Lookbook). */
  rate(id: string, tapped: LookRating): Promise<SavedLook | null> {
    return this.enqueue(() => this.rateNow(id, tapped));
  }

  /** An occasion chip: picks it, or clears it when it is the current one. */
  toggleOccasion(id: string, tapped: Occasion): Promise<SavedLook | null> {
    return this.enqueue(async () => {
      const look = this.findById(id);
      if (!look) return null;
      const occasion = nextOccasion(look.occasion, tapped);
      try {
        await this.deps.repository.setOccasion(id, occasion);
      } catch {
        this.fail(look, LOOKBOOK_MESSAGES.updateFailed);
        return null;
      }
      return this.replace({ ...look, occasion });
    });
  }

  /** Deletes a saved look (already confirmed by the user). Resolves true when it is gone. */
  remove(id: string): Promise<boolean> {
    return this.enqueue(async () => {
      const look = this.findById(id);
      if (!look) return true;
      try {
        await this.deps.repository.remove(id);
      } catch (error) {
        // Already gone counts as done.
        if (!(error instanceof OutfitRepositoryError && error.code === 'not_found')) {
          this.fail(look, LOOKBOOK_MESSAGES.deleteFailed);
          return false;
        }
      }
      this.set({ looks: this.snapshot.looks.filter((l) => l.id !== id), error: null });
      return true;
    });
  }

  // --- Internals (run inside the chain) ---

  private async saveNow(input: LookToSave, rating: LookRating | null): Promise<SavedLook | null> {
    const existing = this.findByItems(input.pieces.map((p) => p.itemId));
    if (existing) return existing;
    const look: SavedLook = {
      id: this.newId(),
      request: input.request,
      rationale: input.rationale,
      pieces: input.pieces.map((p) => ({ ...p })),
      rating,
      occasion: null,
      createdAt: this.now().toISOString(),
      model: input.model,
    };
    try {
      const result = await this.deps.repository.save(look);
      const others = this.snapshot.looks.filter((l) => l.id !== result.look.id);
      this.set({ looks: [result.look, ...others], error: null });
      return result.look;
    } catch {
      this.fail(look, LOOKBOOK_MESSAGES.saveFailed);
      return null;
    }
  }

  private async rateNow(id: string, tapped: LookRating): Promise<SavedLook | null> {
    const look = this.findById(id);
    if (!look) return null;
    return this.setRatingNow(look, nextRating(look.rating, tapped));
  }

  private async setRatingNow(look: SavedLook, rating: LookRating | null): Promise<SavedLook | null> {
    try {
      await this.deps.repository.setRating(look.id, rating);
    } catch {
      this.fail(look, LOOKBOOK_MESSAGES.updateFailed);
      return null;
    }
    return this.replace({ ...look, rating });
  }

  private replace(look: SavedLook): SavedLook {
    this.set({ looks: this.snapshot.looks.map((l) => (l.id === look.id ? look : l)), error: null });
    return look;
  }

  private fail(look: Pick<SavedLook, 'pieces'>, text: string): void {
    this.set({ error: { key: lookKeyOf(look), text } });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task, task);
    this.chain = result.catch(() => undefined);
    return result;
  }

  private set(changes: Partial<LookbookSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of [...this.listeners]) listener();
  }
}

/** What Save stores for a look on Results: the request as sent, the rationale, each piece with its category, the model. */
export function styleLookToSave(request: string, look: Pick<StyleLook, 'pieces' | 'rationale' | 'model'>): LookToSave {
  return {
    request,
    rationale: look.rationale,
    pieces: look.pieces.map((piece) => ({ itemId: piece.id, category: piece.category })),
    model: look.model,
  };
}
