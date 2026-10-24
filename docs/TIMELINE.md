# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-24 by orchestrator (Gate 3 slice 1 committed; slice 2 next)_

- **Gate:** 3 in progress (plan `docs/plans/gate-3.md`, D1-D11 answered). Gate 2 approved 2026-10-23, tagged `gate-2` at `bb112d4`.
- **Gate 3 slice 1 (`generate-outfits` stub), reviewed (PASS WITH NOTES, all notes applied) and committed.** Contract `supabase/functions/_shared/generate-outfits-contract.ts` (app copy `spotlight/src/ai/generate-outfits-contract.ts`, byte-identical, drift test incl. doc). Request `{ request (1-200, may be empty for mode random/weather), mode?, weather? {highC, lowC, rainChance, windKph, conditions}, items (1-300 summaries) }`; body max 650,000 bytes (worst case 563,895, tested). Response `{ apiVersion: 1, outfits: [{ itemIds, rationale (1-300) }] (0-3), stub, usage? }`. 422 `not_enough_items` with `missing` before any AI call; other codes as `tag-item`. D3 rules in `generate-outfits/outfit-rules.ts` (dedupe, max 3). Body helpers moved to `_shared/http-body.ts` (tag-item re-exports; deployed tag-item still the pre-move build, same behaviour; redeploy with its next change). App: `OutfitGenerator` (Mock, Fake, Remote; 30 s timeout, AbortSignal -> `cancelled`, never throws, drops looks with unknown IDs), `prepareOutfitRequest` shared by Mock and Remote (mapping, local not-enough check, contract validation -> `rejected`), `toClosetSummaries` (most recent 300; invalid items omitted; `omittedInvalid`/`omittedOverCap`), `createOutfitGenerator` in `hooks/outfit-services.ts`; no UI yet. Doc `docs/api/generate-outfits.md`. Deployed (`--use-api`); curl (implementer): no/wrong token 401, GET 405, malformed and spaces-only 400, top+shoes 422 missing [bottom, dress], valid 200 stub, random with empty text 200, 700 KB 400. Orchestrator: tsc, lint pass; `npm test` 98 suites, 1769 tests; contract `cmp` identical; unauthenticated POST 401. Carried to slice 3: prompt prefilter to about 100-120 items keeping shoes; budget test. Before slice 5: who fetches weather; `conditions` from a fixed list. Plan `docs/plans/gate-2.md`; decisions D1-D11 answered (ROADMAP). Cutouts shelved (slice 5 dropped, cutout criteria marked shelved in ROADMAP Gate 2). Slices 1-4 and 6 committed and device-checked; slice 7 (gate review and report) done. Gate 1.5 approved and tagged `gate-1.5`; Gates 0 and 1 approved.
- **Backend:** `supabase/` at the repo root, linked to `lithblsvhrxfdkjhnhdy`. One function, `tag-item` (`verify_jwt = false`, deployed with `--use-api`): dev token check (`DEV_TOKEN` secret, constant-time, fails closed), 405/401/400 rules, body max 2,100,000 bytes, drains unread bodies (8 MB / 5 s cap). Calls Claude Haiku 5.5 with plain fetch (`tag-item/{prompt,model-reply,claude}.ts`): enum JSON schema, `thinking: disabled`, `effort: low`, one retry on a bad reply within a 16 s budget (8 s per call); provider errors map to 503/504/502 codes. One JSON log line per call (no image, reply or key). No tables, no Storage, no migrations (RLS not applicable yet). API doc `docs/api/tag-item.md`.
- **Contract:** `supabase/functions/_shared/tag-item-contract.ts` is the source of truth; `spotlight/src/ai/tag-item-contract.ts` a byte-identical copy with a Jest drift test (also checks the doc for values, codes and limits, not shapes). Response `{ apiVersion: 1, tags: { category, colors, seasons, type, pattern, material, fit, formality }, stub, usage? }`. D6 fields lenient, category/colors/seasons strict.
- **App tagging:** `createTaggingServices` (`src/hooks/tagging-services.ts`) pairs `RemoteClosetTagger` (20 s timeout, never throws) with `UploadTagImageSource` (1024 px re-encode, re-checks the exact bytes for Exif/GPS/XMP before sending). Add/Edit form (`FormTagSuggestions`) and import both use it. Auto/user rule for every suggested field; user values always win; "No suggestions" on any failure, never blocks saving. Mocks: `MockClosetTagger`, `FakeClosetTagger`. Dev token: `__DEV__`-only Backend section on the Me tab, `SecureStoreDevTokenStore` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); token file `~/.config/spotlight/dev-token` (600).
- **Tags in the closet (slice 2):** `ClothingItem.attributes?` (type, pattern, material, fit, formality; vocabulary D6) in `src/core/item-attributes.ts`; SQLite migration 7 (`item_attributes`). `AttributeFields` UI, item screen line, search covers tags.
- **Import (slice 6):** Add tab "Several pieces?" panel -> `pickMany(20)` (`selectionLimit`, iOS `orderedSelection`); `selectImportPhotos` (`src/core/import-batch.ts`) caps at 20 in our own logic and drops same-`assetId` duplicates. `ImportSession` (`src/data/import-session.ts`): drafts in memory only, tagging and on-device colors 3 at a time; review screen `app/import/index.tsx`, per-draft "Check piece" `app/import/[draftId].tsx`. Ready = color + category + season and nothing still arriving; "Save N pieces" saves only ready drafts via `addClosetItem` (single-flight). Discard (confirmed; Android back guarded, iOS swipe-back off) deletes temp copies.
- **Eval:** `evals/tagging/` (`npm run eval:tagging -- <init|check|run|score>`), 30 photos in `~/spotlight-eval-photos/`, labels committed. Gate run 2026-10-23 19:32 on `beea2a7` (prompt `e201b76717b0`): category 96.7% (29/30) PASS, primary color 96.2% (25/26) PASS (raw first run 73.1%; passes after the human accepted 5 model colors as label alternatives), type 80.8%, material 82.6%, pattern 76.2%, formality 76.0%, seasons overlap 86.5%, fit 31.6%, other colors 31.4%; $0.000382 per photo; p50 1.53 s, p95 2.91 s; no errors.
- **Security tests:** `src/security/secret-scan.test.ts` scans every committable file in the repo (git, falling back to a directory walk) for provider keys, Supabase secret/service-role keys and 64-hex tokens; `.env*` ignored, `.env.example` not; only `EXPO_PUBLIC_SUPABASE_URL` and the publishable key allowed. Upload-bytes metadata test in `expo-image-processor.test.ts` (single add); import shares the same image source (asserted in `use-import-entry.test.ts`).
- **Verified 2026-10-23 (orchestrator, after slice 6):** tsc, lint pass; `npm test` 91 suites, 1540 tests; ios and android export pass, bundles have no key prefix or `api.anthropic.com`. Device checks (human): slices 1, 2, 3 and 6 all pass; human check (10 items, eval report) done; iOS confirmed, Android not stated.
- **Platform-specific code (Gate 2 and carried):** `.web` files (`confirm-delete`, `confirm-discard-import`, `app-tabs`, `animated-icon`, `use-color-scheme`); `Platform.OS` in `color-matrix` (iOS announce), `camera-intro-modal`, `camera-denied-panel`, `keyboard-aware-scroll-view`; `Platform.select` `bottomTabInset`; `keychainAccessible` (iOS option); picker `selectionLimit` (own cap covers Android) and `orderedSelection` (iOS 15+); `hanger` SF symbol iOS 16+; eval `run` needs macOS `sips`.
- **Privacy line (after the tag):** `PHOTO_UPLOAD_NOTICE` (`src/core/camera-access.ts`) shown under Take/Choose (`SourceButtons`) and in the import panel; rendered tests in `item-form.test.tsx` and `import.test.tsx`. tsc, lint pass; `npm test` 91 suites, 1541 tests. Not checked on a device.
- **Known issues (gate report list):** Android device checks for Gate 2 not stated (iOS done); no rate limit on the function, unauthenticated calls can make it read up to 8 MB / 5 s; Anthropic console spend limit unverified; release builds cannot tag until Gate 4 (token only in `__DEV__`), Backend section code is in the release bundle; bundle secret check is manual; `tag-item/index.ts` not Deno-checked or linted; dashboard log lines unverified; 16 s function budget vs 20 s app timeout; requests not cancelled on leaving a screen or discarding an import; no "retry suggestions"; import duplicates only by `assetId` within one batch; no rendered test of import navigation; small window can leave an import session open until the next import; stale SDK 57 comments in `data/expo-image-processor.ts` (upright reasoning not re-checked on 58) and `data/expo-photo-picker.ts`; fit and other-colors accuracy low; closet screenshots get no tags; cutouts shelved affects Gate 3.5. Earlier: forced-scheme flash; serif accent clipping; typed routes regenerate only on `expo start`; dashed borders on Android unverified; npm audit at SDK 58 (4 high in Expo CLI dev tooling).
- **Review notes still deferred:** user-cleared attribute stored as absent so a retake may re-suggest it; type and name `maxLength` count UTF-16 units; one bad attribute row hides the item; thumbnails pressable while busy; item screen spinner-only loading; radios report `checked` and `selected`; swatch sizes 26/40 and chevron stroke raw numbers; detection thresholds need tuning on real photos.
- **Next step:** Gate 3 slice 2 (Style and Results screens with the mock generator, five tabs per D1) when the human starts it. Mannequin (Gate 3.5) shelved (ROADMAP, CLAUDE.md non-goals line updated). 

