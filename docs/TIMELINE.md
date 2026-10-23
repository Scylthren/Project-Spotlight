# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-22 by orchestrator (deterministic tagging considered, Claude kept; slice 3 device checks and copy approval pending)_

- **Gate:** 2 in progress (plan `docs/plans/gate-2.md`; D1, D4, D5 answered, see ROADMAP). Gate 1.5 approved and tagged `gate-1.5`; Gates 0 and 1 approved.
- **Slice 1 (backend skeleton with stub), reviewed (PASS WITH NOTES) and committed:** `supabase/` at the repo root (`supabase init`, linked to `lithblsvhrxfdkjhnhdy`, no database password used). Function `tag-item` (`verify_jwt = false`): checks `Authorization: Bearer` against the `DEV_TOKEN` secret (constant-time compare, fails closed with 500 if the secret is missing or short), 405 non-POST, 401 bad token, 400 bad or oversized body, 200 with a fixed schema-valid stub. Logic in plain TS (`supabase/functions/_shared/`, `tag-item/handler.ts`); `index.ts` is a thin Deno adapter. Deployed with `--use-api`. API doc `docs/api/tag-item.md`.
- **Slice 2 (tags in the closet, mock tagger): reviewed (PASS WITH NOTES), committed, device checks passed (human, 2026-10-22).** `ClothingItem.attributes?` (type, pattern, material, fit, formality, each `{ value, source: auto|user }`; key absent when none) in `src/core/item-attributes.ts` (vocabulary D6, ids `polka-dot`/`smart-casual`, type max 30 code points). Migration 7: table `item_attributes (item_id, name, value, source)`, no CHECK on name/value (repo validates; bad rows make the item unreadable). Form: `FormTagSuggestions` (`src/data/form-tag-suggestions.ts`) asks the `ClosetTagger` when the front photo is picked or retaken: untouched auto values are cleared at once, the reply fills only untouched fields, out-of-vocabulary values dropped, failures/timeouts (30 s) give no suggestion and never block saving. D7: `FormColorDetection.taggerColors` lets tagger colors replace the on-device guess (user colors win; the later on-device result is ignored); colors from a `stub: true` answer are ignored. App wiring: `MockClosetTagger` + `PlaceholderTagImageSource` (empty image; real image prep is slice 3). UI: `components/attribute-fields.tsx` (2x2 grid Pattern/Material/Fit boxes that open a chip list below, Type text field, Formality 4-way segmented control; "Suggested" notes); item screen line "Category · Type · Pattern · Material · Fit · Formality". Search matches type and value labels. `SegmentedControl` takes `value: T | null`, an optional per-option `accessibilityLabel`, and `selectedAccessibilityHint` (formality: "Tap again to clear it").
- **Slice 3 (real tagging), reviewed (PASS WITH NOTES) and committed; device checks pending.** `tag-item` calls Claude Haiku 5.5 with plain fetch (`tag-item/{prompt,model-reply,claude}.ts`): system prompt lists every allowed value; `thinking: disabled`, `effort: low`, `output_config.format` json_schema with enums (nullable via anyOf), `max_tokens` 1024. Reply: stop_reason must be end_turn/stop_sequence, then per-field validation; any problem -> one retry if >= 3 s of the 16 s budget is left (8 s per call), best reply kept, invalid fields null; both unreadable -> 200 with empty tags. Provider errors not retried: 429 -> 503 `upstream_rate_limited`, 5xx/529/network -> 503 `upstream_unavailable`, timeout -> 504 `upstream_timeout`, other 4xx -> 502 `upstream_rejected`. Missing key -> 500. One JSON log line per call (model, attempt, status, stop_reason, tokens, latency; no image/reply/key). App: `ImageProcessor.prepareForUpload(uri, 1024)`; `UploadTagImageSource` re-checks the exact bytes (no Exif/GPS/XMP) and the size before base64; placeholder deleted; `createTaggingServices` always pairs it with `RemoteClosetTagger` (test guards the pairing). Category and seasons suggested under the auto/user rule, source tracked in the form only (saved values count as user; stub category/seasons ignored). "No suggestions" caption on any failure or empty answer. Copy changed (camera intro, `app.json` permission strings), awaiting approval.
- **Verified for slice 3:** implementer: 5 live calls on crops of the owner's garment photos from `docs/media` all 200 `stub:false` in 1.5-3.4 s (red tee, western shirt, graphic tee, a closet screenshot tagged as the main garment, app icon all null); no token 401; request shape accepted live. Orchestrator: contract copies `cmp` identical; tsc pass; lint pass; `npm test` 83 suites, 1361 tests; diff has no dev token or `sk-ant-`. Implementer: ios/android export pass, bundles contain no token, key, `api.anthropic.com` or model name. Not verified: per-call token log lines (CLI has no logs command; check the dashboard), `deno check`, anything on a device.
- **Contract:** `supabase/functions/_shared/tag-item-contract.ts` is the source of truth; `spotlight/src/ai/tag-item-contract.ts` is a byte-identical copy with a Jest drift test (vocabulary incl. D6 lists and type limit, limits and D6 values in the doc). Request `{ imageBase64, contentType: "image/jpeg" }`, body max 2,100,000 bytes; response `{ apiVersion: 1, tags: { category, colors, seasons, type, pattern, material, fit, formality }, stub }`. D6 fields are lenient (missing/out-of-list/bad type read as null); category/colors/seasons stay strict. Stub now also returns Shirt/striped/cotton/regular/casual; redeployed 2026-10-22 with `--use-api` (unauthenticated POST gives 401; the 200 body was not checked, the token was not used).
- **App:** `ClosetTagger` (`src/ai/closet-tagger.ts`: `MockClosetTagger`, `FakeClosetTagger`), `RemoteClosetTagger` (plain fetch, 20 s AbortController timeout, never throws; failures not-configured / no-token / unauthorized / rejected / server / offline / timeout / invalid-response). `DevTokenStore` with `SecureStoreDevTokenStore` (expo-secure-store, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) and `InMemoryDevTokenStore`. Me tab: `__DEV__`-only Backend section (secure token field, save/clear, Test connection with status text). URL from `EXPO_PUBLIC_SUPABASE_URL` (`spotlight/.env`, gitignored; `.env.example` committed via `!.env.example`). Since slice 2 the add/edit form uses the mock tagger (above); `RemoteClosetTagger` is used only by the Me tab connection test.
- **Config changes:** `expo-secure-store` ~57.0.4 (approved; plugin with `faceIDPermission: false`); tsconfig `allowImportingTsExtensions` (Deno-style `.ts` imports in function code reached by tests); Jest `moduleDirectories` adds `<rootDir>/node_modules` (function files outside `spotlight/`); `TextField` passes `secureTextEntry`, `autoComplete`, `textContentType`.
- **Security tests:** `src/security/secret-scan.test.ts` scans every committable file under `spotlight/` and `supabase/` for provider keys, Supabase secret keys, service-role JWTs and 64-hex tokens (planted-file test; a planted literal was confirmed to fail it); checks `.env*` ignored, `.env.example` not; only allowed `EXPO_PUBLIC_` names. Dev token lives only in `~/.config/spotlight/dev-token` (600) and the `DEV_TOKEN` secret.
- **Found and fixed on the deployed function:** answering before the body was read (401, Content-Length precheck) left large uploads hanging, then 503. The adapter now drains the unread body before replying (`finishBody`): at most 8 MB or 5 s, then cancel; a declared Content-Length over 8 MB is cancelled at once (those clients see a hang, by design; the app never sends over 2.1 MB).
- **Review fixes (architect-reviewer):** drain byte cap plus time budget; a missing or malformed Authorization header gets 401 even when the secret is misconfigured (500 only for a well-formed bearer); the secret scan covers every committable file in the repo (git, falling back to a directory walk) and the EXPO_PUBLIC_ check also covers `.md`, `.env*` and `app.config.*`.
- **Verified 2026-10-22 (macOS, implementer, after review fixes):** tsc pass; lint pass; `npm test` 75 suites, 1154 tests (was 66/981); ios and android export pass before the fixes (bundles contain the URL, not the token). curl on the redeployed function: no token 401, Basic header 401, wrong token 401, GET 405, OPTIONS 405, valid 200 with stub, malformed JSON 400, not a JPEG 400, 2.15 MB 400, chunked 2.2 MB 400, 1.9 MB valid 200, 1.9 MB without token 401, 9 MB (with and without token) no answer within 90 s (cancelled by design), 300 KB at 20 KB/s 401 / 200 after about 15 s, 1.9 MB at 100 KB/s without token 401 after the full upload (about 18.6 s). The 5 s drain budget is unit-tested only; from the client the whole upload completed either way. Not verified: anything on a device.
- **Verified for slice 2 (macOS, implementer, 2026-10-22):** tsc pass; lint pass; `npm test` 78 suites, 1251 tests (was 75/1154); ios and android export pass. Spec-changed tests (expected values extended, none loosened): migration 6 test now expects `CLOSET_SCHEMA_VERSION` (was 6) as the latest version, the fresh-install table list includes `item_attributes`, `itemToFormValues`/`EMPTY_ITEM_FORM` shape includes `attributes`. Not verified: anything on a device.
- **Verified after review (orchestrator, 2026-10-22):** contract copies `cmp` identical; tsc pass; lint pass; `npm test` 78 suites, 1252 tests.
- **Device checks for slice 2 (human reported all passing 2026-10-22; platforms not stated):** Add: pick a photo, details pre-fill (Shirt, Striped, Cotton, Regular, Casual) with "Suggested" (canned mock values on every photo, expected until slice 3, not a bug); change pattern/material/fit in two taps, formality in one; type in Type; edit a field quickly right after picking; retake the front photo (untouched fields re-fill, touched stay); save, restart, values persist; Edit an old item (loads, no details); item screen line; closet search for "striped"/"smart casual"; both themes; keyboard over the Type field; colors still come from on-device detection (stub colors ignored).
- **Device checks for slice 1 (human reported all passing 2026-10-22; platforms not stated):** Me tab Backend section in both themes; paste the token (secure field, paste works); Test connection: OK with the token, "Wrong token" after saving a wrong one, "Offline" in airplane mode; token survives an app restart; Clear works; section absent in a release build (unverified); web shows "Secure storage is not available" (web not a target).
- **Known issues (for later):** Backend section code is in the release bundle (render gated by `__DEV__`). No rate limit on the function, and unauthenticated invocations are not rate-limited either (each can make it read up to 8 MB or 5 s). The drift test's doc check only looks for the limit numbers in `docs/api/tag-item.md`, not the shapes. `supabase/functions/tag-item/index.ts` is not Deno type-checked and the Deno files are not linted (outside ESLint's base path; handler and shared files are type-checked through the tests); run `deno check` in slice 3 if Deno is available via the CLI. Earlier: forced-scheme flash; `hanger` needs iOS 16+; serif accent clipping; token-guard gaps; typed routes regenerate only on `expo start`; dashed borders on Android unverified; gallery `!__DEV__` redirect unverified; npm audit deferred to the next SDK upgrade.
- **Review notes still deferred:** slice 5: name `maxLength` counts UTF-16 units; thumbnails pressable while busy. slice 4: item screen spinner-only loading; no rendered test of screen wiring. Earlier: radios report `checked` and `selected`; swatch sizes 26/40 and chevron stroke raw numbers.
- **Next step:** human: approve or change the slice 3 copy; run the slice 3 device checks (real suggestions with "Suggested" incl. category/seasons; touch a field before the reply; retake; airplane mode and cleared token show "No suggestions" and save works; non-clothing photo; leave mid-request; Edit an old item and retake keeps its category; new intro copy in both themes; 5-photo smoke run with own photos incl. worn, several garments, dark); check `"event":"provider_call"` lines in the Supabase dashboard. Then slice 4 (eval; needs the 30 photos and labels).
- **Open questions:** slice 3 review notes for the human: retry once on provider 5xx/529/network when budget allows (reviewer recommends; currently none); 16 s function budget vs the app's 20 s timeout leaves little margin on slow uploads (paid call lost, degrades to "No suggestions"); library picks via the system picker may show no disclosure text (consider a line near the pick buttons or Me tab); add closet screenshots to the slice 4 eval (prompt says null, model tags the main garment); request not aborted when leaving the screen (one paid call at most, reply ignored); release builds have no token so always "No suggestions" until Gate 4. Earlier: user-cleared attribute stored as absent so a retake may re-suggest it; type `maxLength` counts UTF-16 units; one bad attribute row hides the item; detection thresholds need tuning on real photos.

