import type { TagSummary } from '@/core';
import { addClosetItem, generateItemId } from '@/data/add-closet-item';

import { useClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { useItemFormFields } from './use-item-form-fields';
import { useSavedTags } from './use-saved-tags';
import { useSingleFlight } from './use-single-flight';

/**
 * Form state for the Add item screen. Logic lives in `addClosetItem`.
 * `busy` is true while saving or while a saved tag is being deleted, so
 * neither can start while the other runs. A save still running when the
 * screen unmounts runs to completion; the picked photos are deleted after it.
 */
export function useAddItemForm() {
  const { repository, imageStore, imageProcessor, temporaryFiles } = useClosetServices();
  // Entering Add (the scan flow) shows the camera intro when access is undetermined.
  const fields = useItemFormFields(undefined, undefined, { cameraPromptOnEntry: true });
  const savedTags = useSavedTags();
  const submit = useSingleFlight();
  const isMounted = useIsMounted();

  /** Returns true if the item was saved. A second tap while saving is ignored. */
  async function save(): Promise<boolean> {
    const saved = await submit.run(() => fields.whileSaving(async () => {
      const photos = fields.photos;
      const result = await fields.whileSavingPhotos(() =>
        addClosetItem(
          { ...fields.values, photos },
          { repository, imageStore, imageProcessor, temporaryFiles, newId: () => generateItemId() },
        ),
      );
      if (!result.ok) {
        fields.setErrors(result.errors);
        return false;
      }
      // After the photos are released: reset clears the picked set, which waits for saves.
      fields.reset();
      // New tags were added to the saved list by the save.
      if (isMounted()) await savedTags.reload();
      return true;
    }));
    return saved ?? false;
  }

  /** Deletes a tag from the saved list (after `confirm`) and from this draft. */
  async function deleteSavedTag(summary: TagSummary, confirm: () => Promise<boolean>): Promise<void> {
    if ((await savedTags.remove(summary, confirm)) && isMounted()) fields.removeTag(summary.name);
  }

  return {
    fields,
    savedTags,
    deleteSavedTag,
    saving: submit.busy,
    busy: submit.busy || savedTags.deleting,
    save,
  };
}