## Gate plans
- Gate 1.5 (approved 2026-10-21, done): five slices, see `git log` and ROADMAP decisions.
- Gate 3: `docs/plans/gate-3.md`, approved 2026-10-23, all decisions answered; slice 1 committed.
- Gate 2: `docs/plans/gate-2.md`; all decisions answered; slices 1-4, 6, 7 done; slice 5 (cutouts) shelved. Approved and tagged 2026-10-23.

## Log
Newest first.

### 2026-10-24 — Gate 3 slice 1 (`generate-outfits` stub)
- Implementer built the contract, D3 rules, stub function (deployed, curl-checked) and app `OutfitGenerator`. architect-reviewer (Sonnet): PASS WITH NOTES, no must-fix; applied: invalid items omitted before sending, mock shares request validation, 422 body tidy (redeployed), doc note. Plan updated for slice 3 (prompt prefilter about 100-120 items) and slice 5 (weather source, fixed conditions list).
- Evidence (orchestrator): tsc, lint pass; `npm test` 98 suites, 1769 tests; contract copies identical; unauthenticated POST 401. Committed and pushed. Next: slice 2.

### 2026-10-23 — Gate 3 decisions answered
- Human accepted D1-D7 recommendations; D3 changed: shoes required when the closet has any, 0-5 accessories. Approved Look of the day, Match today's weather and occasion filters for Gate 3; then D8 phone location (`expo-location` approved), D9 Open-Meteo via our function, D10 no notification, D11 user-picked occasion.
- Open-Meteo terms checked (non-commercial free tier, <10,000 calls/day, per-IP limits, CC-BY 4.0). Plan gains slice 5 (weather and Look of the day); eval is slice 6, review slice 7. Recorded in ROADMAP. No code changed.

