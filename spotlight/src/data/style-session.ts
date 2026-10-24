/**
 * One outfit request and its results (Gate 3 slice 2), held outside React
 * so the Style and Results screens share it and a late reply cannot touch a
 * screen that is gone. Subscribe with `subscribe`/`getSnapshot` (React's
 * useSyncExternalStore), like `ImportSession`.
 *
 * States: idle -> loading -> ready | empty | failed; cancel() -> cancelled.
 * `start` (also "Try again") is ignored while a request runs, so a double
 * tap sends one. `close` (leaving Results) aborts every request; anything
 * that arrives later is ignored.
 *
 * Restyle (per look): one generation call per tap with every look shown so
 * far as `avoid`; the first new look takes the old one's place (same
 * number). Nothing new gives "No other looks for this request"; a failure
 * leaves the look as it was with a short message. One restyle per look at a
 * time; different looks may restyle at once.
 *
 * Pieces follow the closet: `refreshCloset` (Results gaining focus) reloads
 * it, so an edited piece shows its new name and a deleted one reads
 * "Removed from closet"; a look whose top, bottom and dress are all gone
 * drops out (D5).
 */
import { outfitKey, OUTFIT_MAX_AVOID, type GeneratedOutfit, type OutfitBasePiece } from '@/ai/generate-outfits-contract';
import type { OutfitGenerator, OutfitOutcome } from '@/ai/outfit-generator';
import { lookStillStands, type Category, type ClothingItem, type LookPiece } from '@/core';

import { NO_OTHER_LOOKS_TEXT, restyleFailureText, type StyleFailure } from './style-messages';

export interface StyleLook {
  /** Stable while the look is shown; a restyled look gets a new key. */
  readonly key: string;
  readonly itemIds: readonly string[];
  readonly rationale: string;
  /** Every piece in look order; `item` is null once it was deleted. */
  readonly pieces: readonly LookPiece[];
  /** True while a restyle for this look runs. */
  readonly restyling: boolean;
  /** The line after a restyle that changed nothing (no other looks, or a failure), else null. */
  readonly restyleNotice: string | null;
}

export type StyleStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      /** Never empty when the answer arrives; may become empty when deleted pieces drop every look. */
      readonly looks: readonly StyleLook[];
      /** Closet items not sent (over the cap or invalid). */
      readonly omittedItems: number;
    }
  /** The answer had no looks. */
  | { readonly kind: 'empty' }
  | { readonly kind: 'failed'; readonly failure: StyleFailure; readonly missing: readonly OutfitBasePiece[] }
  | { readonly kind: 'cancelled' };

export interface StyleSnapshot {
  /** The request text as sent. */
  readonly request: string;
  readonly status: StyleStatus;
  /** True after `close`. */
  readonly closed: boolean;
}

export interface StyleSessionDeps {
  generator: OutfitGenerator;
  /** The closet as it is now (the repository's `list`). */
  loadCloset: () => Promise<ClothingItem[]>;
}

/** What each look was built from: ids, rationale and the category of each piece when it arrived. */
interface LookRecord {
  key: string;
  itemIds: string[];
  rationale: string;
  categories: Category[];
  restyling: boolean;
  restyleNotice: string | null;
}

export class StyleSession {
  private snapshot: StyleSnapshot;
  private readonly listeners = new Set<() => void>();
  private closet = new Map<string, ClothingItem>();
  private looks: LookRecord[] = [];
  private omittedItems = 0;
  /** Every look shown for this request, oldest first (keys from `outfitKey`, and the ids). */
  private readonly shown: string[][] = [];
  private mainRequest: AbortController | null = null;
  private readonly restyles = new Map<string, AbortController>();
  private nextKey = 0;

