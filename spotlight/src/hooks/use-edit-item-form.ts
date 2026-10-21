import { draftsFromPhotos, itemToFormValues, type ClothingItem, type TagSummary } from '@/core';
import { deleteClosetItem } from '@/data/delete-closet-item';
import { editClosetItem } from '@/data/edit-closet-item';

import { useClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { useItemFormFields } from './use-item-form-fields';
import { useSavedTags } from './use-saved-tags';
import { useSingleFlight } from './use-single-flight';

/**
 * Form state for editing a loaded item (prefilled from it). Logic lives in
 * `editClosetItem` and `deleteClosetItem`. Save and delete share one guard,
 * so neither can run twice, or while the other is running. `busy` also covers
 * a saved-tag deletion, so the UI cannot save while one runs (and the tag
 * controls are locked while saving).
 *
 * A save or delete still running when the screen closes (header or hardware
 * back) runs to completion; the picked photos are deleted only after it settles.
 */
export function useEditItemForm(item: ClothingItem) {
  const { repository, imageStore, imageProcessor, temporaryFiles } = useClosetServices();
  const fields = useItemFormFields(itemToFormValues(item), draftsFromPhotos(item.photos));
  const savedTags = useSavedTags();
  const submit = useSingleFlight();
  const isMounted = useIsMounted();

  /** Returns true if the edit was saved, or if there was nothing to save. */
  async function save(): Promise<boolean> {
    const saved = await submit.run(() => fields.whileSaving(async () => {
      const photos = fields.photos;
      const result = await fields.whileSavingPhotos(() =>
        editClosetItem(
          item.id,
          { ...fields.values, photos },
          { repository, imageStore, imageProcessor, temporaryFiles },
        ),
      );
      // An unchanged form is a success too (`result.changed` is false, nothing was written).
      if (!result.ok) fields.setErrors(result.errors);
      return result.ok;
    }));
    return saved ?? false;
  }

  /** Asks `confirm` first, inside the guard, so a double tap shows one dialog. Returns true if deleted. */
  async function remove(confirm: () => Promise<boolean>): Promise<boolean> {
    const deleted = await submit.run(() => fields.whileSaving(async () => {
      if (!(await confirm())) return false;
      const result = await deleteClosetItem(item.id, { repository, imageStore });
      if (!result.ok) fields.setErrors(result.errors);
      return result.ok;
    }));
    return deleted ?? false;
  }

  /**
   * Deletes a tag from the saved list (after `confirm`) and from every item,
   * including this one's draft, so saving the form does not bring it back.
   */
  async function deleteSavedTag(summary: TagSummary, confirm: () => Promise<boolean>): Promise<void> {
    if ((await savedTags.remove(summary, confirm)) && isMounted()) fields.removeTag(summary.name);
  }

  return {
    fields,
    savedTags,
    deleteSavedTag,
    busy: submit.busy || savedTags.deleting,
    save,
    remove,
  };
}
