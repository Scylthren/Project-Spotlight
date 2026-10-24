import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

import { lookbookEntries, type ClothingItem, type LookbookEntry } from '@/core';
import type { LookbookSnapshot, LookbookStore } from '@/data/lookbook-store';

import { useClosetServices } from './closet-services';

/** The saved looks, re-read each time the calling screen gains focus (so Results sees Lookbook deletes). */
export function useLookbookSnapshot(): { lookbook: LookbookStore; snapshot: LookbookSnapshot } {
  const { lookbook } = useClosetServices();
  const snapshot = useSyncExternalStore(lookbook.subscribe, lookbook.getSnapshot);
  useFocusEffect(
    useCallback(() => {
      void lookbook.load();
    }, [lookbook]),
  );
  return { lookbook, snapshot };
}

export interface LookbookEntriesState {
  status: 'loading' | 'ready' | 'failed';
  /** Newest first, each with its pieces against the closet now and its seasons. */
  entries: LookbookEntry[];
  /** The last failed write (see `LookbookSnapshot.error`). */
  error: LookbookSnapshot['error'];
}

/**
 * The Lookbook's looks with their pieces resolved against the closet, both
 * re-read each time the screen gains focus. Loading first deletes looks with
 * no piece left in the closet (D5), so pieces and seasons follow item
 * deletions and edits.
 */
export function useLookbookEntries(): LookbookEntriesState & { lookbook: LookbookStore } {
  const { repository, lookbook } = useClosetServices();
  const snapshot = useSyncExternalStore(lookbook.subscribe, lookbook.getSnapshot);
  const [closet, setCloset] = useState<ReadonlyMap<string, ClothingItem> | null>(null);
  const [closetFailed, setClosetFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      repository.list().then(
        (items) => {
          if (!active) return;
          const map = new Map(items.map((item) => [item.id, item]));
          setCloset(map);
          setClosetFailed(false);
          void lookbook.load(new Set(map.keys()));
        },
        () => {
          if (!active) return;
          setClosetFailed(true);
        },
      );
      return () => {
        active = false;
      };
    }, [repository, lookbook]),
  );

  // A look with no piece left is being deleted (D5); never show it meanwhile.
  const entries = useMemo(
    () => (closet ? lookbookEntries(snapshot.looks, closet).filter((e) => e.pieces.some((p) => p.item !== null)) : []),
    [closet, snapshot.looks],
  );
  const status: LookbookEntriesState['status'] =
    closetFailed || snapshot.status === 'failed' ? 'failed' : closet && snapshot.status === 'ready' ? 'ready' : 'loading';
  return { status, entries, error: snapshot.error, lookbook };
}
