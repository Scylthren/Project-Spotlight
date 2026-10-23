/**
 * The saved form of one eval run (`evals/tagging/runs/<timestamp>.json`,
 * gitignored). Holds no image data and no token: only file names, hashes,
 * sizes, statuses, the returned tags and token counts.
 */
import type { ItemTags, TagItemUsage } from '../../supabase/functions/_shared/tag-item-contract.ts';

export const RUN_RECORD_KIND = 'spotlight-tagging-eval-run';
export const RUN_RECORD_VERSION = 1;

/**
 * Why a photo has no tags. Contract error codes (`unauthorized`,
 * `upstream_timeout`, ...) come from the function; the rest from the runner:
 * `prepare_failed` (the photo could not be converted or still had metadata;
 * nothing was sent), `network`, `timeout` (no answer in time),
 * `invalid_response` (a 200 the contract rejects), `stub` (a canned answer),
 * `http_<status>` (any other status without a known code).
 */
export type RunErrorCode = string;

export interface RunPhotoResult {
  file: string;
  /** The labels' hash of the photo when it was sent. */
  sha256: string;
  /** The JPEG that was (or would have been) sent; absent when preparing failed. */
  prepared: { width: number; height: number; bytes: number } | null;
  status: 'ok' | 'error';
  /** HTTP status, or null when no answer arrived (or nothing was sent). */
  httpStatus: number | null;
  errorCode: RunErrorCode | null;
  /** Request start to full answer, in ms; null when nothing was sent. */
  latencyMs: number | null;
  tags: ItemTags | null;
  /** From the function's `usage` (model, attempts, tokens); null when absent. */
  usage: TagItemUsage | null;
}

export interface RunRecord {
  kind: typeof RUN_RECORD_KIND;
  version: typeof RUN_RECORD_VERSION;
  startedAt: string;
  finishedAt: string;
  /** Short commit id of the repo when the run started. */
  gitCommit: string;
  /** True when the working tree had uncommitted changes. */
  gitDirty: boolean;
  /** First 12 hex digits of the SHA-256 of `supabase/functions/tag-item/prompt.ts` (local file). */
  promptHash: string;
  /** The function URL (public; built from EXPO_PUBLIC_SUPABASE_URL). */
  functionUrl: string;
  concurrency: number;
  photos: RunPhotoResult[];
}

/** Reads a saved run; throws with a plain message when the file is not one. */
export function parseRunRecord(text: string): RunRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('the run file is not JSON');
  }
  const record = value as Partial<RunRecord> | null;
  if (!record || record.kind !== RUN_RECORD_KIND || record.version !== RUN_RECORD_VERSION || !Array.isArray(record.photos)) {
    throw new Error('the file is not a tagging eval run');
  }
  return record as RunRecord;
}