## Gate plans
- Gate 1.5 (approved 2026-10-21, done): five slices, see `git log` and ROADMAP decisions.
- Gate 2: `docs/plans/gate-2.md`; D1, D4-D7 answered; slices 1-3 committed; slice 3 device checks pending.

## Log
Newest first.

### 2026-10-22 — Deterministic tagging considered, Claude kept
- Human asked whether a deterministic (non-LLM) tagger would be better on cost and use. Estimate: Haiku about $0.0003 per photo (about $0.30 per 1,000; unverified until the token log lines or the slice 4 eval). Options weighed: hand-written rules (only colors/pattern, 1-2 weeks), on-device trained model (4-8 weeks, development build, non-commercial dataset licences, weaker on material/fit), hosted label API (about 5x the cost). Human accepted keeping Claude; details in ROADMAP. No code changed.

### 2026-10-22 — Gate 2 slice 3 implemented, reviewed, committed (real tagging)
- `tag-item` now calls Claude Haiku 5.5 (enum JSON schema, one retry on a bad reply, upstream error codes, token log line); the app uploads a 1024 px metadata-checked copy through `RemoteClosetTagger`, suggests category and seasons too, and shows "No suggestions" on failure. Deployed with `--use-api`.
- Evidence: 5 live calls 200 `stub:false`; tsc, lint pass; `npm test` 83 suites, 1361 tests; contracts identical; exports pass (implementer).
- architect-reviewer (Sonnet): PASS WITH NOTES, no blocking issues; comment wording fixed; other notes in Open questions.
- Next: human copy approval and device checks, then slice 4.

