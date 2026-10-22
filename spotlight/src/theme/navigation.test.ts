import { FONT_FAMILIES, themes } from './index';
import { navigationTheme, statusBarStyle, tabBarAppearance } from './navigation';

describe('navigationTheme', () => {
  it.each(['light', 'dark'] as const)('uses the %s tokens', (scheme) => {
    const theme = themes[scheme];
    const nav = navigationTheme(theme);
    expect(nav.dark).toBe(scheme === 'dark');
    expect(nav.colors).toEqual({
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.background,
      text: theme.colors.text,
      border: theme.colors.hairline,
      notification: theme.colors.accent,
    });
  });

  it('uses loaded families without synthetic weights', () => {
    for (const font of Object.values(navigationTheme(themes.light).fonts)) {
      expect(FONT_FAMILIES).toContain(font.fontFamily);
      expect(font.fontWeight).toBe('normal');
    }
  });
});

describe('statusBarStyle', () => {
  it('uses dark text on the light theme and light text on the dark theme', () => {
    expect(statusBarStyle(themes.light)).toBe('dark');
    expect(statusBarStyle(themes.dark)).toBe('light');
  });
});

describe('tabBarAppearance', () => {
  it.each(['light', 'dark'] as const)('follows the mockup bar in %s', (scheme) => {
    const { colors, typography } = themes[scheme];
    const bar = tabBarAppearance(themes[scheme]);
    expect(bar.backgroundColor).toBe(colors.background);
    expect(bar.shadowColor).toBe(colors.text);
    expect(bar.iconColor).toEqual({ default: colors.text, selected: colors.accent });
    expect(bar.labelStyle.default).toEqual({
      fontFamily: typography.tabLabel.fontFamily,
      fontSize: typography.tabLabel.fontSize,
      color: colors.text,
    });
    expect(bar.labelStyle.selected.color).toBe(colors.accent);
    expect(bar.labelStyle.selected.fontSize).toBe(typography.tabLabel.fontSize);
    expect(FONT_FAMILIES).toContain(bar.labelStyle.selected.fontFamily);
  });
});
