# Roadmap

Each gate has measurable "done when" criteria and a human check. Agents stop at a gate and wait for approval. Numeric thresholds are proposals. Adjust them before the gate starts, not after.

## Prerequisites (human)
- Node.js (LTS), git, and a phone with Expo Go installed. Check the Expo "Create a project" page for which SDK version matches the current Expo Go before creating the app, since that has been in transition.
- A Supabase account and an Anthropic API key (needed from Gate 2).
- A paid Apple Developer Program membership is only needed for TestFlight or the App Store (Gate 5).
- Optional: an Android emulator or device for the Android checks in Gate 6.

## Gate 0: Skeleton and tooling
Done when:
- The Expo app starts with `npx expo start` and opens on your phone.
- `npx tsc --noEmit`, lint, and unit tests all pass from the command line.
- The folder layout under `src/`, a `ClothingItem` type, and one passing test exist.
- The Commands section of CLAUDE.md contains the real, working commands.

Human check: scan the QR code and see the app on your phone.

## Gate 1: Local closet, no AI
Done when:
- Add an item from the photo library with manual category, color, and season. Save it, restart the app, and the item is still there.
- Grid view, edit item, and delete item work.
- Repository and logic tests pass against the local implementation.

Human check: add 5 real items on your phone. Is the flow tolerable?

## Gate 2: Backend skeleton and tagging
Done when:
- A Supabase edge function receives an image and returns structured tags (type, colors, pattern, material, formality, season). The provider key exists only as a backend secret. A scan of the repo and the app's environment variables finds no provider or secret key.
- Until real accounts exist (Gate 4), the function is protected by a development-only token that is not committed to the repo.
- The app uses the real `ClosetTagger`. The mock still works.
- Tagging eval: 30 of your own clothing photos with hand-labeled answers in `evals/tagging/`. Proposed targets: category correct in at least 90 percent, primary color correct in at least 85 percent.
- The user can correct tags quickly, and multi-select import from the photo library works.
- Background removal: each item stores its original photo plus an optional cutout (garment only, transparent background). Migrate the existing local items so they keep working with no cutout. Background removal runs behind a `GarmentIsolator` interface during add-item and multi-select import. If it fails, the item is still saved with no cutout. The grid shows the cutout when one exists.
- Decide at the start of this gate: the agent proposes two background-removal options (for example a hosted API called from an edge function, or on-device segmentation, which needs a development build), with cost per image, effort, and quality. You choose one. The tagging function receives the original photo unless the eval shows that cutouts tag better.
- Cutout check: on 10 of the eval photos, at least 8 cutouts are clean enough to use on a mannequin, judged by you.

Human check: scan 10 items on your phone. Review the eval report and the tag-correction flow.

## Gate 3: Outfit engine
Done when:
- An edge function takes a request ("for summer", "emo vibes") plus a prefiltered closet and returns outfits as item IDs with a short rationale.
- Validation: 0 invalid outputs reach the UI across the eval run (unknown IDs, missing top and bottom or dress, duplicated categories). Invalid model output is retried or rejected.
- Eval set in `evals/outfits/`: 20 requests against a sample closet of about 40 items. Proposed target: for at least 70 percent of requests, you would actually wear one of the suggestions.
- Saved outfits, a thumbs up or down, and the originating prompt are stored.
- Loading and failure states exist for slow or failed AI calls.

Human check: run your own 10 requests on your own closet and rate them.

## Gate 3.5: Outfit preview on a mannequin
Done when:
- A generated or saved outfit can be shown on a 2D mannequin. Cutouts are layered by category (outerwear over top over bottom, shoes at the feet) and scaled to fit fixed slots on the figure.
- Items with no cutout show as a card beside the mannequin instead of on it.
- The user can nudge or resize an item on the mannequin, and the adjustment is saved per item.
- Works in Expo Go, with no AI call and no per-render cost.

Human check: view 5 of your own outfits on the mannequin. Does it look good enough to show a friend?

## Gate 4: Accounts, sync, privacy
Done when:
- Sign-in works on a device. Sign in with Apple is required if you offer other social logins. It likely needs a development build, so the agent confirms in the Expo docs first and flags it if so.
- Row level security is enabled on every table. An automated test shows a second test account cannot read the first account's rows or images.
- Closet items, images, and saved outfits sync to the backend and restore on a fresh install. Decide at the start of this gate whether the local repository becomes an offline cache or is replaced by the Supabase one.
- A script verifies that account deletion leaves zero rows and zero stored images for that user.
- Per-user rate limits return a clear error, and the app handles it.
- Images are downscaled and re-encoded before upload, with a test showing location metadata is gone.

Human check: sign in on your phone, delete the account, and confirm the data is gone.

## Gate 5: Friends beta
Done when:
- 3 to 5 friends use a build for a week. Choose the distribution route at the start of the gate (TestFlight needs the paid Apple Developer Program; check current EAS options for the rest).
- Cost per active user per week is measured from backend logs and reported.
- Test: a new user can add 20 items in under 10 minutes and get three outfits they would wear.
- No known data-loss bugs.

Human check: collect friend feedback, then decide whether to continue, tune, or stop.

## Gate 6: Android and release readiness
Done when:
- The app runs on Android (emulator or device) and passes the same checks as iOS for Gates 1 through 4.
- The API doc in `docs/api/` covers every endpoint the app uses, and it matches the code.
- Platform-specific code is listed, with the reason for each.

Human check: use the app on Android for a day, then decide on public release.

## Decisions so far
- Stack: Expo (React Native) and TypeScript. Swift was considered first and dropped for easier agent iteration and a single codebase for iOS and Android.
- Audience: owner and friends first, public release possibly later.
- Backend: hosted, defaulting to Supabase. Reconfirm at the start of Gate 2, since free-tier limits and pricing change.
- Human review at the gates above.
- Images: keep the original photo and a separate background-removed cutout per item, starting in Gate 2. A 2D mannequin preview comes after the outfit engine (Gate 3.5). Realistic AI try-on is out of scope for the MVP because of cost per render and quality.
- Color detection (Gate 1, slice 4, option A): a free on-device heuristic (`LocalGarmentIsolator`: 96px decode with jpeg-js, border-model segmentation, k-means in Lab) used only to suggest colors. No cutout is stored; real stored cutouts stay a Gate 2 decision behind `GarmentIsolator`.
- Camera permission (Gate 1, slice 5): explain-then-prompt modal when entering Add with permission undetermined, at most once per app session; the camera opens only from a "Take photo" tap; denied shows an in-form panel linking to Settings (or the real prompt where the OS can still ask). The photo library is always offered as the alternative.
- Keyboard (Gate 1, slice 6): no keyboard library (would need a dev build). Forms use `KeyboardAwareScrollView`: iOS `automaticallyAdjustKeyboardInsets` (also scrolls the focused field into view), Android `KeyboardAvoidingView` padding with the header height as offset; never both. Drag dismisses (`on-drag`, both platforms); taps outside the tag area dismiss after the press (`KeyboardDismissArea`); the tag box's Done adds the tag and keeps the keyboard, or closes it when empty.
