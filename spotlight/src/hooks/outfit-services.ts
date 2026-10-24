import { configuredGenerateOutfitsUrl } from '@/ai/backend-config';
import { MockOutfitGenerator, type OutfitGenerator } from '@/ai/outfit-generator';
import { RemoteOutfitGenerator } from '@/ai/remote-outfit-generator';
import type { DevTokenStore } from '@/data/dev-token-store';

import { devBackendServices } from './dev-backend-services';

/**
 * The outfit generator for screens (Gate 3 slice 2 onwards): the
 * generate-outfits function with the session's development token store (the
 * one the Me tab saves to). Stateless, so a new one per caller is fine.
 * Tests pass their own token store and URL, or use `MockOutfitGenerator` /
 * `FakeOutfitGenerator` instead.
 */
export function createOutfitGenerator(
  tokenStore: DevTokenStore = devBackendServices().tokenStore,
  url: string | null = configuredGenerateOutfitsUrl(),
): OutfitGenerator {
  return new RemoteOutfitGenerator({ url, tokenStore });
}

/** How long the slice 2 demo mock waits before answering, so the loading state can be seen on the phone. */
export const STYLE_DEMO_DELAY_MS = 1200;

/**
 * The generator the Style and Results screens use. Gate 3 slice 2: the mock
 * in demo mode (no network, no token; layout check only). Slice 3 swaps this
 * to `createOutfitGenerator()`.
 */
export function styleOutfitGenerator(): OutfitGenerator {
  return new MockOutfitGenerator({ demo: true, delayMs: STYLE_DEMO_DELAY_MS });
}
