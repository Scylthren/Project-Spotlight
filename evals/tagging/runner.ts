/**
 * Sends prepared eval photos to the deployed tag-item function and records
 * what came back. Never calls the model provider directly. Plain TypeScript:
 * `fetch`, the clock, preparing and logging are injected (`cli.ts` wires the
 * real ones; Jest uses fakes, never the network).
 *
 * The token goes only into the Authorization header. It is never logged and
 * never written: the run record holds file names, hashes, sizes, statuses,
 * error codes (never error messages), tags and token counts, and
 * `serializeRunRecord` refuses to write anything containing the token or
 * image data.
 */
import {
  readTagItemUsage,
  tagItemErrorCode,
  validateTagItemResponse,
  type TagItemRequest,
} from '../../supabase/functions/_shared/tag-item-contract.ts';

import type { PreparedPhoto } from './prepare.ts';
import { RUN_RECORD_KIND, RUN_RECORD_VERSION, type RunPhotoResult, type RunRecord } from './run-record.ts';

/** Client timeout per request: above the function's 16 s model budget plus upload time. */
export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_CONCURRENCY = 2;

/** `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/tag-item`; the base must be https. */
export function functionUrl(supabaseUrl: string | undefined): string {
  const base = (supabaseUrl ?? '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(base)) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL in spotlight/.env must be the https project URL (https://<ref>.supabase.co).');
  }
  return `${base}/functions/v1/tag-item`;
}

/** Reads KEY=VALUE lines (optional quotes, # comments) from a .env file's text. */
export function parseDotEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at).trim().replace(/^export\s+/, '');
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

/** The dev token from its file's text; throws (without echoing the text) when empty or multi-line. */
export function readDevToken(text: string): string {
  const token = text.trim();
  if (token === '' || /\s/.test(token)) {
    throw new Error('The dev token file must hold exactly one token (see evals/tagging/README.md).');
  }
  return token;
}

export interface SendOutcome {
  httpStatus: number | null;
  latencyMs: number;
  /** Parsed JSON body, or null when there was none or it was not JSON. */
  body: unknown;
  failure: 'network' | 'timeout' | null;
}

export interface SenderConfig {
  url: string;
  token: string;
  fetch: typeof fetch;
  now: () => number;
  timeoutMs?: number;
}

