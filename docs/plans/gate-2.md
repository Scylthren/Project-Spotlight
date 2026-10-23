# Gate 2 plan: backend skeleton and tagging

**Status: proposed (2026-10-22). Answered so far: D1, D4 (`expo-secure-store`), D5 (yes), D6 (lists as proposed), D7 (yes to both), D9 (yes), D10 (cap 20; agent designs the review list); see ROADMAP decisions.** Criteria are in `docs/ROADMAP.md` Gate 2. Nothing here is built until the human answers the decisions below. Recommendations are marked; the human can override any of them.

## Shape of the gate
The phone sends a photo to our Supabase edge functions. One function asks Claude for tags. Another (depending on decision D2) returns a cutout. The app saves the results locally, next to the item, as it does today. Gate 2 adds **no database tables and no Supabase Storage**: the functions are stateless, and accounts, RLS and sync stay in Gate 4. That keeps the gate small and avoids storing anyone's photos on a server.

Constraints that shape everything below:
- The dev-only token that protects the functions cannot be an `EXPO_PUBLIC_` variable: CLAUDE.md allows only the Supabase URL and publishable key there. The token has to be entered on the phone at run time (see D4).
- Photos leave the device for the first time. Every upload is downscaled and re-encoded first, with a test showing location metadata is gone (the Gate 1 stripping code is reused). The camera intro text "Photos stay on this device" must change.
- Nothing about saving an item may depend on the network. Tagging and cutouts only suggest. A failure leaves the item exactly as Gate 1 would save it.

## Slices

### Slice 1: Backend skeleton, end to end with a stub
**Goal:** the phone calls a deployed `tag-item` function and shows its (fixed, fake) answer. Proves the network path, the token check and the API docs before any AI cost.
- `supabase/` folder with `tag-item`. It checks the dev token and returns a fixed tag set.
- App: `RemoteClosetTagger` (plain `fetch`, no Supabase client library; see D5) with a timeout, behind the existing `ClosetTagger` interface. The mock stays the default in tests.
- Dev-only token field on the Me tab, stored on the device.
- `docs/api/tag-item.md`; one source of request/response types, plus a drift test if the app and functions keep copies.
- A repo scan test that fails on a provider key, service-role key or token pattern in the app or repo.
- **Done when:** a tap on the phone round-trips to the deployed function. Wrong or missing token returns 401 and the app says so. tsc, lint and tests pass.
- **Edge cases:** no network; airplane mode mid-request; slow response (timeout, then a clear message); wrong token; function not deployed; response that fails validation (treated as "no suggestion").

### Slice 2: Tags in the closet (mock tagger, no AI)
**Goal:** items carry the new tags, and the user can set and correct them quickly. Built and tested with the mock, so slice 3 only swaps the source.
- New item fields (vocabulary in D6): type, pattern, material, fit, formality. Each suggested value is marked `auto`, and becomes `user` when the user touches it (same rule as Gate 1 colors). SQLite migration 7; existing items get no tags.
- SaveItem tag fields from `SaveItem.dc.html`, styled with the Gate 1.5 theme. The item screen shows the tags.
- Suggestions never overwrite a value the user already set, even if they arrive late.
- **Done when:** with the mock tagger, picking a photo pre-fills suggestions, any tag can be changed in at most two taps, the values persist across restarts, and old items still load.
- **Edge cases:** the user edits a field before suggestions arrive; the user changes the photo after suggestions arrived (re-suggest only untouched fields); a suggestion outside the vocabulary (dropped); an item edited to remove the photo the tags came from.

### Slice 3: Real tagging with Claude
**Goal:** real suggestions on the phone in a few seconds, and a failure never blocks saving.
- `tag-item` sends the photo to Claude with a fixed prompt and a JSON schema, validates the reply against the vocabulary, and maps colors to our palette IDs. The prompt and validation live in the function, not the app.
- App: downscale (for example 1024 px long edge) and strip metadata before upload, with a test on the bytes actually sent.
- The provider key exists only as a Supabase secret. Logs hold no image data or keys.
- Model per D3; log input and output tokens per call so the eval can report cost.
- **Done when:** on the phone, a new photo gets suggestions; offline or on error the form says "No suggestions" and saves normally; a 5-photo smoke run passes.
- **Edge cases:** not a clothing photo (screenshot, pet, person); several garments in one photo; a garment being worn; very dark or blurred photo; Claude refuses or returns malformed JSON (one retry, then no suggestion); a category we don't have (e.g. swimwear, bag vs accessory); 429 rate limit or 5xx from the provider; the user leaves the screen before the reply (ignore it); duplicate taps (single request in flight).