### 2026-10-22 — Slice 2 device check, slice 3 tagging rules
- Human: every slice 2 device check passes.
- Human decided: the AI fills category and seasons too (auto/user rule); fixed prompt limited to the lists, one retry on an out-of-list or malformed reply. Recorded in ROADMAP. Then D3: Haiku 5.5; D11: no "Suggest tags" for old items (ROADMAP). Human asked about cost: estimate about $0.0005 per photo on Haiku, so $5 credit covers development (unverified; eval measures it).

### 2026-10-22 — Gate 2 slice 2 reviewed and committed
- Session resumed after a network cut: tree was clean, origin had only the human's README/LICENSE edits (fast-forwarded); no partial slice 2 work existed, so the slice was built from scratch.
- architect-reviewer (Sonnet, read-only, could not run commands): PASS WITH NOTES, no blocking issues; all seven implementer decisions accepted; suggestion races (photo change, unmount, user edit) handled and tested.
- Applied: formality radios announce "Tap again to clear it" on the selected segment, plus a rendered test. Other notes recorded in Current state (slice 3 to-dos, open questions).
- Evidence (orchestrator): contract copies identical (`cmp`); tsc pass; lint pass; `npm test` 78 suites, 1252 tests. Committed and pushed. Next: device checks.

### 2026-10-22 — Gate 2 slice 2 implemented (tags in the closet, mock tagger)
- Items get type, pattern, material, fit, formality with auto/user source (migration 7, both repositories); contract and API doc gain the D6 fields (lenient parsing), stub extended and function redeployed (unauthenticated 401 checked only).
- Add/Edit form asks the mock tagger on front-photo pick/retake (`FormTagSuggestions`); suggestions fill only untouched fields; tagger colors replace the on-device guess unless the user changed colors (stub colors ignored). New `AttributeFields` UI and item screen line; search covers the tags.
- Mockup differences: Pattern/Material/Fit are choice boxes opening a chip list (closed vocabulary), not free text; mockup "Category: Hoodie" is our Type; Formality has four segments (Athletic, Casual, Smart, Formal; "Smart" read as "Smart casual"); "Suggested" notes added; category chips kept above the grid; pattern shown in the item screen line.
- Evidence: tsc pass; lint pass; `npm test` 78 suites, 1251 tests; ios and android export pass.
- Next: architect-reviewer, commit, device checks.

