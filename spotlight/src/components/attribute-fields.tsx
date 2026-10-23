import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { attributeFieldsLook, itemFormLook } from '@/components/item-form-style';
import { KeyboardDismissArea } from '@/components/keyboard-dismiss-area';
import { SectionLabel, SegmentedControl, TextField } from '@/components/ui';
import {
  ATTRIBUTE_CHOICES,
  ATTRIBUTE_LABELS,
  attributeValueLabel,
  describeAttributeField,
  FORMALITIES,
  FORMALITY_SHORT_LABELS,
  ITEM_TYPE_MAX_LENGTH,
  type AttributeValueMap,
  type ChoiceAttributeName,
} from '@/core';
import type { ItemFormFields } from '@/hooks/use-item-form-fields';
import { useTheme } from '@/hooks/use-theme';

/** The choices opened from a box in the grid (formality is a segmented control instead). */
type GridChoice = Exclude<ChoiceAttributeName, 'formality'>;
const GRID_CHOICES: readonly GridChoice[] = ['pattern', 'material', 'fit'];

const FORMALITY_OPTIONS = FORMALITIES.map((value) => ({
  value,
  label: FORMALITY_SHORT_LABELS[value],
  accessibilityLabel: attributeValueLabel(value),
}));

/** What the attribute fields read and call: the item form, or an import draft (slice 6). */
export type AttributeFieldsModel = Pick<ItemFormFields, 'values' | 'suggestingTags' | 'noSuggestions' | 'setItemType' | 'toggleAttribute'>;

interface AttributeFieldsProps {
  fields: AttributeFieldsModel;
  disabled: boolean;
}

/**
 * Type, pattern, material, fit (a two-column grid) and formality (a segmented
 * row), from SaveItem.dc.html. Every value can be changed in at most two
 * taps: a box opens its choices below the grid, and a choice sets the value
 * and closes them (tapping the chosen one again clears it). A suggested value
 * says "Suggested" until the user touches it.
 */
export function AttributeFields({ fields, disabled }: AttributeFieldsProps) {
  const theme = useTheme();
  const form = itemFormLook(theme);
  const look = attributeFieldsLook(theme);
  const { attributes } = fields.values;
  const [open, setOpen] = useState<GridChoice | null>(null);
  if (!attributes) return null;
  const type = describeAttributeField('type', attributes.type);
  const formality = describeAttributeField('formality', attributes.formality);

  function choose<K extends GridChoice>(name: K, value: AttributeValueMap[K]) {
    fields.toggleAttribute(name, value);
    setOpen(null);
  }

  return (
    <>
      {fields.suggestingTags ? (
        <Text style={form.caption} accessibilityLiveRegion="polite">
          Suggesting details from the photo...
        </Text>
      ) : fields.noSuggestions ? (
        <Text style={form.caption} accessibilityLiveRegion="polite">
          No suggestions
        </Text>
      ) : null}
      <View style={look.grid}>
        {GRID_CHOICES.map((name) => {
          const described = describeAttributeField(name, attributes[name]);
          const isOpen = open === name;
          return (
            <View key={name} style={look.cell}>
              <Text style={look.label} accessible={false} importantForAccessibility="no">
                {ATTRIBUTE_LABELS[name]}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={described.accessibilityLabel}
                accessibilityHint={isOpen ? 'Hides the choices' : 'Shows the choices'}
                accessibilityState={{ disabled, expanded: isOpen }}
                disabled={disabled}
                onPress={() => setOpen(isOpen ? null : name)}
                style={({ pressed }) => look.box({ open: isOpen, pressed, disabled })}>
                <Text style={described.text ? look.value : look.placeholder} numberOfLines={1}>
                  {described.text ?? 'Choose'}
                </Text>
              </Pressable>
              {described.suggested ? <Text style={look.note}>Suggested</Text> : null}
            </View>
          );
        })}
        <View style={look.cell}>
          <TextField
            label={ATTRIBUTE_LABELS.type}
            value={attributes.type.value ?? ''}
            onChangeText={fields.setItemType}
            placeholder="e.g. Hoodie"
            hint={type.suggested ? 'Suggested' : undefined}
            maxLength={ITEM_TYPE_MAX_LENGTH}
            autoCapitalize="sentences"
            returnKeyType="done"
            disabled={disabled}
          />
        </View>
      </View>

      <KeyboardDismissArea style={{ gap: form.body.gap }}>
        {open ? (
          <View style={form.section}>
            <ChipGroup
              accessibilityLabel={`${ATTRIBUTE_LABELS[open]} choices`}
              options={ATTRIBUTE_CHOICES[open] as readonly AttributeValueMap[GridChoice][]}
              isSelected={(value) => attributes[open].value === value}
              onPress={(value) => choose(open, value)}
              formatLabel={attributeValueLabel}
              chipAccessibilityHint="Tap the chosen one again to clear it"
              disabled={disabled}
            />
          </View>
        ) : null}

        <View style={form.section}>
          <View style={form.labelRow}>
            <SectionLabel>{ATTRIBUTE_LABELS.formality}</SectionLabel>
            {formality.suggested ? <Text style={form.note}>Suggested</Text> : null}
          </View>
          <SegmentedControl
            accessibilityLabel={formality.accessibilityLabel}
            options={FORMALITY_OPTIONS}
            value={attributes.formality.value}
            onChange={(value) => fields.toggleAttribute('formality', value)}
            selectedAccessibilityHint="Tap again to clear it"
            disabled={disabled}
          />
        </View>
      </KeyboardDismissArea>
    </>
  );
}