### Slice 4: Tagging eval
**Goal:** measured accuracy against the targets (category at least 90 percent, primary color at least 85 percent) and a cost per image.
- `evals/tagging/`: a label file the human fills for 30 photos, a runner that calls the deployed function, a scorer, results appended to `evals/results.md`.
- Report per field (including the non-target ones), the misses with photos named, tokens and cost per image, and latency.
- If targets are missed: tune the prompt or try the next model up (D3), re-run, report both.
- **Edge cases:** ambiguous labels (navy vs black; a cardigan as top or outerwear): the scorer accepts a listed alternative where the human gives one; photos the function rejects count as misses.

### Slice 5: Cutouts (shelved 2026-10-23 by the human; see ROADMAP "Cutouts shelved")
**Goal:** each item can have a background-removed cutout next to its untouched original, and the grid shows it.
- Implementation per D2, behind `GarmentIsolator`. Today's `LocalGarmentIsolator` (color detection, no stored output) stays; the interface gains a cutout result or a sibling interface is added (the implementer proposes which; either way the mock returns no cutout).
- Cutout for the primary (front) photo only (D8). PNG with transparency, stored locally beside the original; migration 8 adds an optional cutout path; existing items keep working with none.
- Runs during add-item after save is possible, never blocking it. The grid and item screen show the cutout where one exists, with the "Background removed" label from SaveItem; everywhere else falls back to the original.
- Changing or removing the primary photo deletes the stale cutout and makes a new one. Deleting an item deletes its cutout file.
- Human cutout check: 10 of the eval photos, at least 8 clean enough for a mannequin.
- **Edge cases:** empty or near-empty mask; the mask keeps a hanger, hand, or body; white garment on a white background; very large PNGs (cap the size); the app closes mid-request (item saved, no cutout); offline; the cutout on the dark-theme photo background (checked in both themes); tile fit with cutouts (cover was chosen for photos; revisit, as recorded).

### Slice 6: Multi-select import
**Goal:** add many items at once from the photo library, then review and correct them quickly.
- Library multi-select (supported in Expo Go). One photo becomes one item (D9); other angles are added later through Edit.
- Tagging and cutouts run with a small concurrency limit (for example 3) and a per-batch cap (D10).
- A review list: each draft shows its photo and suggestions; the user corrects and saves all or some. Category is required, so a draft whose tagging failed can only be saved after the user picks one.
- **Done when:** importing 10 photos on the phone yields 10 reviewable drafts, partial failures are visible per draft, and nothing is saved without the user confirming.
- **Edge cases:** the app is backgrounded or killed mid-import (drafts lost; nothing half-saved); the same photo picked twice or already in the closet; iCloud photos that must download first; HEIC and very large images; Android returning photos in a different order; the user cancels the review; the cap is reached.

### Slice 7: Gate review and report
Opus architect review, eval results (cutouts shelved), device checklist (scan 10 items, the correction flow, import), platform-specific code list, the updated camera intro text, and the Gate 2 report.

## Decisions needed from the human

**Before slice 1**
- **D1. Backend.** Reconfirm Supabase (the roadmap asks for this at the start of Gate 2). *Recommended: yes.* Then, done by you: create a Supabase project, install the Supabase CLI and log in, set a monthly spend limit on the Anthropic console, and later paste the Anthropic key with `supabase secrets set` (never into chat or the repo).
- **D4. Dev token on the phone.** *Recommended:* a dev-only "Backend token" field on the Me tab, stored in the existing key-value store, hidden in release builds. Alternative: `expo-secure-store` (Expo Go supports it; a new dependency, safer storage). The token only gates the dev backend until Gate 4, and can be rotated anytime.
- **D5. No Supabase client library yet.** *Recommended:* call functions with plain `fetch` in Gate 2; add `@supabase/supabase-js` in Gate 4 with auth. Function tests: keep prompt-building and validation in plain TypeScript tested by Jest, and keep the Deno handler thin (no Deno install needed beyond the CLI).

