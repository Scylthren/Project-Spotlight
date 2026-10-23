/**
 * Tagging eval (Gate 2 slice 4): label file parsing, the cell syntax and its
 * checks against the contract vocabulary, and the `init` merge rules. The
 * modules live in `evals/tagging/`; no photos or network are involved.
 */
import {
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_FITS,
  TAG_FORMALITIES,
  TAG_MATERIALS,
  TAG_PATTERNS,
  TAG_SEASONS,
} from '../../../supabase/functions/_shared/tag-item-contract.ts';
import {
  checkLabels,
  CsvError,
  emptyLabelTable,
  headerProblems,
  initLabels,
  isPhotoFileName,
  LABEL_COLUMNS,
  parseCsv,
  parseLabelTable,
  readExpectation,
  serializeLabelTable,
  SHA256_PATTERN,
  toCsv,
  type LabelRow,
  type LabelTable,
  type PhotoFile,
} from '../../../evals/tagging/labels.ts';
import { isGitIgnored, joinPath, readText, REPO_ROOT } from '@/security/testing/node-files';

const HEADER = LABEL_COLUMNS.join(',');
/** A well-formed photo hash, built at run time. */
const hash = (seed: string) => `sha256-${seed.repeat(43).slice(0, 43)}`;
const HASH_A = hash('A');
const HASH_B = hash('B');
const HASH_C = hash('C');

function row(cells: Partial<Record<(typeof LABEL_COLUMNS)[number], string>>, line = 2): LabelRow {
  const all: Record<string, string> = {};
  for (const column of LABEL_COLUMNS) all[column] = cells[column] ?? '';
  return { line, cells: all };
}

function table(...rows: LabelRow[]): LabelTable {
  return { header: [...LABEL_COLUMNS], rows };
}

describe('parseCsv and toCsv', () => {
  it('reads quoted cells with commas, escaped quotes and line breaks, CRLF, a BOM, and drops empty rows', () => {
    const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n,,\r\n"multi\nline",2,\n';
    expect(parseCsv(text)).toEqual([
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['1', 'x, y', 'say "hi"'] },
      { line: 4, cells: ['multi\nline', '2', ''] },
    ]);
  });

  it('keeps a quote that does not start a cell as text, and handles a file without a final newline', () => {
    expect(parseCsv('a,5" heel\nb,c')).toEqual([
      { line: 1, cells: ['a', '5" heel'] },
      { line: 2, cells: ['b', 'c'] },
    ]);
  });

  it('throws on a quote that is never closed', () => {
    expect(() => parseCsv('a,"open\nb')).toThrow(CsvError);
  });

  it('round-trips through toCsv', () => {
    const rows = [
      ['file', 'notes'],
      ['a.heic', 'has, comma'],
      ['b.png', 'quote " and\nbreak'],
      ['c.jpg', ' padded '],
    ];
    expect(parseCsv(toCsv(rows)).map((r) => r.cells)).toEqual(rows);
  });
});

describe('the label table', () => {
  it('the committed labels.csv parses, has the expected header and no problems', () => {
    const text = readText(joinPath(REPO_ROOT, 'evals/tagging/labels.csv'));
    const parsed = parseLabelTable(text);
    expect(parsed.header).toEqual([...LABEL_COLUMNS]);
    expect(checkLabels(parsed, null).problems).toEqual([]);
  });

  it('keeps extra columns and the file\'s column order', () => {
    const text = `notes,file,sha256,category,primary_color,other_colors,seasons,type,pattern,material,fit,formality,mine\nhello,a.jpg,${HASH_A},top,,,,,,,,,x\n`;
    const parsed = parseLabelTable(text);
    expect(parsed.rows[0].cells.mine).toBe('x');
    expect(serializeLabelTable(parsed)).toBe(text);
  });

  it('reports missing and repeated columns, and a file saved with semicolons', () => {
    expect(headerProblems(['file', 'sha256'])).toContain('The header has no "category" column.');
    expect(headerProblems([...LABEL_COLUMNS, 'type'])).toEqual(['The header repeats the "type" column.']);
    expect(headerProblems([LABEL_COLUMNS.join(';')])[0]).toMatch(/semicolons/);
  });

  it('knows which files are photos', () => {
    for (const name of ['a.HEIC', 'b.heif', 'c.jpg', 'd.JPEG', 'e.png']) expect(isPhotoFileName(name)).toBe(true);
    for (const name of ['.DS_Store', '.hidden.jpg', 'notes.txt', 'body.json', 'clip.mov']) expect(isPhotoFileName(name)).toBe(false);
  });

  it('the photo hash format is never a 64-hex run (the secret scan stays strict)', () => {
    expect(SHA256_PATTERN.test(HASH_A)).toBe(true);
    expect(SHA256_PATTERN.test('ab'.repeat(32))).toBe(false);
    expect(SHA256_PATTERN.test(HASH_A.slice('sha256-'.length))).toBe(false);
  });
});

