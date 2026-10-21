import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { ClothingItem } from '@/core';

import { useClosetServices } from './closet-services';

interface ClosetItemsState {
  items: ClothingItem[];
  loading: boolean;
  error: string | null;
}

/** Loads the closet each time the calling screen gains focus. */
export function useClosetItems(): ClosetItemsState {
  const { repository } = useClosetServices();
  const [state, setState] = useState<ClosetItemsState>({ items: [], loading: true, error: null });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      repository.list().then(
        (items) => active && setState({ items, loading: false, error: null }),
        () => active && setState((s) => ({ ...s, loading: false, error: 'Could not load your closet.' })),
      );
      return () => {
        active = false;
      };
    }, [repository]),
  );

  return state;
}
