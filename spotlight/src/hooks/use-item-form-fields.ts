import { useEffect, useState } from 'react';

import {
  addTag,
  EMPTY_ITEM_FORM,
  removeTag,
  TAG_MESSAGES,
  toggleSeason,
  toggleTag,
  type Category,
  type ItemFormValues,
  type Season,
  type TagListResult,
} from '@/core';
import { describePickProblem, type PhotoSource, type PickedPhoto } from '@/data/photo-picker';
import { PickedPhotoSlot } from '@/data/picked-photo-slot';

import { useClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { useSingleFlight } from './use-single-flight';

/**
 * Field state shared by the Add and Edit item screens. No saving logic here.
 * `initial` is read on the first render only (like `useState`).
 */
export function useItemFormFields(initial: ItemFormValues = EMPTY_ITEM_FORM) {
  const { photoPicker, temporaryFiles } = useClosetServices();
  const picker = useSingleFlight();
  const isMounted = useIsMounted();
  /** Owns the picker's temporary copy: deletes it when replaced, cleared, or the form closes. */
  const [slot] = useState(() => new PickedPhotoSlot(temporaryFiles));
  /** A newly picked photo, or null if none was picked in this form. */
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [category, setCategory] = useState<Category | null>(initial.category);
  const [colorsText, setColorsText] = useState(initial.colorsText);
  const [seasons, setSeasons] = useState<Season[]>(() => [...initial.seasons]);
  const [tags, setTags] = useState<string[]>(() => [...initial.tags]);
  /** What is typed in the tag box (also filters the saved tag list). */
  const [tagText, setTagText] = useState('');
  const [tagProblem, setTagProblem] = useState<string | null>(null);
  const [errors, setErrorsState] = useState<string[]>([]);
  /** True after a permanently denied permission, so the form can offer a Settings link. */
  const [suggestSettings, setSuggestSettings] = useState(false);

  // Leaving the screen without saving discards the unsaved pick (after any
  // save still reading it; see `whileSavingPhoto`), and any photo a picker
  // that is still open returns later.
  useEffect(() => {
    slot.open();
    return () => void slot.close();
  }, [slot]);

  /** No-op after unmount: a save can finish after the user has left. */
  function setErrors(next: string[]) {
    if (!isMounted()) return;
    setErrorsState(next);
    setSuggestSettings(false);
  }

  async function pickPhoto(source: PhotoSource) {
    // One guard for both buttons, so a double tap cannot open two pickers.
    await picker.run(async () => {
      const result = await photoPicker.pick(source);
      if (result.status === 'picked') {
        if (slot.isClosed || !isMounted()) {
          // The form closed while the picker was open: the slot discards it.
          await slot.replace(result.photo);
          return;
        }
        setPhoto(result.photo);
        setErrors([]);
        await slot.replace(result.photo);
        return;
      }
      // 'cancelled' gives no problem: keep whatever was picked before.
      const problem = describePickProblem(result, source);
      if (problem && isMounted()) {
        setErrorsState([problem.message]);
        setSuggestSettings(problem.suggestSettings);
      }
    });
  }

  function applyTags(result: TagListResult): boolean {
    if (!result.ok) {
      setTagProblem(TAG_MESSAGES[result.problem]);
      return false;
    }
    setTags(result.tags);
    setTagProblem(null);
    return true;
  }

  /** Adds the typed tag to the item and clears the box. */
  function addTypedTag() {
    if (applyTags(addTag(tags, tagText))) setTagText('');
  }

  /** Replaces all fields, e.g. to clear after saving. Discards an unsaved pick. */
  function reset(values: ItemFormValues = EMPTY_ITEM_FORM) {
    void slot.clear();
    if (!isMounted()) return;
    setPhoto(null);
    setCategory(values.category);
    setColorsText(values.colorsText);
    setSeasons([...values.seasons]);
    setTags([...values.tags]);
    setTagText('');
    setTagProblem(null);
    setErrors([]);
  }

  const values: ItemFormValues = { category, colorsText, seasons, tags };

  return {
    photo,
    values,
    errors,
    setErrors,
    suggestSettings,
    pickingPhoto: picker.busy,
    pickPhoto,
    setCategory,
    setColorsText,
    toggleSeason: (season: Season) => setSeasons((s) => toggleSeason(s, season)),
    tagText,
    setTagText: (text: string) => {
      setTagText(text);
      setTagProblem(null);
    },
    tagProblem,
    addTypedTag,
    toggleTag: (tag: string) => void applyTags(toggleTag(tags, tag)),
    removeTag: (tag: string) => {
      setTags((t) => removeTag(t, tag));
      setTagProblem(null);
    },
    reset,
    /**
     * Runs a save that reads the picked photo. If the form closes meanwhile,
     * the photo is deleted only after the save settles. Do not call `reset`
     * from inside `task`; call it after.
     */
    whileSavingPhoto: <T>(task: () => Promise<T>): Promise<T> => slot.whileInUse(task),
  };
}

export type ItemFormFields = ReturnType<typeof useItemFormFields>;
