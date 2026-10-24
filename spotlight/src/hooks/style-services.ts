import type { OutfitGenerator } from '@/ai/outfit-generator';
import { createKvRecentRequestsStore, type RecentRequestsStore } from '@/data/recent-requests-store';
import { StyleSessions } from '@/data/style-session';

import { styleOutfitGenerator } from './outfit-services';

export interface StyleServices {
  /** The request shown on Results, shared by the Style and Results screens (in memory only). */
  sessions: StyleSessions;
  generator: OutfitGenerator;
  recentRequests: RecentRequestsStore;
}

let services: StyleServices | null = null;

/**
 * One set per app session (module lifetime), created on first use, so the
 * Results screen finds the request Style started even if a provider
 * remounts. The generator is the slice 2 demo mock (`styleOutfitGenerator`).
 */
export function styleServices(): StyleServices {
  services ??= {
    sessions: new StyleSessions(),
    generator: styleOutfitGenerator(),
    recentRequests: createKvRecentRequestsStore(),
  };
  return services;
}
