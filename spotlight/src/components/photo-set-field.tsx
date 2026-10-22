import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CameraDeniedPanel } from '@/components/camera-denied-panel';
import { CameraIntroModal } from '@/components/camera-intro-modal';
import { ChipGroup } from '@/components/chip-group';
import { FormButton } from '@/components/form-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { spacing } from '@/theme';
import { PHOTO_ROLE_LABELS, primaryPhoto, type PhotoDraft, type PhotoRole, type PhotoTarget } from '@/core';
import type { PhotoSource } from '@/data/photo-picker';
import type { ItemFormFields as Fields } from '@/hooks/use-item-form-fields';

interface PhotoSetFieldProps {
  fields: Fields;
  /** Text inside the empty photo area, before the front photo is added. */
  emptyHint: string;
  /** Locks every photo control (saving, deleting). */
  busy: boolean;
}

/**
 * The item's photos: a large preview of the selected one, a row of
 * thumbnails, retake / make primary / remove for the selected photo, and
 * "Add another angle" with a role chooser. Rules live in core/photo-set.ts;
 * this only offers what `fields` allows. "Take photo" goes through the camera
 * permission flow: the intro modal and the denied panel live here too.
 */
export function PhotoSetField({ fields, emptyHint, busy }: PhotoSetFieldProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The role chosen for a new angle, or null while "Add another angle" is closed. */
  const [addingRole, setAddingRole] = useState<PhotoRole | null>(null);
  const { photos, allowedNewRoles } = fields;
  const selected = photos.find((p) => p.id === selectedId) ?? primaryPhoto(photos);
  const locked = busy || fields.pickingPhoto;
  // A role offered earlier may no longer fit (e.g. the set filled up).
  const role = addingRole && allowedNewRoles.includes(addingRole) ? addingRole : null;

  async function pick(source: PhotoSource, target: PhotoTarget) {
    const id = await fields.pickPhoto(source, target);
    if (id) {
      setSelectedId(id);
      if (target.kind === 'add') setAddingRole(null);
    }
  }

  return (
    <>
      <ThemedView type="surface" style={styles.preview}>
        {selected ? (
          <Image
            source={{ uri: fields.previewUri(selected) }}
            style={styles.previewImage}
            contentFit="cover"
            accessibilityLabel={`${PHOTO_ROLE_LABELS[selected.role]} photo`}
          />
        ) : (
          <ThemedText themeColor="textSecondary">{emptyHint}</ThemedText>
        )}
      </ThemedView>

      <CameraIntroModal camera={fields.camera} />
      <CameraDeniedPanel camera={fields.camera} disabled={locked} />

      {photos.length > 1 && (
        <View style={styles.thumbnails} accessibilityLabel="Item photos">
          {photos.map((photo) => (
            <Thumbnail
              key={photo.id}
              photo={photo}
              uri={fields.previewUri(photo)}
              selected={photo.id === selected?.id}
              onPress={() => setSelectedId(photo.id)}
            />
          ))}
        </View>
      )}

      {selected ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {`${PHOTO_ROLE_LABELS[selected.role]} photo${selected.isPrimary ? ' (shown in your closet)' : ''}. Take or choose another to retake it.`}
          </ThemedText>
          <SourceButtons onPick={(source) => pick(source, { kind: 'retake', id: selected.id })} disabled={locked} />
          {(!selected.isPrimary || selected.role !== 'front') && (
            <View style={styles.row}>
              {!selected.isPrimary && (
                <View style={styles.cell}>
                  <FormButton
                    label="Make primary"
                    variant="secondary"
                    onPress={() => fields.makePrimary(selected.id)}
                    disabled={locked}
                  />
                </View>
              )}
              {selected.role !== 'front' && (
                <View style={styles.cell}>
                  <FormButton
                    label="Remove photo"
                    variant="destructive"
                    onPress={() => fields.removePhoto(selected.id)}
                    disabled={locked}
                  />
                </View>
              )}
            </View>
          )}
        </>
      ) : (
        <SourceButtons onPick={(source) => pick(source, { kind: 'add', role: 'front' })} disabled={locked} />
      )}

      {selected &&
        allowedNewRoles.length > 0 &&
        (role === null ? (
          <FormButton
            label="Add another angle"
            variant="secondary"
            onPress={() => setAddingRole(allowedNewRoles[0])}
            disabled={locked}
          />
        ) : (
          <ThemedView type="surface" style={styles.addPanel}>
            <ThemedText type="smallBold">Which angle?</ThemedText>
            <ChipGroup
              accessibilityLabel="Photo angle"
              options={allowedNewRoles}
              isSelected={(r) => r === role}
              onPress={setAddingRole}
              formatLabel={(r) => PHOTO_ROLE_LABELS[r]}
              disabled={locked}
            />
            <SourceButtons onPick={(source) => pick(source, { kind: 'add', role })} disabled={locked} />
            <FormButton label="Cancel" variant="secondary" onPress={() => setAddingRole(null)} disabled={locked} />
          </ThemedView>
        ))}
    </>
  );
}

function SourceButtons({ onPick, disabled }: { onPick: (source: PhotoSource) => void; disabled: boolean }) {
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <FormButton label="Take photo" variant="secondary" onPress={() => onPick('camera')} disabled={disabled} />
      </View>
      <View style={styles.cell}>
        <FormButton
          label="Choose from library"
          variant="secondary"
          onPress={() => onPick('library')}
          disabled={disabled}
        />
      </View>
    </View>
  );
}

function Thumbnail({
  photo,
  uri,
  selected,
  onPress,
}: {
  photo: PhotoDraft;
  uri: string;
  selected: boolean;
  onPress: () => void;
}) {
  const label = `${PHOTO_ROLE_LABELS[photo.role]}${photo.isPrimary ? ', primary' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} photo`}
      accessibilityState={{ selected }}
      style={styles.thumbnailCell}>
      <View style={[styles.thumbnail, selected && styles.thumbnailSelected]}>
        <Image source={{ uri }} style={styles.thumbnailImage} contentFit="cover" />
      </View>
      <ThemedText type="small" numberOfLines={1}>
        {photo.role === 'detail' ? 'Detail' : PHOTO_ROLE_LABELS[photo.role]}
      </ThemedText>
      {photo.isPrimary && (
        <ThemedText type="small" themeColor="textSecondary">
          Primary
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preview: {
    aspectRatio: 1,
    borderRadius: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  thumbnails: { flexDirection: 'row', gap: spacing.sm },
  thumbnailCell: { width: 72, alignItems: 'center', gap: spacing.xxs },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: spacing.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbnailSelected: { borderColor: '#3c87f7' },
  thumbnailImage: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  addPanel: { borderRadius: spacing.lg, padding: spacing.lg, gap: spacing.sm },
});
