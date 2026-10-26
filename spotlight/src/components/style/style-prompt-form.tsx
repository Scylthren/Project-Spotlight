import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { Button, SwitchRow } from '@/components/ui';
import { textFieldAccessibility } from '@/components/ui/text-field-style';
import { normalizeRequestText } from '@/core';
import { STYLE_DATA_NOTICE, STYLE_EXAMPLES, styleRequestCounter, quotedRequest } from '@/data/style-messages';
import { MATCH_WEATHER_TEXT } from '@/data/weather-messages';
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
  /** "Match today's weather" (slice 5a). */
  weather: MatchWeatherRow;
}

export interface MatchWeatherRow {
  /** "Use local weather" is on (Me tab). Off: the row says how to turn it on. */
  available: boolean;
  on: boolean;
  onChange: (on: boolean) => void;
  /** Opens the Me tab. */
  onOpenMe: () => void;
}

const FIELD_LABEL = 'Describe the look';

/**
 * The Style screen's body (StylePrompt.dc.html): title, the request box with
 * a counter, the "Try" chips and recent requests (both fill the box), the
 * "Match today's weather" row (slice 5a; when on, the text is optional and
 * the notice says the forecast is sent too), the accent "Get looks" button
 * and the data notice. "Look of the day" comes in slice 5b.
 */
export function StylePromptForm({ text, onChangeText, error, canSubmit, onSubmit, recents, weather }: StylePromptFormProps) {
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
        {weather.available ? (
          <>
            <SwitchRow tone="ink" label={MATCH_WEATHER_TEXT.label} value={weather.on} onValueChange={weather.onChange} />
            {weather.on ? <Text style={look.notice}>{MATCH_WEATHER_TEXT.onHint}</Text> : null}
          </>
        ) : (
          <View style={look.weatherOff}>
            <Text style={look.weatherOffLabel}>{MATCH_WEATHER_TEXT.label}</Text>
            <Text style={look.notice}>{MATCH_WEATHER_TEXT.offNote}</Text>
            <Button variant="text" label={MATCH_WEATHER_TEXT.openMe} onPress={weather.onOpenMe} />
          </View>
        )}
      </View>

      <View style={look.section}>
        <Button variant="accent" label="Get looks" onPress={onSubmit} disabled={!canSubmit} />
        <Text style={look.notice}>{STYLE_DATA_NOTICE}</Text>
        {weather.available && weather.on ? <Text style={look.notice}>{MATCH_WEATHER_TEXT.dataNotice}</Text> : null}
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
