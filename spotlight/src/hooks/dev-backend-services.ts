import { configuredTagItemUrl, RemoteClosetTagger } from '@/ai';
import { SecureStoreDevTokenStore } from '@/data/secure-store-dev-token-store';

import type { DevBackendServices } from './use-dev-backend';

let services: DevBackendServices | null = null;

/** The real token store and tagger, created once per app session on first use. */
export function devBackendServices(): DevBackendServices {
  if (!services) {
    const tokenStore = new SecureStoreDevTokenStore();
    services = { tokenStore, tagger: new RemoteClosetTagger({ url: configuredTagItemUrl(), tokenStore }) };
  }
  return services;
}
