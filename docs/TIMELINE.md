# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-21 by orchestrator (Gate 1 review PASS; report sent, awaiting human device check)_

- **Gate:** 1 (Local closet, no AI). Not approved by the human yet. Gate 0 is done.
- **Last commit:** "Gate 1 checkpoint 3" (slices 1-6; human-requested checkpoint, not gate approval). Slice 6 committed before its review.
- **Committed in `21bd742`:** slice 1 multi-photo (migration 3); slice 2/2b JPEG metadata stripping + backfill (migration 4); slice 3 palette colors, CIEDE2000, color matrix (migration 5); slice 4 color detection; slice 5 camera permission flow + slice 4 review fixes. Slices 1-5 reviewed PASS.
- **Slice 6 (in checkpoint 3, reviewed PASS):** keyboard handling on Add and Edit (the tag box is the only `TextInput` in the app). `core/keyboard.ts` (`tagReturnKeyAction`, `keyboardAvoidanceFor`), `components/keyboard-aware-scroll-view.tsx`, `components/keyboard-dismiss-area.tsx`. Plus the slice 5 review fixes in `data/camera-access-flow.ts` and the iOS announcement in `CameraDeniedPanel`. Decision recorded in ROADMAP.
- **Slice 4/5 pieces:** see ROADMAP decisions; color detection in `data/form-color-detection.ts`; camera flow in `core/camera-access.ts`, `data/camera-access-flow.ts`, `hooks/use-camera-access.ts`.
- **Verified 2026-10-21 (macOS):** `npx tsc --noEmit` pass; `npm run lint` pass; `npm test` 41 suites, 742 tests pass; `CI=1 npx expo export` ios and android both succeed.
- **Unverified (needs a device):** all keyboard behavior (avoidance, scroll-into-view, dismissal, return key) on iPhone SE size and Android; the whole camera permission flow; camera opening after the intro closes on iOS; detection quality and Hermes speed; VoiceOver announcements. No simulator on this Mac (Command Line Tools only, no Xcode).
- **Next step:** human device check of Gate 1 (checklist in the gate report). Then the human approves Gate 1 or asks for changes. Do not start Gate 2 until approved. Open small item: a new "Take photo" tap during the iOS intro close can open two pickers (cancel `afterIntro` in `takePhoto`).
- **Open questions:** detection thresholds need tuning on real photos; whether to show detected chips more prominently; Android keyboard padding relies on `useHeaderHeight` and Expo Go's soft-input mode (check on device). Gate 2: reword "Photos stay on this device" in app.json and the camera intro once uploads exist.

## Log
Newest first.

### 2026-10-21 — Review: slice 6 + Gate 1 sweep
- architect-reviewer: PASS, no blocking issues. Keyboard approach sound (one mechanism per platform, offsets correct, `handled` + touch-end dismiss keeps first taps); camera-flow fixes correct and tested.
- Gate sweep: every spec item maps to tests except UI, keyboard and camera behavior, which are device-only; no secrets or `EXPO_PUBLIC_`; `.env*` and native dirs ignored; deps approved. Platform-specific list compiled for the gate report.
- Suggestions: cancel the waiting intro pick on a new tap; check the iOS/Android keyboard gaps and tag-box scroll on device.
- Gate 1 report sent to the human. Next: human device check.

### 2026-10-21 — Checkpoint 3 committed; Gate 1 review started
- Orchestrator re-ran on the slice 6 tree: tsc pass, lint pass, 41 suites / 742 tests pass; package.json unchanged since `21bd742`.
- Committed slices 1-6 state as "Gate 1 checkpoint 3" at the human's request (not gate approval; slice 6 unreviewed at commit time).
- Gate-level architect-reviewer pass is running (slice 6 + every Gate 1 criterion and spec item, platform-specific code list, known issues).
- Next: review result, then the Gate 1 report with the hand-test checklist.

### 2026-10-21 — Slice 6: keyboard handling (+ slice 5 review fixes)
- Add/Edit use `KeyboardAwareScrollView`: iOS scroll insets (native, scrolls the focused field into view; verified in RN 0.86 source), Android `KeyboardAvoidingView` padding offset by `useHeaderHeight` (from `expo-router/react-navigation`, no new dep). `on-drag` dismissal; `handled` taps; `KeyboardDismissArea` closes the keyboard on touch end outside the tag area.
- Tag box: `submitBehavior="submit"`, Done adds the tag and keeps focus; Done on an empty box blurs (`tagReturnKeyAction`).
- Camera flow: intro reappearing clears the old timer and ends the waiting pick; close never finishes while the intro is shown; picker opens before the 'camera-intro' hold is released; double "Take photo" settles the older tap; dispose settles a tap waiting for the close (was left hanging). iOS announces the denied panel.
- Evidence: tsc, lint pass; 41 suites / 742 tests (6 new flow tests fail on the old flow); ios/android export pass. No simulator (no Xcode). Next: architect-reviewer.

