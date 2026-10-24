import type { DevTokenStore } from '@/data/dev-token-store';

import { readGenerateOutfitsError, validateGenerateOutfitsResponse } from './generate-outfits-contract';
import {
  prepareOutfitRequest,
  type OutfitFailure,
  type OutfitGenerateOptions,
  type OutfitGenerator,
  type OutfitOutcome,
  type OutfitRequestInput,
} from './outfit-generator';

/** Gate 3 decision D4: the app waits 30 s; the function keeps its model calls within 25 s. */
export const DEFAULT_OUTFIT_TIMEOUT_MS = 30_000;

export interface RemoteOutfitGeneratorOptions {
  /** Full generate-outfits URL (`configuredGenerateOutfitsUrl()`), or null when not configured. */
  url: string | null;
  tokenStore: DevTokenStore;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * `OutfitGenerator` that calls the generate-outfits edge function with plain
 * `fetch`, like `RemoteClosetTagger`. Never throws. Sends only text
 * summaries of the closet (no photos). Checks the closet can form a look,
 * and that the request is valid, before sending (`prepareOutfitRequest`,
 * shared with the mock), and drops any returned look
 * that names an item it did not send (CLAUDE.md: reject unknown ids). The
 * token goes only into the Authorization header; it is never logged.
 */
export class RemoteOutfitGenerator implements OutfitGenerator {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: RemoteOutfitGeneratorOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_OUTFIT_TIMEOUT_MS;
  }

  async generate(input: OutfitRequestInput, { signal }: OutfitGenerateOptions = {}): Promise<OutfitOutcome> {
    const { url, tokenStore } = this.options;
    if (signal?.aborted) return fail('cancelled');
    if (!url) return fail('not-configured');

    const prepared = prepareOutfitRequest(input);
    if (!prepared.ok) return prepared;
    const { request, omittedItems } = prepared;

    let token: string | null;
    try {
      token = await tokenStore.get();
    } catch {
      token = null;
    }
    if (!token) return fail('no-token');
    if (signal?.aborted) return fail('cancelled');

    const controller = new AbortController();
    let stopped: 'timeout' | 'cancelled' | null = null;
    const stop = (reason: 'timeout' | 'cancelled') => {
      stopped ??= reason;
      controller.abort();
    };
    const onAbort = () => stop('cancelled');
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => stop('timeout'), this.timeoutMs);
    const lost = (): OutfitOutcome => fail(stopped ?? 'offline');

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } catch {
        return lost();
      }

      if (response.status === 401) return fail('unauthorized');
      if (response.status !== 200 && response.status !== 422) {
        return fail(response.status === 400 ? 'rejected' : 'server');
      }

      let body: unknown;
      try {
        const text = await response.text();
        if (stopped) return lost();
        try {
          body = JSON.parse(text);
        } catch {
          return fail(response.status === 422 ? 'server' : 'invalid-response');
        }
      } catch {
        // Reading the body can also time out, be cancelled or lose the connection.
        return lost();
      }

      if (response.status === 422) {
        const error = readGenerateOutfitsError(body);
        return error?.code === 'not_enough_items' ? { ok: false, failure: 'not-enough-items', missing: error.missing } : fail('server');
      }

      const valid = validateGenerateOutfitsResponse(body);
      if (!valid.ok) return fail('invalid-response');
      const sent = new Set(request.items.map((item) => item.id));
      const outfits = valid.value.outfits.filter((outfit) => outfit.itemIds.every((id) => sent.has(id)));
      return {
        ok: true,
        outfits,
        stub: valid.value.stub,
        droppedOutfits: valid.value.outfits.length - outfits.length,
        // Only the items left out here (invalid or over the cap). The function's prefilter count
        // (`valid.value.omittedItems`) is not shown: choosing among the closet is normal (human, 2026-10-24).
        omittedItems,
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

function fail(failure: Exclude<OutfitFailure, 'not-enough-items'>): OutfitOutcome {
  return { ok: false, failure };
}