describe('readExpectation', () => {
  it('reads alternatives, lists, none and all; matches case-insensitively with spaces for hyphens', () => {
    const { expectation, problems } = readExpectation(
      row({
        file: 'a.heic',
        sha256: HASH_A,
        category: 'Top | Outerwear',
        primary_color: 'navy|black',
        other_colors: 'white; light grey|grey',
        seasons: 'Spring;autumn',
        type: ' Denim  Jacket |Jacket',
        pattern: 'POLKA DOT',
        material: 'none',
        fit: 'regular|none',
        formality: 'smart casual',
      }),
    );
    expect(problems).toEqual([]);
    expect(expectation).toEqual({
      file: 'a.heic',
      sha256: HASH_A,
      noTags: false,
      category: ['top', 'outerwear'],
      primary_color: ['navy', 'black'],
      other_colors: [['white'], ['light-grey', 'grey']],
      seasons: ['spring', 'autumn'],
      type: ['denim jacket', 'jacket'],
      pattern: ['polka-dot'],
      material: [null],
      fit: ['regular', null],
      formality: ['smart-casual'],
    });
  });

  it('leaves blank cells out (not scored)', () => {
    const { expectation } = readExpectation(row({ file: 'a.jpg', sha256: HASH_A, category: 'top' }));
    expect(expectation).toEqual({ file: 'a.jpg', sha256: HASH_A, noTags: false, category: ['top'] });
  });

  it('reads "all" seasons and "none" lists', () => {
    expect(readExpectation(row({ seasons: 'all' })).expectation.seasons).toEqual([...TAG_SEASONS]);
    expect(readExpectation(row({ seasons: 'none' })).expectation.seasons).toEqual([]);
    expect(readExpectation(row({ other_colors: 'None' })).expectation.other_colors).toEqual([]);
  });

  it('marks category "none" as a photo that should get no tags, and other filled cells as problems', () => {
    const ok = readExpectation(row({ file: 'cat.jpg', category: 'none', notes: 'my cat' }));
    expect(ok.problems).toEqual([]);
    expect(ok.expectation.noTags).toBe(true);
    expect(ok.expectation.category).toEqual([null]);

    const bad = readExpectation(row({ file: 'cat.jpg', category: 'none', pattern: 'solid' }));
    expect(bad.problems).toEqual([expect.objectContaining({ column: 'pattern', message: expect.stringMatching(/must be blank/) })]);
    expect(bad.expectation.pattern).toBeUndefined();

    expect(readExpectation(row({ category: 'none|accessory' })).expectation.noTags).toBe(false);
  });

  it.each<[string, Partial<Record<(typeof LABEL_COLUMNS)[number], string>>, string, RegExp]>([
    ['an unknown category', { category: 'swimwear' }, 'category', /not an allowed value/],
    ['an empty alternative', { primary_color: 'navy|' }, 'primary_color', /empty alternative/],
    ['a list in a single-value field', { pattern: 'solid;striped' }, 'pattern', /one value/],
    ['an unknown color in a list', { other_colors: 'white;chartreuse' }, 'other_colors', /"chartreuse" is not an allowed value/],
    ['an unknown alternative', { material: 'cotton|tweed' }, 'material', /"tweed" is not an allowed value/],
    ['too many other colors', { other_colors: 'white;grey;red' }, 'other_colors', /at most 2/],
    ['none inside a list', { other_colors: 'white;none' }, 'other_colors', /stand alone/],
    ['an empty list entry', { seasons: 'spring;;summer' }, 'seasons', /empty entry/],
    ['seasons with alternatives', { seasons: 'spring|summer' }, 'seasons', /no alternatives/],
    ['a repeated season', { seasons: 'winter;Winter' }, 'seasons', /twice/],
    ['an unknown season', { seasons: 'monsoon' }, 'seasons', /not a season/],
    ['a type over 30 characters', { type: 'x'.repeat(31) }, 'type', /1 to 30 characters/],
    ['an empty type alternative', { type: 'Shirt|' }, 'type', /1 to 30 characters/],
    ['an unknown formality', { formality: 'business' }, 'formality', /not an allowed value/],
  ])('reports %s', (_name, cells, column, message) => {
    const { problems, expectation } = readExpectation(row({ file: 'x.jpg', ...cells }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ column, file: 'x.jpg', line: 2 });
    expect(problems[0].message).toMatch(message);
    expect((expectation as unknown as Record<string, unknown>)[column]).toBeUndefined();
  });

  it('lists the allowed values from the contract with each closed-list problem', () => {
    const cases: [string, readonly string[]][] = [
      ['category', TAG_CATEGORIES],
      ['primary_color', TAG_COLORS],
      ['pattern', TAG_PATTERNS],
      ['material', TAG_MATERIALS],
      ['fit', TAG_FITS],
      ['formality', TAG_FORMALITIES],
    ];
    for (const [column, list] of cases) {
      const { problems } = readExpectation(row({ [column]: 'zzz' }));
      expect(problems[0].allowed).toEqual([...list, 'none']);
    }
    expect(readExpectation(row({ seasons: 'zzz' })).problems[0].allowed).toEqual([...TAG_SEASONS, 'all', 'none']);
  });
});

