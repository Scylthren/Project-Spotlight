# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-22 by orchestrator (Gate 1.5 approved and tagged)_

- **Gate:** 1.5 (Design foundation) approved by the human 2026-10-22 after the device checklist (no problems found); tagged `gate-1.5`. Gates 0 and 1 approved (tag `gate-1` on `e889592`). Gate 2 not started.
- **Slice 5 contents:** Add/Edit form restyled from SaveItem/Angles (single form, Gate 1 fields plus name; order: photos, colors, name, category, seasons, style tags). Add tab has a "New piece" step header (no back, no step count) and "Save to closet"; Edit keeps the native "Edit item" header. Photo area: 330 pt photo-background preview (`contain`) with a "Front · Primary" badge, three-column angle tiles plus a dashed "Add another angle" tile (opens the role panel), stacked Take photo / Choose from library, text buttons for Make primary / Remove photo. Colors: swatch chips (primary 2 pt outline + "Primary"), dashed "+ Choose colors" / "Edit colors" chip, italic "Detected from the photo" note. Chips via the shared look (`casing="sentence"` for category, seasons, angle, "+ Add"; style tags italic serif). Tag box is a boxed `TextField` (`inputBorder`). Color matrix: "Pick colors" serif title, five columns of 46 pt swatches with a 2 pt ink ring, chosen colors as hairline rows, Done pinned at the bottom. Camera intro: square card on a scrim, serif title, Continue / library / Not now (copy unchanged). Denied panel: ink-outlined box. FormButton wraps the shared button look (destructive = danger outline).
- **Item name (human-approved addition):** `ClothingItem.name?` (absent = no name, never ""), trimmed, at most 60 characters counted as code points (`core/item-name.ts`); validator, `createClothingItem`, form values, `hasDetailChanges`, SQLite migration 6 (`ALTER TABLE clothing_items ADD COLUMN name TEXT`, NULL = no name), both repositories, closet tile (name, meta "Top · Navy, White" when named), item screen title (name, category line under it when named), search (also matches the name), delete confirmation. Fallback to the category everywhere.
- **Spec-changed tests:** `sqlite-closet-repository.test.ts` migration 5 tests hard-coded "latest = version 5"; they now migrate with `CLOSET_MIGRATIONS.slice(0, 5)` (and run the rest of the chain before using the repository), like the migration 4 tests already did. `token-guard.test.ts` `MAX_ALLOWLIST` 10 -> 0 (the test's own comment said slice 5 sets it to 0). No other existing test changed; none deleted.
- **Token guard:** allowlist empty (`TOKEN_GUARD_ALLOWLIST = []`). `themed-text.tsx` and `themed-view.tsx` deleted (no users left); `database-error-boundary.tsx`, `app-tabs.web.tsx` and `animated-icon.tsx` (overlay on `colors.background`, unused `AnimatedIcon` on `colors.surface`, template gradient removed) use tokens. New tokens: `colors.scrim` (#000000 both), `opacity.scrim` 0.6, `sizes.formPhotoHeight` 330, `angleTileHeight` 120, `formSwatchSize` 26, `matrixSwatchSize` 46, `chosenSwatchSize` 28.
- **Known issue fixed:** `CameraAccessFlow.takePhoto` cancels a picker waiting for the intro to close, so a tap during the iOS close opens one picker; after the gate review, the replacing picker also waits until the intro has closed (or the 1 s timeout), so none is presented over the closing modal (2 tests, tightened).
- **Verified 2026-10-22 (macOS):** orchestrator re-ran tsc pass, lint pass, `npm test` 66 suites, 981 tests after the review fix; implementer: tsc pass; lint pass; `npm test` 66 suites, 981 tests (was 64/935); `expo export` ios and android pass. Not verified: anything on a device.
- **Device checks added by slice 5:** Add and Edit in both themes against SaveItem/Angles (preview contain fit, badge, angle tiles and dashed tile, stacked buttons); name field: type, 60-character cap, keyboard over it (iOS insets, Android padding), tap into it while the tag keyboard is up; save a named item, closet tile and item screen show it, search finds it; clear the name, falls back to the category; an existing (pre-migration) closet opens with no names; color chips and matrix (five columns, ring, Done at the bottom, pageSheet on iOS); camera intro on the scrim and the denied panel; double "Take photo" tap during the iOS intro close opens one picker; destructive Delete outline; database error screen (hard to trigger; unverified); web tabs (web is not a target, unverified); plus the slice 2-4 checks still pending.
- **Known issues (for later):** Switching to System while a forced scheme is active may show the old scheme for a frame (unverified on device). `hanger` needs iOS 16+. 1.2 em serif lines may still clip accented capitals. Guard gaps listed in `token-guard-rules.js`. Typed routes (`.expo/types`, gitignored) only regenerate on `expo start`. Dashed borders on Android unverified (now also the add-angle tile and add chips). Gallery `!__DEV__` redirect unverified on a release build. npm audit: no action until the next SDK upgrade (ROADMAP).
- **Mockup differences (slice 5):** approved by the human 2026-10-22 (copy changes, named-item meta lines, form photo `contain`); see ROADMAP.
- **Review notes still deferred:** slice 5: name `maxLength={60}` counts UTF-16 units while the validator counts code points (emoji names stop at 30 in the box; safe direction); photo thumbnails stay pressable while the form is busy (only changes the selected photo). slice 4: item screen shows only a spinner while loading; screen wiring has no rendered test (device checklist); a fresh checkout needs `expo start` once before tsc sees `/item/[id]/edit`. Earlier: radios report both `checked` and `selected`; swatch sizes 26/40 and chevron stroke are raw numbers outside `src/theme/`.
- **Next step:** Gate 2 (backend skeleton and tagging) only when the human says to start it. Start by proposing the two background-removal options (ROADMAP Gate 2).
- **Open questions:** Detection thresholds need tuning on real photos; Android keyboard padding relies on `useHeaderHeight`. Gate 2: reword "Photos stay on this device" once uploads exist.

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