**Before slice 2**
- **D6. Tag vocabulary.** Fixed lists keep the eval scorable and the UI chip-based. Proposed, for you to edit:
  - Type (short free text up to 30 characters, e.g. "Hoodie", shown as in the mockup's "Hoodie · Oversized"; or a fixed list per category).
  - Pattern: solid, striped, checked, floral, graphic, polka dot, animal, other.
  - Material: cotton, denim, wool, knit, linen, silk, leather, synthetic, other.
  - Fit: slim, regular, relaxed, oversized.
  - Formality: athletic, casual, smart casual, formal.
- **D7. Tags already in the app.** The AI also suggests category, colors and seasons. *Recommended:* AI colors replace the on-device color guess when they arrive (on-device stays the offline fallback); anything the user set wins. Also: should closet search match the new tags? *Recommended: yes.*

**Before slice 3**
- **D3. Model.** *Recommended:* start with Claude Haiku 5.5 (cheapest, fast) and move to Sonnet 5.5 only if the eval misses the targets. Prices are checked when the eval runs, not assumed now.
- **D11. Untagged existing items.** Offer a one-time "Suggest tags" on the item screen for items saved before Gate 2? *Recommended:* yes, per item, no bulk backfill (no surprise cost).

**Before slice 4**
- **Eval photos.** You provide 30 of your own clothing photos and fill a label file the agent prepares (category, primary color, plus the other fields). Where to keep the photos: *recommended* outside git (the repo stays small and photos aren't kept forever in history), with labels and file hashes committed. The repo is private, so committing them is possible if you prefer.

**Before slice 5**
- **D2. Background removal.** The roadmap's main decision. Options:
  - **A. Hosted background-removal API, called from an edge function.** Works in Expo Go, quick to build, clean results on clothing. Costs per image, and photos go to a second company (their retention terms need your OK). The provider key stays a backend secret.
  - **B. On-device segmentation.** iOS Vision subject lifting (iOS 17+) and Android ML Kit subject segmentation, through our own native module. Free per image, private, works offline. Needs a development build (leaves Expo Go), platform-specific code on both sides, and the most effort. iOS 16 and older would get no cutouts.
  - **C. Self-hosted open model** (for example a background-removal model on a hosted GPU). No per-image vendor fee and full control, but a server to run, and edge functions are too small to host the model.
  - *Recommended: A now*, behind `GarmentIsolator`, so B can replace it later. Gate 4 will probably need a development build anyway (Sign in with Apple), which is the natural point to reconsider B. Before you choose, the agent will look up current prices and terms for two or three providers and give cost per image and a sample of cutouts on your photos.
- **D8. Which photos get cutouts.** *Recommended:* the primary photo only (the mannequin needs one image per item; halves the cost).

**Before slice 6**
- **D9. One photo per item on import.** *Recommended: yes*; grouping photos into one item is error-prone and can be done through Edit.
- **D10. Batch cap and review design.** *Recommended:* at most 20 photos per import. There is no mockup for the review list; the agent designs it from the theme and shared components, and you check it on the phone.

## Risks
- **Cost:** every scan costs one tagging call and (with option A) one cutout call. Mitigations: downscaling, one request at a time per photo, the batch cap, the console spend limit, and the per-image cost reported by the eval.
- **Privacy:** the first gate where photos leave the phone. Metadata stripping is tested on the bytes actually sent; the camera intro wording changes; provider terms are reviewed before D2.
- **Token leak:** a leaked dev token lets someone spend money through the functions until it is rotated. It never goes in the bundle or the repo. Optional: a simple per-day call cap in the function.
- **Expo Go limits:** option B, and any library that needs native code, forces a development build. Asked before any such step.
