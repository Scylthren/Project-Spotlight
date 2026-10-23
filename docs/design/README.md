# Design reference

The visual direction for Spotlight. `mockups/` has one file per screen. Each one is an HTML mockup drawn at iPhone size (390 pt wide), made in a design canvas outside this repo.

## How to use these files
- **They show how screens should look. They are not code to copy.** Translate them into React Native using the theme and shared components. Don't port the HTML or CSS.
- They don't render on their own. Each file loads a `support.js` from the canvas tool, and that file isn't in this repo. Read the markup and inline styles to get exact colors, sizes, and spacing. The human can view the live canvas.
- The data in them is placeholder: item names, counts, weather, "Your Name". The garment drawings are placeholder shapes standing in for real photos and cutouts.
- When a mockup conflicts with `CLAUDE.md`, `docs/ROADMAP.md`, or a decision already recorded, the existing rules win. Flag the conflict instead of following the mockup.
- Screens that show features from a later gate set the look for that gate. They don't add scope now.

## Design language
- **Mood:** an editorial fashion magazine. Black ink on white, one red accent, a serif display face, and labels in tracked uppercase.
- **Fonts:** Bodoni Moda for display text: titles, item names, prompts and style tags, often in italic. Archivo for UI text. Both are on Google Fonts.
- **Light colors:** ink `#0E0E0E`, paper `#FFFFFF`, photo background `#EDEBE7` / `#E4E1DB`, hairline `#E2DFD8`, border `#B9B6AF`, secondary text `#5E5C58`, body secondary `#4A4945`, accent `#C8102E`.
- **Dark colors** (see `Profile.dc.html`): background `#0B0B0B`, text `#F2F0EB`, secondary text `#A3A19A`, hairline `#33322F`, surface `#1C1B19`, accent `#FF5A6E`.
- **Type scale:** screen titles 40–48 bold serif; item names 17–32 serif; body 13–15; labels 11, uppercase, letter spacing about 0.18em, weight 600–700.
- **Shapes:** square corners everywhere except color swatches and avatars, which are circles. Rules are 1 px; the masthead uses a 2 px rule.
- **Buttons:** 52 pt tall, uppercase 13 with wide tracking. Primary is an ink fill with white text. Secondary is a 1 px ink outline. There is also a plain text button. The accent fill is used only for the main action on the Style screen.
- **Chips:** 36–40 pt, square. Selected chips are ink-filled. Style tags use the italic serif.
- **Touch targets** are at least 44 pt. Every swatch has a text label, so color is never the only cue.

## Screens and the gate they belong to
| Mockup | Gate | Current code / notes |
|---|---|---|
| `Permission.dc.html` | 1 | `camera-intro-modal.tsx`. Same flow as slice 5. |
| `Angles.dc.html` | 1 | `photo-set-field.tsx` (front, back, detail, "Add another angle"). |
| `SaveItem.dc.html` | 1, then 2 | Add/Edit form. Colors, name, seasons and style tags apply now. Pattern, material, fit, formality and "Background removed" come in Gate 2 (tags and cutouts). |
| `ColorMatrix.dc.html` | 1 | `color-matrix.tsx` (palette grid with Primary/Secondary). |
| `Closet.dc.html` | 1 | Closet grid with search and category filters. |
| `ItemDetail.dc.html` | 1 | `item/[id]`. The mockup separates a read-only detail view from editing; propose whether to adopt that. "Pairs well with" is a later idea, not in scope. |
| `Camera.dc.html` | reference | A custom in-app camera. The app uses the system camera through `expo-image-picker`, so treat this as reference only. A custom camera would need `expo-camera` and approval. |
| `StylePrompt.dc.html`, `Results.dc.html`, `Lookbook.dc.html` | 3 | Outfit request, results with rationale, saved outfits. |
| `Today.dc.html` | not in roadmap | "Look of the day" with weather-based and random ("Surprise me") modes plus Shuffle. A candidate addition to Gate 3 or later; the human decides. |
| `Welcome.dc.html` | 4 | Sign in and create account. |
| `Profile.dc.html` | design gate, then 4 | The Appearance setting (Light, Dark, System) comes in the design gate. Account details, log out and delete account come in Gate 4. |
| (no mockup) | 2 | Import review and per-photo details (`app/import/`, `components/import/`), designed from the theme and the Add form's pieces in Gate 2 slice 6 (D10). Check on the phone. |
| `Loading.dc.html` | polish | A glowing "O" in SPOTLIGHT while the rest of the screen dims. Build it in `AnimatedSplashOverlay`. The native splash stays a static black screen with the wordmark. |

## Known conflicts to resolve, not silently follow
- **Tab bar.** The mockup draws a custom bar: Closet, Style, a center Scan button, Looks, Me. The app uses `NativeTabs`, and `CLAUDE.md` says not to swap navigation without asking. The default is to keep `NativeTabs` and apply the mockup's labels, icons and colors. Propose the center Scan button only as an option.
- **Fonts** need `@expo-google-fonts/bodoni-moda` and `@expo-google-fonts/archivo`. These are new dependencies, so ask first.
- **Rounded corners and glass effects** from the native template don't fit this style. Switching them to square, flat surfaces is part of the restyle.
