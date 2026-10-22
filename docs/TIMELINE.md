# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-22 by orchestrator (slice 4 mockup decisions recorded)_

- **Gate:** 1.5 (Design foundation). Slices 1-4 committed (see `git log`). Slice 5 not started. Gates 0 and 1 approved (tag `gate-1` on `e889592`).
- **Slice 4 contents:** Closet tab restyled: masthead with "N pieces", search box (TextField `labelHidden`, named "Search your closet") and category chips (All plus each category, plural labels), 2-column grid of photo-background tiles (checkerboard `photoBackground`/`photoBackgroundAlt`, photo cropped to fill (`cover`, human decision), serif category name, colors underneath). Filter logic in `core/closet-filter.ts` (search matches category id/labels, color names, style tags; case-insensitive; every word must match; combines with the category); no-match message distinct from the empty closet. Item screen split: read-only `item/[id]/index.tsx` (`components/item-detail/`: photo area under the status bar, back and Edit squares, angle tabs, title = category, colors, style tags, seasons; reloads on focus via `useClosetItemOnFocus`) and the unchanged form moved to `item/[id]/edit.tsx` (git rename). One behavior change in the form: after a delete it returns to the closet (`router.dismissTo('/')`) instead of the now read-only item screen.
- **Human decisions applied:** chips pad 14 pt (`sizes.chipPaddingHorizontal`) and take `casing` (`uppercase` default, 12 pt tracked; `sentence` 13 pt via new `typography.chipSentence`, semibold for the add chip). TextField errors are in the accessibility label ("Name, error: ...", hint dropped while an error shows) and announced with `AccessibilityInfo.announceForAccessibility` only when an error appears or changes. Spec-changed tests: `ui-styles.test.ts` (chip loop over casings, padding, casing, text-field accessibility), `chip.test.tsx` (casing test added), `text-field.test.tsx` (error label instead of hint; announcement and hidden-label tests added). No test deleted.
- **New tokens:** `sizes.chipPaddingHorizontal` 14, `sizes.closetTileHeight` 200, `sizes.itemPhotoHeight` 340, `opacity.pressed` 0.7, `typography.chipSentence`.
- **Verified 2026-10-22 (macOS):** orchestrator re-ran tsc pass, lint pass, `npm test` 64 suites, 935 tests; implementer: tsc pass (after a brief `expo start` regenerated typed routes for `/item/[id]/edit`); lint pass; `npm test` 64 suites, 935 tests (was 60/885); ios and android export pass. Not verified: anything on a device.
- **Token guard:** allowlist unchanged (10). None of the slice 4 files were on it; all new and restyled files pass unlisted. `themed-text.tsx` stays: still used by `edit.tsx` (form screen, restyled in slice 5), the slice 5 components, `database-error-boundary.tsx` and `app-tabs.web.tsx`.
- **Known issues (for later):** a "Take photo" tap during the iOS camera intro close can open two pickers (fix: cancel `afterIntro` in `takePhoto`). Switching to System while a forced scheme is active may show the old scheme for a frame (unverified on device). `hanger` needs iOS 16+. 1.2 em serif lines may still clip accented capitals. Guard gaps listed in `token-guard-rules.js`. Typed routes (`.expo/types`, gitignored) only regenerate on `expo start`. Dashed borders on Android unverified. Gallery `!__DEV__` redirect unverified on a release build. npm audit: 5 root advisories, human decision no action until the next SDK upgrade (details in the 2026-10-22 audit log entry and ROADMAP). `database-error-boundary.tsx` and `app-tabs.web.tsx` still use the template themed components and are in no slice.
- **Mockup differences (slice 4):** answered by the human 2026-10-22, see ROADMAP: keep all as built; tiles now crop to fill.
- **Do in slice 5 (human 2026-10-22):** add an item name field (data type, validator, SQLite migration, form, item title, tile label, search); defaults in ROADMAP "Item name field". This is a data-model change, not only a restyle: existing tests stay, new ones cover the field and the migration.
- **Carry into slice 5 (approved):** use `inputBorder` where a border is an input's only boundary; give `animated-icon.tsx` the theme background so the allowlist empties; season chips and "+ Add" can use `casing="sentence"`.
- **Device checks added by slice 4:** closet grid in both themes (tile size, contain fit on real photos, checkerboard backgrounds); search and chips with keyboard up (tap a tile while typing, drag dismisses); chip row scrolls edge to edge; item screen under the status bar on iOS and Android, back/Edit squares, swipe back on iOS, angle tabs; save in Edit returns to the item screen showing changes; delete in Edit returns to the closet; VoiceOver/TalkBack read "Name, error: ..." and announce a new error once; plus the slice 2-3 checks still pending.
- **Review notes still deferred:** slice 4: item screen shows only a spinner while loading, with no Back control (system back works); screen wiring (empty vs no-match message, Edit push, delete navigation, no Delete on the read-only screen) has no rendered test, so it is on the device checklist; a fresh checkout needs `expo start` once before tsc sees `/item/[id]/edit`. Earlier: radios report both `checked` and `selected`; swatch sizes 26/40 and chevron stroke are raw numbers outside `src/theme/`.
- **Next step:** slice 5 in a new session, including the name field. Stop at the Gate 1.5 report. Do not start Gate 2. Stop at the Gate 1.5 report. Do not start Gate 2.
- **Open questions:** search matches parts of words ("blue" finds "Sky blue"); human has not said whether that is too broad. Detection thresholds need tuning on real photos; Android keyboard padding relies on `useHeaderHeight`. Gate 2: reword "Photos stay on this device" once uploads exist.

