/**
 * Scores a tagging eval run against the labels, and formats the report and
 * the `evals/results.md` section. Plain TypeScript, no Node APIs.
 *
 * Rules (docs/plans/gate-2.md "Slice 4"):
 * - A listed alternative counts as correct; `none` matches no answer.
 * - primary_color is the first color returned; other_colors is scored as
 *   overlap (matched / (expected + returned - matched)) with the rest.
 * - seasons are scored twice: exact set, and overlap (same formula).
 * - type passes when the words of any alternative appear, in order, in the
 *   returned type ("t-shirt" matches "Graphic t-shirt"), ignoring capitals
 *   and treating hyphens and other punctuation as spaces. `none` matches no
 *   answer. Free text varies too much for exact matching (human, 2026-10-23).
 * - A row whose category is `none` passes only when no category comes back.
 * - A photo the function rejects or errors on (or that could not be
 *   prepared) scores 0 on every labelled field.
 */
import type { ItemTags } from '../../supabase/functions/_shared/tag-item-contract.ts';

import { normalizeType, type Alternatives, type Expectation } from './labels.ts';
import type { RunRecord } from './run-record.ts';

// ---------------------------------------------------------------------------
// Prices and targets

export interface ModelPrice {
  label: string;
  /** US dollars per million input tokens. */
  inputPerMillionUsd: number;
  /** US dollars per million output tokens. */
  outputPerMillionUsd: number;
  /** When the prices were last checked against the provider's price list. */
  checkedOn: string;
  note: string;
}

/** Prices by model alias. A model missing here gets no cost (shown as unknown). */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-haiku-5-5': {
    label: 'Claude Haiku 5.5',
    inputPerMillionUsd: 0.1,
    outputPerMillionUsd: 0.5,
    checkedOn: '2026-10-23',
    note: 'prompts up to 100K tokens',
  },
};

/** The model the function uses (ROADMAP D3); used for the estimate before a run. */
export const DEFAULT_MODEL = 'claude-haiku-5-5';

/** Rough tokens per photo for the estimate before a run (one call; the run measures the real numbers). */
export const ESTIMATED_TOKENS_PER_PHOTO = { input: 2_500, output: 100 } as const;

export function costUsd(inputTokens: number, outputTokens: number, price: ModelPrice): number {
  return (inputTokens * price.inputPerMillionUsd + outputTokens * price.outputPerMillionUsd) / 1_000_000;
}

/** Estimated cost of sending `photos` photos once each with the default model. */
export function estimateCostUsd(photos: number): number {
  const price = MODEL_PRICES[DEFAULT_MODEL];
  return photos * costUsd(ESTIMATED_TOKENS_PER_PHOTO.input, ESTIMATED_TOKENS_PER_PHOTO.output, price);
}

export const SCORE_FIELDS = [
  'category',
  'primary_color',
  'other_colors',
  'seasons',
  'seasons_overlap',
  'type',
  'pattern',
  'material',
  'fit',
  'formality',
] as const;
export type ScoreField = (typeof SCORE_FIELDS)[number];

export const FIELD_LABELS: Record<ScoreField, string> = {
  category: 'Category',
  primary_color: 'Primary color',
  other_colors: 'Other colors (overlap)',
  seasons: 'Seasons (exact)',
  seasons_overlap: 'Seasons (overlap)',
  type: 'Type',
  pattern: 'Pattern',
  material: 'Material',
  fit: 'Fit',
  formality: 'Formality',
};

/** Accuracy targets (docs/ROADMAP.md, Gate 2). */
export const TARGETS: Partial<Record<ScoreField, number>> = { category: 0.9, primary_color: 0.85 };

/** Fields scored as a fraction per photo rather than right or wrong. */
const OVERLAP_FIELDS: readonly ScoreField[] = ['other_colors', 'seasons_overlap'];

// ---------------------------------------------------------------------------
// Scoring

export interface FieldScore {
  field: ScoreField;
  /** Photos with this field labelled. */
  scored: number;
  /** Sum of per-photo scores (1 per correct answer; a fraction for overlap fields). */
  points: number;
  /** points / scored, or null when nothing was scored. */
  accuracy: number | null;
  target: number | null;
  /** PASS/MISS against the target; null without a target or without scored photos. */
  pass: boolean | null;
}

export interface Miss {
  file: string;
  field: ScoreField;
  expected: string;
  got: string;
  /** For overlap fields: the photo's score (0 to 1). */
  score?: number;
}

