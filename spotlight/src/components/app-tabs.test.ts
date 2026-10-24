/**
 * The tab bar's structure (D1): Closet, Style, Add, Looks, Me, each with its
 * own inset setting. Read from the source because NativeTabs does not render
 * in Jest.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs') as { readFileSync(path: string, encoding: 'utf8'): string };
const path = require('node:path') as { join(...parts: string[]): string };
const { cwd } = require('node:process') as { cwd(): string };
/* eslint-enable @typescript-eslint/no-require-imports */

/** Jest runs from `spotlight/`. */
const read = (file: string) => fs.readFileSync(path.join(cwd(), 'src', 'components', file), 'utf8');

describe('tab bar', () => {
  it('native: five tabs in order, each with automatic insets set and an SF and a Material icon', () => {
    const source = read('app-tabs.tsx');
    const triggers = [...source.matchAll(/<NativeTabs\.Trigger name="([^"]+)"[\s\S]*?<\/NativeTabs\.Trigger>/g)];
    expect(triggers.map((t) => t[1])).toEqual(['index', 'style', 'add', 'looks', 'me']);
    for (const [block] of triggers) {
      expect(block).toContain('disableAutomaticContentInsets={DISABLE_AUTOMATIC_INSETS}');
      expect(block).toMatch(/<NativeTabs\.Trigger\.Icon sf="[^"]+" md="[^"]+" \/>/);
    }
    expect(source).toContain('<NativeTabs.Trigger.Label>LOOKS</NativeTabs.Trigger.Label>');
  });

  it('web: the same five tabs', () => {
    const names = [...read('app-tabs.web.tsx').matchAll(/<TabTrigger name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['home', 'style', 'add', 'looks', 'me']);
  });
});