## Gate 1.5 plan (approved 2026-10-21)
Each slice keeps the existing tests passing unchanged. The token guard starts with an allowlist of not-yet-restyled files; each slice removes its files from it, and slice 5 leaves it empty.
1. **Theme tokens and fonts.** `src/theme/` (tokens: light/dark colors, fonts, type scale in pt, letter spacing converted from em, spacing, borders) replacing `constants/theme.ts`; font loading in the root layout behind the splash (if fonts approved); `use-theme` returns the new tokens; token guard (ESLint `no-restricted-syntax` for hex/rgb strings and numeric `fontSize` outside `src/theme/` and `core/palette.ts`, plus a Jest test scanning the same files). Proposes the missing dark values (photo background, border, body secondary, danger) to the human before finishing. Tests: token completeness (every light key has a dark key), contrast of text on background, guard catches a planted raw color.
2. **Appearance setting, navigation and tab bar.** `core/appearance.ts` (preference type, resolve against system), an `AppearanceStore` interface with a mock and a real one (`expo-sqlite/kv-store`, already in the installed expo-sqlite; no new dependency), provider in the root layout feeding the navigation theme, `StatusBar` style and the tabs. NativeTabs kept (Closet, Add, Me) with mockup labels, icons and colors; check on device whether custom fonts show in tab labels. Plus a "Me" tab holding only the Appearance control (Profile mockup). Tests: persistence, System follows the OS, resolution.
3. **Shared components and dev gallery.** `components/ui/`: Button (primary, outline, text), Chip (plain, selected, serif style tag, dashed "add"), labeled TextInput (underline and boxed), SectionLabel, ScreenHeader (masthead with 2 pt rule and the step header variant), Swatch (circle plus text label), SegmentedControl (used by Appearance and the matrix Primary/Secondary if adopted). Dev screen `app/dev/components.tsx` with a light/dark toggle, redirecting away when `!__DEV__`. Tests: roles, states, labels, 44 pt hit areas.
4. **Closet grid and item screen.** Restyle `app/(tabs)/index.tsx` and `closet-grid.tsx` (masthead with count, 2-column grid, photo-background tiles, serif labels). Search box and category filter chips with the filter/search logic in `src/core` (tested). Item screen becomes read-only detail (`item/[id]`) with Edit opening the unchanged form at `item/[id]/edit`; delete stays in the form.
5. **Add/Edit form, photo set, color matrix, camera intro, denied panel.** Restyle `add.tsx`, `item-form-fields.tsx`, `photo-set-field.tsx`, `color-field.tsx`, `color-matrix.tsx`, `camera-intro-modal.tsx`, `camera-denied-panel.tsx`, `tag-field.tsx`, `chip-group.tsx`, `form-button.tsx`. Keyboard handling and camera flow logic untouched. Empty the guard allowlist. Gate review, gate report, device checklist (Gate 1 checklist re-run plus both themes per screen).

Decisions: see ROADMAP "Gate 1.5 answers". Fonts approved; install in slice 1 with `npx expo install`.

