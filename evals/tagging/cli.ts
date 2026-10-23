/**
 * Command line for the tagging eval: init, check, run, score.
 * Usage (from `spotlight/`): `npm run eval:tagging -- <command> [options]`.
 * See README.md. This file is the only one here that touches the file
 * system, processes, the network and the token; the logic lives in the
 * plain modules next to it (tested by Jest under `spotlight/src/evals/`).
 *
 * Runs on Node (22.13 or newer) with `--experimental-transform-types`.
 * `run` needs macOS (it uses the built-in `sips` to read HEIC).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkLabels,
  initLabels,
  isPhotoFileName,
  parseLabelTable,
  SHA256_PREFIX,
  serializeLabelTable,
  type CheckResult,
  type LabelTable,
  type PhotoFile,
} from './labels.ts';
import { prepareWithSips, SIPS, type PreparedPhoto } from './prepare.ts';
import { parseRunRecord, type RunPhotoResult, type RunRecord } from './run-record.ts';
import {
  buildRunRecord,
  functionUrl,
  makeTagItemSender,
  parseDotEnv,
  readDevToken,
  runFileName,
  runPhotos,
  serializeRunRecord,
  type EvalPhoto,
  type SendOutcome,
} from './runner.ts';
import { appendResults, estimateCostUsd, formatReport, scoreRun } from './scorer.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULTS = {
  photos: process.env.SPOTLIGHT_EVAL_PHOTOS || path.join(os.homedir(), 'spotlight-eval-photos'),
  labels: path.join(REPO_ROOT, 'evals', 'tagging', 'labels.csv'),
  runs: path.join(REPO_ROOT, 'evals', 'tagging', 'runs'),
  results: path.join(REPO_ROOT, 'evals', 'results.md'),
  tokenFile: path.join(os.homedir(), '.config', 'spotlight', 'dev-token'),
  envFile: path.join(REPO_ROOT, 'spotlight', '.env'),
  promptFile: path.join(REPO_ROOT, 'supabase', 'functions', 'tag-item', 'prompt.ts'),
};

const HELP = `Tagging eval. Run from spotlight/:  npm run eval:tagging -- <command> [options]

Commands:
  init     Add a row to the label file for every new photo (file name and hash filled in).
  check    Check every label and photo hash. Exits 1 on any problem.
  run      Prepare each labelled photo like the app does, send it to the deployed
           tag-item function, save the raw run, then score it (macOS only).
  score    Score a saved run (the newest by default) against the current labels.

Options:
  --photos DIR        Photo folder (default ~/spotlight-eval-photos, or $SPOTLIGHT_EVAL_PHOTOS)
  --labels FILE       Label file (default evals/tagging/labels.csv)
  --results FILE      Results file to append to (default evals/results.md)
  --no-results        Do not append to the results file
  --runs DIR          Folder for raw runs (default evals/tagging/runs, not committed)
  --dry-run           run: prepare every photo, send nothing
  --limit N           run: only the first N labelled photos
  --concurrency N     run: 1 (default) or 2 requests at a time
  --save-prepared DIR run: also save the prepared JPEGs there (outside the repo) to look at
  --run FILE          score: the run file to score
  --token-file FILE   run: dev token file (default ~/.config/spotlight/dev-token)
`;

type Options = Record<string, string | boolean>;
const VALUE_FLAGS = ['photos', 'labels', 'results', 'runs', 'limit', 'concurrency', 'save-prepared', 'run', 'token-file'];
const BOOLEAN_FLAGS = ['dry-run', 'no-results', 'help'];

class UsageError extends Error {}

function parseArgs(argv: string[]): { command: string | null; options: Options } {
  const options: Options = {};
  let command: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') {
      options.help = true;
      continue;
    }
    if (!arg.startsWith('--')) {
      if (command !== null) throw new UsageError(`Unexpected argument "${arg}".`);
      command = arg;
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (BOOLEAN_FLAGS.includes(name)) options[name] = true;
    else if (VALUE_FLAGS.includes(name)) {
      const value = inline ?? argv[++i];
      if (value === undefined || value === '') throw new UsageError(`--${name} needs a value.`);
      options[name] = value;
    } else throw new UsageError(`Unknown option --${name}.`);
  }
  return { command, options };
}

const opt = (options: Options, name: string): string | undefined => (typeof options[name] === 'string' ? (options[name] as string) : undefined);
const expandHome = (p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);
const resolvePath = (p: string) => path.resolve(expandHome(p));
const rel = (p: string) => {
  const relative = path.relative(REPO_ROOT, p);
  return relative.startsWith('..') || path.isAbsolute(relative) ? p : relative;
};

function photoHash(bytes: Uint8Array): string {
  return SHA256_PREFIX + createHash('sha256').update(bytes).digest('base64url');
}

async function listPhotos(dir: string): Promise<PhotoFile[]> {
  if (!existsSync(dir)) {
    throw new UsageError(`The photo folder ${dir} does not exist. Create it and put the photos in it, or pass --photos DIR.`);
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const photos: PhotoFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isPhotoFileName(entry.name)) continue;
    photos.push({ file: entry.name, sha256: photoHash(await fs.readFile(path.join(dir, entry.name))) });
  }
  return photos.sort((a, b) => a.file.localeCompare(b.file));
}

async function readLabels(file: string): Promise<LabelTable | null> {
  if (!existsSync(file)) return null;
  return parseLabelTable(await fs.readFile(file, 'utf8'));
}

function printCheck(result: CheckResult): void {
  for (const problem of result.problems) console.log(`PROBLEM  ${problem}`);
  for (const warning of result.warnings) console.log(`note     ${warning}`);
  console.log(
    `${result.rows} row(s), ${result.labelled} labelled (${result.noTags} expecting no tags). ` +
      (result.problems.length === 0 ? 'No problems.' : `${result.problems.length} problem(s).`),
  );
}

async function commandInit(options: Options): Promise<number> {
  const photosDir = resolvePath(opt(options, 'photos') ?? DEFAULTS.photos);
  const labelsFile = resolvePath(opt(options, 'labels') ?? DEFAULTS.labels);
  const photos = await listPhotos(photosDir);
  const result = initLabels(await readLabels(labelsFile), photos);
  if (result.changed) {
    // Write beside the file, then rename, so a crash never leaves hand-typed labels half-written.
    const temp = `${labelsFile}.tmp`;
    await fs.writeFile(temp, serializeLabelTable(result.table));
    await fs.rename(temp, labelsFile);
  }
  console.log(`Photo folder: ${photosDir} (${photos.length} photo(s))`);
  console.log(`Label file:   ${rel(labelsFile)}${result.changed ? ' (updated)' : ' (unchanged)'}`);
  console.log(`Added ${result.added.length} new row(s)${result.added.length > 0 ? `: ${result.added.join(', ')}` : ''}.`);
  if (result.hashFilled.length > 0) console.log(`Filled the hash for: ${result.hashFilled.join(', ')}.`);
  for (const file of result.hashChanged) {
    console.log(`CHANGED  ${file}: the photo differs from when its row was made. Check its labels, then clear its sha256 cell and run init again.`);
  }
  for (const file of result.missing) console.log(`MISSING  ${file}: has a row but is not in the photo folder.`);
  return result.hashChanged.length > 0 || result.missing.length > 0 ? 1 : 0;
}

async function loadChecked(options: Options, withPhotos: boolean): Promise<{ check: CheckResult; photosDir: string }> {
  const photosDir = resolvePath(opt(options, 'photos') ?? DEFAULTS.photos);
  const labelsFile = resolvePath(opt(options, 'labels') ?? DEFAULTS.labels);
  const table = await readLabels(labelsFile);
  if (!table) throw new UsageError(`No label file at ${labelsFile}. Run init first.`);
  const check = checkLabels(table, withPhotos ? await listPhotos(photosDir) : null);
  return { check, photosDir };
}

async function commandCheck(options: Options): Promise<number> {
  const { check } = await loadChecked(options, true);
  printCheck(check);
  return check.problems.length > 0 ? 1 : 0;
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

async function gitInfo(): Promise<{ commit: string; dirty: boolean }> {
  try {
    const commit = (await run('git', ['-C', REPO_ROOT, 'rev-parse', '--short=12', 'HEAD'])).trim();
    const status = await run('git', ['-C', REPO_ROOT, 'status', '--porcelain']);
    return { commit, dirty: status.trim() !== '' };
  } catch {
    return { commit: 'unknown', dirty: false };
  }
}

async function promptHash(): Promise<string> {
  const text = await fs.readFile(DEFAULTS.promptFile);
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function insideRepo(p: string): boolean {
  const relative = path.relative(REPO_ROOT, p);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function commandRun(options: Options): Promise<number> {
  if (process.platform !== 'darwin' || !existsSync(SIPS)) {
    throw new UsageError('run needs macOS: it uses the built-in sips to read HEIC photos. init, check and score work anywhere.');
  }
  const dryRun = options['dry-run'] === true;
  const concurrency = Number(opt(options, 'concurrency') ?? '1');
  if (concurrency !== 1 && concurrency !== 2) throw new UsageError('--concurrency must be 1 or 2.');
  const limitText = opt(options, 'limit');
  const limit = limitText === undefined ? null : Number(limitText);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new UsageError('--limit must be a whole number of at least 1.');
  const savePrepared = opt(options, 'save-prepared');
  const saveDir = savePrepared ? resolvePath(savePrepared) : null;
  if (saveDir && insideRepo(saveDir)) throw new UsageError('--save-prepared must be a folder outside the repository (these are your photos).');

  const { check, photosDir } = await loadChecked(options, true);
  if (check.problems.length > 0) {
    printCheck(check);
    console.log('Fix the problems above first (nothing was sent).');
    return 1;
  }
  for (const warning of check.warnings) console.log(`note     ${warning}`);
  let selected: EvalPhoto[] = check.expectations.map((e) => ({ file: e.file, sha256: e.sha256, path: path.join(photosDir, e.file) }));
  if (limit !== null) selected = selected.slice(0, limit);
  if (selected.length === 0) {
    console.log('No labelled photos to run. Fill some labels first (see README.md).');
    return 1;
  }

  let send: ((imageBase64: string) => Promise<SendOutcome>) | undefined;
  let url = '';
  let token = '';
  if (!dryRun) {
    if (!existsSync(DEFAULTS.envFile)) throw new UsageError('spotlight/.env is missing; it must set EXPO_PUBLIC_SUPABASE_URL.');
    url = functionUrl(parseDotEnv(await fs.readFile(DEFAULTS.envFile, 'utf8')).EXPO_PUBLIC_SUPABASE_URL);
    const tokenFile = resolvePath(opt(options, 'token-file') ?? DEFAULTS.tokenFile);
    if (!existsSync(tokenFile)) throw new UsageError(`No dev token file at ${tokenFile}.`);
    token = readDevToken(await fs.readFile(tokenFile, 'utf8'));
    send = makeTagItemSender({ url, token, fetch: (input, init) => fetch(input, init), now: () => Date.now() });
    console.log(
      `Sending ${selected.length} photo(s) to ${url}, ${concurrency} at a time. ` +
        `Estimated cost about $${estimateCostUsd(selected.length).toFixed(4)} (an estimate; the run measures it).`,
    );
  } else {
    console.log(`Dry run: preparing ${selected.length} photo(s); nothing is sent.`);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'spotlight-eval-'));
  let counter = 0;
  const startedAt = new Date().toISOString();
  let results: RunPhotoResult[];
  try {
    if (saveDir) await fs.mkdir(saveDir, { recursive: true });
    const prepare = async (photoPath: string): Promise<PreparedPhoto> => {
      const prepared = await prepareWithSips(photoPath, {
        exec: run,
        readBytes: async (p) => new Uint8Array(await fs.readFile(p)),
        tempPath: (name) => path.join(tempDir, `${++counter}-${name}`),
        remove: (p) => fs.rm(p, { force: true }),
      });
      if (saveDir) await fs.writeFile(path.join(saveDir, `${path.basename(photoPath)}.jpg`), prepared.bytes);
      return prepared;
    };
    results = await runPhotos(selected, { prepare, send, log: (line) => console.log(line) }, concurrency);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  const prepareFailures = results.filter((r) => r.errorCode === 'prepare_failed').length;
  if (dryRun) {
    console.log(`Prepared ${results.length - prepareFailures} of ${results.length} photo(s)${saveDir ? `; saved to ${saveDir}` : ''}.`);
    return prepareFailures > 0 ? 1 : 0;
  }

  const git = await gitInfo();
  const record = buildRunRecord({
    startedAt,
    finishedAt: new Date().toISOString(),
    gitCommit: git.commit,
    gitDirty: git.dirty,
    promptHash: await promptHash(),
    functionUrl: url,
    concurrency,
    photos: results,
  });
  const runsDir = resolvePath(opt(options, 'runs') ?? DEFAULTS.runs);
  await fs.mkdir(runsDir, { recursive: true });
  const runFile = path.join(runsDir, runFileName(startedAt));
  await fs.writeFile(runFile, serializeRunRecord(record, [token]));
  console.log(`Saved the raw run to ${rel(runFile)}.`);
  return scoreAndReport(record, runFile, options);
}

async function newestRun(dir: string): Promise<string> {
  const names = existsSync(dir) ? (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort() : [];
  if (names.length === 0) throw new UsageError(`No runs in ${dir}. Run the eval first, or pass --run FILE.`);
  return path.join(dir, names[names.length - 1]);
}

async function scoreAndReport(record: RunRecord, runFile: string, options: Options): Promise<number> {
  const { check } = await loadChecked(options, false);
  if (check.problems.length > 0) {
    printCheck(check);
    console.log('Fix the label problems above, then run score again (the run is saved).');
    return 1;
  }
  const report = scoreRun(check.expectations, record);
  const section = formatReport(report, {
    date: record.startedAt,
    gitCommit: record.gitCommit,
    gitDirty: record.gitDirty,
    promptHash: record.promptHash,
    runFile: rel(runFile),
  });
  console.log('');
  console.log(section);
  if (options['no-results'] !== true) {
    const resultsFile = resolvePath(opt(options, 'results') ?? DEFAULTS.results);
    const existing = existsSync(resultsFile) ? await fs.readFile(resultsFile, 'utf8') : null;
    await fs.writeFile(resultsFile, appendResults(existing, section));
    console.log(`Appended to ${rel(resultsFile)}.`);
  }
  return 0;
}

async function commandScore(options: Options): Promise<number> {
  const runOption = opt(options, 'run');
  const runFile = runOption ? resolvePath(runOption) : await newestRun(resolvePath(opt(options, 'runs') ?? DEFAULTS.runs));
  const record = parseRunRecord(await fs.readFile(runFile, 'utf8'));
  console.log(`Scoring ${rel(runFile)}.`);
  return scoreAndReport(record, runFile, options);
}

async function main(argv: string[]): Promise<number> {
  const { command, options } = parseArgs(argv);
  if (options.help || command === null || command === 'help') {
    console.log(HELP);
    return command === null && !options.help ? 1 : 0;
  }
  switch (command) {
    case 'init':
      return commandInit(options);
    case 'check':
      return commandCheck(options);
    case 'run':
      return commandRun(options);
    case 'score':
      return commandScore(options);
    default:
      throw new UsageError(`Unknown command "${command}". Use init, check, run or score.`);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Messages here never contain the token: it is only read inside commandRun and only sent as a header.
    console.error(error instanceof UsageError ? error.message : `Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
