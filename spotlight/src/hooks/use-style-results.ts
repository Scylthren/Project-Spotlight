import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { StyleSession, StyleSnapshot } from '@/data/style-session';

import { styleServices, type StyleServices } from './style-services';

const NO_SUBSCRIPTION = () => () => undefined;
const NO_SNAPSHOT = () => null;

/**
 * The request the Results screen shows and its latest state (nulls when
 * there is none, e.g. after an app restart). The session is read once, so
 * the screen keeps the request it opened with. On focus the closet is
 * reloaded (pieces follow edits and deletions). Leaving the screen closes
 * the session, aborting any request; the close is deferred one tick so a
 * development Strict Mode remount does not end it.
 */
export function useStyleResults(services: StyleServices = styleServices()): {
  session: StyleSession | null;
  snapshot: StyleSnapshot | null;
} {
  const [session] = useState(() => services.sessions.current);
  const snapshot = useSyncExternalStore<StyleSnapshot | null>(
    session?.subscribe ?? NO_SUBSCRIPTION,
    session?.getSnapshot ?? NO_SNAPSHOT,
  );
  const pendingClose = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingClose.current) clearTimeout(pendingClose.current);
    pendingClose.current = null;
    return () => {
      pendingClose.current = setTimeout(() => session?.close(), 0);
    };
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void session?.refreshCloset();
    }, [session]),
  );

  return { session, snapshot };
}
