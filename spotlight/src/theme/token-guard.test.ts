import { TOKEN_GUARD_ALLOWLIST, TOKEN_GUARD_SELECTORS } from './token-guard-rules';
import {
  FIXTURE_FILE,
  findFileViolations,
  findTokenViolations,
  guardRuleFor,
  sourceFiles,
} from './testing/token-guard-linter';

const lines = async (code: string) => (await findTokenViolations(code)).map((v) => v.line);

describe('eslint.config.js applies the token guard', () => {
  it('turns the rule on, with the shared selectors, for a file outside the allowlist', async () => {
    const rule = await guardRuleFor(FIXTURE_FILE);
    expect(rule).toEqual([2, ...TOKEN_GUARD_SELECTORS]);
    expect(await guardRuleFor(FIXTURE_FILE.replace(/\.tsx$/, '.ts'))).toEqual([2, ...TOKEN_GUARD_SELECTORS]);
  });

  it('covers screens, components, hooks and core logic', async () => {
    for (const file of [
      'src/components/closet-grid.tsx',
      'src/app/(tabs)/index.tsx',
      'src/hooks/use-theme.ts',
      'src/core/color-science.ts',
      'src/data/testing/node-sql-database.ts',
    ]) {
      expect([file, await guardRuleFor(file)]).toEqual([file, [2, ...TOKEN_GUARD_SELECTORS]]);
    }
  });

  it('skips the theme, the palette, tests, contracts and the core test fixtures', async () => {
    for (const file of [
      'src/theme/colors.ts',
      'src/core/palette.ts',
      'src/core/palette.test.ts',
      'src/data/closet-repository.contract.ts',
      'src/core/testing/synthetic-images.ts',
    ]) {
      expect([file, await guardRuleFor(file)]).toEqual([file, undefined]);
    }
  });
});

describe('token guard detector', () => {
  it('flags a planted hex color in a style', async () => {
    const found = await findTokenViolations(`export const styles = { box: { backgroundColor: '#3c87f7' } };`);
    expect(found).toEqual([{ line: 1, message: expect.stringContaining('color token') }]);
  });

  it('flags every hex length and rgb, rgba, hsl strings, including in JSX and templates', async () => {
    const code = [
      `export const a = '#fff';`,
      `export const b = '#FFFA';`,
      `export const c = "#0E0E0E";`,
      `export const d = '#0E0E0E80';`,
      `export const e = 'rgba(0, 0, 0, 0.5)';`,
      `export const f = 'RGB(1,2,3)';`,
      `export const g = (r: number) => \`rgba(\${r}, 0, 0, 1)\`;`,
      `export const h = 'hsl(10, 50%, 50%)';`,
      `export const i = <View style={{ borderColor: '#d93025' }} />;`,
      `export const j = <Text color="#000" />;`,
      `export const k = \`#ABCDEF\`;`,
    ].join('\n');
    expect(await lines(code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('flags named colors in color-valued style keys and props', async () => {
    const code = [
      `export const a = { color: 'white' };`,
      `export const b = { backgroundColor: 'Black' };`,
      `export const c = { borderColor: 'transparent' };`,
      `export const d = { borderTopColor: 'red', borderBottomColor: 'grey' };`,
      `export const e = { tintColor: 'blue' };`,
      `export const f = { shadowColor: 'black' };`,
      `export const g = { 'borderLeftColor': 'gray' };`,
      `export const h = <TextInput placeholderTextColor="lightgray" />;`,
      `export const i = <Icon color={'white'} />;`,
    ].join('\n');
    expect(await lines(code)).toEqual([1, 2, 3, 4, 4, 5, 6, 7, 8, 9]);
  });

  it('flags a planted numeric fontSize in a style object, a quoted key and a JSX prop', async () => {
    const code = [
      `export const s = StyleSheet.create({ t: { fontSize: 16 } });`,
      `export const q = { 'fontSize': 12 };`,
      `export const x = <SvgText fontSize={14} />;`,
    ].join('\n');
    const found = await findTokenViolations(code);
    expect(found.map((v) => v.line)).toEqual([1, 2, 3]);
    expect(found[0].message).toContain('typography token');
  });

  it('allows tokens, item hex values from variables, and strings that only look similar', async () => {
    const code = [
      `export const s = { color: theme.colors.text, fontSize: typography.body.fontSize };`,
      `export const t = { ...typography.label };`,
      `export const swatch = { backgroundColor: item.hex };`,
      `export const label = 'Item #12 of 30';`,
      `export const id = '#';`,
      `export const notHex = '#GGGGGG';`,
      `export const five = '#12345';`,
      `export const word = 'background';`,
      `export const size = { width: 72, lineHeight: 16 };`,
      `export const data = { paletteId: 'red', name: 'white', category: 'black' };`,
      `export const named = { color: 'whitesmoke-ish', title: 'Black jeans' };`,
      `export const x = <Chip label="white" accessibilityLabel="Black" />;`,
    ].join('\n');
    expect(await findTokenViolations(code)).toEqual([]);
  });
});

describe('token guard on the app source', () => {
  // Each Gate 1.5 slice lowers this number as it restyles its files; slice 5
  // sets it to 0. Never raise it: new files must use theme tokens.
  const MAX_ALLOWLIST = 10;

  it('keeps the allowlist within its cap, without duplicates', () => {
    expect(TOKEN_GUARD_ALLOWLIST.length).toBeLessThanOrEqual(MAX_ALLOWLIST);
    expect(new Set(TOKEN_GUARD_ALLOWLIST).size).toBe(TOKEN_GUARD_ALLOWLIST.length);
  });

  it('finds no raw colors or numeric font sizes in any guarded file', async () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain('src/app/_layout.tsx');
    const offenders: string[] = [];
    let guarded = 0;
    for (const file of files) {
      if ((await guardRuleFor(file)) === undefined) continue;
      guarded += 1;
      for (const v of await findFileViolations(file)) offenders.push(`${file}:${v.line} ${v.message}`);
    }
    expect(guarded).toBeGreaterThan(30);
    expect(offenders).toEqual([]);
  });

  it('allowlists only existing files that the config skips and that still violate (so the list only shrinks)', async () => {
    const files = sourceFiles();
    const stale: string[] = [];
    for (const file of TOKEN_GUARD_ALLOWLIST) {
      if (!files.includes(file)) stale.push(`${file}: missing`);
      else if ((await guardRuleFor(file)) !== undefined) stale.push(`${file}: config does not skip it`);
      else if ((await findFileViolations(file)).length === 0) stale.push(`${file}: no violations left`);
    }
    expect(stale).toEqual([]);
  });
});
