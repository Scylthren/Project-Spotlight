import { Text, View } from 'react-native';

import { SectionLabel, SwitchRow, TextField } from '@/components/ui';
import { HOME_CITY_MAX_LENGTH, type WeatherSettings } from '@/data/weather-settings';
import { WEATHER_SETTINGS_TEXT } from '@/data/weather-messages';
import { useTheme } from '@/hooks/use-theme';

interface WeatherSettingsSectionProps {
  settings: WeatherSettings;
  onToggle: (on: boolean) => void;
  cityText: string;
  onChangeCity: (text: string) => void;
  /** The field was left or submitted: check and save. */
  onSaveCity: () => void;
  cityError?: string;
  saveError?: string;
}

/**
 * The Me tab's Weather section (Profile.dc.html "Use local weather", slice
 * 5a): the switch with a line on what it uses, and the home city field
 * (used when location is off or not allowed).
 */
export function WeatherSettingsSection({ settings, onToggle, cityText, onChangeCity, onSaveCity, cityError, saveError }: WeatherSettingsSectionProps) {
  const { colors, spacing, typography } = useTheme();
  const note = { ...typography.caption, color: colors.textSecondary };
  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel>{WEATHER_SETTINGS_TEXT.section}</SectionLabel>
      <View style={{ gap: spacing.xs }}>
        <SwitchRow label={WEATHER_SETTINGS_TEXT.toggle} value={settings.useLocalWeather} onValueChange={onToggle} />
        <Text style={note}>{WEATHER_SETTINGS_TEXT.toggleHint}</Text>
      </View>
      <TextField
        label={WEATHER_SETTINGS_TEXT.cityLabel}
        value={cityText}
        onChangeText={onChangeCity}
        onBlur={onSaveCity}
        onSubmitEditing={onSaveCity}
        returnKeyType="done"
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="addressCity"
        placeholder={WEATHER_SETTINGS_TEXT.cityPlaceholder}
        maxLength={HOME_CITY_MAX_LENGTH * 2}
        error={cityError}
        hint={WEATHER_SETTINGS_TEXT.cityHint}
      />
      {saveError ? (
        <Text style={{ ...typography.caption, color: colors.danger }} accessibilityLiveRegion="polite">
          {saveError}
        </Text>
      ) : null}
    </View>
  );
}
