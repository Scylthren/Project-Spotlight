import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { Button } from '@/components/ui';
import { textFieldAccessibility } from '@/components/ui/text-field-style';
import { normalizeRequestText } from '@/core';
import { STYLE_DATA_NOTICE, STYLE_EXAMPLES, styleRequestCounter, quotedRequest } from '@/data/style-messages';
import { useTheme } from '@/hooks/use-theme';

import { stylePromptLook } from './style-look';

interface StylePromptFormProps {
  text: string;
  onChangeText: (text: string) => void;
  /** Shown under the field (too long), else undefined. */
  error?: string;
  canSubmit: boolean;
  onSubmit: () => void;
  /** Newest first. Hidden when empty. */
  recents: readonly string[];
}

const FIELD_LABEL = 'Describe the look';

/**
 * The Style screen's body (StylePrompt.dc.html): title, the request box with
 * a counter, the "Try" chips and recent requests (both fill the box), the
 * accent "Get looks" button and the data notice. "Match today's weather" and
 * "Look of the day" come in slice 5.
 */
export function StylePromptForm({ text, onChangeText, error, canSubmit, onSubmit, recents }: StylePromptFormProps) {
  const theme = useTheme();
  const look = stylePromptLook(theme);
  const [focused, setFocused] = useState(false);
  const current = normalizeRequestText(text).toLocaleLowerCase();

  return (
    <View style={look.body}>
      <Text style={look.eyebrow}>Style me</Text>
      <Text accessibilityRole="header">
        <Text style={look.titleItalic}>{"What's the\n"}</Text>
        <Text style={look.titleBold}>occasion?</Text>
      </Text>

      <View style={look.section}>
        <Text style={look.sectionLabel} accessible={false} importantForAccessibility="no">
          {FIELD_LABEL}
        </Text>
        <TextInput
          {...textFieldAccessibility(FIELD_LABEL, { disabled: false, error, hint: 'Then tap Get looks' })}
          value={text}
          onChangeText={onChangeText}
          multiline
          placeholder="Emo vibes for a concert, warm enough for October"
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.accent}
          cursorColor={theme.colors.accent}
          keyboardAppearance={theme.scheme}
          autoCapitalize="sentences"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[look.input, { borderColor: look.inputBorder(focused, Boolean(error)) }]}
        />
        <View style={look.fieldFooter}>
          {error ? <Text style={look.fieldError}>{error}</Text> : null}
          <Text style={look.counter} accessibilityLabel={`${styleRequestCounter(text).replace('/', ' of ')} characters`}>
            {styleRequestCounter(text)}
          </Text>
        </View>
      </View>

      <View style={look.section}>
        <Text style={look.sectionLabel}>Try</Text>
        <ChipGroup
          options={STYLE_EXAMPLES}
          variant="styleTag"
          accessibilityLabel="Example requests"
          formatLabel={(example) => example}
          isSelected={(example) => example.toLocaleLowerCase() === current}
          onPress={(example) => onChangeText(example)}
          chipAccessibilityHint="Fills the request"
        />
      </View>

      <View style={look.section}>
        <Button variant="accent" label="Get looks" onPress={onSubmit} disabled={!canSubmit} />
        <Text style={look.notice}>{STYLE_DATA_NOTICE}</Text>
      </View>

      {recents.length > 0 ? (
        <View style={look.section}>
          <Text style={look.sectionLabel}>Recent</Text>
          {recents.map((request) => (
            <Pressable
              key={request}
              accessibilityRole="button"
              accessibilityLabel={request}
              accessibilityHint="Fills the request"
              onPress={() => onChangeText(request)}
              style={({ pressed }) => look.recentRow(pressed)}>
              <Text style={look.recentText} numberOfLines={2}>
                {quotedRequest(request)}
              </Text>
              <Text style={look.recentArrow} accessible={false} importantForAccessibility="no">
                {'→'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
