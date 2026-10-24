# generate-outfits

Suggests up to 3 outfits from the user's closet for a text request ("for summer", "emo vibes"). The app sends the request and a text summary of the closet (ids and tags, **never photos**); the function is stateless and stores nothing.

**Status (Gate 3 slice 1): stub.** The function checks the token, the body and the closet, then answers a deterministic stub (`stub: true`) picked by `stubOutfits` and checked by the same composition rules a model's answer will be. No model is called and no model key is read. Slice 3 adds the Claude call (prompt, prefilter, one retry) behind the same contract; slice 5 uses `mode` and `weather`.

- **URL:** `POST https://<project-ref>.supabase.co/functions/v1/generate-outfits` (the app builds it from `EXPO_PUBLIC_SUPABASE_URL`, `configuredGenerateOutfitsUrl()`).
- **Source:** `supabase/functions/generate-outfits/` (thin Deno entry `index.ts`, logic in `handler.ts`, composition rules in `outfit-rules.ts`), shared code in `supabase/functions/_shared/` (`dev-token.ts`, `http-body.ts`, the contracts).
- **Secrets:** `DEV_TOKEN` (auth, same as tag-item). Slice 3 adds `ANTHROPIC_API_KEY`. Both exist only as Supabase function secrets.
- **Types:** `supabase/functions/_shared/generate-outfits-contract.ts` is the single source of the request and response types, limits, validators and the stub's picks. It imports the shared vocabulary from the sibling `tag-item-contract.ts`. The app keeps a byte-identical copy at `spotlight/src/ai/generate-outfits-contract.ts`; `spotlight/src/ai/generate-outfits-contract.test.ts` fails when they drift, and checks this doc for every error code, mode, field and limit. Edit the supabase file, then copy it.
- **App client:** `RemoteOutfitGenerator` (`spotlight/src/ai/remote-outfit-generator.ts`) behind the `OutfitGenerator` interface (`outfit-generator.ts`, with `MockOutfitGenerator` and `FakeOutfitGenerator`); the closet is mapped by `toClosetSummaries` (`closet-summary.ts`); `createOutfitGenerator` (`spotlight/src/hooks/outfit-services.ts`) builds the real one. Not wired into any screen yet (slice 2).

## Auth
Same as tag-item (see `docs/api/tag-item.md`, "Auth"): `Authorization: Bearer <token>` compared in constant time with the `DEV_TOKEN` secret; `verify_jwt = false` in `supabase/config.toml`; no `apikey` header needed. A missing or malformed header gets 401; a well-formed bearer token with an unset or too-short secret gets 500 `server_misconfigured` (fails closed).

## Request
`Content-Type: application/json`

