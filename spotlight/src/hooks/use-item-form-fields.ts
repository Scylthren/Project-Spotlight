import { useEffect, useRef, useState } from 'react';

import {
  addTag,
  allowedNewRoles,
  EMPTY_ATTRIBUTE_FIELDS,
  setAttribute,
  toggleAttribute,
  type AttributeFields,
  type AttributeValueMap,
  type ChoiceAttributeName,
  COLOR_MESSAGES,
  EMPTY_ITEM_FORM,
  makePrimary,
  makePrimaryColor,
  PHOTO_MESSAGES,
  removePhoto,
  removeTag,
  TAG_MESSAGES,
  toggleColor,
  toggleSeason,
  toggleTag,
  type Category,
  type ColorSelectionResult,
  type ItemColor,
  type ItemFormValues,
  type PhotoDraft,
  type PhotoSetResult,
  type PhotoTarget,
  type Season,
  type TagListResult,
} from '@/core';
import { generateItemId } from '@/data/add-closet-item';
import type { CameraFlowPick } from '@/data/camera-access-flow';
import { FormColorDetection } from '@/data/form-color-detection';
import { FormTagSuggestions } from '@/data/form-tag-suggestions';
import { describePickProblem, type PhotoSource } from '@/data/photo-picker';
import { PickedPhotoSet, placePickedPhoto } from '@/data/picked-photo-set';

import { useCameraAccess } from './use-camera-access';
import { useClosetServices } from './closet-services';
import { useIsMounted } from './use-is-mounted';
import { useSingleFlight } from './use-single-flight';

const NO_PHOTOS: readonly PhotoDraft[] = Object.freeze([]);

/**
 * Field state shared by the Add and Edit item screens. No saving logic here.
 * `initial` and `initialPhotos` are read on the first render only (like `useState`).
 * Photo rules (roles, primary, limits) come from core/photo-set.ts.
 *
 * Color detection (slice 4): when a front photo is picked or retaken, its
 * colors are detected in the background (`FormColorDetection`). It never
 * blocks anything: saving works meanwhile, and failures or timeouts just
 * open the color matrix with a notice (held while a picker, the camera
 * intro, or a save is in the way). It never undoes a user's color change.
 *
 * Camera (slice 5): "Take photo" goes through `useCameraAccess` (permission
 * intro, denied panel). `cameraPromptOnEntry` shows the intro when the
 * screen is entered (the Add screen only).
 *
 * Tag suggestions (Gate 2): picking or retaking the front photo also asks the
 * `ClosetTagger` in the background (`FormTagSuggestions`). Suggestions fill
 * only attributes the user has not touched; the tagger's colors go through
 * the color detection (D7). Failures just leave the fields for the user.
 */
