# Project Spotlight

Mobile app that builds a digital closet from photos of a user's clothes and generates outfits from a text request ("for summer", "emo vibes"). Solo project built almost entirely by AI agents. The human reviews at the gates defined in `docs/ROADMAP.md`.

Audience for now: the owner and a few friends. A public store release may come later. iOS and Android both matter, so keep the code cross-platform.

## Start here (saves tokens)
- Read `docs/TIMELINE.md` "Current state" first. It says which gate you're in, what's committed, what's verified, and what's next. Trust it; don't re-explore the repo to rediscover it. Only check what it marks "unverified" or what your task touches.
- When you finish a slice, a review, or stop mid-task, update `docs/TIMELINE.md` (rules at the top of that file) before reporting. An unfinished task gets an entry too, saying exactly where you stopped, so the next session resumes instead of restarting.

## Stack
- Expo (React Native) with TypeScript in strict mode. Use the Expo SDK version the project was created with. Do not upgrade the SDK without asking.
- Use the routing and structure the Expo default template ships with. Do not swap navigation or state libraries without asking.
- Add packages with `npx expo install <package>` so versions match the SDK.
- Stay within what Expo Go supports until a native module is truly needed. A native library forces a development build, so ask first.
- Do not hand-edit generated native folders (`ios/`, `android/`).
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions written in TypeScript). Introduced at Gate 2, not before.
- AI: image tagging and outfit generation call Claude, always through our edge functions. The app never calls an AI provider directly.

## Architecture rules
- Screens stay thin. Logic lives in plain TypeScript modules under `src/` (for example `src/core` for types and rules, `src/data` for repositories, `src/ai` for clients).
- Anything backed by a service sits behind an interface: `ClosetRepository`, `ClosetTagger`, `GarmentIsolator`, `OutfitGenerator`. Each has a mock and a real implementation. Tests use the mocks.
- Every closet item keeps its original photo and, separately, an optional cutout (the garment with the background removed, as a PNG with transparency). Never overwrite the original. Wherever a cutout is missing, the UI falls back to the original. Background removal is a step in the add-item flow behind `GarmentIsolator`. Its mock returns no cutout, and a failure there must never block saving the item.
- Prompts, closet prefiltering, and outfit validation live in edge functions, not in the app. The app renders results and caches data.
- Document the API in `docs/api/` and update it in the same change as the endpoint. Request and response types live in one place. If sharing them between the app and the functions is awkward, keep copies and add a test that fails when they drift.
- Outfit output is JSON referencing closet item IDs. Reject any ID that is not in the user's closet.
- Avoid platform-specific APIs without a fallback. List any platform-specific code in the gate report.

## Security and privacy
- Variables prefixed `EXPO_PUBLIC_` are bundled into the app and are public. Only the Supabase URL and publishable key may use that prefix.
- Never put the AI provider key, a Supabase secret or service-role key, or the database password in the app, the repo, or logs. They exist only as backend secrets. Gitignore `.env*` files before the first commit.
- Enable row level security with explicit policies on every table. Tests must show one user cannot read another user's rows or images.
- Downscale and re-encode images before upload, and verify in a test that location metadata is gone. Do not assume a library strips it.
- No analytics or third-party SDKs without asking.
- Account deletion must remove database rows and stored images.

## Commands
Run all of these from the `spotlight/` folder (the Expo app), not the repo root. Requires Node 22.13 or newer (the SQLite repository tests use Node's built-in `node:sqlite`).
- Dev server: `npx expo start`
- Typecheck: `npx tsc --noEmit` (also `npm run typecheck`)
- Lint: `npm run lint` (runs `expo lint`, ESLint flat config in `eslint.config.js`)
- Unit tests: `npm test` (Jest with the `jest-expo` preset; config in `package.json`). Single file: `npm test -- src/core/clothing-item.test.ts`
- `spotlight/tsconfig.json` lists `compilerOptions.types` explicitly (`jest`, `expo/types`). Any new global `@types/*` package must be added there or its globals will not be visible.
- Bundle sanity check without a device: `npx expo export --platform ios --output-dir <scratch dir outside the repo>`
- Camera and photo-library features need a real device. List them as manual checks.

## Workflow
- Work in vertical slices: types, logic, UI, tests, together. Do not build all the data layer and then all the UI.
- UI work follows docs/design/; build new screens styled from the start using the theme and shared components.
- Every feature gets at least one test. Do not weaken or delete a test to make it pass.
- Use `implementer-tester` to build a slice. Run `architect-reviewer` before reporting a slice or gate as done.
- Evals in `evals/` call the real AI and cost money. Run them after prompt or model changes and at gates, and append results to `evals/results.md`.
- Add no dependency without asking and explaining why.
- Stop at each gate. Do not start the next gate until the human approves. At a gate, report what was built, the measured numbers against the criteria, and known issues.

## Non-goals for the MVP
Social features, shopping or recommendations for items the user does not own, a web client, and sync across devices before Gate 4. Realistic virtual try-on (AI-rendered clothes on a body) is a possible post-launch stretch. The MVP preview is the 2D mannequin in Gate 3.5.
