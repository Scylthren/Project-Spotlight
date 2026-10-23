/**
 * Tagging eval (Gate 2 slice 4): scoring rules, cost math and the results
 * section. Pure functions over fake runs; nothing is sent anywhere.
 */
import type { ItemTags } from '../../../supabase/functions/_shared/tag-item-contract.ts';
import { checkLabels, LABEL_COLUMNS, parseLabelTable, type Expectation } from '../../../evals/tagging/labels.ts';
import { RUN_RECORD_KIND, RUN_RECORD_VERSION, parseRunRecord, type RunPhotoResult, type RunRecord } from '../../../evals/tagging/run-record.ts';
import {
  appendResults,
  costUsd,
  estimateCostUsd,
  formatReport,
  MODEL_PRICES,
  overlap,
  percentile,
  RESULTS_FILE_HEADER,
  scorePhoto,
  scoreRun,
  TARGETS,
  typeMatches,
  type FieldScore,
  type ScoreField,
} from '../../../evals/tagging/scorer.ts';

const hash = (seed: string) => `sha256-${seed.repeat(43).slice(0, 43)}`;

const TAGS: ItemTags = {
  category: 'top',
  colors: ['navy', 'white', 'grey'],
  seasons: ['spring', 'autumn'],
  type: 'Oxford Shirt',
  pattern: 'striped',
  material: 'cotton',
  fit: 'regular',
  formality: 'smart-casual',
};

const USAGE = { model: 'claude-haiku-5-5', attempts: 1, inputTokens: 2000, outputTokens: 80 };

/** Expectations from CSV lines (the same path the CLI uses). */
function expectations(...lines: string[]): Expectation[] {
  const text = [LABEL_COLUMNS.join(','), ...lines].join('\n');
  const result = checkLabels(parseLabelTable(text), null);
  expect(result.problems).toEqual([]);
  return result.expectations;
}

function ok(file: string, tags: ItemTags, extra: Partial<RunPhotoResult> = {}): RunPhotoResult {
  return {
    file,
    sha256: hash(file[0]),
    prepared: { width: 768, height: 1024, bytes: 120_000 },
    status: 'ok',
    httpStatus: 200,
    errorCode: null,
    latencyMs: 2000,
    tags,
    usage: USAGE,
    ...extra,
  };
}

function failed(file: string, errorCode: string, extra: Partial<RunPhotoResult> = {}): RunPhotoResult {
  return { ...ok(file, TAGS), status: 'error', errorCode, tags: null, usage: null, httpStatus: 503, ...extra };
}

function runOf(...photos: RunPhotoResult[]): RunRecord {
  return {
    kind: RUN_RECORD_KIND,
    version: RUN_RECORD_VERSION,
    startedAt: '2026-10-23T10:00:00.000Z',
    finishedAt: '2026-10-23T10:01:00.000Z',
    gitCommit: 'abc123def456',
    gitDirty: false,
    promptHash: '0123456789ab',
    functionUrl: 'https://example.supabase.co/functions/v1/tag-item',
    concurrency: 1,
    photos,
  };
}

function field(scores: FieldScore[], name: ScoreField): FieldScore {
  return scores.find((score) => score.field === name)!;
}

const pointsOf = (scores: ReturnType<typeof scorePhoto>) => Object.fromEntries(scores.map((s) => [s.field, s.points]));