## Log
Newest first.

### 2026-10-22 — Slice 4 mockup decisions
- Human: keep the masthead count, no search icon, 26/36 pt sizes, later-gate sections stay out. Tiles crop to fill: closet grid switched to `contentFit="cover"`. New: an item name field, to build in slice 5. Recorded in ROADMAP.
- Evidence: tsc pass; lint pass; `npm test` 64 suites, 935 tests.
- Next: slice 5.

### 2026-10-22 — Gate 1.5 slice 4 reviewed and committed
- architect-reviewer (Sonnet): PASS WITH NOTES, no blocking issues. `dismissTo('/')` checked against the expo-router StackRouter source: it pops past the item screen, and on a deep link it replaces the edit screen with the closet. The spec-changed tests match the human decisions.
- Orchestrator: `git diff` on the test files shows only restructured loops (now also over casings) and the error-in-label change; nothing weakened. Review note about an empty seasons box dropped, because the validator requires at least one season. Other notes deferred (Current state).
- Evidence (orchestrator): tsc pass; lint pass; `npm test` 64 suites, 935 tests.
- Next: human answers on the mockup differences, then slice 5.

### 2026-10-22 — Gate 1.5 slice 4 implemented (closet grid, filters, item screen)
- Closet masthead, search and category chips (logic in `core/closet-filter.ts`), 2-column photo tiles; read-only item screen at `item/[id]` with angle tabs, Edit opens the unchanged form at `item/[id]/edit` (delete now returns to the closet).
- Human decisions: chip 14 pt padding token and `casing` prop; TextField error in the accessibility label and announced on appearance. Spec-changed tests listed in Current state.
- Evidence: tsc pass; lint pass; `npm test` 64 suites, 935 tests; ios and android export pass.
- Not reviewed, not committed. Next: architect-reviewer, commit, then slice 5.

### 2026-10-22 — npm audit checked; slice 4 decisions
- Audit: 61 warnings trace to 5 root advisories, 4 dev/build-only, 1 (`decode-uri-component` via expo-router) likely in the app as a local DoS. No safe fix within SDK 57. Human: no action, revisit at the next SDK upgrade.
- Human decisions for slice 4: chips follow the mockup (14 pt padding, mockup casing); fix TextField error announcements. Recorded in ROADMAP and Current state.
- Next: slice 4.

### 2026-10-22 — Gate 1.5 slice 3 reviewed and committed
- architect-reviewer (Sonnet): PASS WITH NOTES, no blocking issues. Applied: allowlist comment for `themed-text.tsx`; ROADMAP decision (inputBorder values, chip border, testing-library approval); TextField uses `error || hint` for both the visible message and the spoken hint; testing-library pinned to `~14.1.0`. Also untracked `.DS_Store` (human request) and committed its `.gitignore` line.
- Deferred review notes listed in Current state.
- Evidence (orchestrator): tsc pass; lint pass; `npm test` 60 suites, 885 tests.
- Next: slice 4.

### 2026-10-22 — Gate 1.5 slice 3 implemented (shared components, dev gallery)
- Added `components/ui/` (Button, Chip, TextField, SectionLabel, ScreenHeader, Swatch, SegmentedControl) with tested style/accessibility modules; AppearanceControl now uses SegmentedControl; dev gallery with a local ThemeOverride; dev-only Me row. Tokens `inputBorder`, `inputSerif`, `headerLabel`, `opacity.disabled`.
- New devDependency `@testing-library/react-native` 14.1.0 (human-approved, installed by the orchestrator); rendered tests for every interactive ui component and AppearanceControl.
- Evidence: tsc pass; lint pass; `npm test` 60 suites, 885 tests; ios and android export pass.
- Not reviewed, not committed. Next: architect-reviewer, commit, then slice 4.

### 2026-10-22 — Gate 1.5 slice 2 follow-ups (human feedback)
- Human: keep the native override; keep ADD with a mockup-like round plus icon; Closet icon a hanger; Me title clipped at the top on device. Recorded in ROADMAP.
- Fix: Bodoni Moda (capHeight 0.75 em, descent 0.4 em) clipped in 1.0 em line boxes; serif variants now use ceil(1.2 em). Expected display/title/headline line heights updated in `theme.test.ts` (spec change) plus a new test enforcing the 1.2 em floor.
- architect-reviewer (Sonnet): PASS WITH NOTES (accents can still clip at 1.2 em; `hanger` needs iOS 16).
- Evidence: tsc pass; lint pass; `npm test` 49 suites, 807 tests. Also committed the human's CLAUDE.md and architect-reviewer.md edits.
- Next: device check of the fixes, then slice 3.

