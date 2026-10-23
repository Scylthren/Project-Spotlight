# Tagging eval

Measures how well the deployed `tag-item` function tags your clothes photos: accuracy per field, tokens and cost per photo, and latency. Targets: category at least 90%, primary color at least 85%.

Every command runs from the `spotlight/` folder:

```sh
cd spotlight
npm run eval:tagging -- <command>
```

## Quick start

1. Put about 30 photos in `~/spotlight-eval-photos/` (HEIC straight from the iPhone is fine, also PNG and JPEG).
2. `npm run eval:tagging -- init` adds a row per photo to `evals/tagging/labels.csv`.
3. Open `labels.csv` in Numbers or Excel and fill the labels (below). Save it as CSV.
4. `npm run eval:tagging -- check` until it says "No problems."
5. `npm run eval:tagging -- run` sends the photos, prints the scores and adds them to `evals/results.md`.

## 1. Photos

- Folder: `~/spotlight-eval-photos/`. Use another one with `--photos DIR` or the `SPOTLIGHT_EVAL_PHOTOS` variable.
- The photos stay outside git. The repo keeps only `labels.csv`, with a hash per photo so a changed or swapped photo is noticed. If you put them in `evals/tagging/photos/` by mistake, git ignores that folder.
- Files ending in `.heic`, `.heif`, `.jpg`, `.jpeg` or `.png` are used; anything else in the folder is ignored. Subfolders are not read.
- Include a few hard cases, not just neat flat-lays: several garments in one photo, a garment being worn, a dark or blurred photo, a screenshot of your closet, and one or two photos that are not clothing at all.

## 2. Create or update the label file

```sh
npm run eval:tagging -- init
```

Adds a row for every new photo with `file` and `sha256` filled in. It never changes labels you already filled. Run it again whenever you add photos. It also reports:
- **CHANGED**: the photo is different from when its row was made (edited or replaced). Check its labels, clear its `sha256` cell, and run `init` again.
- **MISSING**: a row whose photo is no longer in the folder. Delete the row or put the photo back.

## 3. Fill the labels

One row per photo. Leave a cell **blank** to skip scoring that field for that photo. Capital letters don't matter, and a space can stand in for a hyphen (`smart casual` works).

| Column | What to write | Allowed values |
| --- | --- | --- |
| `file`, `sha256` | Filled by `init`. Don't edit. | |
| `category` | One value | `top`, `bottom`, `dress`, `outerwear`, `shoes`, `accessory` |
| `primary_color` | The main color | `black`, `charcoal`, `grey`, `light-grey`, `white`, `cream`, `beige`, `tan`, `camel`, `brown`, `navy`, `denim-blue`, `blue`, `sky-blue`, `teal`, `green`, `forest-green`, `olive`, `sage`, `yellow`, `mustard`, `orange`, `red`, `burgundy`, `pink`, `purple`, `lavender` |
| `other_colors` | Up to 2 more colors, separated by `;` | Same colors |
| `seasons` | Seasons separated by `;`, or `all` | `spring`, `summer`, `autumn`, `winter` |
| `type` | Short name, up to 30 characters ("Hoodie", "Denim jacket") | Free text. Passes when your words appear in the answer, in order: `t-shirt` matches "Graphic t-shirt", `bag` matches "Leather bag". Capitals and hyphens don't matter. |
| `pattern` | One value | `solid`, `striped`, `checked`, `floral`, `graphic`, `polka-dot`, `animal`, `other` |
| `material` | One value | `cotton`, `denim`, `wool`, `knit`, `linen`, `silk`, `leather`, `synthetic`, `other` |
| `fit` | One value | `slim`, `regular`, `relaxed`, `oversized` |
| `formality` | One value | `athletic`, `casual`, `smart-casual`, `formal` |
| `notes` | Anything | Not scored |

`check` prints the current allowed values from the tag-item contract (the same lists the app uses) if any of this changes.

