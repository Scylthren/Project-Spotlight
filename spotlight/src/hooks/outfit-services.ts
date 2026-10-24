import { configuredGenerateOutfitsUrl } from '@/ai/backend-config';
import type { OutfitGenerator } from '@/ai/outfit-generator';
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

/**
 * The generator the Style and Results screens use: the real one
 * (`createOutfitGenerator()`, Gate 3 slice 3). The slice 2 demo mock
 * (`MockOutfitGenerator` with `demo: true`) stays for tests and layout work.
 */
export function styleOutfitGenerator(): OutfitGenerator {
  return createOutfitGenerator();
}
