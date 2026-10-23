/**
 * The tagging eval's label file (`labels.csv`): CSV reading and writing, the
 * cell syntax, checks against the tag-item contract vocabulary, and the
 * `init` merge rules. Plain TypeScript with no Node APIs, so Jest tests it
 * through the app (`spotlight/src/evals/`); file access lives in `cli.ts`.
 *
 * Cell syntax (README.md has the human version):
 * - blank: not scored;
 * - `a|b`: either answer counts (alternatives);
 * - `a;b`: a list (other_colors, seasons); list entries may have alternatives;
 * - `none`: expect no answer for that field. `none` alone in `category`
 *   marks a photo that should get no tags at all (not clothing);
 * - `all` in `seasons`: all four seasons.
 * Closed-list values are matched case-insensitively and a space may stand for
 * a hyphen ("smart casual" is `smart-casual`).
 */
import {
  readTagType,
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_FITS,
  TAG_FORMALITIES,
  TAG_MATERIALS,
  TAG_MAX_COLORS,
  TAG_PATTERNS,
  TAG_SEASONS,
  type TagCategory,
  type TagColor,
  type TagFit,
  type TagFormality,
  type TagMaterial,
  type TagPattern,
  type TagSeason,
} from '../../supabase/functions/_shared/tag-item-contract.ts';

/** Columns of `labels.csv`, in the order `init` writes them. */
export const LABEL_COLUMNS = [
  'file',
  'sha256',
  'category',
  'primary_color',
  'other_colors',
  'seasons',
  'type',
  'pattern',
  'material',
  'fit',
  'formality',
  'notes',
] as const;
export type LabelColumn = (typeof LABEL_COLUMNS)[number];

/** Columns that hold an expected answer (everything but file, sha256 and notes). */
export const EXPECTATION_COLUMNS = [
  'category',
  'primary_color',
  'other_colors',
  'seasons',
  'type',
  'pattern',
  'material',
  'fit',
  'formality',
] as const satisfies readonly LabelColumn[];
export type ExpectationColumn = (typeof EXPECTATION_COLUMNS)[number];

export const NONE = 'none';
export const ALL_SEASONS = 'all';

/** File types `init` picks up from the photo folder (lower case). */
export const PHOTO_EXTENSIONS = ['.heic', '.heif', '.jpg', '.jpeg', '.png'] as const;

