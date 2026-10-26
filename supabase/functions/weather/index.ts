/**
 * weather edge function (Deno), Gate 3 slice 5a. Thin adapter: everything
 * testable lives in `handler.ts` (with `open-meteo.ts`, `wmo.ts`,
 * `cache.ts`) and `../_shared/`. API: `docs/api/weather.md`.
 *
 * `verify_jwt = false` in `supabase/config.toml`: the function checks the
 * development token itself (`DEV_TOKEN` secret). Open-Meteo needs no key.
 * Never log the request's headers or body (they hold the position or the
 * city); the handler logs one line per request (status and counts only).
 */
import { finishBody, readCapped, type ByteReader } from '../_shared/http-body.ts';
import { FixedWindowRateLimiter } from '../_shared/rate-limit.ts';

import { HourlyCache } from './cache.ts';
import { handleWeather, WEATHER_RATE_LIMIT, type CachedWeather } from './handler.ts';

/** One per instance (isolate), kept across requests: best effort (see `_shared/rate-limit.ts` and `cache.ts`). */
const rateLimiter = new FixedWindowRateLimiter(WEATHER_RATE_LIMIT);
const cache = new HourlyCache<CachedWeather>();

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

Deno.serve(async (request: Request): Promise<Response> => {
  const contentLength = request.headers.get('Content-Length');
  let reader: ByteReader | null = null;
  const bodyReader = (): ByteReader | null => (reader ??= request.body ? request.body.getReader() : null);
  try {
    const result = await handleWeather(
      {
        method: request.method,
        authorization: request.headers.get('Authorization'),
        contentLength,
        readBody: (maxBytes) => readCapped(bodyReader(), maxBytes),
      },
      { devToken: Deno.env.get('DEV_TOKEN'), rateLimiter, cache },
    );
    await finishBody(bodyReader(), contentLength);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: result.headers });
  } catch {
    console.error('weather: unexpected error');
    await finishBody(bodyReader(), contentLength);
    return new Response(JSON.stringify({ error: { code: 'internal', message: 'Unexpected error.' } }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
});
