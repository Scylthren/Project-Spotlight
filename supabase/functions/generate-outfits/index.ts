/**
 * generate-outfits edge function (Deno). Thin adapter: everything testable
 * lives in `handler.ts`, `outfit-rules.ts` and `../_shared/`. API:
 * `docs/api/generate-outfits.md`.
 *
 * `verify_jwt = false` in `supabase/config.toml`: the function checks the
 * development token itself (`DEV_TOKEN` secret). Never log the request's
 * headers or body; the handler logs one line per answer (counts only).
 */
import { finishBody, readCapped, type ByteReader } from '../_shared/http-body.ts';

import { handleGenerateOutfits } from './handler.ts';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

Deno.serve(async (request: Request): Promise<Response> => {
  const contentLength = request.headers.get('Content-Length');
  let reader: ByteReader | null = null;
  const bodyReader = (): ByteReader | null => (reader ??= request.body ? request.body.getReader() : null);
  try {
    const result = await handleGenerateOutfits(
      {
        method: request.method,
        authorization: request.headers.get('Authorization'),
        contentLength,
        readBody: (maxBytes) => readCapped(bodyReader(), maxBytes),
      },
      { devToken: Deno.env.get('DEV_TOKEN') },
    );
    await finishBody(bodyReader(), contentLength);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: result.headers });
  } catch {
    console.error('generate-outfits: unexpected error');
    await finishBody(bodyReader(), contentLength);
    return new Response(JSON.stringify({ error: { code: 'internal', message: 'Unexpected error.' } }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