export function isPhotoFileName(name: string): boolean {
  if (name.startsWith('.')) return false;
  const lower = name.toLowerCase();
  return PHOTO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * How a photo hash is written: `sha256-` then the SHA-256 as unpadded
 * base64url (43 characters). Not a 64-hex run, so the repo's secret scan
 * stays strict; the prefix keeps spreadsheets from reading a leading `-` as
 * a formula.
 */
export const SHA256_PREFIX = 'sha256-';
export const SHA256_PATTERN = /^sha256-[A-Za-z0-9_-]{43}$/;

// ---------------------------------------------------------------------------
// CSV

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

/**
 * Parses RFC 4180 CSV: comma separated, `"` quoting with `""` escapes,
 * LF or CRLF line ends, an optional UTF-8 BOM. A `"` that does not start a
 * cell is kept as text. Lines with only empty cells are dropped.
 * Each record keeps its 1-based starting line.
 */
export function parseCsv(text: string): { line: number; cells: string[] }[] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStarted = false;
  let line = 1;
  let recordLine = 1;
  const endRecord = () => {
    cells.push(cell);
    // Rows with nothing in them (spreadsheets add ",,,," lines) are dropped.
    if (cells.some((value) => value.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
    cell = '';
    cellStarted = false;
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (char === '\n') line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      quoted = true;
      cellStarted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
      cellStarted = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += char;
    }
  }
  if (quoted) throw new CsvError(`line ${recordLine}: a quoted cell is never closed`);
  if (cell !== '' || cells.length > 0 || cellStarted) endRecord();
  return records;
}

function csvCell(value: string): string {
  return /[",\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Writes rows as CSV with LF line ends and a final newline. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// The label table

export interface LabelRow {
  /** 1-based line in the file. */
  line: number;
  /** Every header column, by name ('' when the row is short). */
  cells: Record<string, string>;
}

export interface LabelTable {
  /** Column names as in the file; extra columns are kept. */
  header: string[];
  rows: LabelRow[];
}

export function emptyLabelTable(): LabelTable {
  return { header: [...LABEL_COLUMNS], rows: [] };
}

/** Problems with the header itself: missing or repeated columns, or a file saved with semicolons. */
export function headerProblems(header: readonly string[]): string[] {
  const problems: string[] = [];
  if (header.length === 1 && header[0].includes(';')) {
    return ['The file uses semicolons between columns. Save it as CSV with commas (in Excel: "CSV UTF-8 (Comma delimited)").'];
  }
  for (const column of LABEL_COLUMNS) {
    if (!header.includes(column)) problems.push(`The header has no "${column}" column.`);
  }
  const seen = new Set<string>();
  for (const column of header) {
    if (seen.has(column)) problems.push(`The header repeats the "${column}" column.`);
    seen.add(column);
  }
  return problems;
}

/** Parses `labels.csv`. Throws CsvError on broken quoting; header problems are left to `headerProblems`. */
export function parseLabelTable(text: string): LabelTable {
  const records = parseCsv(text);
  if (records.length === 0) return emptyLabelTable();
  const header = records[0].cells.map((cell) => cell.trim());
  const rows = records.slice(1).map(({ line, cells }) => {
    const byName: Record<string, string> = {};
    header.forEach((name, i) => {
      byName[name] = cells[i] ?? '';
    });
    return { line, cells: byName };
  });
  return { header, rows };
}

export function serializeLabelTable(table: LabelTable): string {
  return toCsv([table.header, ...table.rows.map((row) => table.header.map((name) => row.cells[name] ?? ''))]);
}

export function cell(row: LabelRow, column: LabelColumn): string {
  return (row.cells[column] ?? '').trim();
}

/** True when at least one expectation cell is filled. */
export function isLabelled(row: LabelRow): boolean {
  return EXPECTATION_COLUMNS.some((column) => cell(row, column) !== '');
}

// ---------------------------------------------------------------------------
// Expectations

/** Alternatives for a single-value field; `null` is "none" (expect no answer). */
export type Alternatives<T> = (T | null)[];

/** What a labelled row expects. An absent key is a blank cell: not scored. */
export interface Expectation {
  file: string;
  sha256: string;
  /** `category` is exactly `none`: the photo should get no tags (only category is scored). */
  noTags: boolean;
  category?: Alternatives<TagCategory>;
  primary_color?: Alternatives<TagColor>;
  /** Each entry: the colors that count for it. `[]` is "none": expect no other colors. */
  other_colors?: TagColor[][];
  /** Exact set. `[]` is "none". */
  seasons?: TagSeason[];
  /** Lower case, single spaces. */
  type?: Alternatives<string>;
  pattern?: Alternatives<TagPattern>;
  material?: Alternatives<TagMaterial>;
  fit?: Alternatives<TagFit>;
  formality?: Alternatives<TagFormality>;
}

export interface CellProblem {
  line: number;
  file: string;
  column: string;
  value: string;
  message: string;
  /** Allowed values to show with the message. */
  allowed?: readonly string[];
}

/** Lower case, trimmed, inner whitespace as one hyphen ("Smart  casual" -> "smart-casual"). */
export function normalizeId(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Lower case with single spaces, for comparing types. Null when empty or too long. */
export function normalizeType(text: string): string | null {
  const type = readTagType(text);
  return type === null ? null : type.toLowerCase();
}

const MAX_OTHER_COLORS = TAG_MAX_COLORS - 1;

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string; allowed?: readonly string[] };

function parseAlternatives<T extends string>(raw: string, list: readonly T[]): Parsed<Alternatives<T>> {
  const parts = raw.split('|').map(normalizeId);
  if (parts.some((part) => part === '')) return { ok: false, message: 'has an empty alternative (check the | signs)' };
  if (raw.includes(';')) return { ok: false, message: 'takes one value; use | between alternatives, not ;' };
  const values: Alternatives<T> = [];
  for (const part of parts) {
    if (part === NONE) values.push(null);
    else if ((list as readonly string[]).includes(part)) values.push(part as T);
    else {
      const message = parts.length > 1 ? `"${part}" is not an allowed value` : 'is not an allowed value';
      return { ok: false, message, allowed: [...list, NONE] };
    }
  }
  return { ok: true, value: [...new Set(values)] };
}

function parseTypeAlternatives(raw: string): Parsed<Alternatives<string>> {
  const parts = raw.split('|');
  const values: Alternatives<string> = [];
  for (const part of parts) {
    if (normalizeId(part) === NONE) {
      values.push(null);
      continue;
    }
    const type = normalizeType(part);
    if (type === null) {
      return { ok: false, message: 'each alternative must be 1 to 30 characters (check the | signs)' };
    }
    values.push(type);
  }
  return { ok: true, value: [...new Set(values)] };
}

function parseOtherColors(raw: string): Parsed<TagColor[][]> {
  if (normalizeId(raw) === NONE) return { ok: true, value: [] };
  const entries = raw.split(';').map((entry) => entry.trim());
  if (entries.some((entry) => entry === '')) return { ok: false, message: 'has an empty entry (check the ; signs)' };
  if (entries.length > MAX_OTHER_COLORS) {
    return { ok: false, message: `lists ${entries.length} colors; the function returns at most ${MAX_OTHER_COLORS} besides the primary one` };
  }
  const value: TagColor[][] = [];
  for (const entry of entries) {
    const parsed = parseAlternatives(entry, TAG_COLORS);
    if (!parsed.ok) return { ...parsed, message: parsed.message.startsWith('"') ? parsed.message : `"${entry}" ${parsed.message}` };
    if (parsed.value.includes(null)) return { ok: false, message: '"none" must stand alone in other_colors' };
    value.push(parsed.value as TagColor[]);
  }
  return { ok: true, value };
}

function parseSeasons(raw: string): Parsed<TagSeason[]> {
  const id = normalizeId(raw);
  if (id === NONE) return { ok: true, value: [] };
  if (id === ALL_SEASONS) return { ok: true, value: [...TAG_SEASONS] };
  if (raw.includes('|')) return { ok: false, message: 'seasons take no alternatives; list the expected seasons with ;' };
  const entries = raw.split(';').map(normalizeId);
  if (entries.some((entry) => entry === '')) return { ok: false, message: 'has an empty entry (check the ; signs)' };
  const value: TagSeason[] = [];
  for (const entry of entries) {
    if (!(TAG_SEASONS as readonly string[]).includes(entry)) {
      return { ok: false, message: `"${entry}" is not a season`, allowed: [...TAG_SEASONS, ALL_SEASONS, NONE] };
    }
    if (value.includes(entry as TagSeason)) return { ok: false, message: `lists "${entry}" twice` };
    value.push(entry as TagSeason);
  }
  return { ok: true, value };
}

const SINGLE_LISTS = {
  category: TAG_CATEGORIES,
  primary_color: TAG_COLORS,
  pattern: TAG_PATTERNS,
  material: TAG_MATERIALS,
  fit: TAG_FITS,
  formality: TAG_FORMALITIES,
} as const;

/**
 * Reads a row's expectations. Problems are returned, never thrown; a field
 * with a problem is left out of the expectation (not scored).
 */
export function readExpectation(row: LabelRow): { expectation: Expectation; problems: CellProblem[] } {
  const file = cell(row, 'file');
  const problems: CellProblem[] = [];
  const report = (column: string, value: string, parsed: { message: string; allowed?: readonly string[] }) =>
    problems.push({ line: row.line, file, column, value, message: parsed.message, ...(parsed.allowed ? { allowed: parsed.allowed } : {}) });
  const expectation: Expectation = { file, sha256: cell(row, 'sha256'), noTags: false };

  for (const column of EXPECTATION_COLUMNS) {
    const raw = cell(row, column);
    if (raw === '') continue;
    let parsed: Parsed<unknown>;
    if (column === 'other_colors') parsed = parseOtherColors(raw);
    else if (column === 'seasons') parsed = parseSeasons(raw);
    else if (column === 'type') parsed = parseTypeAlternatives(raw);
    else parsed = parseAlternatives(raw, SINGLE_LISTS[column]);
    if (!parsed.ok) {
      report(column, raw, parsed);
      continue;
    }
    (expectation as unknown as Record<string, unknown>)[column] = parsed.value;
  }

  const category = expectation.category;
  if (category && category.length === 1 && category[0] === null) {
    expectation.noTags = true;
    for (const column of EXPECTATION_COLUMNS) {
      if (column !== 'category' && cell(row, column) !== '') {
        report(column, cell(row, column), { message: 'must be blank when category is "none" (a photo that should get no tags)' });
        delete (expectation as unknown as Record<string, unknown>)[column];
      }
    }
  }
  return { expectation, problems };
}

// ---------------------------------------------------------------------------
// check

export interface PhotoFile {
  /** File name inside the photo folder. */
  file: string;
  /** Hash of the file as SHA256_PATTERN describes. */
  sha256: string;
}

export interface CheckResult {
  /** Anything that makes `check` exit non-zero. */
  problems: string[];
  /** Worth knowing, not an error. */
  warnings: string[];
  expectations: Expectation[];
  rows: number;
  labelled: number;
  noTags: number;
}

/** One line for a cell problem, with the allowed values when there is a list. */
export function formatCellProblem(problem: CellProblem): string {
  const where = `line ${problem.line} (${problem.file || 'no file name'}), ${problem.column} "${problem.value}"`;
  return `${where} ${problem.message}.${problem.allowed ? ` Allowed: ${problem.allowed.join(', ')}.` : ''}`;
}

/**
 * Checks every row: file names, hashes (against `photos` when given; null
 * skips the photo checks), and every label cell against the contract
 * vocabulary. Unlabelled rows are a warning (the run skips them).
 */
export function checkLabels(table: LabelTable, photos: readonly PhotoFile[] | null): CheckResult {
  const problems = headerProblems(table.header);
  const warnings: string[] = [];
  const expectations: Expectation[] = [];
  if (problems.length > 0) return { problems, warnings, expectations, rows: table.rows.length, labelled: 0, noTags: 0 };

  const byFile = new Map((photos ?? []).map((photo) => [photo.file, photo]));
  const seen = new Set<string>();
  let labelled = 0;
  let noTags = 0;
  for (const row of table.rows) {
    const file = cell(row, 'file');
    const sha = cell(row, 'sha256');
    if (file === '') {
      problems.push(`line ${row.line}: the file cell is empty.`);
      continue;
    }
    if (/[/\\]/.test(file)) problems.push(`line ${row.line} (${file}): use the file name only, without folders.`);
    if (seen.has(file)) problems.push(`line ${row.line} (${file}): this file has more than one row.`);
    seen.add(file);
    if (sha === '') problems.push(`line ${row.line} (${file}): sha256 is empty; run init to fill it.`);
    else if (!SHA256_PATTERN.test(sha)) problems.push(`line ${row.line} (${file}): sha256 "${sha}" is not one init wrote; clear it and run init.`);
    if (photos) {
      const photo = byFile.get(file);
      if (!photo) problems.push(`line ${row.line} (${file}): no such photo in the photo folder.`);
      else if (sha !== '' && photo.sha256 !== sha) {
        problems.push(`line ${row.line} (${file}): the photo changed since its row was made (hash differs). Check the labels, then clear sha256 and run init.`);
      }
    }
    const { expectation, problems: cellProblems } = readExpectation(row);
    problems.push(...cellProblems.map(formatCellProblem));
    if (isLabelled(row)) {
      labelled++;
      if (expectation.noTags) noTags++;
      expectations.push(expectation);
    }
  }
  const unlabelled = table.rows.length - labelled;
  if (unlabelled > 0) warnings.push(`${unlabelled} row(s) have no labels yet; run skips them.`);
  if (photos) {
    const extra = photos.filter((photo) => !seen.has(photo.file)).map((photo) => photo.file);
    if (extra.length > 0) warnings.push(`${extra.length} photo(s) have no row; run init to add them: ${extra.join(', ')}`);
  }
  return { problems, warnings, expectations, rows: table.rows.length, labelled, noTags };
}

// ---------------------------------------------------------------------------
// init

export interface InitResult {
  table: LabelTable;
  /** Photos that got a new row. */
  added: string[];
  /** Rows whose empty sha256 was filled. */
  hashFilled: string[];
  /** Rows whose photo's hash differs from the stored one (left unchanged). */
  hashChanged: string[];
  /** Rows whose photo is not in the folder (left unchanged). */
  missing: string[];
  /** True when the table differs from the input. */
  changed: boolean;
}

/**
 * Adds a row (file and sha256 filled, labels blank) for every photo without
 * one, in file-name order after the existing rows. Fills a blank sha256.
 * Never changes a label, a note, a stored hash, or the row order, and never
 * removes a row: a changed photo or a missing photo is only reported.
 * Throws if the header is unusable (see `headerProblems`).
 */
export function initLabels(input: LabelTable | null, photos: readonly PhotoFile[]): InitResult {
  const source = input ?? emptyLabelTable();
  const headerIssues = headerProblems(source.header);
  if (headerIssues.length > 0) throw new Error(headerIssues.join(' '));
  const table: LabelTable = { header: [...source.header], rows: source.rows.map((row) => ({ line: row.line, cells: { ...row.cells } })) };
  const byFile = new Map(photos.map((photo) => [photo.file, photo]));
  const result: InitResult = { table, added: [], hashFilled: [], hashChanged: [], missing: [], changed: false };
  const present = new Set<string>();
  for (const row of table.rows) {
    const file = cell(row, 'file');
    if (file === '') continue;
    present.add(file);
    const photo = byFile.get(file);
    if (!photo) {
      result.missing.push(file);
      continue;
    }
    const stored = cell(row, 'sha256');
    if (stored === '') {
      row.cells.sha256 = photo.sha256;
      result.hashFilled.push(file);
    } else if (stored !== photo.sha256) {
      result.hashChanged.push(file);
    }
  }
  const newPhotos = photos.filter((photo) => !present.has(photo.file)).sort((a, b) => a.file.localeCompare(b.file));
  let line = Math.max(1, ...table.rows.map((row) => row.line));
  for (const photo of newPhotos) {
    const cells: Record<string, string> = {};
    for (const name of table.header) cells[name] = '';
    cells.file = photo.file;
    cells.sha256 = photo.sha256;
    table.rows.push({ line: ++line, cells });
    result.added.push(photo.file);
  }
  result.changed = result.added.length > 0 || result.hashFilled.length > 0 || input === null;
  return result;
}
