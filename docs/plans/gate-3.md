# Gate 3 plan: outfit engine

**Status: proposed (2026-10-23). Nothing here is built until the human answers the decisions below.** Criteria are in `docs/ROADMAP.md` Gate 3. Recommendations are marked; the human can override any of them. The mannequin (Gate 3.5) is shelved, so outfits are shown with the items' own photos.

## Shape of the gate
The user types a request ("for summer", "emo vibes"). The app sends the request plus a text description of the closet (IDs and tags, **no photos**) to a new edge function, `generate-outfits`. The function prefilters the closet, asks Claude for outfits as JSON, validates every outfit against the closet and the composition rules, retries once on bad output, and returns only valid outfits. The app shows them with item photos and a short rationale, and can save them to a local lookbook with a thumbs up or down.

Like Gate 2, Gate 3 adds **no database tables and no Supabase Storage**. The closet still lives on the phone, so the app sends the closet description with each request (the function is stateless). Saved outfits are stored locally in SQLite and move to the backend with sync in Gate 4.

Constraints that shape everything below:
- CLAUDE.md: prompts, prefiltering and validation live in the function. The app still rejects any ID that is not in the closet (defence in depth; it's cheap).
- Item names, tags and the request text leave the device for the first time. The Style screen carries a one-line notice, like the photo notice from Gate 2.
- Release builds still have no dev token, so outfit generation only works in development builds until Gate 4 (same as tagging).

## Composition rules (proposed, see D3)
An outfit is valid when:
- every item ID is in the closet sent with the request, and no ID appears twice;
- it has either (one top and one bottom) or one dress;
- at most one item per category, except accessories (up to 2); outerwear and shoes optional, at most one each;
- a dress outfit has no top or bottom.

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
- Results screen from `Results.dc.html`: the request as the title, "N looks from your closet", one card per look: numbered, item photos (primary photo, falling back as today), item names or category/type line, "Why it works" rationale, Save. "Swap piece" and "Restyle" are left out (not approved).
- Loading state (the call may take 5-15 s) with a cancel; failure states per error ("No looks this time", "Not enough pieces: add a top and a bottom, or a dress", offline, no token). Single request in flight.
- Navigation per D1.
- **Done when:** with the mock, a request shows 3 looks with photos and rationale; every failure state is reachable in tests; double taps send one request.
- **Edge cases:** an item deleted while results are shown (card drops the look or marks the piece missing); the user leaves the screen mid-request (reply ignored, request aborted); keyboard over the field; long rationale; both themes.

### Slice 3: Real generation with Claude
**Goal:** real looks in a few seconds, and invalid output never reaches the UI.
- Prompt in the function: the closet as a compact list, the request, the composition rules, "only use these IDs", 3 distinct looks, a short rationale each. JSON schema output; `thinking` and model per D2.
- Prefilter (in the function): drop nothing for closets up to the cap; above it, keep a per-category quota favouring items whose seasons and tags match words in the request. Deterministic and unit-tested.
- Validation as in slice 1; one retry if fewer than 1 valid look survives and the time budget allows; otherwise 200 with the valid ones (possibly 0, which the app shows as "No looks this time").
- Same logging rule as `tag-item`: one JSON line per call, no request text, closet or reply.
- **Done when:** on the phone, 3 real requests on the owner's closet return looks; offline and errors show the failure states; a 5-request smoke run has 0 invalid outfits after validation.
- **Edge cases:** the request is not about clothes ("write me a poem"); a request the closet cannot meet ("black tie" with no formal items: the model should still answer with the closest looks and say so in the rationale); prompt-injection text in an item name or tag; Claude returns the same outfit three times (deduplicate); refusal or malformed JSON; 429/5xx.

### Slice 4: Lookbook (saved outfits and ratings)
**Goal:** saved looks with their request and a thumbs up or down, kept across restarts.
- SQLite migration 8: `outfits (id, request, rationale, rating, created_at, model)` and `outfit_items (outfit_id, item_id, position)`. Both repositories (SQLite and in-memory) behind `ClosetRepository` or a sibling `OutfitRepository` (implementer proposes).
- Save from Results; thumbs up/down on Results and in the Lookbook (tap again clears).
- Lookbook screen from `Lookbook.dc.html`: "Lookbook", "N saved", one row per look (photos, request, date, rating), open a look, delete a look. Occasion filters (Night out, Everyday) left out (not approved).
- Deleting a closet item per D4x.
- **Done when:** a saved look and its rating survive a restart; old databases migrate; deleting an item behaves per D4x.
- **Edge cases:** saving the same look twice (one entry); a look whose items were all deleted; very many saved looks (list performance).

### Slice 5: Outfit eval
**Goal:** the validation criterion measured automatically and the "would wear" target measured by the human.
- `evals/outfits/`: the sample closet per D6x (about 40 items as JSON, committed), 20 requests (agent drafts a mix: seasons, occasions, vibes, a few hard or impossible ones; the human edits), a runner that calls the deployed function, and a report.
- Automatic: invalid outputs reaching the response (target 0), looks per request, tokens, cost per request, latency p50/p95.
- Human rating: the runner writes a review file (each request with its looks as item names and photos where available); the human marks per request whether they would wear at least one look; a scorer computes the percentage (target at least 70 percent). Results appended to `evals/results.md`.
- If the target is missed: tune the prompt or try the next model up (D2), re-run, report both.

### Slice 6: Gate review and report
Opus architect review, eval results, device checklist (the human's own 10 requests on their own closet, rated), platform-specific code list, and the Gate 3 report.

## Decisions needed from the human

**Before slice 1**
- **D1. Navigation.** Gate 3 adds a Style screen and a Lookbook. The mockups' bar is Closet, Style, (Scan), Looks, Me. *Recommended:* add two tabs to the existing `NativeTabs`, giving Closet, Style, Add, Looks, Me (five tabs, the iOS maximum before "More"). Results opens as a pushed screen from Style. Alternative: keep three tabs and put the Lookbook under Me.
- **D2. Model.** *Recommended:* start with Claude Haiku 5.5 (as for tagging), and have the eval also run Sonnet 5.5 on the same 20 requests so the choice is made on your ratings, not guessed. Outfit taste matters more than tagging accuracy, so Sonnet may win; prices are checked when the eval runs. Text only (no photos sent), so either should cost well under a cent per request (estimate, unverified).
- **D3. Composition rules.** Accept the rules above (top + bottom or a dress; outerwear, shoes optional; up to 2 accessories)? Should shoes be required when the closet has any?
- **D4. Looks per request and wait time.** *Recommended:* 3 looks per request (as in the mockup), app timeout 30 s, function budget 25 s.

**Before slice 4**
- **D4x. Deleting an item that is in a saved look.** *Recommended:* keep the look and show the deleted piece as "Removed from closet"; a look with no pieces left is deleted. Alternative: delete every look that used the item.
- **D6. What the ratings do.** *Recommended:* store them only in Gate 3 (as the roadmap says). Feeding recent thumbs-down looks back into the prompt is a later idea.

**Before slice 5**
- **D6x. Sample closet for the eval.** Options: (a) a JSON export of your real closet from the app (a small dev-only "Export closet as JSON" on the Me tab, tags only, no photos); (b) the 30 labelled eval photos' labels plus about 10 items you describe; (c) a synthetic closet the agent writes. *Recommended: (a)*, because you rate looks you would actually wear, and the export is also useful for Gate 4. Kept outside git like the eval photos, with a hash committed.
- **Eval requests.** The agent drafts 20; you edit them before the run.

## Risks
- **Cost:** text-only requests keep it small; the closet cap bounds input tokens; the eval reports cost per request. Same dev-token protection and no rate limit as Gate 2 (Gate 4 adds per-user limits).
- **Quality is subjective:** the 70 percent target is your judgement; the eval compares two models so the choice is evidence-based.
- **Privacy:** item names, tags and requests go to our function and to Claude. Notice on the Style screen; nothing is logged or stored server-side.
- **Prompt injection via item names or tags:** they are the user's own data, so the harm is limited to their own results; validation still rejects any ID or shape outside the rules.
- **Navigation change:** five tabs is a structure change inside the existing library (D1), not a library swap.
