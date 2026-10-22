import type { ClosetTagger, TagFailure, TagImage } from './closet-tagger';

/**
 * An 8 x 8 white JPEG (614 bytes, no metadata), generated with jpeg-js. The
 * smallest payload the tag-item function accepts; used by the Me tab's
 * "Test connection" button.
 */
export const CONNECTION_CHECK_IMAGE: TagImage = {
  contentType: 'image/jpeg',
  base64:
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1R' +
    'V19iZ2hnPk1xeXBkeFxlZ2MBERISGBUYLxoaL2NCOEJjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj' +
    'Y2NjY2NjY2NjY//AABEIAAgACAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMF' +
    'BQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElK' +
    'U1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV' +
    '1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncA' +
    'AQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZ' +
    'WmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri' +
    '4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APQKAP8A/9k=',
};

export type ConnectionStatus = 'ok' | TagFailure;

/** Sends the tiny image and reports how the round trip went. Never throws. */
export async function checkConnection(tagger: ClosetTagger): Promise<ConnectionStatus> {
  try {
    const outcome = await tagger.tag(CONNECTION_CHECK_IMAGE);
    return outcome.ok ? 'ok' : outcome.failure;
  } catch {
    return 'server';
  }
}

/** What the Me tab shows after a connection check. */
export function connectionStatusMessage(status: ConnectionStatus): string {
  switch (status) {
    case 'ok':
      return 'Connected. The backend answered.';
    case 'not-configured':
      return 'No backend URL in this build. Set EXPO_PUBLIC_SUPABASE_URL in spotlight/.env and restart Expo.';
    case 'no-token':
      return 'No token saved. Paste the token, then save it.';
    case 'unauthorized':
      return 'Wrong token. The backend refused it.';
    case 'offline':
      return 'Offline. The backend could not be reached.';
    case 'timeout':
      return 'Timed out. The backend did not answer in time.';
    case 'rejected':
      return 'The backend rejected the test request.';
    case 'server':
      return 'The backend had a problem (or the function is not deployed).';
    case 'invalid-response':
      return 'The backend answered with something unexpected.';
  }
}