  constructor(
    request: string,
    private readonly deps: StyleSessionDeps,
  ) {
    this.snapshot = { request, status: { kind: 'idle' }, closed: false };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StyleSnapshot => this.snapshot;

  get loading(): boolean {
    return this.snapshot.status.kind === 'loading';
  }

  /**
   * Asks for looks (also "Try again"). Ignored while a request runs, after
   * `close`, and once looks are shown. The status turns `loading` at once,
   * before anything is awaited.
   */
  async start(): Promise<void> {
    const { status, closed } = this.snapshot;
    if (closed || status.kind === 'loading' || status.kind === 'ready') return;
    const controller = new AbortController();
    this.mainRequest = controller;
    this.setStatus({ kind: 'loading' });

    const items = await this.readCloset();
    if (controller.signal.aborted) return;
    if (!items) {
      this.finishMain(controller, { kind: 'failed', failure: 'closet-unavailable', missing: [] });
      return;
    }
    const outcome = await this.deps.generator.generate({ request: this.snapshot.request, items }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    this.finishMain(controller, this.statusFor(outcome));
  }

  /** Stops the request in flight (the Cancel button). Its reply is ignored. */
  cancel(): void {
    if (this.snapshot.closed || !this.mainRequest) return;
    this.mainRequest.abort();
    this.mainRequest = null;
    this.setStatus({ kind: 'cancelled' });
  }

  /** Leaving Results: aborts every request; later replies are ignored. Safe to call more than once. */
  close(): void {
    if (this.snapshot.closed) return;
    this.mainRequest?.abort();
    this.mainRequest = null;
    for (const controller of this.restyles.values()) controller.abort();
    this.restyles.clear();
    this.snapshot = { ...this.snapshot, closed: true };
    this.emit();
  }

  /** Replaces one look with a new one for the same request (see the file comment). */
  async restyle(key: string): Promise<void> {
    if (this.snapshot.closed || this.snapshot.status.kind !== 'ready') return;
    const look = this.looks.find((l) => l.key === key);
    if (!look || look.restyling) return;
    const controller = new AbortController();
    this.restyles.set(key, controller);
    this.patchLook(key, { restyling: true, restyleNotice: null });

    const items = (await this.readCloset()) ?? [...this.closet.values()];
    if (controller.signal.aborted) return;
    const outcome = await this.deps.generator.generate(
      { request: this.snapshot.request, items, avoid: this.avoidList() },
      { signal: controller.signal },
    );
    if (controller.signal.aborted || this.restyles.get(key) !== controller) return;
    this.restyles.delete(key);
    if (!this.looks.some((l) => l.key === key)) return;

    if (!outcome.ok) {
      this.patchLook(key, { restyling: false, restyleNotice: restyleFailureText(outcome.failure) });
      return;
    }
    const taken = new Set([...this.shown.map(outfitKey), ...this.looks.map((l) => outfitKey(l.itemIds))]);
    const fresh = outcome.outfits.find((outfit) => !taken.has(outfitKey(outfit.itemIds)) && this.lookFits(outfit));
    if (!fresh) {
      this.patchLook(key, { restyling: false, restyleNotice: NO_OTHER_LOOKS_TEXT });
      return;
    }
    const replacement = this.record(fresh);
    this.shown.push([...fresh.itemIds]);
    this.looks = this.looks.map((l) => (l.key === key ? replacement : l));
    this.publishLooks();
  }

  /** Reloads the closet so pieces follow edits and deletions (Results gaining focus). */
  async refreshCloset(): Promise<void> {
    if (this.snapshot.closed) return;
    await this.readCloset();
    if (this.snapshot.closed || this.snapshot.status.kind !== 'ready') return;
    this.publishLooks();
  }

  // --- Internals ---

  /** Loads the closet into `this.closet`; null when it could not be read. */
  private async readCloset(): Promise<ClothingItem[] | null> {
    try {
      const items = await this.deps.loadCloset();
      this.closet = new Map(items.map((item) => [item.id, item]));
      return items;
    } catch {
      return null;
    }
  }

  private finishMain(controller: AbortController, status: StyleStatus): void {
    if (this.mainRequest !== controller) return;
    this.mainRequest = null;
    if (status.kind === 'ready') {
      this.publishLooks();
      return;
    }
    this.setStatus(status);
  }

  private statusFor(outcome: OutfitOutcome): StyleStatus {
    if (!outcome.ok) {
      if (outcome.failure === 'cancelled') return { kind: 'cancelled' };
      return { kind: 'failed', failure: outcome.failure, missing: outcome.failure === 'not-enough-items' ? outcome.missing : [] };
    }
    const outfits = outcome.outfits.filter((outfit) => this.lookFits(outfit));
    if (outfits.length === 0) return { kind: 'empty' };
    this.looks = outfits.map((outfit) => this.record(outfit));
    for (const outfit of outfits) this.shown.push([...outfit.itemIds]);
    this.omittedItems = outcome.omittedItems;
    return { kind: 'ready', looks: [], omittedItems: outcome.omittedItems };
  }

  /** Every piece is in the closet the request was built from (the generator already checks; cheap to repeat). */
  private lookFits(outfit: GeneratedOutfit): boolean {
    return outfit.itemIds.length > 0 && outfit.itemIds.every((id) => this.closet.has(id));
  }

  private record(outfit: GeneratedOutfit): LookRecord {
    return {
      key: `look-${++this.nextKey}`,
      itemIds: [...outfit.itemIds],
      rationale: outfit.rationale,
      categories: outfit.itemIds.map((id) => this.closet.get(id)!.category),
      restyling: false,
      restyleNotice: null,
    };
  }

  /** The looks shown now first, then earlier ones newest first; at most OUTFIT_MAX_AVOID. */
  private avoidList(): string[][] {
    const seen = new Set<string>();
    const list: string[][] = [];
    for (const ids of [...this.looks.map((l) => l.itemIds), ...[...this.shown].reverse()]) {
      const key = outfitKey(ids);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push([...ids]);
      if (list.length >= OUTFIT_MAX_AVOID) break;
    }
    return list;
  }

  private patchLook(key: string, changes: Partial<Pick<LookRecord, 'restyling' | 'restyleNotice'>>): void {
    this.looks = this.looks.map((l) => (l.key === key ? { ...l, ...changes } : l));
    this.publishLooks();
  }

  /** Rebuilds the ready status from the records and the closet; drops looks that no longer stand. */
  private publishLooks(): void {
    const looks: StyleLook[] = [];
    const kept: LookRecord[] = [];
    for (const record of this.looks) {
      const pieces: LookPiece[] = record.itemIds.map((id, index) => ({
        id,
        category: record.categories[index],
        item: this.closet.get(id) ?? null,
      }));
      if (!lookStillStands(pieces)) {
        this.restyles.get(record.key)?.abort();
        this.restyles.delete(record.key);
        continue;
      }
      kept.push(record);
      looks.push({
        key: record.key,
        itemIds: record.itemIds,
        rationale: record.rationale,
        pieces,
        restyling: record.restyling,
        restyleNotice: record.restyleNotice,
      });
    }
    this.looks = kept;
    this.setStatus({ kind: 'ready', looks, omittedItems: this.omittedItems });
  }

  private setStatus(status: StyleStatus): void {
    this.snapshot = { ...this.snapshot, status };
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * The request on the Results screen, shared by Style (which starts it) and
 * Results (which shows it). One per app session, in memory only.
 */
export class StyleSessions {
  private session: StyleSession | null = null;

  get current(): StyleSession | null {
    return this.session;
  }

  /**
   * Starts a new request, closing the previous one. Returns null (and starts
   * nothing) while the current request is still loading, so a double tap on
   * "Get looks" sends one request.
   */
  begin(request: string, deps: StyleSessionDeps): StyleSession | null {
    if (this.session && !this.session.getSnapshot().closed && this.session.loading) return null;
    this.session?.close();
    const session = new StyleSession(request, deps);
    this.session = session;
    void session.start();
    return session;
  }
}