export interface ScoreReport {
  /** Photos scored (in the run and labelled). */
  photos: number;
  noTags: { rows: number; passed: number };
  fields: FieldScore[];
  misses: Miss[];
  tokens: {
    /** Photos whose answer reported usage. */
    photos: number;
    totalInput: number;
    totalOutput: number;
    meanInput: number | null;
    meanOutput: number | null;
    /** Null when a model in the run has no price. */
    totalCostUsd: number | null;
    meanCostUsd: number | null;
  };
  /** Requests that got an answer or failed after sending, in ms. */
  latency: { count: number; p50: number | null; p95: number | null };
  /** Error count by code. */
  errors: Record<string, number>;
  /** Model calls over all answers, and photos that needed the retry. */
  modelCalls: number;
  retried: number;
  models: string[];
  warnings: string[];
}

const fmtAlt = (value: string | null) => (value === null ? 'none' : value);
const fmtAlternatives = (alternatives: Alternatives<string>) => alternatives.map(fmtAlt).join('|');
const fmtList = (values: readonly string[]) => (values.length === 0 ? 'none' : values.join(';'));

/** Overlap of two sets: matched / (expected + got - matched); 1 when both are empty. */
export function overlap(expected: readonly (readonly string[])[], got: readonly string[]): number {
  if (expected.length === 0 && got.length === 0) return 1;
  const unused = [...got];
  let matched = 0;
  for (const alternatives of expected) {
    const at = unused.findIndex((value) => alternatives.includes(value));
    if (at >= 0) {
      unused.splice(at, 1);
      matched++;
    }
  }
  return matched / (expected.length + got.length - matched);
}

/** Nearest-rank percentile of `values` (0 < p <= 100). */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

interface PhotoScore {
  field: ScoreField;
  points: number;
  expected: string;
  got: string;
}

function typeWords(text: string): string[] {
  return (normalizeType(text) ?? '').split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
}

/** True when `expected` (null: no answer) matches the returned type, by words in order. */
export function typeMatches(expected: string | null, got: string | null): boolean {
  if (expected === null || got === null) return expected === got;
  const want = typeWords(expected);
  const have = typeWords(got);
  if (want.length === 0) return false;
  for (let start = 0; start + want.length <= have.length; start += 1) {
    if (want.every((word, offset) => have[start + offset] === word)) return true;
  }
  return false;
}

/** Per-field scores for one photo; `tags` null means the photo failed (every field 0). */
export function scorePhoto(expectation: Expectation, tags: ItemTags | null, failure: string | null): PhotoScore[] {
  const scores: PhotoScore[] = [];
  const failed = tags === null;
  const gotText = (text: string) => (failed ? `error ${failure ?? 'unknown'}` : text);
  const single = <T extends string>(field: ScoreField, alternatives: Alternatives<T> | undefined, got: T | null) => {
    if (!alternatives) return;
    scores.push({
      field,
      points: !failed && alternatives.includes(got) ? 1 : 0,
      expected: fmtAlternatives(alternatives),
      got: gotText(fmtAlt(got)),
    });
  };

  single('category', expectation.category, tags?.category ?? null);
  single('primary_color', expectation.primary_color, tags?.colors[0] ?? null);
  if (expectation.other_colors) {
    const others = tags ? tags.colors.slice(1) : [];
    scores.push({
      field: 'other_colors',
      points: failed ? 0 : overlap(expectation.other_colors, others),
      expected: expectation.other_colors.length === 0 ? 'none' : expectation.other_colors.map((alts) => alts.join('|')).join(';'),
      got: gotText(fmtList(others)),
    });
  }
  if (expectation.seasons) {
    const got = tags ? tags.seasons : [];
    const same = !failed && got.length === expectation.seasons.length && got.every((season) => expectation.seasons!.includes(season));
    const expected = fmtList(expectation.seasons);
    scores.push({ field: 'seasons', points: same ? 1 : 0, expected, got: gotText(fmtList(got)) });
    scores.push({
      field: 'seasons_overlap',
      points: failed ? 0 : overlap(expectation.seasons.map((season) => [season]), got),
      expected,
      got: gotText(fmtList(got)),
    });
  }
  if (expectation.type) {
    const got = tags?.type ?? null;
    scores.push({
      field: 'type',
      points: !failed && expectation.type.some((alternative) => typeMatches(alternative, got)) ? 1 : 0,
      expected: fmtAlternatives(expectation.type),
      // Show the type as returned, not lower-cased.
      got: gotText(fmtAlt(got)),
    });
  }
  single('pattern', expectation.pattern, tags?.pattern ?? null);
  single('material', expectation.material, tags?.material ?? null);
  single('fit', expectation.fit, tags?.fit ?? null);
  single('formality', expectation.formality, tags?.formality ?? null);
  return scores;
}