export function useItemFormFields(
  initial: ItemFormValues = EMPTY_ITEM_FORM,
  initialPhotos: readonly PhotoDraft[] = NO_PHOTOS,
  { cameraPromptOnEntry = false }: { cameraPromptOnEntry?: boolean } = {},
) {
  const { photoPicker, temporaryFiles, imageStore, garmentIsolator, closetTagger, tagImageSource } = useClosetServices();
  const picker = useSingleFlight();
  const isMounted = useIsMounted();
  /** Owns the picker's temporary copies (keyed by draft id): deletes them when retaken, removed, cleared, or the form closes. */
  const [picked] = useState(() => new PickedPhotoSet(temporaryFiles));
  /** The form's photos in display order: kept stored ones and newly picked ones. */
  const [photos, setPhotosState] = useState<PhotoDraft[]>(() => [...initialPhotos]);
  /** Latest `photos`, for handlers that run after an await (the picker). */
  const photosRef = useRef(photos);
  /** The name as typed; trimmed (and left out when blank) on save. */
  const [name, setName] = useState(initial.name ?? '');
  const [category, setCategory] = useState<Category | null>(initial.category);
  const [colors, setColorsState] = useState<ItemColor[]>(() => initial.colors.map((c) => ({ ...c })));
  /** Latest `colors`, so quick taps and late detection results never act on a stale list. */
  const colorsRef = useRef(colors);
  const [detection] = useState(
    () =>
      new FormColorDetection(
        garmentIsolator,
        {
          colors: () => colorsRef.current,
          frontPhotoId: () => photosRef.current.find((p) => p.role === 'front')?.id ?? null,
          setColors: (next) => {
            setColors(next);
            setColorProblem(null);
          },
          openMatrix: (notice) => setColorMatrix({ notice }),
          setDetecting: (detecting) => setDetectingColors(detecting),
          isActive: () => isMounted(),
        },
        { onError: (error) => console.warn('Color detection failed', error) },
      ),
  );
  /** True while the front photo's colors are being detected (shown as a hint; never blocks). */
  const [detectingColors, setDetectingColors] = useState(false);
  /** Last refused matrix tap (e.g. a fourth color), shown in the matrix. */
  const [colorProblem, setColorProblem] = useState<string | null>(null);
  /**
   * The color matrix: closed (null) or open with an optional notice at the
   * top. Slice 4 opens it with a notice when detection fails or is unsure.
   */
  const [colorMatrix, setColorMatrix] = useState<{ notice: string | null } | null>(null);
  const [attributes, setAttributesState] = useState<AttributeFields>(() => ({
    ...(initial.attributes ?? EMPTY_ATTRIBUTE_FIELDS),
  }));
  /** Latest `attributes`, so a late suggestion never acts on a stale copy. */
  const attributesRef = useRef(attributes);
  /** True while the front photo is being tagged (shown as a hint; never blocks). */
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [suggestions] = useState(
    () =>
      new FormTagSuggestions(
        { tagger: closetTagger, imageSource: tagImageSource },
        {
          attributes: () => attributesRef.current,
          setAttributes: (next) => setAttributes(next),
          frontPhotoId: () => photosRef.current.find((p) => p.role === 'front')?.id ?? null,
          suggestColors: (id, suggested) => detection.taggerColors(id, suggested),
          setSuggesting: (suggesting) => setSuggestingTags(suggesting),
          isActive: () => isMounted(),
        },
        { onError: (error) => console.warn('Tag suggestion failed', error) },
      ),
  );
  const [seasons, setSeasons] = useState<Season[]>(() => [...initial.seasons]);
  const [tags, setTags] = useState<string[]>(() => [...initial.tags]);
  /** What is typed in the tag box (also filters the saved tag list). */
  const [tagText, setTagText] = useState('');
  const [tagProblem, setTagProblem] = useState<string | null>(null);
  const [errors, setErrorsState] = useState<string[]>([]);
  /**
   * True after the photo library refused access permanently, so the form can
   * offer a Settings link. (The camera uses the denied panel instead.)
   */
  const [suggestSettings, setSuggestSettings] = useState(false);
  const camera = useCameraAccess(
    {
      pick: (source, target) => pickInto(source, target),
      defaultTarget: () => {
        const front = photosRef.current.find((p) => p.role === 'front');
        return front ? { kind: 'retake', id: front.id } : { kind: 'add', role: 'front' };
      },
      onIntroVisible: (visible) => (visible ? detection.hold('camera-intro') : detection.release('camera-intro')),
    },
    { promptOnEntry: cameraPromptOnEntry },
  );

  // Leaving the screen without saving discards the unsaved pick (after any
  // save still reading it; see `whileSavingPhoto`), and any photo a picker
  // that is still open returns later.
  useEffect(() => {
    picked.open();
    return () => void picked.close();
  }, [picked]);
  useEffect(() => () => detection.cancel(), [detection]);
  useEffect(() => () => suggestions.cancel(), [suggestions]);

  function setPhotos(next: PhotoDraft[]) {
    photosRef.current = next;
    setPhotosState(next);
  }

  function setAttributes(next: AttributeFields) {
    attributesRef.current = next;
    setAttributesState(next);
  }

  function setColors(next: ItemColor[]) {
    colorsRef.current = next;
    setColorsState(next);
  }

  /** No-op after unmount: a save can finish after the user has left. */
  function setErrors(next: string[]) {
    if (!isMounted()) return;
    setErrorsState(next);
    setSuggestSettings(false);
  }

  /**
   * Gets a photo for `target`: a new photo with a role, or a retake of one
   * photo. The camera goes through the permission flow first. Resolves to
   * the new photo's draft id, or null if nothing was added (cancelled,
   * refused, "Not now", or a second tap while a picker is open).
   */
  async function pickPhoto(source: PhotoSource, target: PhotoTarget): Promise<string | null> {
    if (source === 'camera') return camera.takePhoto(target);
    return (await pickInto(source, target)).id;
  }

  /** Opens the picker itself (the camera flow calls this once access is granted). */
  async function pickInto(source: PhotoSource, target: PhotoTarget): Promise<CameraFlowPick> {
    // One guard for every photo button, so a double tap cannot open two pickers.
    const outcome = await picker.run(async (): Promise<CameraFlowPick> => {
      detection.hold('picker');
      let result;
      try {
        result = await photoPicker.pick(source);
      } finally {
        detection.release('picker');
      }
      if (result.status === 'picked') {
        const placed = await placePickedPhoto(
          picked,
          photosRef.current,
          target,
          { key: generateItemId(), photo: result.photo },
          (next) => {
            setPhotos(next);
            setErrors([]);
          },
          isMounted(),
        );
        if (!placed.ok && placed.problem !== 'closed') setErrorsState([PHOTO_MESSAGES[placed.problem]]);
        if (!placed.ok) return { id: null };
        const draft = photosRef.current.find((p) => p.id === placed.id);
        // Not awaited: detection runs in the background and never blocks the form.
        if (draft?.kind === 'picked' && draft.role === 'front') {
          // Detection first: tagger colors that arrive later must win over its guess (D7).
          void detection.frontPhotoPicked(draft.id, draft.uri);
          void suggestions.frontPhotoPicked(draft.id, draft.uri);
        }
        return { id: placed.id };
      }
      // Access to the camera was refused at the last moment (e.g. changed in Settings): the flow shows its panel.
      if (result.status === 'permission-denied' && source === 'camera') {
        return { id: null, cameraRefused: { status: 'denied', canAskAgain: result.canAskAgain } };
      }
      // 'cancelled' gives no problem: keep whatever was picked before.
      const problem = describePickProblem(result, source);
      if (problem && isMounted()) {
        setErrorsState([problem.message]);
        setSuggestSettings(problem.suggestSettings);
      }
      return { id: null };
    });
    return outcome ?? { id: null };
  }

  function applyPhotoChange(result: PhotoSetResult<PhotoDraft>): boolean {
    if (!result.ok) {
      setErrorsState([PHOTO_MESSAGES[result.problem]]);
      return false;
    }
    setPhotos(result.photos);
    return true;
  }

  /** Removes a photo from the form (not the front). A stored file is deleted only when the edit is saved. */
  function removePhotoById(id: string) {
    const target = photosRef.current.find((p) => p.id === id);
    if (applyPhotoChange(removePhoto(photosRef.current, id)) && target?.kind === 'picked') {
      void picked.release(id);
    }
  }

  /** URI an <Image> can show for a draft. */
  function previewUri(draft: PhotoDraft): string {
    return draft.kind === 'picked' ? draft.uri : imageStore.resolveUri(draft.path);
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

  /** `change` runs on the latest colors (`colorsRef`), so two taps in one frame both count. */
  function applyColors(change: (current: ItemColor[]) => ColorSelectionResult) {
    const result = change(colorsRef.current);
    if (!result.ok) {
      setColorProblem(COLOR_MESSAGES[result.problem]);
      return;
    }
    setColors(result.colors);
    setColorProblem(null);
    detection.userChangedColors();
  }

  /** Adds the typed tag to the item and clears the box. */
  function addTypedTag() {
    if (applyTags(addTag(tags, tagText))) setTagText('');
  }

  /** Replaces all fields, e.g. to clear after saving. Discards unsaved picks. */
  function reset(values: ItemFormValues = EMPTY_ITEM_FORM, nextPhotos: readonly PhotoDraft[] = NO_PHOTOS) {
    void picked.clear();
    detection.reset();
    suggestions.reset();
    if (!isMounted()) return;
    setPhotos([...nextPhotos]);
    setName(values.name ?? '');
    setCategory(values.category);
    setColors(values.colors.map((c) => ({ ...c })));
    setColorProblem(null);
    setColorMatrix(null);
    setSeasons([...values.seasons]);
    setTags([...values.tags]);
    setAttributes({ ...(values.attributes ?? EMPTY_ATTRIBUTE_FIELDS) });
    setTagText('');
    setTagProblem(null);
    setErrors([]);
  }

  const values: ItemFormValues = { name, category, colors, seasons, tags, attributes };

  return {
    photos,
    allowedNewRoles: allowedNewRoles(photos),
    previewUri,
    removePhoto: removePhotoById,
    makePrimary: (id: string) => void applyPhotoChange(makePrimary(photosRef.current, id)),
    values,
    errors,
    setErrors,
    suggestSettings,
    pickingPhoto: picker.busy,
    pickPhoto,
    setName,
    setCategory,
    /** Matrix tap: select (first is primary) or deselect. Rules in core/color-selection.ts. */
    toggleColor: (paletteId: string) => applyColors((current) => toggleColor(current, paletteId)),
    makePrimaryColor: (paletteId: string) => applyColors((current) => makePrimaryColor(current, paletteId)),
    detectingColors,
    /** Applies colors as if detected (no photo or other field changes); opens the matrix with `notice`. */
    setDetectedColors: (next: ItemColor[], notice: string | null) => detection.apply(next, notice),
    colorProblem,
    colorMatrix,
    /** Does nothing while a save runs (the form is locked and may reset when it ends). */
    openColorMatrix: (notice: string | null = null) => {
      if (!detection.isHeld('save')) setColorMatrix({ notice });
    },
    closeColorMatrix: () => {
      setColorMatrix(null);
      setColorProblem(null);
    },
    toggleSeason: (season: Season) => setSeasons((s) => toggleSeason(s, season)),
    /** True while the front photo is being tagged. */
    suggestingTags,
    /** The type as typed (marks it the user's). */
    setItemType: (text: string) => setAttributes(setAttribute(attributesRef.current, 'type', text)),
    /** A tap on a choice: picks it, or clears it when already picked (marks it the user's). */
    toggleAttribute: <K extends ChoiceAttributeName>(name: K, value: AttributeValueMap[K]) =>
      setAttributes(toggleAttribute(attributesRef.current, name, value)),
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
     * Runs a save that reads the picked photos. If the form closes meanwhile,
     * they are deleted only after the save settles. Do not call `reset`
     * from inside `task`; call it after.
     */
    whileSavingPhotos: <T>(task: () => Promise<T>): Promise<T> => picked.whileInUse(task),
    /**
     * Wraps a whole save or delete (resolving true on success): the color
     * matrix cannot open meanwhile. A detection notice that arrives during it
     * is shown after a failure and dropped after a success (the form resets
     * or closes).
     */
    whileSaving: async (task: () => Promise<boolean>): Promise<boolean> => {
      detection.hold('save');
      let ok = false;
      try {
        ok = await task();
        return ok;
      } finally {
        detection.release('save', { drop: ok });
      }
    },
    /** Camera permission state and actions for the intro modal and the denied panel. */
    camera,
  };
}

export type ItemFormFields = ReturnType<typeof useItemFormFields>;
