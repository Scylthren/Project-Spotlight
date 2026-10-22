import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import type { ClothingItem } from '@/core';
import type { ClosetRepository } from '@/data/closet-repository';

import { useClosetServices } from './closet-services';

export type ClosetItemState =
  | { status: 'loading' }
  | { status: 'ready'; item: ClothingItem }
  | { status: 'missing' }
  | { status: 'error' };

/** Loads `id` into `setState`; returns a cancel function. */
function loadItem(repository: ClosetRepository, id: string, setState: (state: ClosetItemState) => void): () => void {
  let active = true;
  repository.get(id).then(
    (item) => active && setState(item ? { status: 'ready', item } : { status: 'missing' }),
    () => active && setState({ status: 'error' }),
  );
  return () => {
    active = false;
  };
}

/** Loads one item by id, once (the edit form: it must not reset while open). */
export function useClosetItem(id: string): ClosetItemState {
  const { repository } = useClosetServices();
  const [state, setState] = useState<ClosetItemState>({ status: 'loading' });

  useEffect(() => loadItem(repository, id, setState), [id, repository]);

  return state;
}

/**
 * Loads one item by id each time the screen gains focus (the item screen:
 * it shows the saved changes after Edit). The last state stays while it
 * reloads, so the screen does not flash a spinner.
 */
export function useClosetItemOnFocus(id: string): ClosetItemState {
  const { repository } = useClosetServices();
  const [state, setState] = useState<ClosetItemState>({ status: 'loading' });

  useFocusEffect(useCallback(() => loadItem(repository, id, setState), [id, repository]));

  return state;
}
