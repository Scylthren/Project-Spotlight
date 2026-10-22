import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CameraDeniedPanel } from '@/components/camera-denied-panel';
import { CameraIntroModal } from '@/components/camera-intro-modal';
import { ChipGroup } from '@/components/chip-group';
import { FormButton } from '@/components/form-button';
import { angleTileWidth, itemFormLook, photoSetLook } from '@/components/item-form-style';
import { SectionLabel } from '@/components/ui';
import { PHOTO_ROLE_LABELS, primaryPhoto, type PhotoDraft, type PhotoRole, type PhotoTarget } from '@/core';
import type { PhotoSource } from '@/data/photo-picker';
import type { ItemFormFields as Fields } from '@/hooks/use-item-form-fields';
import { useTheme } from '@/hooks/use-theme';

interface PhotoSetFieldProps {
  fields: Fields;
  /** Text inside the empty photo area, before the front photo is added. */
  emptyHint: string;
  /** Locks every photo control (saving, deleting). */
  busy: boolean;
}

/**
 * The item's photos (Angles.dc.html): a large preview of the selected one, a
 * row of angle tiles (thumbnails and the dashed "Add another angle" tile, which
 * opens a role chooser), and retake / make primary / remove for the selected
 * photo. Rules live in core/photo-set.ts; this only offers what `fields`
 * allows. "Take photo" goes through the camera permission flow: the intro
 * modal and the denied panel live here too.
 */
export function PhotoSetField({ fields, emptyHint, busy }: PhotoSetFieldProps) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  const look = photoSetLook(theme);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The role chosen for a new angle, or null while "Add another angle" is closed. */
  const [addingRole, setAddingRole] = useState<PhotoRole | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const { photos, allowedNewRoles } = fields;
  const selected = photos.find((p) => p.id === selectedId) ?? primaryPhoto(photos);
  const locked = busy || fields.pickingPhoto;
  // A role offered earlier may no longer fit (e.g. the set filled up).
  const role = addingRole && allowedNewRoles.includes(addingRole) ? addingRole : null;
  const canOfferAngle = selected !== undefined && allowedNewRoles.length > 0 && role === null;
  const tileWidth = angleTileWidth(theme, rowWidth);

  async function pick(source: PhotoSource, target: PhotoTarget) {
    const id = await fields.pickPhoto(source, target);
    if (id) {
      setSelectedId(id);
      if (target.kind === 'add') setAddingRole(null);
    }
  }

  return (
    <View style={form.section}>
      <SectionLabel>Photos</SectionLabel>
      <View style={look.preview}>
        {selected ? (
          <>
            <Image
              source={{ uri: fields.previewUri(selected) }}
              style={look.previewImage}
              contentFit="contain"
              accessibilityLabel={`${PHOTO_ROLE_LABELS[selected.role]} photo`}
            />
            <View style={look.badge} accessible={false} importantForAccessibility="no-hide-descendants">
              <Text style={look.badgeText}>
                {`${PHOTO_ROLE_LABELS[selected.role]}${selected.isPrimary ? ' · Primary' : ''}`}
              </Text>
            </View>
          </>
        ) : (
          <Text style={look.emptyHint}>{emptyHint}</Text>
        )}
      </View>

      <CameraIntroModal camera={fields.camera} />
      <CameraDeniedPanel camera={fields.camera} disabled={locked} />

      {photos.length > 1 || canOfferAngle ? (
        <View
          style={look.tiles}
          accessibilityLabel="Item photos"
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
          {photos.length > 1 &&
            photos.map((photo) => (
              <Thumbnail
                key={photo.id}
                photo={photo}
                uri={fields.previewUri(photo)}
                width={tileWidth}
                selected={photo.id === selected?.id}
                onPress={() => setSelectedId(photo.id)}
              />
            ))}
          {canOfferAngle ? (
            <AddAngleTile width={tileWidth} disabled={locked} onPress={() => setAddingRole(allowedNewRoles[0])} />
          ) : null}
        </View>
      ) : null}

      {selected && role !== null ? (
        <View style={form.panel}>
          <SectionLabel>Which angle?</SectionLabel>
          <ChipGroup
            accessibilityLabel="Photo angle"
            options={allowedNewRoles}
            isSelected={(r) => r === role}
            onPress={setAddingRole}
            formatLabel={(r) => PHOTO_ROLE_LABELS[r]}
            disabled={locked}
          />
          <SourceButtons onPick={(source) => pick(source, { kind: 'add', role })} disabled={locked} />
          <View style={form.textButtons}>
            <FormButton label="Cancel" variant="text" onPress={() => setAddingRole(null)} disabled={locked} />
          </View>
        </View>
      ) : null}

      {selected ? (
        <>
          <Text style={form.caption}>
            {`${PHOTO_ROLE_LABELS[selected.role]} photo${selected.isPrimary ? ' (shown in your closet)' : ''}. Take or choose another to retake it.`}
          </Text>
          <SourceButtons onPick={(source) => pick(source, { kind: 'retake', id: selected.id })} disabled={locked} />
          {(!selected.isPrimary || selected.role !== 'front') && (
            <View style={form.textButtons}>
              {!selected.isPrimary && (
                <FormButton
                  label="Make primary"
                  variant="text"
                  onPress={() => fields.makePrimary(selected.id)}
                  disabled={locked}
                />
              )}
              {selected.role !== 'front' && (
                <FormButton
                  label="Remove photo"
                  variant="text"
                  onPress={() => fields.removePhoto(selected.id)}
                  disabled={locked}
                />
              )}
            </View>
          )}
        </>
      ) : (
        <SourceButtons onPick={(source) => pick(source, { kind: 'add', role: 'front' })} disabled={locked} />
      )}
    </View>
  );
}

function SourceButtons({ onPick, disabled }: { onPick: (source: PhotoSource) => void; disabled: boolean }) {
  const theme = useTheme();
  return (
    <View style={itemFormLook(theme).buttons}>
      <FormButton label="Take photo" variant="secondary" onPress={() => onPick('camera')} disabled={disabled} />
      <FormButton
        label="Choose from library"
        variant="secondary"
        onPress={() => onPick('library')}
        disabled={disabled}
      />
    </View>
  );
}

function Thumbnail({
  photo,
  uri,
  width,
  selected,
  onPress,
}: {
  photo: PhotoDraft;
  uri: string;
  width: number;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const look = photoSetLook(theme);
  const label = `${PHOTO_ROLE_LABELS[photo.role]}${photo.isPrimary ? ', primary' : ''}`;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} photo`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [look.tile, { width, opacity: pressed ? theme.opacity.pressed : 1 }]}>
      <View style={look.thumbnail(selected)}>
        <Image source={{ uri }} style={look.thumbnailImage} contentFit="cover" />
      </View>
      <Text style={look.tileLabel} numberOfLines={1}>
        {photo.role === 'detail' ? 'Detail' : PHOTO_ROLE_LABELS[photo.role]}
      </Text>
      {photo.isPrimary && <Text style={look.tileNote}>Primary</Text>}
    </Pressable>
  );
}

function AddAngleTile({ width, disabled, onPress }: { width: number; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const look = photoSetLook(theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Add another angle"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [look.tile, { width, opacity: disabled ? theme.opacity.disabled : 1 }, look.addTile(pressed)]}>
      <Text style={look.addTilePlus} accessible={false}>
        +
      </Text>
      <Text style={look.addTileText} accessible={false}>
        Add another angle
      </Text>
    </Pressable>
  );
}