### 2026-10-21 — Review: slice 5 (camera permission flow + slice 4 fixes)
- architect-reviewer: PASS, no blocking issues. No fake deny button, library offered in every state, no camera on entry, AppState listener cleaned up, onDismiss/timer can't launch twice or after unmount; replaced color test is legitimate (intended rule change).
- Orchestrator re-ran before commit: tsc pass, lint pass, 40 suites / 728 tests pass. Committed as `21bd742` "Gate 1 checkpoint 2" (human asked; not gate approval; slice 5 committed before review).
- Suggestions folded into slice 6: clear the old close timer when the intro reappears; tests for onDismiss-then-timer and dispose-while-closing; settle the first tap's promise on a double tap; launch the picker before releasing the matrix hold; iOS announcement for the denied panel.
- Next: slice 6 (keyboard), then the Gate 1 report and the device check.

### 2026-10-21 — Slice 5: camera permission flow (+ slice 4 review fixes)
- Intro modal on entering Add when undetermined (once per app session; "Not now" hides it until restart; "Take photo" shows it any time, also on Edit). One button triggers the real prompt; no fake "Don't Allow". Denied: inline panel with Settings (or the real prompt when `canAskAgain`, Android). Library offered on every surface. Re-check on AppState 'active'.
- SDK 57 docs checked: `getCameraPermissionsAsync` / `requestCameraPermissionsAsync`; library needs no permission for images. app.json usage strings already specific; unchanged.
- Review fixes: user color touch blocks a running detection; failed detection clears stale auto colors (test changed to the new rule); detection logic moved to `FormColorDetection` (tested); matrix never opens during a save (notice dropped on success, shown on failure); jpeg-js `~0.4.4`.
- Evidence: tsc, lint pass; 40 suites / 728 tests; ios/android export pass. Next: architect-reviewer.

### 2026-10-21 — Review: slice 4 (color detection)
- architect-reviewer: PASS, no blocking issues. Temp-file cleanup, stale-result guards, matrix can't trap the user, jpeg-js in dependencies.
- Orchestrator re-ran: tsc pass, lint pass, 36 suites / 664 tests pass; package.json vs 39dc607 adds only jpeg-js since the last approved list.
- Suggestions folded into slice 5: a user deselect can be undone by a running detection; stale auto colors stay after a failed detection; hook detection logic untested; don't open the matrix during a save; pin jpeg-js with `~`.
- Next: slice 5 (camera permission modal), then slice 6 (keyboard), then the Gate 1 report.

### 2026-10-21 — Slice 4: color detection from the front photo
- Added jpeg-js 0.4.4 (BSD-3-Clause, pure JS, ships types). Decoding verified with `Buffer` removed (Hermes has none).
- Segmentation: border colors clustered in Lab (CIE76), flood fill (deltaE 12, shading 1.5x with step < 3), largest component, holes filled, alpha < 128 ignored. Confidence from garment share, separation, border uniformity, border touch.
- Colors: k-means++ (k=5, seed fixed), merge centers < 10 CIEDE2000, palette match, secondaries >= 10%. Prefill threshold stays 0.6.
- Folded in slice 3 review notes: iOS announcement of refused taps, header roles instead of labels on plain Views, color taps read the latest colors (ref), `setDetectedColors`, backfill leak comment.
- Evidence: tsc, lint, 664 tests, ios/android export all pass. Next: architect-reviewer.

### 2026-10-21 — Timeline set up
- Added this file and pointers to it in `CLAUDE.md` and both agent definitions. No code changed.
- Verified typecheck and 608 tests on the uncommitted tree. Found the lint environment issue above.

### 2026-10-21 (approx. 07:00–10:55) — Gate 1 follow-on work, uncommitted
- Multi-photo items, metadata stripping and backfill, palette colors and color matrix (details in Current state). Schema now through migration 5.
- Test count went from 234 to 608.

### 2026-10-21 06:52 — Gate 1 checkpoint (`39dc607`)
- Add, edit, and delete items from the photo library or camera, stored in SQLite.
- Photos downscaled to 1600px JPEG, temp files cleaned up. User-defined style tags with a reusable list. 234 unit tests.

### 2026-10-20 18:07 — Gate 0 (`a0cc043`)
- Expo skeleton, ESLint, Jest (`jest-expo`), `ClothingItem` type with a strict validator, 16 tests. Working commands recorded in `CLAUDE.md`.

### 2026-10-20 17:15 — Repo started (`f5f4b87`)
