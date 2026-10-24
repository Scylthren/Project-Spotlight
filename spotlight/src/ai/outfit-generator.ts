import type { ClothingItem } from '@/core/types';

import { toClosetSummaries } from './closet-summary';
import {
  missingForOutfit,
  stubOutfits,
  validateGenerateOutfitsRequest,
  type GeneratedOutfit,
  type GenerateOutfitsRequest,
  type OutfitBasePiece,
  type OutfitMode,
  type WeatherSummary,
} from './generate-outfits-contract';

/** What the user asked for, and the closet to dress them from. */
export interface OutfitRequestInput {
  /** The user's words; may be empty only for `weather` and `random` (slice 5). */
  request: string;
  /** The closet. Mapped to text summaries (`toClosetSummaries`); photos never leave the phone. */
  items: readonly ClothingItem[];
  mode?: OutfitMode;
  weather?: WeatherSummary;
}

export interface OutfitGenerateOptions {
  /** Aborting resolves `cancelled` (the user left the screen). */
  signal?: AbortSignal;
}

/**
 * Why no looks came back. Same kinds as tagging (`TAG_FAILURES`), plus:
 * - `not-enough-items`: the closet has no dress and no top and bottom pair
 *   (from the function's 422, or found before sending); `missing` says which.
 * - `cancelled`: the caller aborted.
 * `rejected` also covers a request the app itself finds invalid (empty or
 * too-long text), which is not sent.
 */
export const OUTFIT_FAILURES = [
  'not-configured',
  'no-token',
  'unauthorized',
  'offline',
  'timeout',
  'rejected',
  'server',
  'invalid-response',
  'not-enough-items',
  'cancelled',
] as const;
export type OutfitFailure = (typeof OUTFIT_FAILURES)[number];

export type OutfitOutcome =
  | {
      ok: true;
      /** 0 to 3 looks, every id in the closet that was sent. */
      outfits: GeneratedOutfit[];
      stub: boolean;
      /** Looks dropped because they named an item the app did not send. */
      droppedOutfits: number;
      /** Closet items not sent (see `toClosetSummaries`). */
      omittedItems: number;
    }
  | { ok: false; failure: 'not-enough-items'; missing: OutfitBasePiece[] }
  | { ok: false; failure: Exclude<OutfitFailure, 'not-enough-items'> };

/**
 * Suggests outfits from the closet for a request. Implementations never
 * throw or reject: every problem resolves `{ ok: false, failure }`.
 *
 * Implementations: `MockOutfitGenerator` (the stub's picks, offline),
 * `FakeOutfitGenerator` (tests), and `RemoteOutfitGenerator` (the
 * generate-outfits edge function).
 */
export interface OutfitGenerator {
  generate(input: OutfitRequestInput, options?: OutfitGenerateOptions): Promise<OutfitOutcome>;
}

/**
 * The request body for an input, built the same way by every generator:
 * the closet mapped to summaries (`toClosetSummaries`), then the closet
 * check (`not-enough-items`, on what will be sent) and the contract's own
 * request validation (`rejected`: empty text in mode `request`, over 200
 * characters, control characters). A failure here means nothing is sent.
 */
export function prepareOutfitRequest(
  input: OutfitRequestInput,
): { ok: true; request: GenerateOutfitsRequest; omittedItems: number } | Extract<OutfitOutcome, { ok: false }> {
  const { items, omitted } = toClosetSummaries(input.items);
  const missing = missingForOutfit(items);
  if (missing.length > 0) return { ok: false, failure: 'not-enough-items', missing };
  const request: GenerateOutfitsRequest = {
    request: input.request,
    items,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.weather ? { weather: input.weather } : {}),
  };
  if (!validateGenerateOutfitsRequest(request).ok) return { ok: false, failure: 'rejected' };
  return { ok: true, request, omittedItems: omitted };
}

/**
 * Mock `OutfitGenerator`: answers what the deployed stub would for the same
 * closet (`stubOutfits`), marked `stub`, with the same `not-enough-items`
 * and `rejected` checks as `RemoteOutfitGenerator`.
 */
export class MockOutfitGenerator implements OutfitGenerator {
  async generate(input: OutfitRequestInput, options: OutfitGenerateOptions = {}): Promise<OutfitOutcome> {
    if (options.signal?.aborted) return { ok: false, failure: 'cancelled' };
    const prepared = prepareOutfitRequest(input);
    if (!prepared.ok) return prepared;
    const { request, omittedItems } = prepared;
    return { ok: true, outfits: stubOutfits(request.items), stub: true, droppedOutfits: 0, omittedItems };
  }
}

/**
 * Configurable `OutfitGenerator` for tests. Each call takes the next queued
 * outcome (or a function returning one), then falls back to `fallback`.
 * `inputs` records every request.
 */
export class FakeOutfitGenerator implements OutfitGenerator {
  readonly inputs: { input: OutfitRequestInput; options: OutfitGenerateOptions }[] = [];
  readonly queue: (OutfitOutcome | ((input: OutfitRequestInput, options: OutfitGenerateOptions) => Promise<OutfitOutcome>))[] = [];
  fallback: OutfitOutcome = { ok: false, failure: 'offline' };

  async generate(input: OutfitRequestInput, options: OutfitGenerateOptions = {}): Promise<OutfitOutcome> {
    this.inputs.push({ input, options });
    const next = this.queue.shift() ?? this.fallback;
    return typeof next === 'function' ? next(input, options) : next;
  }
}