### 2026-10-23 — Gate 3 planned, mannequin shelved
- Human shelved the mannequin (Gate 3.5) and asked for the Gate 3 plan. Recorded in ROADMAP (Gate 3.5 marked shelved, decision added) and the CLAUDE.md non-goals line.
- Wrote `docs/plans/gate-3.md`: stub function, Style/Results with mock, real generation, Lookbook (migration 8), outfit eval, gate review; decisions D1-D7. No code changed. Next: human answers.

### 2026-10-23 — Gate 2 approved
- Human: human check done, iOS checks done, privacy line approved, Gate 2 approved. Tagged `gate-2` at `bb112d4`, tag pushed.
- Added the approved library privacy line (`PHOTO_UPLOAD_NOTICE`) under the pick buttons and in the import panel, with rendered tests. tsc, lint pass; `npm test` 91 suites, 1541 tests. Not checked on a device. Next: Gate 3 plan when the human starts it.

### 2026-10-23 — Gate 2 slice 7: gate review and report
- Human: slice 6 device checks pass ("works as intended"; platforms not stated).
- Gate eval run on `beea2a7`: category 96.7%, primary color 96.2%, both PASS; same numbers as the reviewed slice 4 scores; $0.0115 total. Appended to `evals/results.md`.
- architect-reviewer (Opus): PASS WITH NOTES, no code must-fix. Applied its doc fixes: ROADMAP Gate 2 cutout criteria marked shelved, stale Current state lines corrected (form uses the real tagger, eval has run, scan is repo-wide), secret-scan comment scope fixed. Timeline compacted.
- Evidence: tsc, lint, `npm test` 91 suites, 1540 tests; ios and android export pass (code unchanged since slice 6 except one comment).
- Gate 2 report sent. Next: human approval, then tag `gate-2`.

