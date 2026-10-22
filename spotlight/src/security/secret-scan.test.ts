import { makeTempDir, removeDir } from '@/data/testing/temp-dir';

import { ALLOWED_PUBLIC_ENV, decodeBase64Url, disallowedPublicEnvNames, scanText, type SecretKind } from './secret-scan';
import {
  fileExists,
  fileSize,
  git,
  isGitIgnored,
  joinPath,
  mkdir,
  readBytes,
  readText,
  REPO_ROOT,
  toBase64Url,
  utf8,
  walkFiles,
  writeFile,
} from './testing/node-files';

const REPO = REPO_ROOT;
/** Generated files with long hashes and no secrets by construction. */
const SKIPPED = [/(^|\/)package-lock\.json$/];
const MAX_FILE_BYTES = 5_000_000;

/**
 * Every file git would commit anywhere in the repository (tracked plus
 * untracked-not-ignored: app, functions, docs, evals, root files). Falls back
 * to walking the folder when git is not available.
 */
function committableFiles(): { files: string[]; source: 'git' | 'walk' } {
  let out: string;
  try {
    out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  } catch {
    return { files: walkFiles(REPO), source: 'walk' };
  }
  return { files: out.split('\0').filter((path) => path.length > 0 && fileExists(joinPath(REPO, path))), source: 'git' };
}

interface FileFinding {
  path: string;
  kind: SecretKind;
  line: number;
}

/** Scans text files under `root` (binary files, with a NUL byte, are skipped). */
function scanFiles(root: string, paths: string[]): FileFinding[] {
  const findings: FileFinding[] = [];
  for (const path of paths) {
    if (SKIPPED.some((pattern) => pattern.test(path))) continue;
    const full = joinPath(root, path);
    if (fileSize(full) > MAX_FILE_BYTES) continue;
    const bytes = readBytes(full);
    if (bytes.includes(0)) continue;
    for (const finding of scanText(new TextDecoder().decode(bytes))) findings.push({ path, ...finding });
  }
  return findings;
}

// Planted secrets, assembled at run time so none sits in the repo as a literal.
const base64Url = (json: object) => toBase64Url(JSON.stringify(json));
const jwt = (claims: object) => `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(claims)}.c2lnbmF0dXJl`;
const PLANTED = {
  anthropic: `const key = "${['sk', 'ant', 'api03'].join('-')}-${'Xy9'.repeat(30)}";`,
  supabaseSecret: `SUPABASE_KEY=${['sb', 'secret'].join('_')}_${'Q'.repeat(30)}`,
  serviceRole: `const k = '${jwt({ iss: 'supabase', role: ['service', 'role'].join('_'), exp: 1 })}';`,
  hexToken: `DEV_TOKEN=${'4f'.repeat(32)}`,
};

describe('scanText', () => {
  it('finds each kind of planted secret, with its line', () => {
    const text = ['// header', PLANTED.anthropic, PLANTED.supabaseSecret, PLANTED.serviceRole, PLANTED.hexToken].join('\n');
    expect(scanText(text)).toEqual([
      { kind: 'anthropic-key', line: 2 },
      { kind: 'supabase-secret-key', line: 3 },
      { kind: 'service-role-jwt', line: 4 },
      { kind: 'hex-token', line: 5 },
    ]);
  });

  it('finds a hex token in upper case and at the start or end of the text', () => {
    expect(scanText('AB'.repeat(32))).toEqual([{ kind: 'hex-token', line: 1 }]);
    expect(scanText(`x\n"${'0a'.repeat(32)}"`)).toEqual([{ kind: 'hex-token', line: 2 }]);
  });

  it('ignores look-alikes that are not secrets', () => {
    const anon = jwt({ iss: 'supabase', role: 'anon' });
    const text = [
      `sha: ${'ab'.repeat(31)}a`, // 63 hex
      `sha512: ${'cd'.repeat(64)}`, // 128 hex: a hash, not a 64-hex token
      `anon: ${anon}`,
      'the words service role and sk ant',
      `publishable: ${['sb', 'publishable'].join('_')}_${'Z'.repeat(20)}`,
    ].join('\n');
    expect(scanText(text)).toEqual([]);
  });

  it('decodes base64url', () => {
    expect(decodeBase64Url(toBase64Url('{"role":"x"}'))).toBe('{"role":"x"}');
  });
});

