/** What a pressable control looks like right now. */
export interface ControlState {
  pressed: boolean;
  disabled: boolean;
}

export const IDLE: ControlState = { pressed: false, disabled: false };

/** Every combination, for tests and the dev gallery. */
export const CONTROL_STATES: readonly ControlState[] = [
  { pressed: false, disabled: false },
  { pressed: true, disabled: false },
  { pressed: false, disabled: true },
];

/** `accessibilityState` for a control that can be disabled and, optionally, selected. */
export function controlAccessibilityState({
  disabled,
  selected,
}: {
  disabled: boolean;
  selected?: boolean;
}): { disabled: boolean; selected?: boolean } {
  return selected === undefined ? { disabled } : { disabled, selected };
}
