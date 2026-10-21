import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a stable function that is true while the component is mounted.
 * Async work that outlives the screen (a save finishing after the user went
 * back) checks it before setting state.
 */
export function useIsMounted(): () => boolean {
  const mounted = useRef(true);
  useEffect(() => {
    // Set here too: Strict Mode in development unmounts and remounts effects.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