### 2026-10-22 — Gate 2 D6 and D7 answered
- Human accepted the proposed tag lists (D6) and said yes to AI colors replacing the on-device guess and to search over the new tags (D7). Recorded in ROADMAP. Human asked not to start slice 2 yet.

### 2026-10-22 — Gate 2 slice 1 device check
- Human: the dev token works on the phone (token copied via the clipboard; the file path is `/Users/arcno/.config/spotlight/dev-token`) and every slice 1 device check passes.
- Next: D6 and D7, then slice 2.

### 2026-10-22 — Gate 2 slice 1 implemented (backend skeleton, stub)
- `supabase/` linked; `tag-item` deployed (dev token check, stub answer); dev token generated outside the repo and set as `DEV_TOKEN`. App: `ClosetTagger` with mock, fake and `RemoteClosetTagger`; `DevTokenStore` on expo-secure-store; dev-only Backend section on the Me tab; `docs/api/tag-item.md`; secret scan and env tests.
- Fix found by curl: early replies to large uploads hung (503); the function now drains the body first.
- Evidence: tsc pass; lint pass; `npm test` 75 suites, 1138 tests; ios and android export pass; curl codes in Current state.
- Review fixes applied (drain time budget and Content-Length cancel, 401 before 500, repo-wide secret scan, EXPO_PUBLIC_ check over docs/config); redeployed; tests 75 suites, 1154 tests.
- architect-reviewer (Sonnet): PASS WITH NOTES, no blocking issues; all four notes applied (above). A body declared over 8 MB is cancelled at once, so such a client gets no answer (abusive requests only; the app sends at most 2.1 MB). Orchestrator re-ran tsc, lint, `npm test` 75 suites, 1154 tests; token absent from the diff and untracked files. Committed. Next: device check, D6/D7.