describe('checkLabels', () => {
  const photos: PhotoFile[] = [
    { file: 'a.heic', sha256: HASH_A },
    { file: 'b.png', sha256: HASH_B },
  ];

  it('passes a clean table and counts labelled and no-tags rows', () => {
    const result = checkLabels(
      table(row({ file: 'a.heic', sha256: HASH_A, category: 'top' }, 2), row({ file: 'b.png', sha256: HASH_B, category: 'none' }, 3)),
      photos,
    );
    expect(result.problems).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result).toMatchObject({ rows: 2, labelled: 2, noTags: 1 });
    expect(result.expectations.map((e) => e.file)).toEqual(['a.heic', 'b.png']);
  });

  it('reports each bad cell with its line, file, column and the allowed values', () => {
    const result = checkLabels(table(row({ file: 'a.heic', sha256: HASH_A, fit: 'baggy' }, 7)), photos);
    expect(result.problems).toEqual([
      `line 7 (a.heic), fit "baggy" is not an allowed value. Allowed: ${[...TAG_FITS, 'none'].join(', ')}.`,
    ]);
  });

  it('confirms hashes: missing, malformed, or different from the photo', () => {
    const result = checkLabels(
      table(
        row({ file: 'a.heic', sha256: '', category: 'top' }, 2),
        row({ file: 'b.png', sha256: HASH_C, category: 'top' }, 3),
        row({ file: 'c.jpg', sha256: 'abc', category: 'top' }, 4),
      ),
      [...photos, { file: 'c.jpg', sha256: HASH_C }],
    );
    expect(result.problems).toEqual([
      'line 2 (a.heic): sha256 is empty; run init to fill it.',
      'line 3 (b.png): the photo changed since its row was made (hash differs). Check the labels, then clear sha256 and run init.',
      'line 4 (c.jpg): sha256 "abc" is not one init wrote; clear it and run init.',
      'line 4 (c.jpg): the photo changed since its row was made (hash differs). Check the labels, then clear sha256 and run init.',
    ]);
  });

  it('reports a missing photo, a repeated file, a folder in the name and an empty file cell', () => {
    const result = checkLabels(
      table(
        row({ file: 'gone.jpg', sha256: HASH_C, category: 'top' }, 2),
        row({ file: 'a.heic', sha256: HASH_A }, 3),
        row({ file: 'a.heic', sha256: HASH_A }, 4),
        row({ file: 'sub/b.png', sha256: HASH_B }, 5),
        row({ file: '', category: 'top' }, 6),
      ),
      photos,
    );
    expect(result.problems).toEqual([
      'line 2 (gone.jpg): no such photo in the photo folder.',
      'line 4 (a.heic): this file has more than one row.',
      'line 5 (sub/b.png): use the file name only, without folders.',
      'line 5 (sub/b.png): no such photo in the photo folder.',
      'line 6: the file cell is empty.',
    ]);
  });

  it('warns (no problem) about unlabelled rows and photos without a row', () => {
    const result = checkLabels(table(row({ file: 'a.heic', sha256: HASH_A })), photos);
    expect(result.problems).toEqual([]);
    expect(result.warnings).toEqual(['1 row(s) have no labels yet; run skips them.', '1 photo(s) have no row; run init to add them: b.png']);
    expect(result.expectations).toEqual([]);
  });

  it('skips the photo checks when no folder is given (score)', () => {
    expect(checkLabels(table(row({ file: 'a.heic', sha256: HASH_C, category: 'top' })), null).problems).toEqual([]);
  });

  it('stops at header problems', () => {
    const result = checkLabels({ header: ['file'], rows: [] }, photos);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.expectations).toEqual([]);
  });
});

