# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-22 by orchestrator (Gate 2 slice 1 reviewed and committed)_

- **Gate:** 2 in progress (plan `docs/plans/gate-2.md`; D1, D4, D5 answered, see ROADMAP). Gate 1.5 approved and tagged `gate-1.5`; Gates 0 and 1 approved.
- **Slice 1 (backend skeleton with stub), reviewed (PASS WITH NOTES) and committed:** `supabase/` at the repo root (`supabase init`, linked to `lithblsvhrxfdkjhnhdy`, no database password used). Function `tag-item` (`verify_jwt = false`): checks `Authorization: Bearer` against the `DEV_TOKEN` secret (constant-time compare, fails closed with 500 if the secret is missing or short), 405 non-POST, 401 bad token, 400 bad or oversized body, 200 with a fixed schema-valid stub. Logic in plain TS (`supabase/functions/_shared/`, `tag-item/handler.ts`); `index.ts` is a thin Deno adapter. Deployed with `--use-api`. API doc `docs/api/tag-item.md`.
- **Contract:** `supabase/functions/_shared/tag-item-contract.ts` is the source of truth; `spotlight/src/ai/tag-item-contract.ts` is a byte-identical copy with a Jest drift test (also vocabulary vs `CATEGORIES`/`PALETTE_IDS`/`SEASONS`, limits vs the doc). Request `{ imageBase64, contentType: "image/jpeg" }`, body max 2,100,000 bytes; response `{ apiVersion: 1, tags: { category, colors, seasons }, stub }` (D6 fields come in slice 2).
- **App:** `ClosetTagger` (`src/ai/closet-tagger.ts`: `MockClosetTagger`, `FakeClosetTagger`), `RemoteClosetTagger` (plain fetch, 20 s AbortController timeout, never throws; failures not-configured / no-token / unauthorized / rejected / server / offline / timeout / invalid-response). `DevTokenStore` with `SecureStoreDevTokenStore` (expo-secure-store, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) and `InMemoryDevTokenStore`. Me tab: `__DEV__`-only Backend section (secure token field, save/clear, Test connection with status text). URL from `EXPO_PUBLIC_SUPABASE_URL` (`spotlight/.env`, gitignored; `.env.example` committed via `!.env.example`). The tagger is not used by the add-item flow yet (slice 2/3).
- **Config changes:** `expo-secure-store` ~57.0.4 (approved; plugin with `faceIDPermission: false`); tsconfig `allowImportingTsExtensions` (Deno-style `.ts` imports in function code reached by tests); Jest `moduleDirectories` adds `<rootDir>/node_modules` (function files outside `spotlight/`); `TextField` passes `secureTextEntry`, `autoComplete`, `textContentType`.
- **Security tests:** `src/security/secret-scan.test.ts` scans every committable file under `spotlight/` and `supabase/` for provider keys, Supabase secret keys, service-role JWTs and 64-hex tokens (planted-file test; a planted literal was confirmed to fail it); checks `.env*` ignored, `.env.example` not; only allowed `EXPO_PUBLIC_` names. Dev token lives only in `~/.config/spotlight/dev-token` (600) and the `DEV_TOKEN` secret.
- **Found and fixed on the deployed function:** answering before the body was read (401, Content-Length precheck) left large uploads hanging, then 503. The adapter now drains the unread body before replying (`finishBody`): at most 8 MB or 5 s, then cancel; a declared Content-Length over 8 MB is cancelled at once (those clients see a hang, by design; the app never sends over 2.1 MB).
- **Review fixes (architect-reviewer):** drain byte cap plus time budget; a missing or malformed Authorization header gets 401 even when the secret is misconfigured (500 only for a well-formed bearer); the secret scan covers every committable file in the repo (git, falling back to a directory walk) and the EXPO_PUBLIC_ check also covers `.md`, `.env*` and `app.config.*`.
- **Verified 2026-10-22 (macOS, implementer, after review fixes):** tsc pass; lint pass; `npm test` 75 suites, 1154 tests (was 66/981); ios and android export pass before the fixes (bundles contain the URL, not the token). curl on the redeployed function: no token 401, Basic header 401, wrong token 401, GET 405, OPTIONS 405, valid 200 with stub, malformed JSON 400, not a JPEG 400, 2.15 MB 400, chunked 2.2 MB 400, 1.9 MB valid 200, 1.9 MB without token 401, 9 MB (with and without token) no answer within 90 s (cancelled by design), 300 KB at 20 KB/s 401 / 200 after about 15 s, 1.9 MB at 100 KB/s without token 401 after the full upload (about 18.6 s). The 5 s drain budget is unit-tested only; from the client the whole upload completed either way. Not verified: anything on a device.
- **Device checks added by slice 1:** Me tab Backend section in both themes; paste the token (secure field, paste works); Test connection: OK with the token, "Wrong token" after saving a wrong one, "Offline" in airplane mode; token survives an app restart; Clear works; section absent in a release build (unverified); web shows "Secure storage is not available" (web not a target).
- **Known issues (for later):** Backend section code is in the release bundle (render gated by `__DEV__`). No rate limit on the function, and unauthenticated invocations are not rate-limited either (each can make it read up to 8 MB or 5 s). The drift test's doc check only looks for the limit numbers in `docs/api/tag-item.md`, not the shapes. `supabase/functions/tag-item/index.ts` is not Deno type-checked and the Deno files are not linted (outside ESLint's base path; handler and shared files are type-checked through the tests); run `deno check` in slice 3 if Deno is available via the CLI. Earlier: forced-scheme flash; `hanger` needs iOS 16+; serif accent clipping; token-guard gaps; typed routes regenerate only on `expo start`; dashed borders on Android unverified; gallery `!__DEV__` redirect unverified; npm audit deferred to the next SDK upgrade.
- **Review notes still deferred:** slice 5: name `maxLength` counts UTF-16 units; thumbnails pressable while busy. slice 4: item screen spinner-only loading; no rendered test of screen wiring. Earlier: radios report `checked` and `selected`; swatch sizes 26/40 and chevron stroke raw numbers.
- **Next step:** the human puts the token on the phone and runs the slice 1 device checks, and answers D6 and D7. Then slice 2.
- **Open questions:** whether to record the slice 1 decisions (contract copy + drift test, `apiVersion`, drain, 400 for oversized) in ROADMAP; detection thresholds need tuning on real photos; reword "Photos stay on this device" once uploads exist (slice 3).

## Gate plans
- Gate 1.5 (approved 2026-10-21, done): five slices, see `git log` and ROADMAP decisions.
- Gate 2: `docs/plans/gate-2.md`; D1, D4, D5 answered; slice 1 implemented.

## Log
Newest first.

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
