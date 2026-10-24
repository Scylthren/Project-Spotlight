import type { ClothingItem } from '@/core/types';

import { toClosetSummaries } from './closet-summary';
import {
  missingForOutfit,
  OUTFIT_MAX_AVOID,
  stubOutfits,
  validateGenerateOutfitsRequest,
  type ClosetItemSummary,
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
  /**
   * Restyle: looks not to answer again (item id sets). The Results session
   * passes the looks on screen first, then earlier ones newest first, at
   * most OUTFIT_MAX_AVOID. Sets naming an item that is not sent are left
   * out (they cannot come back anyway); if more than OUTFIT_MAX_AVOID
   * remain, the first OUTFIT_MAX_AVOID are sent (callers list the most
   * important first).
   */
  avoid?: readonly (readonly string[])[];
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
      /** The model that answered (from the response's `usage`), when known; kept with saved looks. */
      model?: string;
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
  const avoid = avoidToSend(input.avoid ?? [], items);
  const request: GenerateOutfitsRequest = {
    request: input.request,
    items,
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.weather ? { weather: input.weather } : {}),
    ...(avoid.length > 0 ? { avoid } : {}),
  };
  if (!validateGenerateOutfitsRequest(request).ok) return { ok: false, failure: 'rejected' };
  return { ok: true, request, omittedItems: omitted };
}

/** The avoid sets worth sending: only sets whose every id is sent, the first OUTFIT_MAX_AVOID of them. */
function avoidToSend(avoid: readonly (readonly string[])[], items: readonly ClosetItemSummary[]): string[][] {
  const sent = new Set(items.map((item) => item.id));
  const usable = avoid.filter((set) => set.length > 0 && set.every((id) => sent.has(id))).map((set) => [...new Set(set)]);
  return usable.slice(0, OUTFIT_MAX_AVOID);
}

export interface MockOutfitGeneratorOptions {
  /**
   * Demo mode for the phone (slice 2, before real looks): each stub look
   * also gets the closet's next accessory and outerwear in turn, and a
   * longer placeholder rationale, so the Results layout can be checked.
   * Off by default: then the answer is exactly the deployed stub's.
   */
  demo?: boolean;
  /** Wait this long before answering (demo: to see the loading state). Aborting ends the wait. */
  delayMs?: number;
}

/** The demo rationale: fixed text and categories only (no user text), well under 300 characters. */
export function mockDemoRationale(categories: readonly string[]): string {
  return (
    `A placeholder look (${categories.join(' + ')}) picked from your closet in order, so the layout can be checked. ` +
    'Real looks, chosen for your request with a reason for each, arrive in the next update.'
  );
}

/**
 * Mock `OutfitGenerator`: answers what the deployed stub would for the same
 * closet (`stubOutfits`, including `avoid`), marked `stub`, with the same
 * `not-enough-items` and `rejected` checks as `RemoteOutfitGenerator`.
 * See `MockOutfitGeneratorOptions` for the demo mode the app uses.
 */
export class MockOutfitGenerator implements OutfitGenerator {
  constructor(private readonly options: MockOutfitGeneratorOptions = {}) {}

  async generate(input: OutfitRequestInput, options: OutfitGenerateOptions = {}): Promise<OutfitOutcome> {
    const { signal } = options;
    if (signal?.aborted) return { ok: false, failure: 'cancelled' };
    const prepared = prepareOutfitRequest(input);
    if (!prepared.ok) return prepared;
    if (this.options.delayMs && !(await wait(this.options.delayMs, signal))) return { ok: false, failure: 'cancelled' };
    const { request, omittedItems } = prepared;
    const outfits = this.options.demo ? demoOutfits(request.items, request.avoid ?? []) : stubOutfits(request.items, request.avoid);
    return { ok: true, outfits, stub: true, droppedOutfits: 0, omittedItems };
  }
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The stub's looks, each with the next accessory and outerwear in turn (still valid under D3). */
function demoOutfits(items: readonly ClosetItemSummary[], avoid: readonly (readonly string[])[]): GeneratedOutfit[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const extras = (category: string) => items.filter((item) => item.category === category);
  const accessories = extras('accessory');
  const outerwear = extras('outerwear');
  const isExtra = (id: string) => ['accessory', 'outerwear'].includes(byId.get(id)?.category ?? '');
  // The stub never picks extras, so it is compared with the avoided looks' other pieces.
  const baseAvoid = avoid.map((set) => set.filter((id) => !isExtra(id))).filter((set) => set.length > 0);
  return stubOutfits(items, baseAvoid).map((outfit, index) => {
    const ids = [...outfit.itemIds];
    if (outerwear.length > 0) {
      // Category order: outerwear goes before the shoes, or last when there are none.
      const shoes = ids.findIndex((id) => byId.get(id)?.category === 'shoes');
      ids.splice(shoes === -1 ? ids.length : shoes, 0, outerwear[index % outerwear.length].id);
    }
    if (accessories.length > 0) ids.push(accessories[index % accessories.length].id);
    return { itemIds: ids, rationale: mockDemoRationale(ids.map((id) => byId.get(id)?.category ?? 'piece')) };
  });
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
