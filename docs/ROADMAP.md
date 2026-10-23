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

## Gate 1.5: Design foundation
The look from `docs/design/` applied to what Gate 1 built. No new features.

Done when:
- A theme module holds light and dark tokens from `docs/design/README.md`: colors, fonts, type scale, spacing, borders. Screens and components use no raw colors or font sizes outside the theme, and a lint rule or test fails when one is added (palette swatch colors are item data, not theme, and are exempt).
- An Appearance setting (Light / Dark / System) persists across restarts and applies app-wide, including navigation (headers, tab bar) and the status bar.
- Shared components match the mockups: Button (primary, outline, text), Chip, labeled TextInput, SectionLabel, ScreenHeader, Swatch. Every touch target is at least 44 pt (visual size may be smaller, with hit slop). Accessibility labels, roles and states are kept.
- The Gate 1 screens are restyled to match their mockups: Closet grid (`Closet`), Add/Edit form (`SaveItem`, Gate 1 fields only), photo set (`Angles`), color matrix (`ColorMatrix`), camera intro modal (`Permission`), item screen (`ItemDetail`, Gate 1 content only).
- Closet search and category filters (approved addition, from `Closet.dc.html`): a search box matching category, color names and style tags, and filter chips (All plus each category). Both work together, are covered by logic tests, and an empty result says so.
- The item screen becomes a read-only detail view (photos with angle switching, colors, seasons, style tags) with an Edit action that opens the existing edit form unchanged; delete stays in the edit form.
- Apart from the two items above, all Gate 1 behavior is unchanged: the existing tests still pass, none are weakened or deleted, and the Gate 1 device checklist is re-run.
- A dev-only screen shows every shared component in light and dark. It is not reachable in a production build.

Human check: compare each restyled screen on your phone to its mockup, in both themes.

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
Design: `SaveItem.dc.html` adds the tag fields (pattern, material, fit, formality) and the cutout display with the "Background removed" label to the save screen. Built with the theme and shared components from Gate 1.5.

## Gate 3: Outfit engine
Done when:
- An edge function takes a request ("for summer", "emo vibes") plus a prefiltered closet and returns outfits as item IDs with a short rationale.
- Validation: 0 invalid outputs reach the UI across the eval run (unknown IDs, missing top and bottom or dress, duplicated categories). Invalid model output is retried or rejected.
- Eval set in `evals/outfits/`: 20 requests against a sample closet of about 40 items. Proposed target: for at least 70 percent of requests, you would actually wear one of the suggestions.
- Saved outfits, a thumbs up or down, and the originating prompt are stored.
- Loading and failure states exist for slow or failed AI calls.

Human check: run your own 10 requests on your own closet and rate them.
Design: `StylePrompt.dc.html` (request), `Results.dc.html` (outfits with rationale), `Lookbook.dc.html` (saved outfits). Only the parts in the criteria above; the mockups' extras are listed under "Proposed, not approved".

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
Design: `Welcome.dc.html` (sign in, create account) and the account parts of `Profile.dc.html` (name, email, password, log out, delete account).

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

## Polish (no gate yet)
- Loading animation from `Loading.dc.html` (glowing "O" in SPOTLIGHT, rest of the screen dims) in `AnimatedSplashOverlay`. The native splash stays a static black screen with the wordmark.

## Proposed, not approved
Shown in the mockups but not in any gate. The human decides; agents don't build these.
- "Look of the day" (`Today.dc.html`): weather-based and random ("Surprise me") modes plus Shuffle. Also its entry point on `StylePrompt.dc.html` ("Match today's weather", "Look of the day") and the Profile notification toggles ("Look of the day, 7:30 AM", "Use local weather"). Weather needs location and a weather service.
- "Pairs well with" on `ItemDetail.dc.html`.
- From `Results.dc.html`: "Swap piece" and "Restyle". From `Lookbook.dc.html`: filtering saved looks by occasion ("Night out", "Everyday").
- From `ItemDetail.dc.html`: "Style this piece" (starts a Gate 3 request from one item).
- From `Profile.dc.html`: the stats row (pieces, saved looks, days styled), "Sizes & fit", "Style preferences", "Export my closet", "Help & feedback", avatar and @username.
- A custom in-app camera (`Camera.dc.html`), which would need `expo-camera`.

