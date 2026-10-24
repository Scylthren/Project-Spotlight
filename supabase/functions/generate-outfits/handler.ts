/**
 * generate-outfits request handling, independent of Deno so Jest can test
 * it. `index.ts` adapts a `Request` to `GenerateOutfitsHttpRequest` and back.
 * API: `docs/api/generate-outfits.md`.
 *
 * Order of checks, as in tag-item: method (405), token (401; 500 when the
 * secret is unusable), body size, JSON and shape (400), then whether the
 * closet can form any outfit (422 `not_enough_items`, before any model
 * call). Slice 1 answers with the stub (`stubOutfits`), checked by the same
 * composition rules a model's answer will be (`outfit-rules.ts`). Slice 3
 * adds the model key check (500, after the token) and the model call.
 *
 * The adapter drains an unread body before replying (`finishBody` in
 * `_shared/http-body.ts`). Nothing here logs the token, the request text,
 * the closet or the outfits: one line per answered request with counts only.
 */
import { checkDevToken } from '../_shared/dev-token.ts';
import {
  GENERATE_OUTFITS_API_VERSION,
  GENERATE_OUTFITS_MAX_BODY_BYTES,
  missingForOutfit,
  stubOutfits,
  validateGenerateOutfitsRequest,
  type GenerateOutfitsErrorCode,
  type GenerateOutfitsErrorResponse,
  type GenerateOutfitsResponse,
  type OutfitBasePiece,
} from '../_shared/generate-outfits-contract.ts';
import type { CappedBody } from '../_shared/http-body.ts';

import { indexCloset, validateOutfits } from './outfit-rules.ts';

export interface GenerateOutfitsHttpRequest {
  method: string;
  authorization: string | null;
  contentLength: string | null;
  /** Reads the body as UTF-8, giving up once it exceeds `maxBytes`. */
  readBody(maxBytes: number): Promise<CappedBody>;
}

export interface GenerateOutfitsHttpResult {
  status: number;
  headers: Record<string, string>;
  body: GenerateOutfitsResponse | GenerateOutfitsErrorResponse;
}

export interface GenerateOutfitsEnv {
  /** The `DEV_TOKEN` secret. */
  devToken: string | undefined;
  /** One line per answered request; defaults to `console.log`. */
  log?: (line: string) => void;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function failure(
  status: number,
  code: GenerateOutfitsErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {},
  missing?: OutfitBasePiece[],
): GenerateOutfitsHttpResult {
  const error = missing ? { code, message, missing } : { code, message };
  return { status, headers: { ...JSON_HEADERS, ...extraHeaders }, body: { error } };
}

/** What to add, in words, for the not_enough_items message. */
export function notEnoughItemsMessage(missing: readonly OutfitBasePiece[]): string {
  const needsTop = missing.includes('top');
  const needsBottom = missing.includes('bottom');
  const pair = needsTop && needsBottom ? 'a top and a bottom' : needsTop ? 'a top' : 'a bottom';
  return `The closet cannot form an outfit: add ${pair}, or a dress.`;
}

export async function handleGenerateOutfits(
  request: GenerateOutfitsHttpRequest,
  env: GenerateOutfitsEnv,
): Promise<GenerateOutfitsHttpResult> {
  if (request.method !== 'POST') {
    return failure(405, 'method_not_allowed', 'Use POST.', { Allow: 'POST' });
  }

  const auth = checkDevToken(request.authorization, env.devToken);
  if (auth === 'misconfigured') return failure(500, 'server_misconfigured', 'The function is not configured.');
  if (auth === 'unauthorized') return failure(401, 'unauthorized', 'Missing or wrong token.');

  const tooLarge = `The body is larger than ${GENERATE_OUTFITS_MAX_BODY_BYTES} bytes.`;
  const declared = request.contentLength === null ? null : Number(request.contentLength);
  if (declared !== null && Number.isFinite(declared) && declared > GENERATE_OUTFITS_MAX_BODY_BYTES) {
    return failure(400, 'too_large', tooLarge);
  }
  const body = await request.readBody(GENERATE_OUTFITS_MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === 'too_large' ? failure(400, 'too_large', tooLarge) : failure(400, 'bad_request', 'The body could not be read.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return failure(400, 'bad_request', 'The body is not valid JSON.');
  }
  const valid = validateGenerateOutfitsRequest(parsed);
  if (!valid.ok) return failure(400, 'bad_request', valid.reason);
  const { items, avoid = [] } = valid.value;

  const missing = missingForOutfit(items);
  if (missing.length > 0) return failure(422, 'not_enough_items', notEnoughItemsMessage(missing), {}, missing);

  // Slice 1: the stub. Its picks go through the same checks as a model's will,
  // including skipping the looks in `avoid` (Restyle).
  const checked = validateOutfits(stubOutfits(items, avoid), indexCloset(items), avoid);
  const log = env.log ?? ((line) => console.log(line));
  log(
    JSON.stringify({
      fn: 'generate-outfits',
      event: 'stub',
      items: items.length,
      outfits: checked.outfits.length,
      rejected: checked.rejected.length,
      avoid: avoid.length,
      avoided: checked.avoided,
    }),
  );
  const response: GenerateOutfitsResponse = { apiVersion: GENERATE_OUTFITS_API_VERSION, outfits: checked.outfits, stub: true };
  return { status: 200, headers: { ...JSON_HEADERS }, body: response };
}