```json
{
  "request": "emo vibes",
  "items": [
    {
      "id": "mf3k2-abc123xyz789",
      "category": "top",
      "colors": ["black", "white"],
      "seasons": ["autumn", "winter"],
      "name": "Black band hoodie",
      "type": "Hoodie",
      "pattern": "graphic",
      "material": "cotton",
      "fit": "oversized",
      "formality": "casual",
      "tags": ["emo", "90s"]
    },
    { "id": "mf3k9-0q8w7e6r5t4y", "category": "bottom", "colors": ["black"], "seasons": ["autumn"] }
  ]
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `request` | string | The user's words. Trimmed and every whitespace run (line breaks, tabs) collapsed to one space; then 1 to 200 characters (code points; emoji count as one) in mode `request`, 0 to 200 in modes `weather` and `random`. No other control characters. A request of only spaces is empty. |
| `mode` | string, optional | `request` (default when missing): dress for the text. `weather`: dress for `weather` (required in this mode); the text is optional extra wishes. `random`: a surprise look (Look of the day); the text is optional. The slice 1 stub accepts and ignores it. |
| `weather` | object, optional | Today's weather as a summary, never coordinates (slice 5). Allowed in any mode, required in mode `weather`. `null` counts as absent. The stub ignores it. |
| `weather.highC` | number | Today's high in °C, -80 to 70. |
| `weather.lowC` | number | Today's low in °C, -80 to 70, not above `highC`. |
| `weather.rainChance` | number | Chance of rain in percent, 0 to 100. |
| `weather.windKph` | number | Wind in km/h, 0 to 400. |
| `weather.conditions` | string | Short text ("Light rain"), 1 to 40 characters after trimming. |
| `items` | object[] | The closet: 1 to 300 summaries, ids unique. |
| `items[].id` | string | The item's id, 1 to 64 characters from `A-Z a-z 0-9 . _ : -` (the app's ids are `<time base36>-<12 random base36>`). Outfits reference items by it. |
| `items[].category` | string | `top`, `bottom`, `dress`, `outerwear`, `shoes`, `accessory`. |
| `items[].colors` | string[] | Palette color ids (as in tag-item), primary first, no duplicates, at most 3 (may be empty). |
| `items[].seasons` | string[] | `spring`, `summer`, `autumn`, `winter`, no duplicates (may be empty). |
| `items[].name` | string, optional | What the user calls it. 1 to 60 characters after trimming and collapsing whitespace, no control characters. |
| `items[].type` | string, optional | Short free text ("Hoodie"), 1 to 30 characters, same text rules. |
| `items[].pattern` | string, optional | One of tag-item's patterns (`solid`, `striped`, ...). |
| `items[].material` | string, optional | One of tag-item's materials. |
| `items[].fit` | string, optional | One of tag-item's fits. |
| `items[].formality` | string, optional | One of tag-item's formalities. |
| `items[].tags` | string[], optional | The user's own tags: at most 10 tags of 1 to 30 characters each, same text rules; the function lowercases them and drops repeats. |

Optional fields that are missing or `null` mean "unknown"; the app leaves out what an item does not have. Unknown extra fields (top level or per item) are ignored. Any other rule broken is 400 `bad_request` with a message naming the first bad field (for example `items[3]: unknown category.`).

How the app builds the summaries (`toClosetSummaries`): every item's id, category, palette color ids and seasons, plus its name, attribute values (type, pattern, material, fit, formality) and tags when present. Photos, photo paths, hex values, color and attribute sources, and timestamps are never sent. Control characters become spaces, whitespace collapses, and text is cut to the caps above (an item's own limits are the same, so this only matters for odd data). Each summary is then checked with the contract's `validateClosetItemSummary`; an item that fails (an id outside the id rule, a bad category or season) is left out, so one bad item never blocks the request. A closet still over 300 items sends its 300 most recently updated items (closet order kept). The mapper counts both kinds separately (`omittedInvalid`, `omittedOverCap`); the caller gets the total (`omittedItems`). Choosing among what is sent (prefiltering) is the function's job (slice 3).

## Response (200)
```json
{
  "apiVersion": 1,
  "outfits": [
    { "itemIds": ["mf3k2-abc123xyz789", "mf3k9-0q8w7e6r5t4y", "mf3kd-a1s2d3f4g5h6"], "rationale": "Stub look 1: top + bottom + shoes." }
  ],
  "stub": true
}
```

| Field | Type | Rules |
| --- | --- | --- |
| `apiVersion` | number | `1`. Bumped on incompatible changes; the app rejects other versions. |
| `outfits` | object[] | 0 to 3 outfits, each valid under the composition rules below and distinct (no two with the same set of ids). 0 means no valid look this time; the app says so. |
| `outfits[].itemIds` | string[] | Ids from the request's `items`, at most 9 ids, no repeats, in category order: top, bottom, dress, outerwear, shoes, accessories (accessories in the order chosen). |
| `outfits[].rationale` | string | Why the look works, 1 to 300 characters after trimming and collapsing whitespace. |
| `stub` | boolean | `true` for the stub's canned picks (slice 1, and the app's `MockOutfitGenerator`); `false` for a model's answer (slice 3). |
| `usage` | object, optional | Same shape as tag-item's `usage` (`model`, `attempts`, `inputTokens`, `outputTokens`), for the outfit eval (slice 6). Absent from the stub. The app ignores it (`validateGenerateOutfitsResponse` drops it); evals read it with `readGenerateOutfitsUsage`. |

### Composition rules (Gate 3 decision D3)
Checked by the function (`outfit-rules.ts`) on every outfit before it is answered; an outfit breaking any rule is dropped, never repaired:
- every id is in the request's `items`, and no id appears twice;
- one top and one bottom, or one dress, never both; at most one of each;
- exactly one pair of shoes when the request's `items` contain any shoes, none otherwise;
- outerwear optional, at most one; 0 to 5 accessories;
- a rationale of 1 to 300 characters.

Repeats (the same set of ids, in any order) are dropped, keeping the first; at most 3 are kept. The stub (`stubOutfits`) picks, in closet order, every top and bottom pair (top by top), then every dress, each with the next pair of shoes in turn when there are shoes, until it has 3; it adds no outerwear or accessories and its rationale names only categories (no user text).

### What the app checks
`validateGenerateOutfitsResponse` checks the shape (version, `stub`, at most 3 outfits, each with 1 to 9 distinct string ids and a 1 to 300 character rationale); anything malformed rejects the whole answer (`invalid-response`). Then `RemoteOutfitGenerator` drops any outfit naming an id it did not send (CLAUDE.md: reject ids not in the closet) and reports how many it dropped (`droppedOutfits`). The app does not re-run the composition rules; those live in the function.

## Errors
Error bodies: `{ "error": { "code": "<code>", "message": "<text>" } }`, plus `missing` for `not_enough_items`. Messages are for developers, not shown to users.

| Status | Code | When |
| --- | --- | --- |
| 405 | `method_not_allowed` | Any method other than POST (also OPTIONS; the app is native, no CORS). Header `Allow: POST`. Checked first. |
| 401 | `unauthorized` | Missing, malformed or wrong `Authorization` header. Checked before the body is read. |
| 400 | `too_large` | `Content-Length` or the actual body is over 650,000 bytes. |
| 400 | `bad_request` | Body not readable as UTF-8, not JSON, or fails the request rules above (including an empty request in mode `request`, an empty closet, more than 300 items, a repeated id). |
| 422 | `not_enough_items` | The request is valid but the closet sent cannot form any outfit: no dress and no top and bottom pair. Checked before any model call (no cost). `error.missing` says what is absent. |
| 500 | `server_misconfigured` | A well-formed bearer token, but the `DEV_TOKEN` secret is missing or too short. From slice 3 also a missing `ANTHROPIC_API_KEY` (checked after the token, before the body). |
| 503 | `upstream_rate_limited` | Slice 3: the model provider answered 429. |
| 503 | `upstream_unavailable` | Slice 3: the model provider answered 5xx (including 529) or could not be reached. |
| 504 | `upstream_timeout` | Slice 3: the model calls did not finish within the function's budget. |
| 502 | `upstream_rejected` | Slice 3: the model provider refused the call (any other 4xx). |
| 500 | `internal` | Unexpected error. |

The `upstream_*` codes are in the contract now so the app handles them before slice 3 can send them; the stub never does. Other statuses can come from the Supabase gateway (for example 404 when the function is not deployed).

`error.missing` (only with `not_enough_items`): which of `top`, `bottom` and `dress` the closet has none of, in that order. `dress` is always there; `top`, `bottom` or both say what would complete a pair. Examples: only tops gives `["bottom", "dress"]` ("add a bottom, or a dress"); only shoes and accessories gives `["top", "bottom", "dress"]` ("add a top and a bottom, or a dress"). Shoes, outerwear and accessories never cause this error.

## Limits and budgets
- Body: at most 650,000 bytes. The largest request the app can send (300 summaries with every field at its cap and 4-byte characters in every text field, a 200-character request and weather) is 563,895 bytes (`generate-outfits-contract.test.ts` builds it); a typical summary is 100 to 300 bytes, so a 300-item closet is usually under 100 KB.
- Items per request: 1 to 300 summaries.
- Request text: 1 to 200 characters (0 to 200 in modes `weather` and `random`).
- Answer: 0 to 3 outfits, each at most 9 ids (top, bottom, shoes, outerwear and 0 to 5 accessories), rationale 1 to 300 characters.
- Unread bodies are drained before replying exactly as in tag-item (`_shared/http-body.ts`): at most 8,000,000 bytes or 5 seconds, then the stream is cancelled; a declared `Content-Length` over 8,000,000 bytes is cancelled at once. This applies to any caller, authorized or not.
- Client timeout (app, D4): 30 seconds (`DEFAULT_OUTFIT_TIMEOUT_MS`), then `timeout`. The caller can also abort (`cancelled`).
- Function budget (D4, slice 3): model calls within 25 seconds, so the answer arrives inside the app's timeout. The stub answers at once.
- Cost: none for the stub. Slice 3: one text-only model call per request (two with the retry); measured by the outfit eval.
- No rate limit yet (as tag-item; Gate 4 adds per-user limits).

## App failure mapping
`RemoteOutfitGenerator` never throws; it resolves `{ ok: true, outfits, stub, droppedOutfits, omittedItems }` or one of:

| Failure | Cause |
| --- | --- |
| `not-configured` | No or non-https `EXPO_PUBLIC_SUPABASE_URL` in the build. No request is made. |
| `not-enough-items` | The closet has no dress and no top and bottom pair, found by the app before sending (no request) or from a 422; carries `missing`. The app's precheck runs on what it would send, after leaving out invalid items and items over the 300 cap, so it matches the function's check on the same body. |
| `rejected` | The request fails the contract's `validateGenerateOutfitsRequest` before sending (empty text in mode `request`, over 200 characters, a control character, mode `weather` without weather; no request), or a 400. `MockOutfitGenerator` makes the same checks (`prepareOutfitRequest`). |
| `no-token` | No token saved on the device, or secure storage could not be read. No request is made. |
| `unauthorized` | 401. |
| `server` | Any other non-200 status (404 not deployed, 500, 502/503/504 provider trouble, a 422 that is not `not_enough_items`). |
| `offline` | `fetch` failed before an answer, or the connection dropped while reading. |
| `timeout` | No complete answer within 30 s (request aborted). |
| `cancelled` | The caller's `AbortSignal` fired (request aborted). |
| `invalid-response` | 200 with a body that is not JSON or fails `validateGenerateOutfitsResponse`. |

## Logging
One JSON line per answered request: `{"fn":"generate-outfits","event":"stub","items","outfits","rejected"}` (counts only). Errors before the stub (400, 401, 405, 422) log nothing. The function never logs headers, the token, the request text, the closet or the outfits. An unexpected error logs only `generate-outfits: unexpected error`. Slice 3 adds one line per model call, like tag-item.
