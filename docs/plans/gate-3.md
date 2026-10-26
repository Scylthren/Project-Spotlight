# Gate 3 plan: outfit engine

**Status: approved (2026-10-23). All decisions answered (D1-D11, see ROADMAP decisions); the human also added Look of the day, Match today's weather and Lookbook occasion filters to this gate.** Criteria are in `docs/ROADMAP.md` Gate 3. Recommendations are marked; the human can override any of them. The mannequin (Gate 3.5) is shelved, so outfits are shown with the items' own photos.

## Shape of the gate
The user types a request ("for summer", "emo vibes"). The app sends the request plus a text description of the closet (IDs and tags, **no photos**) to a new edge function, `generate-outfits`. The function prefilters the closet, asks Claude for outfits as JSON, validates every outfit against the closet and the composition rules, retries once on bad output, and returns only valid outfits. The app shows them with item photos and a short rationale, and can save them to a local lookbook with a thumbs up or down.

Like Gate 2, Gate 3 adds **no database tables and no Supabase Storage**. The closet still lives on the phone, so the app sends the closet description with each request (the function is stateless). Saved outfits are stored locally in SQLite and move to the backend with sync in Gate 4.

Constraints that shape everything below:
- CLAUDE.md: prompts, prefiltering and validation live in the function. The app still rejects any ID that is not in the closet (defence in depth; it's cheap).
- Item names, tags and the request text leave the device for the first time. The Style screen carries a one-line notice, like the photo notice from Gate 2.
- Release builds still have no dev token, so outfit generation only works in development builds until Gate 4 (same as tagging).

## Composition rules (D3, answered)
An outfit is valid when:
- every item ID is in the closet sent with the request, and no ID appears twice;
- it has either (one top and one bottom) or one dress;
- it has exactly one pair of shoes when the closet sent with the request has any shoes, and none otherwise (D3);
- outerwear optional, at most one; accessories optional, 0 to 5 (D3);
- at most one top, bottom or dress; a dress outfit has no top or bottom.

The function drops invalid outfits (after one retry for the whole reply) and returns 0-3 valid ones. If the closet cannot form any outfit (no dress and no top/bottom pair), the function answers with a clear code before calling Claude, and the app says what is missing.

## Slices

### Slice 1: `generate-outfits` function with a stub, end to end
**Goal:** the network path, contract, validation rules and API doc, before any AI cost.
- New function `generate-outfits`, same dev-token check, size limits and body drain as `tag-item` (shared code in `_shared/`).
- Contract (one source in `_shared/`, app copy with a drift test, like `tag-item`): request `{ request: string (1-200 chars), items: ClosetItemSummary[] (max 300) }`; summary = id, category, colors, seasons, and the optional name, type, pattern, material, fit, formality, tags. Response `{ apiVersion: 1, outfits: [{ itemIds, rationale }], stub, usage? }` plus error codes (`not_enough_items`, upstream codes as in `tag-item`).
- Validation module (plain TS, Jest-tested): composition rules, unknown and duplicate IDs, rationale length.
- Stub picks the first valid combinations deterministically.
- App: `OutfitGenerator` interface with `MockOutfitGenerator`, `FakeOutfitGenerator` and `RemoteOutfitGenerator` (plain fetch, timeout per D4), plus a closet-to-summary mapper with tests. The app re-checks returned IDs against the closet.
- `docs/api/generate-outfits.md`.
- **Done when:** a curl and a unit-level app call round-trip to the deployed stub; 401/400/405 behave like `tag-item`; tsc, lint, tests pass.
- **Edge cases:** empty closet; closet with only tops; 300+ items (capped, see slice 3); request of only spaces or emoji; very long item names or tags (truncated in the summary); IDs in the reply that are not in the closet.

### Slice 2: Style and Results screens (mock generator)
**Goal:** the whole request-to-results flow on the phone, built and tested with the mock, so slice 3 only swaps the source.
- Style screen from `StylePrompt.dc.html`: "What's the occasion?" text field, the example chips (For summer, Emo vibes, First date, Job interview, Rainy day), recent requests (local, last 5), "Get looks" button, the data notice. "Match today's weather" and "Look of the day" are left out (not approved).
- Results screen from `Results.dc.html`: the request as the title, "N looks from your closet", one card per look: numbered, item photos as a grid (main pieces large, shoes and accessories in a smaller row; no flat-lay, cutouts are shelved), item names or category/type line, "Why it works" rationale, Restyle. Save comes in slice 4 (left out until then). "Swap piece" is left out (not approved).
- Restyle (approved 2026-10-24): replaces one look with a new look for the same request. The contract gains an optional `avoid` list (item ID sets of the looks already shown, max 9); the function and stub skip looks matching one of them, and the slice 3 prompt asks for something different. One call per tap; the button shows its own loading state and failures leave the look as it was.
- Tabs in this slice: Closet, Style, Add, Me; Looks is added with the Lookbook in slice 4.
- Style screen notice (approved): "Your request and your pieces' names and tags (not photos) are sent to our server and to Claude (Anthropic) to suggest looks."
- Loading state (the call may take 5-15 s) with a cancel; failure states per error ("No looks this time", "Not enough pieces: add a top and a bottom, or a dress", offline, no token). Single request in flight.
- Navigation per D1.
- **Done when:** with the mock, a request shows 3 looks with photos and rationale; every failure state is reachable in tests; double taps send one request.
- **Edge cases:** an item deleted while results are shown (card drops the look or marks the piece missing); the user leaves the screen mid-request (reply ignored, request aborted); keyboard over the field; long rationale; both themes.

### Slice 3: Real generation with Claude
**Goal:** real looks in a few seconds, and invalid output never reaches the UI.
- Prompt in the function: the closet as a compact list, the request, the composition rules, "only use these IDs", 3 distinct looks, a short rationale each. JSON schema output; `thinking` and model per D2.
- Prefilter (in the function, from slice 1 review): the app sends up to 300 items (transport cap, most recent first); the function always trims what reaches the prompt to about 100-120 items with per-category quotas, scoring items by season and tag/name match to the request (and weather in slice 5). It must keep at least one shoes item when the closet sent has any (the shoes rule depends on it) and enough tops/bottoms/dresses to form a look. Deterministic and unit-tested. The app shows when items were left out (`omitted` counts).
- Assert the 25 s function budget in a test, as `tag-item` does for its 16 s.
- Validation as in slice 1; one retry if fewer than 1 valid look survives and the time budget allows; otherwise 200 with the valid ones (possibly 0, which the app shows as "No looks this time").
- Same logging rule as `tag-item`: one JSON line per call, no request text, closet or reply.
- **Done when:** on the phone, 3 real requests on the owner's closet return looks; offline and errors show the failure states; a 5-request smoke run has 0 invalid outfits after validation.
- **Edge cases:** the request is not about clothes ("write me a poem"); a request the closet cannot meet ("black tie" with no formal items: the model should still answer with the closest looks and say so in the rationale); prompt-injection text in an item name or tag; Claude returns the same outfit three times (deduplicate); refusal or malformed JSON; 429/5xx.

### Slice 4: Lookbook (saved outfits and ratings)
**Goal:** saved looks with their request and a thumbs up or down, kept across restarts.
- SQLite migration 8: `outfits (id, request, rationale, rating, created_at, model)` and `outfit_items (outfit_id, item_id, position)`. Both repositories (SQLite and in-memory) behind `ClosetRepository` or a sibling `OutfitRepository` (implementer proposes).
- Save from Results; thumbs up/down on Results and in the Lookbook (tap again clears).
- Occasion (D11): on save the user may pick one occasion from a fixed list (Everyday, Work, Night out, Date, Formal, Active, Travel; agent may propose edits) or leave it empty; editable later. No AI occasion. Stored as `outfits.occasion` (nullable).
- Lookbook screen from `Lookbook.dc.html`: "Lookbook", "N saved", filter chips (All, then the occasions in use, then seasons: a look is in a season when every remaining item has that season), one row per look (photos, request, date, rating, occasion), open a look, delete a look.
- Deleting a closet item per D5.
- **Done when:** a saved look and its rating survive a restart; old databases migrate; deleting an item behaves per D5.
- **Edge cases:** saving the same look twice (one entry); a look whose items were all deleted; very many saved looks (list performance); a filter whose last look is deleted (falls back to All); an item's seasons edited after saving (season filter follows the items).

### Slice 5: Weather and Look of the day
**Goal:** "Match today's weather" on the Style screen and a Look of the day screen, both using local weather.
- Location (D8): `expo-location` (approved; works in Expo Go), foreground "while using the app" permission only, asked the first time weather is needed, with an intro line like the camera's. The app rounds to 0.1 degrees (about 10 km) before sending; the position is never stored on a server or logged. If permission is denied or location is off, the user can type a city (geocoded by our function) on the Me tab. Behind a `LocationProvider` interface with mock and real.
- Me tab: "Use local weather" toggle (off = no location, no weather features) and the home city fallback. The "Look of the day, 7:30 AM" notification is left out (D10).
- Weather (D9): our function fetches Open-Meteo (free tier, no key; non-commercial only, under 10,000 calls a day, CC-BY 4.0) and turns it into a short summary (today's high/low, rain chance, wind, conditions). Cached in the function per rounded location and hour where possible, and on the phone per day. The app shows "Weather data by Open-Meteo.com" wherever weather appears. Open question from the slice 1 review, settle at the start of slice 5: either a separate `weather` function returns the summary and the app passes it to `generate-outfits` (the slice 1 contract already accepts `weather: { highC, lowC, rainChance, windKph, conditions }`), or `generate-outfits` takes the rounded position and fetches the weather itself. Either way `conditions` must come from a fixed list mapped from Open-Meteo weather codes, so no free text reaches the prompt; the contract's free-text `conditions` is narrowed then.
- `generate-outfits` request gains optional `weather` (the summary, never coordinates go to Claude) and `mode` (`request`, `weather`, `random`). The prompt uses the weather to pick layers and fabrics.
- Style screen: "Match today's weather" (a weather request) and "Look of the day" entry, per `StylePrompt.dc.html`.
- Look of the day screen from `Today.dc.html`: "For today" (weather) and "Surprise me" (random) modes, one look shown with its rationale and the weather line, Shuffle for the next look, Save to the Lookbook. One generation call returns 3 looks; Shuffle steps through them and only calls again after the third. Today's looks are cached locally until midnight, so reopening costs nothing.
- **Done when:** on the phone, with location allowed, "Match today's weather" and Look of the day return looks that mention the weather; with location denied, the typed city works; with weather off, the screens say how to turn it on; offline shows a clear state.
- **Edge cases:** permission denied, then allowed in Settings; location services off; no fix within a timeout (fall back to the last known or the city); Open-Meteo down or rate-limited (looks without weather, said plainly); midnight rollover while the screen is open; travel to another city (new rounded position, new weather); a closet that cannot form a look.

### Slice 6: Outfit eval
*Reordered 2026-10-26 (human): runs right after slice 5a, before 5b, and also covers the prompt styling guide and the "Style preferences" setting (see ROADMAP decision "Outfit quality"). Baseline first on the current prompt, then the variants.*
**Goal:** the validation criterion measured automatically and the "would wear" target measured by the human.
- `evals/outfits/`: the sample closet per D7 (about 40 items as JSON, committed), 20 requests (agent drafts a mix: seasons, occasions, vibes, a few hard or impossible ones; the human edits), a runner that calls the deployed function, and a report.
- Automatic: invalid outputs reaching the response (target 0), looks per request, tokens, cost per request, latency p50/p95.
- Human rating: the runner writes a review file (each request with its looks as item names and photos where available); the human marks per request whether they would wear at least one look; a scorer computes the percentage (target at least 70 percent). Results appended to `evals/results.md`.
- If the target is missed: tune the prompt or try the next model up (D2), re-run, report both.
- Include 3 weather requests with fixed weather summaries (no live weather in the eval, so runs are comparable).

### Slice 7: Gate review and report
Opus architect review, eval results, device checklist (the human's own 10 requests on their own closet, rated; Look of the day on two days; location allowed, denied and city), platform-specific code list, and the Gate 3 report.

## Decisions (all answered 2026-10-23; the human accepted every recommendation unless noted)

**Before slice 1**
- **D1. Navigation.** Gate 3 adds a Style screen and a Lookbook. The mockups' bar is Closet, Style, (Scan), Looks, Me. *Recommended:* add two tabs to the existing `NativeTabs`, giving Closet, Style, Add, Looks, Me (five tabs, the iOS maximum before "More"). Results opens as a pushed screen from Style. Alternative: keep three tabs and put the Lookbook under Me.
- **D2. Model.** *Recommended:* start with Claude Haiku 5.5 (as for tagging), and have the eval also run Sonnet 5.5 on the same 20 requests so the choice is made on your ratings, not guessed. Outfit taste matters more than tagging accuracy, so Sonnet may win; prices are checked when the eval runs. Text only (no photos sent), so either should cost well under a cent per request (estimate, unverified).
- **D3. Composition rules.** *Answered:* rules as above, with shoes required when the closet has any, and 0 to 5 accessories.
- **D4. Looks per request and wait time.** *Recommended:* 3 looks per request (as in the mockup), app timeout 30 s, function budget 25 s.

**Before slice 4**
- **D5. Deleting an item that is in a saved look.** *Recommended:* keep the look and show the deleted piece as "Removed from closet"; a look with no pieces left is deleted. Alternative: delete every look that used the item.
- **D6. What the ratings do.** *Recommended:* store them only in Gate 3 (as the roadmap says). Feeding recent thumbs-down looks back into the prompt is a later idea.

**Before slice 5**
- **D7. Sample closet for the eval.** Options: (a) a JSON export of your real closet from the app (a small dev-only "Export closet as JSON" on the Me tab, tags only, no photos); (b) the 30 labelled eval photos' labels plus about 10 items you describe; (c) a synthetic closet the agent writes. *Recommended: (a)*, because you rate looks you would actually wear, and the export is also useful for Gate 4. Kept outside git like the eval photos, with a hash committed.
- **Eval requests.** The agent drafts 20; you edit them before the run.

**Added with Look of the day, weather and occasion filters**
- **D8. Location.** *Answered:* phone location through `expo-location` (new dependency, approved), rounded to about 10 km before it leaves the phone; a typed city as the fallback.
- **D9. Weather source.** *Answered:* Open-Meteo, fetched by our function. Free tier is non-commercial only; a public store release needs its paid plan (price not checked).
- **D10. Look of the day notification.** *Answered:* left out for now.
- **D11. Occasions for Lookbook filters.** *Answered:* the user picks one on save (optional); no AI occasion.

## Risks
- **Cost:** text-only requests keep it small; the closet cap bounds input tokens; the eval reports cost per request. Same dev-token protection and no rate limit as Gate 2 (Gate 4 adds per-user limits).
- **Quality is subjective:** the 70 percent target is your judgement; the eval compares two models so the choice is evidence-based.
- **Privacy:** item names, tags and requests go to our function and to Claude. Notice on the Style screen; nothing is logged or stored server-side.
- **Prompt injection via item names or tags:** they are the user's own data, so the harm is limited to their own results; validation still rejects any ID or shape outside the rules.
- **Navigation change:** five tabs is a structure change inside the existing library (D1), not a library swap.
- **Location privacy:** the first location use in the app. Foreground only, rounded before sending, not stored or logged server-side, coordinates never sent to Claude, toggle to turn it off. Open-Meteo sees our server's address and the rounded position.
- **Open-Meteo limits:** limits are per IP, and edge functions share outbound addresses, so the free tier may throttle us sooner than 10,000 calls a day. Caching plus a graceful "no weather" fallback cover it; a public release needs the paid plan.
