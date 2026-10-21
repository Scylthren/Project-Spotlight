import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import type { TagSummary } from '@/core';
import { deleteSavedTag, loadSavedTags } from '@/data/closet-tags';

import { useClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { useSingleFlight } from './use-single-flight';

/** The user's saved tag list, reloaded whenever the calling screen gains focus. */
export function useSavedTags() {
  const { repository } = useClosetServices();
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const guard = useSingleFlight();
  const isMounted = useIsMounted();

  const reload = useCallback(async () => {
    const result = await loadSavedTags(repository);
    if (!isMounted()) return;
    if (result.ok) {
      setTags(result.tags);
      setError(null);
    } else {
      setError(result.errors[0]);
    }
  }, [repository, isMounted]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadSavedTags(repository).then((result) => {
        if (!active) return;
        if (result.ok) setTags(result.tags);
        setError(result.ok ? null : result.errors[0]);
      });
      return () => {
        active = false;
      };
    }, [repository]),
  );

  /**
   * Asks `confirm` (inside the guard, so a double long-press shows one dialog),
   * then deletes the tag from the list and every item. Returns true if deleted.
   */
  async function remove(summary: TagSummary, confirm: () => Promise<boolean>): Promise<boolean> {
    const deleted = await guard.run(async () => {
      if (!(await confirm())) return false;
      const result = await deleteSavedTag(summary.name, repository);
      await reload();
      if (!result.ok && isMounted()) setError(result.errors[0]);
      return result.ok;
    });
    return deleted ?? false;
  }

  return { tags, error, deleting: guard.busy, reload, remove };
}

export type SavedTags = ReturnType<typeof useSavedTags>;
