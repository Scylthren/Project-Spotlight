import { useState, useSyncExternalStore } from 'react';

import type { ImportSession, ImportSnapshot } from '@/data/import-session';

import { useClosetServices } from './closet-services';

const NO_SUBSCRIPTION = () => () => undefined;
const NO_SNAPSHOT = () => null;

/**
 * The import under review and its latest state, or nulls when there is none
 * (the app restarted, or the import ended). The session is read once, so a
 * screen keeps showing the import it opened with.
 */
export function useImportSession(): { session: ImportSession | null; snapshot: ImportSnapshot | null } {
  const { importSessions } = useClosetServices();
  const [session] = useState(() => importSessions.current);
  const snapshot = useSyncExternalStore<ImportSnapshot | null>(
    session?.subscribe ?? NO_SUBSCRIPTION,
    session?.getSnapshot ?? NO_SNAPSHOT,
  );
  return { session, snapshot };
}