## Decisions so far
- Stack: Expo (React Native) and TypeScript. Swift was considered first and dropped for easier agent iteration and a single codebase for iOS and Android.
- Audience: owner and friends first, public release possibly later.
- Backend: hosted, defaulting to Supabase. Reconfirm at the start of Gate 2, since free-tier limits and pricing change.
- Human review at the gates above.
- Images: keep the original photo and a separate background-removed cutout per item, starting in Gate 2. A 2D mannequin preview comes after the outfit engine (Gate 3.5). Realistic AI try-on is out of scope for the MVP because of cost per render and quality.
- Color detection (Gate 1, slice 4, option A): a free on-device heuristic (`LocalGarmentIsolator`: 96px decode with jpeg-js, border-model segmentation, k-means in Lab) used only to suggest colors. No cutout is stored; real stored cutouts stay a Gate 2 decision behind `GarmentIsolator`.
- Camera permission (Gate 1, slice 5): explain-then-prompt modal when entering Add with permission undetermined, at most once per app session; the camera opens only from a "Take photo" tap; denied shows an in-form panel linking to Settings (or the real prompt where the OS can still ask). The photo library is always offered as the alternative.
- Keyboard (Gate 1, slice 6): no keyboard library (would need a dev build). Forms use `KeyboardAwareScrollView`: iOS `automaticallyAdjustKeyboardInsets` (also scrolls the focused field into view), Android `KeyboardAvoidingView` padding with the header height as offset; never both. Drag dismisses (`on-drag`, both platforms); taps outside the tag area dismiss after the press (`KeyboardDismissArea`); the tag box's Done adds the tag and keeps the keyboard, or closes it when empty.
- Design direction (2026-10-21): the editorial look in `docs/design/` (black ink on white, one red accent, Bodoni Moda display serif, Archivo UI text, tracked uppercase labels, square corners, 1 px rules) with a matching dark theme. Applied in Gate 1.5 before Gate 2; every later screen is built styled from the start. The mockups are a visual spec, not code. `CLAUDE.md`, this roadmap and recorded decisions win over the mockups, and conflicts are flagged to the human. Mockups for later gates set their look but add no scope.
- Gate 1.5 answers (2026-10-21): fonts via `@expo-google-fonts/bodoni-moda` and `@expo-google-fonts/archivo` (approved). Keep `NativeTabs` with the mockup's labels, icons and colors; no center Scan button, no custom tab bar. Adopt the read-only item detail view with a separate Edit screen. Add closet search and category filters. Keep the season value and label "autumn" (not "Fall"). The agent proposes the dark values the README lacks (photo background, border, body secondary, danger) in slice 1 for approval. Unanswered conflicts take the defaults: no item name field, single Add/Edit form (no two-step flow), fixed category list as chips, current color matrix interaction and palette, current camera intro copy, small mockup elements keep their size with hit slop to 44 pt.
- Gate 1.5 dark values (2026-10-21, approved): photoBackground `#1C1B19`, photoBackgroundAlt `#24231F`, border `#615F5A`, textBodySecondary `#C9C7C0`, danger `#FF7A86`. Also approved: where the light border `#B9B6AF` (2.02:1 on white) is an input's only boundary, slices 3 and 5 use a darker value meeting 3:1; slice 5 gives the template splash overlay (`animated-icon.tsx`) the theme background so the guard allowlist can empty (the glowing "O" animation stays in Polish).
- Gate 1.5 slice 2 (2026-10-22, approved): the Appearance setting also drives React Native's native `Appearance.setColorScheme` ('unspecified' for System) so alerts, keyboards and the native tab bar match the app. Tabs: CLOSET (hanger icon: SF `hanger`, Material `checkroom`), ADD (filled circle with plus, `plus.circle.fill` / `add_circle`, the nearest native match to the mockup's round Scan button), ME. Serif text uses a line height of at least 1.2 em (`SERIF_MIN_LINE_HEIGHT`), not the mockups' 1.0-1.05, because Bodoni Moda's deep descent clipped the tops of titles on device.
- Gate 1.5 slice 3 (2026-10-22): `inputBorder` light `#88857E` (3.68:1 on background, 3.09:1 on surface), dark `#6B6964` (3.59:1, 3.14:1), used where a border is an input's only boundary (boxed TextField at rest). Plain and swatch chips keep the light `border`: their text identifies them and selection is an ink fill or 2 pt ink outline (reviewer agreed; if a chip ever becomes the only edge of an entry field, use `inputBorder`). The human approved `@testing-library/react-native` as a dev dependency for rendered component tests.
- Gate 1.5 slice 4 inputs (2026-10-22, human): chips follow the mockups (14 pt horizontal padding as a token; label casing as in each mockup). TextField errors must be read as part of the field and announced when they appear, not only through `accessibilityHint`. npm audit: no action on the 5 root advisories (none fixable within SDK 57 without breaking changes); revisit at the next Expo SDK upgrade.
- Gate 1.5 slice 4 (2026-10-22, reviewed PASS WITH NOTES): chips take `casing` (`uppercase` default, `sentence` 13 pt) and pad `sizes.chipPaddingHorizontal` (14). TextField reads an error as part of its name ("Name, error: ...") and announces it once when it appears or changes. The item screen is read-only at `item/[id]` (title = category, since items have no name); the form lives at `item/[id]/edit` and returns to the closet after a delete. Closet search: every query word must match the category, a color name or a style tag (substring, case-insensitive).
- Gate 1.5 slice 4 mockup differences (2026-10-22, human): keep the uppercase tracked count in the closet masthead; no magnifier icon in the search box (fits the magazine look); keep 26 pt swatches and 36 pt style-tag chips on the item screen; "Pairs well with", "Style this piece" and the detail line under the title stay out until their gates. Closet tiles crop the photo to fill the tile (`contentFit="cover"`), not fit inside it; the item screen's large photo still shows the whole photo. Revisit tile fit when Gate 2 cutouts arrive. Search keeps substring matching ("blue" finds "Sky blue").
- Item name field (2026-10-22, human; approved addition to Gate 1.5, built in slice 5): items get a name. Defaults unless the human says otherwise: optional, trimmed, up to 60 characters; existing items migrate with no name; the item screen title and closet tile label show the name and fall back to the category; closet search also matches the name.
- Gate 1.5 slice 5 (2026-10-22, gate review PASS WITH NOTES; human approved all copy and layout changes: "Save to closet", "Pick colors", "Edit colors", "Style tags", the named-item meta lines, and `contain` for the form photo): the item name is `ClothingItem.name?` (absent means no name, never an empty string), trimmed, at most 60 characters counted as code points; SQLite migration 6 adds a nullable `name` column. A named item's tile shows "Category · colors" under the name and the item screen shows the category under the title. The token guard allowlist is empty and capped at 0; the template `ThemedText`/`ThemedView` are deleted. `colors.scrim` (black in both themes) at `opacity.scrim` 0.6 dims behind modal cards, since color tokens stay `#RRGGBB`. The form's large photo shows the whole photo (`contain`), like the item screen.
- Gate 2 plan (2026-10-22, human): plan in `docs/plans/gate-2.md`. D1: Supabase reconfirmed; project "Project Spotlight" (ref `lithblsvhrxfdkjhnhdy`) on the free tier, which is the spend limit for now; the Anthropic key is stored as a Supabase secret by the human when slice 3 needs it. D4: the dev token is entered on the phone and stored with `expo-secure-store` (new dependency, approved). D5: plain `fetch` to edge functions in Gate 2; `@supabase/supabase-js` waits for Gate 4. Supabase CLI installed and logged in by the human.
- Gate 2 D6 and D7 (2026-10-22, human): tag vocabulary accepted as proposed in `docs/plans/gate-2.md`. Type: short free text up to 30 characters (e.g. "Hoodie"). Pattern: solid, striped, checked, floral, graphic, polka dot, animal, other. Material: cotton, denim, wool, knit, linen, silk, leather, synthetic, other. Fit: slim, regular, relaxed, oversized. Formality: athletic, casual, smart casual, formal. AI colors replace the on-device color guess when they arrive (on-device stays the offline fallback); values the user set always win. Closet search also matches the new tags.
- Gate 2 slice 3 tagging rules (2026-10-22, human): the AI also suggests category and seasons, under the same auto/user rule as the D6 fields (suggestions fill only fields the user has not touched). The `tag-item` function uses a fixed prompt that lists every allowed value and constrains the reply to those lists (JSON schema with enums); the function validates the reply, and if any field is malformed or outside the lists it retries the call once, then answers with what is valid (out-of-list fields null). The prompt and validation stay in the function.
- Gate 2 D3 and D11 (2026-10-22, human): tagging uses Claude Haiku 5.5 (`claude-haiku-5-5`); move to Sonnet 5.5 only if the slice 4 eval misses the targets. No "Suggest tags" for items saved before Gate 2: old items stay untagged unless edited by hand (retaking the front photo in Edit still suggests).
- Gate 2 slice 3 implementation choices (2026-10-22, agent; reviewed, not yet confirmed by the human): `tag-item` uses plain fetch to the Messages API (no SDK, keeps the handler testable in Jest), `thinking: disabled`, effort low, json_schema output. Time budget 16 s, 8 s per call, the one retry only with at least 3 s left. Provider errors are not retried and map to 503/504/502 `upstream_*` codes; two unreadable replies give 200 with empty tags. Category and season source is tracked in the form only (a saved value counts as the user's). A stub answer's category, seasons and colors are ignored. Tag ids are hyphenated (`polka-dot`, `smart-casual`) and D6 fields parse leniently. The request is not aborted when the user leaves the form.
- Deterministic tagging considered (2026-10-22, human): keep Claude Haiku for tagging. Cost is not a reason to switch (estimated $0.0003 per photo, to be measured in slice 4). Alternatives weighed: hand-written pixel rules (can only tag colors, already on-device, and maybe solid vs patterned; 1-2 weeks); an on-device trained model (category, pattern, maybe formality; 4-8 weeks; needs a development build and platform-specific code; public fashion datasets are mostly non-commercial; weaker on material and fit); a hosted label API (about 5x the cost, photos still leave the device). On-device gains: privacy, offline, same answer per photo, no backend abuse surface. Revisit an on-device model at Gate 4, together with D2 option B, if a development build is needed then or the eval misses targets. If repeatable answers matter, cache the answer per photo instead.
- Expo SDK 58 (2026-10-23, human): the project moves from SDK 57 to SDK 58 (React Native 0.88, Jest 30) because Expo Go on iOS only runs the latest SDK. Still Expo Go compatible; no new packages.
- Gate 2 slice 3 wording and slice 4 photos (2026-10-23, human): the new privacy wording is approved as is (camera intro: "Photos are saved on this device. To suggest details, a smaller copy without location data is sent to our server and to Claude (Anthropic)."; permission prompts: "Photos are saved on this device; a smaller copy without location data is sent for AI tagging."). Eval photos live outside git; the repo keeps only the labels and a hash per photo.
- Gate 2 slice 4 eval setup (2026-10-23, human chose HEIC originals; tooling choices by agent, reviewed): eval photos stay as camera originals (HEIC/JPEG/PNG) and the runner prepares them like the app (JPEG q80, 1024 px, upright, metadata stripped) with macOS `sips`, so `run` is macOS-only dev tooling. `tag-item` 200 answers include optional `usage` (model, attempts, input/output tokens) so the eval measures cost; the app ignores it. Label hashes are `sha256-` + base64url.
- Gate 2 slice 4 result (2026-10-23, human): multi-item photos keep the "tag the most prominent item" rule (option A; labels name the expected item). After reviewing the photos, the human accepted five model colors as label alternatives, and type is scored by word containment (the label's words appear in order in the answer; a label like `shirt` therefore also accepts "T-shirt"). Result on 30 photos with Haiku 5.5: category 96.7%, primary color 96.2% (73.1% before review), both targets met; about $0.00038 per photo, p50 1.6 s. Haiku stays; no Sonnet comparison needed.