describe('initLabels', () => {
  it('creates the table with a row per photo, sorted, labels blank', () => {
    const result = initLabels(null, [
      { file: 'b.png', sha256: HASH_B },
      { file: 'a.heic', sha256: HASH_A },
    ]);
    expect(result.added).toEqual(['a.heic', 'b.png']);
    expect(result.changed).toBe(true);
    expect(serializeLabelTable(result.table)).toBe(`${HEADER}\na.heic,${HASH_A},,,,,,,,,,\nb.png,${HASH_B},,,,,,,,,,\n`);
  });

  it('never overwrites labels, notes or a stored hash; appends new photos after existing rows', () => {
    const existing = parseLabelTable(
      `${HEADER}\nz.jpg,${HASH_C},top,navy,,,Shirt,,,,,"keep, me"\na.heic,,dress,red,,,,,,,,\nb.png,${HASH_A},none,,,,,,,,,cat\n`,
    );
    const result = initLabels(existing, [
      { file: 'a.heic', sha256: HASH_A },
      { file: 'b.png', sha256: HASH_B },
      { file: 'c.jpg', sha256: HASH_C },
      { file: 'z.jpg', sha256: HASH_C },
    ]);
    expect(result.added).toEqual(['c.jpg']);
    expect(result.hashFilled).toEqual(['a.heic']);
    expect(result.hashChanged).toEqual(['b.png']);
    expect(result.missing).toEqual([]);
    expect(serializeLabelTable(result.table)).toBe(
      `${HEADER}\nz.jpg,${HASH_C},top,navy,,,Shirt,,,,,"keep, me"\na.heic,${HASH_A},dress,red,,,,,,,,\nb.png,${HASH_A},none,,,,,,,,,cat\nc.jpg,${HASH_C},,,,,,,,,,\n`,
    );
    // The input table is not modified.
    expect(existing.rows[1].cells.sha256).toBe('');
  });

  it('keeps rows whose photo is missing and reports them; nothing to write when nothing changed', () => {
    const existing = parseLabelTable(`${HEADER}\na.heic,${HASH_A},top,,,,,,,,,\ngone.jpg,${HASH_B},top,,,,,,,,,\n`);
    const result = initLabels(existing, [{ file: 'a.heic', sha256: HASH_A }]);
    expect(result.missing).toEqual(['gone.jpg']);
    expect(result.changed).toBe(false);
    expect(result.table.rows).toHaveLength(2);
  });

  it('fills extra columns of new rows with blanks', () => {
    const existing = parseLabelTable(`${HEADER},mine\n`);
    const result = initLabels(existing, [{ file: 'a.heic', sha256: HASH_A }]);
    expect(serializeLabelTable(result.table)).toBe(`${HEADER},mine\na.heic,${HASH_A},,,,,,,,,,,\n`);
  });

  it('refuses a table with an unusable header', () => {
    expect(() => initLabels({ header: ['file'], rows: [] }, [])).toThrow(/no "sha256" column/);
  });

  it('an empty file is treated as a new table', () => {
    expect(parseLabelTable('')).toEqual(emptyLabelTable());
  });
});

describe('README.md', () => {
  it('lists every allowed value of the contract (drift check) and every column', () => {
    const readme = readText(joinPath(REPO_ROOT, 'evals/tagging/README.md'));
    for (const value of [...TAG_CATEGORIES, ...TAG_COLORS, ...TAG_SEASONS, ...TAG_PATTERNS, ...TAG_MATERIALS, ...TAG_FITS, ...TAG_FORMALITIES]) {
      expect(readme).toContain(`\`${value}\``);
    }
    for (const column of LABEL_COLUMNS) expect(readme).toContain(`\`${column}\``);
  });
});

describe('what git keeps', () => {
  it('ignores eval photos put in the repo by mistake and raw runs; keeps the labels', () => {
    for (const path of ['evals/tagging/photos/IMG_0001.HEIC', 'evals/tagging/photos/x.png', 'evals/tagging/runs/2026-10-23T10-00-00Z.json']) {
      expect([path, isGitIgnored(path)]).toEqual([path, true]);
    }
    for (const path of ['evals/tagging/labels.csv', 'evals/tagging/README.md', 'evals/results.md']) {
      expect([path, isGitIgnored(path)]).toEqual([path, false]);
    }
  });
});
