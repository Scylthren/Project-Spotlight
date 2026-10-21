import type { TagSummary } from '@/core';

import type { ItemFlowResult } from './add-closet-item';
import { ClosetRepositoryError, type ClosetRepository } from './closet-repository';

export const TAG_LIST_MESSAGES = {
  loadFailed: 'Could not load your saved tags.',
  deleteFailed: 'Could not delete the tag. Please try again.',
  notFound: 'That tag was already deleted.',
} as const;

/** Loads the saved tag list, or a user-facing error. */
export async function loadSavedTags(
  repository: ClosetRepository,
): Promise<ItemFlowResult<{ tags: TagSummary[] }>> {
  try {
    return { ok: true, tags: await repository.listTags() };
  } catch {
    return { ok: false, errors: [TAG_LIST_MESSAGES.loadFailed] };
  }
}

/**
 * Deletes a tag from the saved list and from every item that has it. The
 * caller asks the user to confirm first (see `describeTagDeletion`).
 */
export async function deleteSavedTag(
  name: string,
  repository: ClosetRepository,
): Promise<ItemFlowResult<object>> {
  try {
    await repository.deleteTag(name);
    return { ok: true };
  } catch (error) {
    const notFound = error instanceof ClosetRepositoryError && error.code === 'not_found';
    return { ok: false, errors: [notFound ? TAG_LIST_MESSAGES.notFound : TAG_LIST_MESSAGES.deleteFailed] };
  }
}
