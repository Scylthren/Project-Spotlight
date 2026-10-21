# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-21 by orchestrator (Gate 1.5 planned; waiting for the human's answers)_

- **Gate:** 1.5 (Design foundation), **not started**. Plan below needs the human's approval and answers to the open decisions. No app code written for it. Gates 0 and 1 are approved (tag `gate-1` on `e889592`).
- **Committed:** Gate 1 in `2e6bf13`; approval in `e889592`; Gate 1.5 plan docs (ROADMAP Gate 1.5, Design lines, Polish, "Proposed, not approved", design decision; CLAUDE.md design line; `docs/design/`) in the commit after it.
- **Verified 2026-10-21 (macOS, Gate 1 tree):** tsc pass; lint pass; `npm test` 41 suites, 742 tests pass; ios/android export pass. Device check done by the human. Nothing re-run since (docs-only changes).
- **Known issues (for later):** a new "Take photo" tap while the iOS camera intro is closing can open two pickers (fix: cancel `afterIntro` in `takePhoto`).
- **Next step:** human answers the decisions in the plan. Then each slice is its own session: implementer-tester, architect-reviewer, update this file. Stop at the Gate 1.5 report. Do not start Gate 2.
- **Open questions:** detection thresholds need tuning on real photos; Android keyboard padding relies on `useHeaderHeight` and Expo Go's soft-input mode. Gate 2: reword "Photos stay on this device" in app.json and the camera intro once uploads exist.

## Gate 1.5 plan (proposed, not approved)
Each slice keeps the existing tests passing unchanged. The token guard starts with an allowlist of not-yet-restyled files; each slice removes its files from it, and slice 5 leaves it empty.
1. **Theme tokens and fonts.** `src/theme/` (tokens: light/dark colors, fonts, type scale in pt, letter spacing converted from em, spacing, borders) replacing `constants/theme.ts`; font loading in the root layout behind the splash (if fonts approved); `use-theme` returns the new tokens; token guard (ESLint `no-restricted-syntax` for hex/rgb strings and numeric `fontSize` outside `src/theme/` and `core/palette.ts`, plus a Jest test scanning the same files). Tests: token completeness (every light key has a dark key), contrast of text on background, guard catches a planted raw color.
2. **Appearance setting, navigation and tab bar.** `core/appearance.ts` (preference type, resolve against system), an `AppearanceStore` interface with a mock and a real one (`expo-sqlite/kv-store`, already in the installed expo-sqlite; no new dependency), provider in the root layout feeding the navigation theme, `StatusBar` style and the tabs. Tab bar per the decision below, plus a "Me" tab holding only the Appearance control (Profile mockup). Tests: persistence, System follows the OS, resolution.
3. **Shared components and dev gallery.** `components/ui/`: Button (primary, outline, text), Chip (plain, selected, serif style tag, dashed "add"), labeled TextInput (underline and boxed), SectionLabel, ScreenHeader (masthead with 2 pt rule and the step header variant), Swatch (circle plus text label), SegmentedControl (used by Appearance and the matrix Primary/Secondary if adopted). Dev screen `app/dev/components.tsx` with a light/dark toggle, redirecting away when `!__DEV__`. Tests: roles, states, labels, 44 pt hit areas.
4. **Closet grid and item screen.** Restyle `app/(tabs)/index.tsx` and `closet-grid.tsx` (masthead with count, 2-column grid, photo-background tiles, serif labels). Item screen per the decision below. No search or filters unless approved.
5. **Add/Edit form, photo set, color matrix, camera intro, denied panel.** Restyle `add.tsx`, `item-form-fields.tsx`, `photo-set-field.tsx`, `color-field.tsx`, `color-matrix.tsx`, `camera-intro-modal.tsx`, `camera-denied-panel.tsx`, `tag-field.tsx`, `chip-group.tsx`, `form-button.tsx`. Keyboard handling and camera flow logic untouched. Empty the guard allowlist. Gate review, gate report, device checklist (Gate 1 checklist re-run plus both themes per screen).

Decisions needed before slice 1 (see the session report for detail): fonts dependency; tab bar; item screen read-only detail or not; dark values the README doesn't give; closet search/filters; single form vs two-step add; color matrix interaction; copy changes.

## Log
Newest first.

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