/** Makes the function that POSTs one image. Never throws; never includes the token in what it returns. */
export function makeTagItemSender(config: SenderConfig): (imageBase64: string) => Promise<SendOutcome> {
  const timeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return async (imageBase64) => {
    const request: TagItemRequest = { imageBase64, contentType: 'image/jpeg' };
    const started = config.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve('timeout');
      }, timeoutMs);
    });
    const work = (async (): Promise<{ status: number; text: string } | 'network'> => {
      try {
        const response = await config.fetch(config.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        return { status: response.status, text: await response.text() };
      } catch {
        return 'network';
      }
    })();
    try {
      const result = await Promise.race([work, expired]);
      const latencyMs = Math.max(0, Math.round(config.now() - started));
      if (result === 'timeout') {
        work.catch(() => undefined);
        return { httpStatus: null, latencyMs, body: null, failure: 'timeout' };
      }
      if (result === 'network') return { httpStatus: null, latencyMs, body: null, failure: 'network' };
      let body: unknown = null;
      try {
        body = JSON.parse(result.text);
      } catch {
        body = null;
      }
      return { httpStatus: result.status, latencyMs, body, failure: null };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Turns one answer into the recorded result. Keeps error codes only, never error messages. */
export function interpretOutcome(
  photo: { file: string; sha256: string },
  prepared: PreparedPhoto,
  outcome: SendOutcome,
): RunPhotoResult {
  const base = {
    file: photo.file,
    sha256: photo.sha256,
    prepared: { width: prepared.width, height: prepared.height, bytes: prepared.bytes.length },
    httpStatus: outcome.httpStatus,
    latencyMs: outcome.latencyMs,
  };
  const error = (errorCode: string, usage = readTagItemUsage(outcome.body)): RunPhotoResult => ({
    ...base,
    status: 'error',
    errorCode,
    tags: null,
    usage,
  });
  if (outcome.failure) return error(outcome.failure, null);
  if (outcome.httpStatus !== 200) {
    return error(tagItemErrorCode(outcome.body) ?? `http_${outcome.httpStatus}`, null);
  }
  const valid = validateTagItemResponse(outcome.body);
  if (!valid.ok) return error('invalid_response');
  if (valid.value.stub) return error('stub');
  return { ...base, status: 'ok', errorCode: null, tags: valid.value.tags, usage: readTagItemUsage(outcome.body) };
}

export interface EvalPhoto {
  file: string;
  sha256: string;
  /** Full path of the photo file. */
  path: string;
}

export interface RunDeps {
  prepare(path: string): Promise<PreparedPhoto>;
  /** Absent for a dry run: nothing is sent. */
  send?: (imageBase64: string) => Promise<SendOutcome>;
  log(line: string): void;
}

/** Message of a preparation failure, safe to print (no paths beyond the file name). */
function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/**
 * Prepares and (unless dry) sends every photo, at most `concurrency`
 * (1 or 2) at a time. Results come back in input order. A photo that cannot
 * be prepared is recorded as `prepare_failed` and nothing is sent for it.
 */
export async function runPhotos(photos: readonly EvalPhoto[], deps: RunDeps, concurrency = 1): Promise<RunPhotoResult[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`concurrency must be 1 or ${MAX_CONCURRENCY}`);
  }
  const results: RunPhotoResult[] = new Array(photos.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < photos.length) {
      const index = next++;
      const photo = photos[index];
      let prepared: PreparedPhoto;
      try {
        prepared = await deps.prepare(photo.path);
      } catch (error) {
        results[index] = {
          file: photo.file,
          sha256: photo.sha256,
          prepared: null,
          status: 'error',
          httpStatus: null,
          errorCode: 'prepare_failed',
          latencyMs: null,
          tags: null,
          usage: null,
        };
        deps.log(`[${++done}/${photos.length}] ${photo.file}: not sent, could not prepare it: ${failureMessage(error)}`);
        continue;
      }
      const size = `${prepared.width}x${prepared.height}, ${Math.round(prepared.bytes.length / 1024)} KB`;
      if (!deps.send) {
        results[index] = {
          file: photo.file,
          sha256: photo.sha256,
          prepared: { width: prepared.width, height: prepared.height, bytes: prepared.bytes.length },
          status: 'ok',
          httpStatus: null,
          errorCode: null,
          latencyMs: null,
          tags: null,
          usage: null,
        };
        deps.log(`[${++done}/${photos.length}] ${photo.file}: prepared (${size}), not sent (dry run)`);
        continue;
      }
      const result = interpretOutcome(photo, prepared, await deps.send(prepared.base64));
      results[index] = result;
      const what = result.status === 'ok' ? `${result.tags?.category ?? 'no category'}` : `error ${result.errorCode}`;
      deps.log(`[${++done}/${photos.length}] ${photo.file}: ${result.httpStatus ?? '-'} ${what} in ${result.latencyMs} ms (${size})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, photos.length)) }, worker));
  return results;
}

export function buildRunRecord(fields: Omit<RunRecord, 'kind' | 'version'>): RunRecord {
  return { kind: RUN_RECORD_KIND, version: RUN_RECORD_VERSION, ...fields };
}

/** The start of every base64 JPEG (FF D8 FF). */
const BASE64_JPEG_START = '/9j/';

/**
 * JSON text of the run, refusing (throws) when it contains any of
 * `secrets` or anything that looks like base64 image data.
 */
export function serializeRunRecord(record: RunRecord, secrets: readonly string[]): string {
  const text = `${JSON.stringify(record, null, 2)}\n`;
  for (const secret of secrets) {
    if (secret.length > 0 && text.includes(secret)) throw new Error('refusing to write the run: it contains the token');
  }
  if (text.includes(BASE64_JPEG_START)) throw new Error('refusing to write the run: it contains image data');
  return text;
}

/** File name for a run started at `iso` (an ISO date-time), sortable by time. */
export function runFileName(iso: string): string {
  return `${iso.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')}.json`;
}
