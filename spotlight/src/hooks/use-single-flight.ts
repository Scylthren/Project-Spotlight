import { useRef, useState } from 'react';

import { createSingleFlight, type SingleFlight } from '@/core';

import { useIsMounted } from './use-is-mounted';

/**
 * Runs one async action at a time. The guard is a ref (see `createSingleFlight`),
 * so two taps in one frame cannot both start; `busy` is React state for the UI.
 * Returns the task's value, or `undefined` if the call was dropped. A task
 * still running when the component unmounts runs to completion; only the
 * `busy` update is skipped.
 */
export function useSingleFlight() {
  const guard = useRef<SingleFlight | null>(null);
  const [busy, setBusy] = useState(false);
  const isMounted = useIsMounted();

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    guard.current ??= createSingleFlight();
    const result = await guard.current.run(async () => {
      setBusy(true);
      try {
        return await task();
      } finally {
        if (isMounted()) setBusy(false);
      }
    });
    return result.ran ? result.value : undefined;
  }

  return { busy, run };
}