describe('scorePhoto', () => {
  it('scores every labelled field, accepting listed alternatives and matching type case-insensitively', () => {
    const [expectation] = expectations(
      `a.heic,${hash('a')},outerwear|top,black|navy,white;grey|light-grey,autumn;spring,oxford  shirt|Shirt,striped,cotton|linen,regular,smart casual,`,
    );
    expect(pointsOf(scorePhoto(expectation, TAGS, null))).toEqual({
      category: 1,
      primary_color: 1,
      other_colors: 1,
      seasons: 1,
      seasons_overlap: 1,
      type: 1,
      pattern: 1,
      material: 1,
      fit: 1,
      formality: 1,
    });
  });

  it('type passes when the words of an alternative appear in order in the answer', () => {
    expect(typeMatches('t-shirt', 'Graphic t-shirt')).toBe(true);
    expect(typeMatches('T-Shirt', 'graphic T SHIRT')).toBe(true);
    expect(typeMatches('button-up shirt', 'Floral button-up shirt')).toBe(true);
    expect(typeMatches('wallet', 'Leather wallet')).toBe(true);
    expect(typeMatches('necklace', 'Jade pendant necklace')).toBe(true);
    expect(typeMatches('Oxford Shirt', 'Oxford Shirt')).toBe(true);
    // Whole words, in order: no partial words, no reordering, nothing extra.
    expect(typeMatches('heels', 'Strappy sandals')).toBe(false);
    expect(typeMatches('tee', 'Teeshirt')).toBe(false);
    expect(typeMatches('shirt button-up', 'Button-up shirt')).toBe(false);
    expect(typeMatches('messenger bag', 'Leather briefcase')).toBe(false);
    expect(typeMatches('denim jacket', 'Jacket')).toBe(false);
    // none matches only no answer.
    expect(typeMatches(null, null)).toBe(true);
    expect(typeMatches(null, 'Belt')).toBe(false);
    expect(typeMatches('belt', null)).toBe(false);

    const [expectation] = expectations(`a.heic,${hash('a')},,,,,Tee|T-shirt,,,,,`);
    expect(pointsOf(scorePhoto(expectation, { ...TAGS, type: 'Graphic t-shirt' }, null))).toEqual({ type: 1 });
    expect(pointsOf(scorePhoto(expectation, { ...TAGS, type: 'Polo shirt' }, null))).toEqual({ type: 0 });
    expect(pointsOf(scorePhoto(expectation, null, 'timeout'))).toEqual({ type: 0 });
  });

  it('primary color is the first color returned, not any color', () => {
    const [expectation] = expectations(`a.heic,${hash('a')},,white,,,,,,,,`);
    expect(pointsOf(scorePhoto(expectation, TAGS, null))).toEqual({ primary_color: 0 });
  });

  it('none matches no answer and only no answer', () => {
    const [expectation] = expectations(`a.heic,${hash('a')},,,none,none,none,none,none,none,none,`);
    const empty: ItemTags = { ...TAGS, colors: ['navy'], seasons: [], type: null, pattern: null, material: null, fit: null, formality: null };
    expect(pointsOf(scorePhoto(expectation, empty, null))).toEqual({
      other_colors: 1,
      seasons: 1,
      seasons_overlap: 1,
      type: 1,
      pattern: 1,
      material: 1,
      fit: 1,
      formality: 1,
    });
    const scores = pointsOf(scorePhoto(expectation, TAGS, null));
    expect(Object.values(scores).every((points) => points === 0)).toBe(true);
  });

  it('scores other colors and seasons as overlap, seasons also exact', () => {
    const [expectation] = expectations(`a.heic,${hash('a')},,,white;red,spring;summer;autumn,,,,,,`);
    const scores = pointsOf(scorePhoto(expectation, TAGS, null));
    // others returned: white, grey; expected white, red: 1 matched of 3 distinct.
    expect(scores.other_colors).toBeCloseTo(1 / 3);
    expect(scores.seasons).toBe(0);
    // returned spring, autumn; expected spring, summer, autumn: 2 of 3.
    expect(scores.seasons_overlap).toBeCloseTo(2 / 3);
  });

  it('a failed photo scores 0 on every labelled field and shows the error', () => {
    const [expectation] = expectations(`a.heic,${hash('a')},top,navy,none,all,Shirt,striped,cotton,regular,casual,`);
    const scores = scorePhoto(expectation, null, 'upstream_timeout');
    expect(scores).toHaveLength(10);
    expect(scores.every((score) => score.points === 0 && score.got === 'error upstream_timeout')).toBe(true);
  });
});

describe('overlap and percentile', () => {
  it('overlap counts each returned value once and is 1 for two empty sets', () => {
    expect(overlap([], [])).toBe(1);
    expect(overlap([['a']], [])).toBe(0);
    expect(overlap([], ['a'])).toBe(0);
    expect(overlap([['a', 'b'], ['b']], ['b'])).toBeCloseTo(1 / 2);
    expect(overlap([['a', 'b'], ['b']], ['a', 'b'])).toBe(1);
  });

  it('nearest-rank percentiles', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(values, 50)).toBe(1000);
    expect(percentile(values, 95)).toBe(1900);
    expect(percentile([3, 1, 2], 50)).toBe(2);
  });
});