describe('repository secret scan', () => {
  it('catches secrets planted in files on disk (the same code path as the repo scan)', () => {
    const dir = makeTempDir('secret-scan-');
    try {
      writeFile(joinPath(dir, 'config.ts'), `${PLANTED.anthropic}\n`);
      writeFile(joinPath(dir, '.env'), `${PLANTED.hexToken}\n${PLANTED.supabaseSecret}\n`);
      writeFile(joinPath(dir, 'fixture.json'), JSON.stringify({ key: PLANTED.serviceRole }));
      writeFile(joinPath(dir, 'clean.ts'), 'export const x = 1;\n');
      writeFile(joinPath(dir, 'photo.jpg'), Uint8Array.from([0xff, 0xd8, 0x00, ...utf8(PLANTED.hexToken)]));
      const byPlace = (a: { path: string; line: number }, b: { path: string; line: number }) => a.path.localeCompare(b.path) || a.line - b.line;
      const findings = scanFiles(dir, ['config.ts', '.env', 'fixture.json', 'clean.ts', 'photo.jpg']).sort(byPlace);
      expect(findings).toEqual([
        { path: 'config.ts', kind: 'anthropic-key', line: 1 },
        { path: '.env', kind: 'supabase-secret-key', line: 2 },
        { path: '.env', kind: 'hex-token', line: 1 },
        { path: 'fixture.json', kind: 'service-role-jwt', line: 1 },
      ].sort(byPlace));
    } finally {
      removeDir(dir);
    }
  });

  it('the fallback walk finds planted secrets in nested folders and skips dependency folders', () => {
    const dir = makeTempDir('secret-walk-');
    try {
      for (const folder of ['docs', 'docs/notes', 'evals', 'node_modules', 'node_modules/pkg', '.git']) {
        mkdir(joinPath(dir, folder));
      }
      writeFile(joinPath(dir, 'README.md'), 'clean\n');
      writeFile(joinPath(dir, 'docs/notes/setup.md'), `x\n${PLANTED.anthropic}\n`);
      writeFile(joinPath(dir, 'evals/run.ts'), `${PLANTED.hexToken}\n`);
      writeFile(joinPath(dir, 'node_modules/pkg/index.js'), `${PLANTED.hexToken}\n`);
      writeFile(joinPath(dir, '.git/config'), `${PLANTED.hexToken}\n`);
      const files = walkFiles(dir).sort();
      expect(files).toEqual(['README.md', 'docs/notes/setup.md', 'evals/run.ts']);
      expect(scanFiles(dir, files)).toEqual([
        { path: 'docs/notes/setup.md', kind: 'anthropic-key', line: 2 },
        { path: 'evals/run.ts', kind: 'hex-token', line: 1 },
      ]);
    } finally {
      removeDir(dir);
    }
  });

  it('lists every file git would commit, across the repo, and no env file or Supabase temp state', () => {
    const { files, source } = committableFiles();
    expect(source).toBe('git');
    // Guards against a vacuous pass (wrong folder, git missing).
    expect(files).toEqual(
      expect.arrayContaining([
        'CLAUDE.md',
        '.gitignore',
        'docs/ROADMAP.md',
        'docs/api/tag-item.md',
        'spotlight/package.json',
        'spotlight/src/ai/remote-closet-tagger.ts',
        'supabase/config.toml',
        'supabase/functions/tag-item/index.ts',
      ]),
    );
    expect(files.length).toBeGreaterThan(100);
    const envFiles = files.filter((path) => /(^|\/)\.env/.test(path));
    expect(envFiles).toEqual(['spotlight/.env.example']);
    expect(files.filter((path) => path.startsWith('supabase/.temp/') || path.startsWith('supabase/.branches/'))).toEqual([]);
  });

  it('finds no provider key, secret key, service-role JWT or 64-hex token anywhere in the repo', () => {
    const findings = scanFiles(REPO, committableFiles().files);
    // Locations only, never the matched text.
    expect(findings).toEqual([]);
  });
});

/** Code, JSON, Markdown, `.env*` and `app.config.*` files anywhere in the repo. */
const PUBLIC_ENV_SCANNED = /\.(ts|tsx|js|jsx|cjs|mjs|json|md)$|(^|\/)\.env|(^|\/)app\.config\.[^/]+$/;

describe('environment variables', () => {
  it('checks app.config, Markdown and env files for EXPO_PUBLIC_ names', () => {
    for (const path of ['spotlight/app.config.ts', 'spotlight/app.config.js', 'docs/setup.md', 'spotlight/.env.example', 'app.json']) {
      expect([path, PUBLIC_ENV_SCANNED.test(path)]).toEqual([path, true]);
    }
    expect(PUBLIC_ENV_SCANNED.test('docs/design/mockups/Closet.dc.html')).toBe(false);
  });

  it('the env files are ignored by git, the example is not', () => {
    const ignored = isGitIgnored;
    for (const path of ['spotlight/.env', 'spotlight/.env.local', 'spotlight/.env.production', '.env', 'supabase/.env', 'supabase/functions/.env']) {
      expect([path, ignored(path)]).toEqual([path, true]);
    }
    expect(ignored('spotlight/.env.example')).toBe(false);
  });

  it('only the Supabase URL and publishable key use the EXPO_PUBLIC_ prefix in code, config, env files and docs', () => {
    const { files } = committableFiles();
    const offenders: string[] = [];
    for (const path of files) {
      if (!PUBLIC_ENV_SCANNED.test(path) || /package-lock\.json$/.test(path)) continue;
      const names = disallowedPublicEnvNames(readText(joinPath(REPO, path)));
      offenders.push(...names.map((name) => `${path}: ${name}`));
    }
    expect(offenders).toEqual([]);
    expect(disallowedPublicEnvNames(`EXPO_PUBLIC_${'ANTHROPIC'}_KEY=x\n${ALLOWED_PUBLIC_ENV[0]}=y`)).toEqual([
      `EXPO_PUBLIC_${'ANTHROPIC'}_KEY`,
    ]);
  });

  it('a local spotlight/.env, if present, holds only allowed public names and no secrets', () => {
    const path = joinPath(REPO, 'spotlight', '.env');
    if (!fileExists(path)) return;
    const text = readText(path);
    const names = text
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.startsWith('#'))
      .map((line: string) => line.split('=')[0].trim());
    expect(names.filter((name: string) => !(ALLOWED_PUBLIC_ENV as readonly string[]).includes(name))).toEqual([]);
    expect(scanText(text)).toEqual([]);
  });
});