- **Either answer is fine:** separate alternatives with `|`. Examples: `top|outerwear` for a cardigan, `navy|black` for a very dark navy, `Hoodie|Sweatshirt` for the type. In `other_colors` each entry can have alternatives: `white;grey|light-grey`.
- **Expect no answer for a field:** write `none` (for example `none` in `fit` for a bag). In `other_colors` and `seasons`, `none` means the list should be empty.
- **Not clothing (expect no tags at all):** write `none` in `category` and leave every other label cell blank. That photo passes only when the function returns no category.

How it is scored: primary color is the first color the function returns. Other colors and seasons also get an overlap score (matched divided by expected plus returned minus matched), and seasons are also scored as an exact match. A photo the function rejects or fails on counts as a miss for every field you labelled.

## 4. Check

```sh
npm run eval:tagging -- check
```

Checks every label against the allowed values (printing them next to each bad cell) and confirms each photo's hash matches its file. It exits with an error until everything is fixed. Rows with no labels yet are only a note; `run` skips them.

## 5. Run

```sh
npm run eval:tagging -- run --dry-run     # prepare every photo, send nothing (free)
npm run eval:tagging -- run --limit 3     # try the first 3 labelled photos
npm run eval:tagging -- run               # the full run
```

Before sending, it prints the photo count and an estimated cost. For each photo it does what the app does: converts it to JPEG at the app's quality (80%), makes it upright, shrinks it to at most 1024 px on the long edge (never enlarges), and strips all metadata (location, camera details). It then checks the exact bytes with the app's metadata code and refuses to send a photo if anything is left. One photo at a time (`--concurrency 2` for two).

Afterwards it saves the raw run to `evals/tagging/runs/` (not committed; no images, no token), prints the scores, and adds a dated section to `evals/results.md`: commit, model, prompt hash, photo count, the per-field table with PASS or MISS against the targets, tokens and cost per photo, latency (p50, p95), errors by code, and every miss with the photo's file name. Commit `labels.csv` and `evals/results.md` after a real run.

`--no-results` skips the results file; `--results FILE` writes elsewhere. `--save-prepared DIR` (a folder outside the repo) also saves the JPEGs that were sent, if you want to look at them.

**First time:** run `npm run eval:tagging -- run --dry-run --save-prepared ~/spotlight-eval-prepared` and open a few of the saved JPEGs to check portrait photos are upright. This is free; orientation is tested on synthetic HEICs, not yet on real iPhone ones.

Colors can differ slightly from the phone: iPhone HEICs use a wide color profile, and `sips` converts it differently from the app's image library. Expect close, not identical, color results.

What it needs:
- **macOS.** The runner uses the built-in `sips` tool to read HEIC photos. `init`, `check` and `score` work anywhere.
- `spotlight/.env` with `EXPO_PUBLIC_SUPABASE_URL` (already there for the app).
- The dev token in `~/.config/spotlight/dev-token` (the same token as on the phone). It is only sent as the request header; it is never printed or saved. `--token-file FILE` reads it from elsewhere.

The runner calls our `tag-item` function only, never the AI provider directly. Its model (Claude Haiku 5.5) and prompt are whatever is deployed; the prompt hash in the results is of the local `supabase/functions/tag-item/prompt.ts`, so deploy before running after a prompt change.

## 6. Score again

```sh
npm run eval:tagging -- score                   # the newest run
npm run eval:tagging -- score --run FILE        # a specific run
```

Scores a saved run against the current labels without sending anything (use it after fixing a label). It also appends to `evals/results.md` unless you add `--no-results`.

## Cost

About $0.0003 per photo, so 30 photos cost about 1 cent. That is an estimate: Haiku 5.5 at $0.10 per million input tokens and $0.50 per million output tokens (prices checked 2026-10-23, in `scorer.ts`), and about 2,500 input tokens per photo. A photo whose answer needs the function's one retry costs about double. Every run measures the real tokens and cost per photo from the function's answer.