### 2026-10-23 — Slice 6 (multi-select import)
- Human answered D9 (one photo per item) and D10 (max 20). Implementer built it; architect-reviewer PASS WITH NOTES, no must-fix. Orchestrator: tsc, lint pass; `npm test` 91 suites, 1540 tests; ios/android export pass, bundle scan clean. Committed `beea2a7` and pushed.

### 2026-10-23 — Cutouts shelved
- After D2 research (Photoroom $0.02/image plus $20/month, Replicate about $0.0005/image, on-device needs a development build), the human dropped cutouts: slice 5 and the cutout check removed, D2 closed as "none", D8 stands for later. `GarmentIsolator` stays and never produces a cutout. Gate 3.5 impact recorded in ROADMAP.

### Earlier — Gate 2 slices 1-4 and SDK 58 (2026-10-22 to 2026-10-23)
- Plan proposed; D1, D3-D7, D11 answered. Slice 1 backend skeleton with stub and dev token (curl-verified codes, body drain fix); slice 2 tags in the closet with the mock tagger (migration 7); slice 3 real tagging with Haiku 5.5; Expo SDK 58 upgrade (human approved, RN 0.88 type fixes); slice 4 eval tooling, first run (primary color 73.1%), human label review and re-score (both targets pass). Deterministic tagging considered, Claude kept. Each slice reviewed PASS WITH NOTES, device-checked and committed. Details in ROADMAP decisions and commit messages.

### 2026-10-22 — Gate 1.5 approved
- Human ran the device checklist (iOS and Android, both themes): no problems. Tagged `gate-1.5`.

### Earlier — Gate 1.5 (2026-10-21 to 2026-10-22)
- Theme tokens and fonts, navigation and tab bar, `components/ui/` and dev gallery, closet grid and item screen, Add/Edit form restyle with item name (migration 6). Each slice PASS WITH NOTES; gate review (Opus) PASS WITH NOTES; 981 tests.

### 2026-10-21 — Gate 1 approved
- Tagged `gate-1`. Slices 1-6 (multi-photo items, metadata stripping, palette colors and matrix, color detection, camera permission flow, keyboard handling), each reviewed PASS; 742 tests.

### 2026-10-20 — Gate 0 (`a0cc043`) and repo start (`f5f4b87`)
- Expo skeleton, ESLint, Jest (`jest-expo`), `ClothingItem` type with a strict validator, 16 tests.
