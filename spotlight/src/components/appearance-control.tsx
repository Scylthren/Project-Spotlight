import { SegmentedControl, type SegmentOption } from '@/components/ui';
import {
  APPEARANCE_LABELS,
  APPEARANCE_PREFERENCES,
  type AppearancePreference,
} from '@/core/appearance';

const OPTIONS: readonly SegmentOption<AppearancePreference>[] = APPEARANCE_PREFERENCES.map((value) => ({
  value,
  label: APPEARANCE_LABELS[value],
}));

/**
 * Light / Dark / System (Profile.dc.html, "Appearance"): a segmented
 * control, a radio group named "Theme" for screen readers.
 */
export function AppearanceControl({
  value,
  onChange,
}: {
  value: AppearancePreference;
  onChange: (preference: AppearancePreference) => void;
}) {
  return <SegmentedControl options={OPTIONS} value={value} onChange={onChange} accessibilityLabel="Theme" />;
}
