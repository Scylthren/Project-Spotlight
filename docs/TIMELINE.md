# Timeline

The handoff file between sessions and agents. **Read "Current state" before anything else, and trust it.** Only re-explore what it says is unverified or what your task touches. This file exists so no agent spends tokens rediscovering the project.

Rules for updating:
- At the end of every slice, review, gate, or stopped session, rewrite "Current state" and add one entry at the top of "Log".
- Facts only. Each log entry is 3 to 8 lines: what changed, evidence (commands and results), what's next. Put file lists in commit messages, not here.
- Write "unverified" next to anything you didn't check yourself.
- Keep this file under about 150 lines. When the log gets long, merge the oldest entries into one "Earlier" summary line per gate.
- Durable decisions also go in the "Decisions so far" section of `docs/ROADMAP.md`. The timeline points there; it doesn't replace it.

## Current state
_Last updated: 2026-10-21 by implementer-tester (slice 5 done, not yet reviewed)_

- **Gate:** 1 (Local closet, no AI). Not approved by the human yet. Gate 0 is done.
- **Last commit:** `39dc607` "Gate 1 checkpoint". Everything below is uncommitted on top of it.
- **Uncommitted work:** slice 1 multi-photo (migration 3); slice 2/2b JPEG metadata stripping + backfill (migration 4); slice 3 palette colors, CIEDE2000, color matrix (migration 5); slice 4 color detection (no migration); slice 5 camera permission flow + slice 4 review fixes (no migration). Slices 1-4 reviewed PASS; slice 5 awaits architect-reviewer. Slice 6 (keyboard) not started.
- **Slice 4:** on-device color detection (option A): `GarmentIsolator` (`NoGarmentIsolator`, `FakeGarmentIsolator`, `LocalGarmentIsolator` with jpeg-js, now pinned `~0.4.4`), `core/garment-segmentation.ts`, `core/garment-colors.ts`, `applyDetectedColors`, `data/detect-item-colors.ts`. Form-level logic now in `data/form-color-detection.ts`.
- **Slice 5:** pure reducer `core/camera-access.ts`; `CameraPermissions` (`FakeCameraPermissions`, `ExpoCameraPermissions`), runner `data/camera-access-flow.ts`, hook `hooks/use-camera-access.ts` (AppState re-check), `CameraIntroModal`, `CameraDeniedPanel`. Entry prompt on Add at most once per app session; camera opens only from a "Take photo" tap.
- **Verified 2026-10-21 (macOS):** `npx tsc --noEmit` pass; `npm run lint` pass; `npm test` 40 suites, 728 tests pass; `CI=1 npx expo export` ios and android both succeed.
- **Unverified (needs a device):** whole permission flow (intro, system prompt, denied panel, Settings round trip), camera opening after the intro closes on iOS, detection quality and Hermes speed, matrix not opening over the picker, VoiceOver announcements. Usage strings only show in a dev/store build (Expo Go shows its own).
- **Next step:** architect-reviewer on slice 5, then slice 6 (keyboard), then the Gate 1 report and the human's device check. Commit only when the human says so.
- **Open questions:** detection thresholds need tuning on real photos; whether to show detected chips more prominently; whether the intro's "Allow" should continue straight to the camera (implemented: yes, only when a "Take photo" tap opened it).

## Log
Newest first.

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
