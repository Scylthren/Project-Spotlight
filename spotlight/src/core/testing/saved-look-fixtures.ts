/** TEST-ONLY builders for saved looks (Lookbook, Gate 3 slice 4). */
import type { SavedLook, SavedLookPiece } from '../saved-look';
import type { Category } from '../types';

export function piece(itemId: string, category: Category): SavedLookPiece {
  return { itemId, category };
}

/** A valid saved look: top-1, bottom-1, shoes-1; no rating or occasion. */
export function makeSavedLook(overrides: Partial<SavedLook> = {}): SavedLook {
  return {
    id: 'look-1',
    request: 'Emo vibes',
    rationale: 'An all-dark palette keeps the focus on the print.',
    pieces: [piece('top-1', 'top'), piece('bottom-1', 'bottom'), piece('shoes-1', 'shoes')],
    rating: null,
    occasion: null,
    createdAt: '2026-10-24T12:00:00.000Z',
    model: 'claude-haiku-5-5',
    ...overrides,
  };
}
