import type { DevTokenStore } from '@/data/dev-token-store';

import type { ClosetTagger, TagFailure, TagImage, TagOutcome } from './closet-tagger';
import { validateTagItemResponse, type TagItemRequest } from './tag-item-contract';

/** Long enough for a model call in slice 3; the stub answers in well under a second. */
export const DEFAULT_TAG_TIMEOUT_MS = 20_000;

export interface RemoteClosetTaggerOptions {
  /** Full tag-item URL (`configuredTagItemUrl()`), or null when not configured. */
  url: string | null;
  tokenStore: DevTokenStore;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * `ClosetTagger` that calls the tag-item edge function with plain `fetch`
 * (decision D5). Never throws: missing configuration, a missing token, a
 * network error, a timeout and an unexpected answer all resolve a typed
 * failure. The token goes only into the Authorization header; it is never
 * logged or included in a failure.
 */
export class RemoteClosetTagger implements ClosetTagger {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: RemoteClosetTaggerOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TAG_TIMEOUT_MS;
  }

  async tag(image: TagImage): Promise<TagOutcome> {
    const { url, tokenStore } = this.options;
    if (!url) return fail('not-configured');

    let token: string | null;
    try {
      token = await tokenStore.get();
    } catch {
      token = null;
    }
    if (!token) return fail('no-token');

    const request: TagItemRequest = { imageBase64: image.base64, contentType: image.contentType };
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

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
        return fail(timedOut ? 'timeout' : 'offline');
      }

      if (response.status === 401) return fail('unauthorized');
      if (response.status === 400) return fail('rejected');
      if (response.status !== 200) return fail('server');

      let text: string;
      try {
        text = await response.text();
      } catch {
        // Reading the body can also time out or lose the connection.
        return fail(timedOut ? 'timeout' : 'offline');
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return fail('invalid-response');
      }
      const valid = validateTagItemResponse(body);
      if (!valid.ok) return fail('invalid-response');
      return { ok: true, tags: valid.value.tags, stub: valid.value.stub };
    } finally {
      clearTimeout(timer);
    }
  }
}

function fail(failure: TagFailure): TagOutcome {
  return { ok: false, failure };
}