describe('cost', () => {
  it('uses the Haiku 5.5 prices with a checked-on date', () => {
    const price = MODEL_PRICES['claude-haiku-5-5'];
    expect(price).toMatchObject({ inputPerMillionUsd: 0.1, outputPerMillionUsd: 0.5 });
    expect(price.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(costUsd(1_000_000, 0, price)).toBeCloseTo(0.1, 10);
    expect(costUsd(0, 1_000_000, price)).toBeCloseTo(0.5, 10);
    expect(costUsd(2000, 80, price)).toBeCloseTo(0.00024, 10);
  });

  it('estimates about $0.0003 per photo, about a cent for 30', () => {
    expect(estimateCostUsd(1)).toBeCloseTo(0.0003, 6);
    expect(estimateCostUsd(30)).toBeCloseTo(0.009, 6);
  });
});

describe('scoreRun', () => {
  it('reports per-field accuracy, targets, misses, tokens, cost, latency and errors', () => {
    const labels = expectations(
      `a.heic,${hash('a')},top,navy,,,,,,,,`,
      `b.png,${hash('b')},top|outerwear,black,,,,,,,,`,
      `c.jpg,${hash('c')},bottom,denim-blue,,,,,,,,`,
      `d.jpg,${hash('d')},none,,,,,,,,,`,
      `e.jpg,${hash('e')},none,,,,,,,,,`,
      `f.jpg,${hash('f')},shoes,,,,,,,,,`,
    );
    const run = runOf(
      ok('a.heic', TAGS, { latencyMs: 1000 }),
      ok('b.png', { ...TAGS, category: 'outerwear' }, { latencyMs: 3000, usage: { ...USAGE, attempts: 2, inputTokens: 4000, outputTokens: 160 } }),
      ok('c.jpg', { ...TAGS, category: 'bottom', colors: ['blue'] }, { latencyMs: 2000 }),
      ok('d.jpg', { ...TAGS, category: null, colors: [], seasons: [] }, { latencyMs: 1500 }),
      ok('e.jpg', TAGS, { latencyMs: 2500 }),
      failed('f.jpg', 'upstream_timeout', { latencyMs: 16000, httpStatus: 504 }),
    );
    const report = scoreRun(labels, run);
    expect(report.photos).toBe(6);
    expect(field(report.fields, 'category')).toEqual({ field: 'category', scored: 6, points: 4, accuracy: 4 / 6, target: 0.9, pass: false });
    expect(field(report.fields, 'primary_color')).toMatchObject({ scored: 3, points: 1, target: 0.85, pass: false });
    expect(field(report.fields, 'pattern')).toMatchObject({ scored: 0, accuracy: null, target: null, pass: null });
    expect(report.noTags).toEqual({ rows: 2, passed: 1 });
    expect(report.misses).toEqual([
      { file: 'b.png', field: 'primary_color', expected: 'black', got: 'navy' },
      { file: 'c.jpg', field: 'primary_color', expected: 'denim-blue', got: 'blue' },
      { file: 'e.jpg', field: 'category', expected: 'none', got: 'top' },
      { file: 'f.jpg', field: 'category', expected: 'shoes', got: 'error upstream_timeout' },
    ]);
    expect(report.tokens).toEqual({
      photos: 5,
      totalInput: 12_000,
      totalOutput: 480,
      meanInput: 2400,
      meanOutput: 96,
      totalCostUsd: expect.closeTo(0.00144, 10),
      meanCostUsd: expect.closeTo(0.000288, 10),
    });
    expect(report.latency).toEqual({ count: 6, p50: 2000, p95: 16000 });
    expect(report.errors).toEqual({ upstream_timeout: 1 });
    expect(report.modelCalls).toBe(6);
    expect(report.retried).toBe(1);
    expect(report.models).toEqual(['claude-haiku-5-5']);
    expect(report.warnings).toEqual([]);
  });

  it('a row expecting no tags passes only when no category comes back, and fails when the photo errors', () => {
    const labels = expectations(`d.jpg,${hash('d')},none,,,,,,,,,`);
    expect(scoreRun(labels, runOf(ok('d.jpg', { ...TAGS, category: null }))).noTags).toEqual({ rows: 1, passed: 1 });
    expect(scoreRun(labels, runOf(failed('d.jpg', 'invalid_response'))).noTags).toEqual({ rows: 1, passed: 0 });
    expect(field(scoreRun(labels, runOf(failed('d.jpg', 'invalid_response'))).fields, 'category').points).toBe(0);
  });

  it('a photo that could not be prepared counts as a miss for every labelled field and is not a request', () => {
    const labels = expectations(`a.heic,${hash('a')},top,navy,,,Shirt,,,,,`);
    const report = scoreRun(labels, runOf(failed('a.heic', 'prepare_failed', { latencyMs: null, httpStatus: null, prepared: null })));
    expect(report.misses.map((miss) => miss.field)).toEqual(['category', 'primary_color', 'type']);
    expect(report.latency.count).toBe(0);
    expect(report.errors).toEqual({ prepare_failed: 1 });
  });

  it('warns about photos without a labelled row and changed hashes', () => {
    const labels = expectations(`a.heic,${hash('z')},top,,,,,,,,,`);
    const report = scoreRun(labels, runOf(ok('a.heic', TAGS), ok('x.jpg', TAGS)));
    expect(report.photos).toBe(1);
    expect(report.warnings).toEqual([
      "a.heic: the labels' hash differs from the run's; the photo or its row changed since the run.",
      'x.jpg is in the run but has no labelled row; not scored.',
    ]);
  });

  it('gives no cost when a model has no price', () => {
    const labels = expectations(`a.heic,${hash('a')},top,,,,,,,,,`);
    const report = scoreRun(labels, runOf(ok('a.heic', TAGS, { usage: { ...USAGE, model: 'claude-sonnet-5-5' } })));
    expect(report.tokens.totalCostUsd).toBeNull();
    expect(report.tokens.meanCostUsd).toBeNull();
    expect(formatReport(report, meta())).toContain('Cost: unknown');
  });

  it('targets are category 90% and primary color 85%; meeting one exactly passes', () => {
    expect(TARGETS).toEqual({ category: 0.9, primary_color: 0.85 });
    const rows = Array.from({ length: 10 }, (_, i) => `p${i}.jpg,${hash('p')},top,,,,,,,,,`);
    const photos = Array.from({ length: 10 }, (_, i) => ok(`p${i}.jpg`, i === 0 ? { ...TAGS, category: 'dress' } : TAGS));
    expect(field(scoreRun(expectations(...rows), runOf(...photos)).fields, 'category').pass).toBe(true);
  });
});

function meta() {
  return { date: '2026-10-23T10:00:00.000Z', gitCommit: 'abc123def456', gitDirty: true, promptHash: '0123456789ab', runFile: 'evals/tagging/runs/x.json' };
}

describe('formatReport and appendResults', () => {
  const labels = expectations(
    `a.heic,${hash('a')},top|outerwear,navy,,,,,,,,`,
    `b.png,${hash('b')},dress,red,,,,,,,,`,
  );
  const run = runOf(ok('a.heic', TAGS), failed('b.png', 'upstream_unavailable'));

  it('has the date, commit, model, prompt hash, photo count, the table with PASS/MISS, and the misses', () => {
    const text = formatReport(scoreRun(labels, run), meta());
    expect(text).toContain('## Tagging eval, 2026-10-23 10:00:00 UTC');
    expect(text).toContain('- Commit: `abc123def456` (with uncommitted changes)');
    expect(text).toContain('- Model: claude-haiku-5-5');
    expect(text).toContain('- Prompt hash: `0123456789ab`');
    expect(text).toContain('- Photos: 2 scored, 1 error');
    expect(text).toContain('| Category | 2 | 50.0% (1/2) | >= 90% | MISS |');
    expect(text).toContain('| Primary color | 2 | 50.0% (1/2) | >= 85% | MISS |');
    expect(text).toContain('| Pattern | 0 | n/a |  |  |');
    expect(text).toContain('- Errors by code: upstream_unavailable 1');
    expect(text).toContain('| b.png | Category | dress | error upstream_unavailable |');
    expect(text).toMatch(/Cost: mean \$0\.000240 per photo, total \$0\.000240 \(Claude Haiku 5\.5 \$0\.1 \/ \$0\.5 per million/);
    expect(text).toContain('- Latency: p50 2.00 s, p95 2.00 s (2 requests)');
  });

  it('escapes | in table cells (alternatives)', () => {
    const report = scoreRun(labels, runOf(ok('a.heic', { ...TAGS, category: 'dress' }), ok('b.png', TAGS)));
    expect(formatReport(report, meta())).toContain('| a.heic | Category | top\\|outerwear | dress |');
  });

  it('holds no image data, token or URL', () => {
    const text = formatReport(scoreRun(labels, run), meta());
    expect(text).not.toContain('/9j/');
    expect(text).not.toMatch(/Bearer|https:\/\//);
    expect(text).not.toMatch(/[0-9a-f]{64}/i);
  });

  it('creates the results file with a header, then appends dated sections', () => {
    const first = appendResults(null, '## one\n');
    expect(first.startsWith(RESULTS_FILE_HEADER)).toBe(true);
    expect(first.endsWith('\n## one\n')).toBe(true);
    const second = appendResults(first, '## two\n\n');
    expect(second).toBe(`${first}\n## two\n`);
  });
});

describe('parseRunRecord', () => {
  it('reads a saved run and rejects anything else', () => {
    const run = runOf(ok('a.heic', TAGS));
    expect(parseRunRecord(JSON.stringify(run))).toEqual(run);
    expect(() => parseRunRecord('nope')).toThrow('not JSON');
    expect(() => parseRunRecord('{"kind":"other"}')).toThrow('not a tagging eval run');
  });
});