### 2026-10-22 — Gate 2 plan proposed
- Wrote `docs/plans/gate-2.md`: 7 slices (skeleton with stub, tags with mock, real tagging, eval, cutouts, multi-select import, gate review), edge cases per slice, decisions D1-D11 with recommendations. No app code changed.
- Next: human decisions, then slice 1.

### 2026-10-22 — Gate 1.5 approved
- Human ran the device checklist (Gate 1 re-run plus both themes per screen, iOS and Android): no problems found. Gate 1.5 approved; tagged `gate-1.5` and pushed the tag.
- Next: Gate 2, when the human starts it.

### 2026-10-22 — Slice 5 copy and layout approved
- Human approved all slice 5 copy and layout changes. Recorded in ROADMAP. Gate 1.5 not yet approved: device checklist pending; not tagged.

### 2026-10-22 — Gate 1.5 slice 5 gate review and commit
- architect-reviewer (Opus): PASS WITH NOTES, no blocking issues. Name field, migration 6, emptied guard and both spec-changed tests checked; double-tap fix correct.
- Applied: the replacing picker also waits while the intro is still closing (`introOnScreen`); the two double-tap tests now assert no pick before `introClosed()` (tightened, not weakened). Deferred notes in Current state.
- Evidence (orchestrator): tsc pass; lint pass; `npm test` 66 suites, 981 tests.
- Gate 1.5 report sent to the human. Next: device check, copy/layout answers, approval, tag.

### 2026-10-22 — Gate 1.5 slice 5 implemented (form restyle, item name, empty allowlist)
- Add/Edit form, photo set, color field and matrix, camera intro, denied panel, tag field, chip group and form button restyled; item name field end to end (migration 6); token allowlist emptied, template themed components deleted; camera double-picker fix.
- Mockup differences: Gate 2 fields, the cutout label and the thumbnail/name header block left out (SaveItem); no "Continue"/two-step flow; the Retake overlay button and per-thumbnail "x" replaced by the existing Take/Choose and Remove photo buttons; Permission's camera icon, "Before we start" and "You can change this anytime" left out (current copy kept); matrix keeps toggle + chosen list instead of Primary/Secondary mode; copy changes "Save item" -> "Save to closet", matrix "Colors" -> "Pick colors", "Tags" -> "Style tags"; form preview uses `contain` (was `cover`).
- Evidence: tsc pass; lint pass; `npm test` 66 suites, 981 tests; ios and android export pass. Spec-changed tests listed in Current state.
- Not reviewed, not committed. Next: architect-reviewer (Opus), commit, Gate 1.5 report.

### Earlier — Gate 1.5 slices 1-4 (2026-10-21 to 2026-10-22)
- Plan approved; slice 1 theme tokens, fonts and token guard; slice 2 Appearance, navigation, tab bar (serif 1.2 em line floor); slice 3 `components/ui/` and dev gallery (testing-library added); slice 4 closet grid, filters, item screen; npm audit deferred; reviewer runs on Sonnet. Each reviewed PASS WITH NOTES and committed; 935 tests at slice 4. Details in ROADMAP decisions and commit messages.

### 2026-10-21 — Gate 1 approved
- The human finished the device check and approved Gate 1. Tagged `gate-1`.
- Known issue carried forward: double "Take photo" tap during the iOS intro close can open two pickers.
- Next: plan the design gate (Gate 1.5).

### Earlier — Gate 1 (2026-10-21)
- Slices 1-6 (multi-photo items, metadata stripping, palette colors and matrix, color detection, camera permission flow, keyboard handling), each reviewed PASS; checkpoints `39dc607`, `21bd742`, `2e6bf13`; gate review PASS; 742 tests. Details in ROADMAP decisions and commit messages.

### 2026-10-20 18:07 — Gate 0 (`a0cc043`)
- Expo skeleton, ESLint, Jest (`jest-expo`), `ClothingItem` type with a strict validator, 16 tests. Working commands recorded in `CLAUDE.md`.

### 2026-10-20 17:15 — Repo started (`f5f4b87`)
