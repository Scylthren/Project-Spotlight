import { STUB_TAG_ITEM_RESPONSE, type ItemTags, type TagItemContentType } from './tag-item-contract';

/** A photo ready to send: already downscaled, re-encoded and stripped of metadata. */
export interface TagImage {
  /** Standard base64, no `data:` prefix. */
  base64: string;
  contentType: TagItemContentType;
}

/**
 * Why tagging gave no suggestion. Callers treat every failure as "no
 * suggestion" and never block saving on it.
 * - `not-configured`: the app has no backend URL (`EXPO_PUBLIC_SUPABASE_URL`).
 * - `no-token`: no development token saved on this device (or it could not be read).
 * - `unauthorized`: the backend refused the token (401).
 * - `offline`: the request never reached the backend (no network, DNS, TLS).
 * - `timeout`: no complete answer in time.
 * - `rejected`: the backend refused the request (400).
 * - `server`: any other status (404 when not deployed, 5xx).
 * - `invalid-response`: a 200 whose body does not match the contract.
 */
export const TAG_FAILURES = [
  'not-configured',
  'no-token',
  'unauthorized',
  'offline',
  'timeout',
  'rejected',
  'server',
  'invalid-response',
] as const;
export type TagFailure = (typeof TAG_FAILURES)[number];

export type TagOutcome = { ok: true; tags: ItemTags; stub: boolean } | { ok: false; failure: TagFailure };

/**
 * Suggests tags for a garment photo. Implementations never throw or reject:
 * every problem resolves `{ ok: false, failure }`.
 *
 * Implementations: `MockClosetTagger` (fixed tags, the default in tests),
 * `FakeClosetTagger` (tests), and `RemoteClosetTagger` (the tag-item edge
 * function).
 */
export interface ClosetTagger {
  tag(image: TagImage): Promise<TagOutcome>;
}

/** Mock `ClosetTagger`: always suggests the same tags as the backend stub. */
export class MockClosetTagger implements ClosetTagger {
  async tag(): Promise<TagOutcome> {
    const { tags, stub } = STUB_TAG_ITEM_RESPONSE;
    return { ok: true, tags: { ...tags, colors: [...tags.colors], seasons: [...tags.seasons] }, stub };
  }
}

/**
 * Configurable `ClosetTagger` for tests. Each call takes the next queued
 * outcome (or a function returning one), then falls back to `fallback`.
 * `inputs` records every image.
 */
export class FakeClosetTagger implements ClosetTagger {
  readonly inputs: TagImage[] = [];
  readonly queue: (TagOutcome | (() => Promise<TagOutcome>))[] = [];
  fallback: TagOutcome = { ok: false, failure: 'offline' };

  async tag(image: TagImage): Promise<TagOutcome> {
    this.inputs.push(image);
    const next = this.queue.shift() ?? this.fallback;
    return typeof next === 'function' ? next() : next;
  }
}
