import { useEffect, useState } from 'react';

import type { ClothingItem } from '@/core';

import { useClosetServices } from './closet-services';

export type ClosetItemState =
  | { status: 'loading' }
  | { status: 'ready'; item: ClothingItem }
  | { status: 'missing' }
  | { status: 'error' };

/** Loads one item by id. */
export function useClosetItem(id: string): ClosetItemState {
  const { repository } = useClosetServices();
  const [state, setState] = useState<ClosetItemState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    repository.get(id).then(
      (item) => active && setState(item ? { status: 'ready', item } : { status: 'missing' }),
      () => active && setState({ status: 'error' }),
    );
    return () => {
      active = false;
    };
  }, [id, repository]);

  return state;
}
