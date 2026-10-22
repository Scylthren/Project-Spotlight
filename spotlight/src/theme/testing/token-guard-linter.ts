/**
 * TEST-ONLY: runs the token guard through ESLint with the project's real
 * `eslint.config.js`, so the test fails if the config stops applying the
 * guard. Node and ESLint are typed locally because the app's tsconfig
 * deliberately does not load Node's types.
 *
 * The config is `require`d and passed as `overrideConfig` (with
 * `overrideConfigFile: true`) instead of being found on disk: ESLint loads
 * config files with a dynamic `import()`, which Jest does not support without
 * experimental flags. It is the same config array `npm run lint` uses.
 */

interface LintMessage {
  ruleId: string | null;
  message: string;
  line: number;
  fatal?: boolean;
}
interface ResolvedConfig {
  rules?: Record<string, unknown>;
}
interface ESLintInstance {
  lintText(code: string, options: { filePath: string }): Promise<{ messages: LintMessage[] }[]>;
  calculateConfigForFile(filePath: string): Promise<ResolvedConfig | undefined>;
}

// Provided by Jest's CommonJS module wrapper.
declare const __dirname: string;

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs') as {
  readdirSync(dir: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
  readFileSync(file: string, encoding: 'utf8'): string;
};
const path = require('node:path') as { join(...parts: string[]): string };
const { ESLint } = require('eslint') as {
  ESLint: new (options: { cwd: string; overrideConfigFile: true; overrideConfig: unknown }) => ESLintInstance;
};

/** `spotlight/`, the folder the guard's globs are relative to. */
export const APP_ROOT = path.join(__dirname, '..', '..', '..');

const projectConfig: unknown = require(path.join(APP_ROOT, 'eslint.config.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

const eslint = new ESLint({ cwd: APP_ROOT, overrideConfigFile: true, overrideConfig: projectConfig });

/**
 * Where fixture text is linted: a guarded path that is neither exempt nor
 * allowlisted (the file does not exist; ESLint only uses the path).
 */
export const FIXTURE_FILE = 'src/components/__token-guard-fixture__.tsx';

function fixtureFileFor(extension: string): string {
  return FIXTURE_FILE.replace(/\.tsx$/, `.${extension}`);
}

const SOURCE_FILE = /\.(?:js|jsx|ts|tsx)$/;

export interface GuardViolation {
  line: number;
  message: string;
}

/**
 * Token guard violations in `code`, linted with the project config as if it
 * were `FIXTURE_FILE` (with `extension`, so `.ts` code is not parsed as TSX).
 * Throws if the code does not parse.
 */
export async function findTokenViolations(code: string, extension = 'tsx'): Promise<GuardViolation[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(APP_ROOT, fixtureFileFor(extension)) });
  const fatal = result.messages.find((m) => m.fatal);
  if (fatal) throw new Error(`fixture does not parse: ${fatal.message}`);
  return result.messages
    .filter((m) => m.ruleId === 'no-restricted-syntax')
    .map((m) => ({ line: m.line, message: m.message }));
}

/** The guard rule's resolved setting for `file` (relative to `spotlight/`), or undefined if it does not apply. */
export async function guardRuleFor(file: string): Promise<unknown> {
  const config = await eslint.calculateConfigForFile(path.join(APP_ROOT, file));
  return config?.rules?.['no-restricted-syntax'];
}

/** Token guard violations in an app file's text, linted at the fixture path (so allowlisted files are checked too). */
export function findFileViolations(file: string): Promise<GuardViolation[]> {
  const extension = file.slice(file.lastIndexOf('.') + 1);
  return findTokenViolations(fs.readFileSync(path.join(APP_ROOT, file), 'utf8'), extension);
}

/** Every JS/TS source file under `src/`, relative to `spotlight/`, sorted. */
export function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (relDir: string) => {
    for (const entry of fs.readdirSync(path.join(APP_ROOT, relDir), { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (SOURCE_FILE.test(entry.name)) found.push(rel);
    }
  };
  walk('src');
  return found.sort();
}