/**
 * Scores every photo in `run` that has a labelled row. Photos in the run
 * without a row, and rows whose hash differs from the run's, are warned about.
 */
export function scoreRun(expectations: readonly Expectation[], run: RunRecord): ScoreReport {
  const byFile = new Map(expectations.map((expectation) => [expectation.file, expectation]));
  const totals = new Map<ScoreField, { scored: number; points: number }>(SCORE_FIELDS.map((field) => [field, { scored: 0, points: 0 }]));
  const misses: Miss[] = [];
  const warnings: string[] = [];
  const errors: Record<string, number> = {};
  const latencies: number[] = [];
  const models = new Set<string>();
  let photos = 0;
  let noTagsRows = 0;
  let noTagsPassed = 0;
  let usagePhotos = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost: number | null = 0;
  let modelCalls = 0;
  let retried = 0;

  for (const result of run.photos) {
    if (result.latencyMs !== null) latencies.push(result.latencyMs);
    if (result.status === 'error') {
      const code = result.errorCode ?? 'unknown';
      errors[code] = (errors[code] ?? 0) + 1;
    }
    if (result.usage) {
      usagePhotos++;
      totalInput += result.usage.inputTokens;
      totalOutput += result.usage.outputTokens;
      modelCalls += result.usage.attempts;
      if (result.usage.attempts > 1) retried++;
      models.add(result.usage.model);
      const price = MODEL_PRICES[result.usage.model];
      totalCost = price && totalCost !== null ? totalCost + costUsd(result.usage.inputTokens, result.usage.outputTokens, price) : null;
    }

    const expectation = byFile.get(result.file);
    if (!expectation) {
      warnings.push(`${result.file} is in the run but has no labelled row; not scored.`);
      continue;
    }
    if (expectation.sha256 !== result.sha256) {
      warnings.push(`${result.file}: the labels' hash differs from the run's; the photo or its row changed since the run.`);
    }
    photos++;
    const tags = result.status === 'ok' ? result.tags : null;
    for (const score of scorePhoto(expectation, tags, result.errorCode)) {
      const total = totals.get(score.field)!;
      total.scored++;
      total.points += score.points;
      if (score.points < 1 && score.field !== 'seasons_overlap') {
        misses.push({
          file: result.file,
          field: score.field,
          expected: score.expected,
          got: score.got,
          ...(OVERLAP_FIELDS.includes(score.field) ? { score: score.points } : {}),
        });
      }
    }
    if (expectation.noTags) {
      noTagsRows++;
      if (tags !== null && tags.category === null) noTagsPassed++;
    }
  }

  const fields = SCORE_FIELDS.map((field): FieldScore => {
    const { scored, points } = totals.get(field)!;
    const accuracy = scored > 0 ? points / scored : null;
    const target = TARGETS[field] ?? null;
    return { field, scored, points, accuracy, target, pass: target === null || accuracy === null ? null : accuracy >= target };
  });

  return {
    photos,
    noTags: { rows: noTagsRows, passed: noTagsPassed },
    fields,
    misses,
    tokens: {
      photos: usagePhotos,
      totalInput,
      totalOutput,
      meanInput: usagePhotos > 0 ? totalInput / usagePhotos : null,
      meanOutput: usagePhotos > 0 ? totalOutput / usagePhotos : null,
      totalCostUsd: usagePhotos > 0 ? totalCost : null,
      meanCostUsd: usagePhotos > 0 && totalCost !== null ? totalCost / usagePhotos : null,
    },
    latency: { count: latencies.length, p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    errors,
    modelCalls,
    retried,
    models: [...models].sort(),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Formatting

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const usd = (value: number) => `$${value < 0.01 ? value.toFixed(6) : value.toFixed(4)}`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const int = (value: number) => Math.round(value).toLocaleString('en-US');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Escapes a Markdown table cell. */
const mdCell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export interface ResultsMeta {
  /** ISO date-time of the run. */
  date: string;
  gitCommit: string;
  gitDirty: boolean;
  promptHash: string;
  /** Where the raw run is (not committed). */
  runFile: string;
}

function scoreCell(score: FieldScore): string {
  if (score.accuracy === null) return 'n/a';
  if (OVERLAP_FIELDS.includes(score.field)) return `${pct(score.accuracy)} (mean)`;
  return `${pct(score.accuracy)} (${int(score.points)}/${score.scored})`;
}

/** The report as Markdown: used for the console and appended to `evals/results.md`. */
export function formatReport(report: ScoreReport, meta: ResultsMeta): string {
  const lines: string[] = [];
  const when = meta.date.replace('T', ' ').replace(/\.\d+Z$|Z$/, ' UTC');
  lines.push(`## Tagging eval, ${when}`, '');
  lines.push(`- Commit: \`${meta.gitCommit}\`${meta.gitDirty ? ' (with uncommitted changes)' : ''}`);
  lines.push(`- Model: ${report.models.length > 0 ? report.models.join(', ') : 'unknown (no answer reported usage)'}`);
  lines.push(`- Prompt hash: \`${meta.promptHash}\` (SHA-256 of \`supabase/functions/tag-item/prompt.ts\`, first 12 hex digits; the local file, which should match the deployed function)`);
  const errorCount = Object.values(report.errors).reduce((sum, n) => sum + n, 0);
  lines.push(
    `- Photos: ${report.photos} scored` +
      (report.noTags.rows > 0 ? ` (${report.noTags.rows} expected no tags: ${report.noTags.passed} passed)` : '') +
      `, ${plural(errorCount, 'error')}`,
  );
  lines.push(`- Run file: \`${meta.runFile}\` (not committed)`, '');

  lines.push('| Field | Scored | Score | Target | Result |', '| --- | --- | --- | --- | --- |');
  for (const score of report.fields) {
    const target = score.target === null ? '' : `>= ${pct(score.target).replace('.0%', '%')}`;
    const result = score.pass === null ? '' : score.pass ? 'PASS' : 'MISS';
    lines.push(`| ${FIELD_LABELS[score.field]} | ${score.scored} | ${scoreCell(score)} | ${target} | ${result} |`);
  }
  lines.push('');

  const { tokens } = report;
  if (tokens.photos > 0) {
    lines.push(
      `- Tokens per photo: mean ${int(tokens.meanInput!)} input / ${int(tokens.meanOutput!)} output; total ${int(tokens.totalInput)} / ${int(tokens.totalOutput)} (${plural(tokens.photos, 'answer')} with usage)`,
    );
    const prices = report.models
      .map((model) => MODEL_PRICES[model])
      .filter((price): price is ModelPrice => price !== undefined)
      .map((price) => `${price.label} $${price.inputPerMillionUsd} / $${price.outputPerMillionUsd} per million input / output tokens, ${price.note}, checked ${price.checkedOn}`);
    lines.push(
      tokens.totalCostUsd === null
        ? '- Cost: unknown (a model in this run has no price in `evals/tagging/scorer.ts`)'
        : `- Cost: mean ${usd(tokens.meanCostUsd!)} per photo, total ${usd(tokens.totalCostUsd)} (${prices.join('; ')})`,
    );
  } else {
    lines.push('- Tokens and cost: no answer reported usage');
  }
  lines.push(
    report.latency.count > 0
      ? `- Latency: p50 ${seconds(report.latency.p50!)}, p95 ${seconds(report.latency.p95!)} (${plural(report.latency.count, 'request')})`
      : '- Latency: no requests',
  );
  lines.push(`- Model calls: ${report.modelCalls} (${plural(report.retried, 'photo')} needed the retry)`);
  const errorList = Object.entries(report.errors)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, n]) => `${code} ${n}`);
  lines.push(`- Errors by code: ${errorList.length > 0 ? errorList.join(', ') : 'none'}`);
  for (const warning of report.warnings) lines.push(`- Note: ${warning}`);
  lines.push('');

  lines.push('### Misses', '');
  if (report.misses.length === 0) {
    lines.push('None.', '');
  } else {
    lines.push('| Photo | Field | Expected | Got |', '| --- | --- | --- | --- |');
    for (const miss of report.misses) {
      const got = miss.score === undefined ? miss.got : `${miss.got} (overlap ${pct(miss.score)})`;
      lines.push(`| ${mdCell(miss.file)} | ${FIELD_LABELS[miss.field]} | ${mdCell(miss.expected)} | ${mdCell(got)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** The header `evals/results.md` starts with when the first run creates it. */
export const RESULTS_FILE_HEADER = `# Eval results

Appended by the eval commands (\`evals/tagging/README.md\`), newest last. Each section is one run against the real AI. Raw runs stay in \`evals/tagging/runs/\` (not committed). No image data and no tokens appear here.
`;

/** Text to append to the results file (`existing` is its current text, or null when missing). */
export function appendResults(existing: string | null, section: string): string {
  const base = existing === null || existing.trim() === '' ? RESULTS_FILE_HEADER : existing;
  return `${base.replace(/\n*$/, '\n')}\n${section.replace(/\n*$/, '\n')}`;
}