### 2026-10-21 — Gate 1.5 slice 2 reviewed and committed
- architect-reviewer (Sonnet): PASS WITH NOTES, no blocking issues. Native override checked against RN 0.86 source: 'unspecified' is valid; System recovery relies on native `appearanceChanged` (unverified on device).
- Applied: override now runs in `useLayoutEffect` (before paint). Not applied: ROADMAP entry for the override (needs human approval).
- Evidence (orchestrator): tsc pass; lint pass; `npm test` 49 suites, 806 tests.
- Next: human decisions above, then slice 3.

### 2026-10-21 — Gate 1.5 slice 2 implemented (Appearance, navigation, tab bar)
- Appearance preference (core), `AppearanceStore` mock + kv-store implementation, `AppearanceSettings` controller, provider in the root layout feeding `useTheme()`, the navigation theme, StatusBar and RN's native override. NativeTabs restyled (Closet, Add, Me); new Me tab with the Appearance control.
- Evidence: tsc pass; lint pass; `npm test` 49 suites, 806 tests; ios and android export pass.
- Not committed, not reviewed. Next: architect-reviewer, then commit, then slice 3.

### 2026-10-21 — Gate 1.5 slice 1 done (theme tokens and fonts)
- Added `src/theme/`, fonts (`@expo-google-fonts/bodoni-moda`, `@expo-google-fonts/archivo`) and the token guard; removed `constants/theme.ts` and `global.css`; screens mapped to tokens without restyling.
- architect-reviewer (Sonnet): PASS WITH NOTES. Follow-ups applied: allowlist cap, guard test loads real ESLint config (removing the guard block fails 8 tests), named-color selector, narrower test exemption, serif title tracking from mockup px.
- Human approved the 5 dark values and both suggestions (ROADMAP "Gate 1.5 dark values").
- Evidence (orchestrator re-run): tsc pass; lint pass; `npm test` 45 suites, 772 tests; ios and android export pass.
- Next: slice 2 in a new session.

### 2026-10-21 — Gate 1.5 plan approved
- Human: fonts approved, keep NativeTabs, adopt read-only detail, agent proposes dark values, add closet search and category filters, keep "autumn". Other conflicts take the defaults. Recorded in ROADMAP (criteria and decisions) and the plan above.
- Next: slice 1 (theme tokens and fonts) in a new session.

### 2026-10-21 — Reviewer model
- `architect-reviewer` now runs on Sonnet for slice reviews (frontmatter `model: sonnet`). Gate-closing reviews are spawned with an Opus override. Rule recorded in CLAUDE.md Workflow.

### 2026-10-21 — Gate 1.5 planned
- Read `docs/design/README.md` and all 14 mockups. Added Gate 1.5 to ROADMAP with criteria, Design lines on Gates 2-4, a Polish item (Loading), a "Proposed, not approved" list, and the design decision. Added the design line to CLAUDE.md Workflow.
- Slice plan above. Conflicts and decisions sent to the human. No app code changed.
- Next: human answers, then slice 1.

### 2026-10-21 — Gate 1 approved
- The human finished the device check and approved Gate 1. Tagged `gate-1`.
- Known issue carried forward: double "Take photo" tap during the iOS intro close can open two pickers.
- Next: plan the design gate (Gate 1.5).

### Earlier — Gate 1 (2026-10-21)
- Slices 1-6 (multi-photo items, metadata stripping, palette colors and matrix, color detection, camera permission flow, keyboard handling), each reviewed PASS; checkpoints `39dc607`, `21bd742`, `2e6bf13`; gate review PASS; 742 tests. Details in ROADMAP decisions and commit messages.

### 2026-10-20 18:07 — Gate 0 (`a0cc043`)
- Expo skeleton, ESLint, Jest (`jest-expo`), `ClothingItem` type with a strict validator, 16 tests. Working commands recorded in `CLAUDE.md`.

### 2026-10-20 17:15 — Repo started (`f5f4b87`)
