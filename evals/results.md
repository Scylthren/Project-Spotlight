# Eval results

Appended by the eval commands (`evals/tagging/README.md`), newest last. Each section is one run against the real AI. Raw runs stay in `evals/tagging/runs/` (not committed). No image data and no tokens appear here.

## Tagging eval, 2026-10-23 18:38:52 UTC

- Commit: `7233d765f46e` (with uncommitted changes)
- Model: claude-haiku-5-5
- Prompt hash: `e201b76717b0` (SHA-256 of `supabase/functions/tag-item/prompt.ts`, first 12 hex digits; the local file, which should match the deployed function)
- Photos: 30 scored (4 expected no tags: 4 passed), 0 errors
- Run file: `evals/tagging/runs/2026-10-23T18-38-52Z.json` (not committed)

| Field | Scored | Score | Target | Result |
| --- | --- | --- | --- | --- |
| Category | 30 | 96.7% (29/30) | >= 90% | PASS |
| Primary color | 26 | 73.1% (19/26) | >= 85% | MISS |
| Other colors (overlap) | 17 | 30.4% (mean) |  |  |
| Seasons (exact) | 26 | 73.1% (19/26) |  |  |
| Seasons (overlap) | 26 | 86.5% (mean) |  |  |
| Type | 26 | 26.9% (7/26) |  |  |
| Pattern | 21 | 76.2% (16/21) |  |  |
| Material | 23 | 82.6% (19/23) |  |  |
| Fit | 19 | 31.6% (6/19) |  |  |
| Formality | 25 | 76.0% (19/25) |  |  |

- Tokens per photo: mean 3,450 input / 75 output; total 103,500 / 2,260 (30 answers with usage)
- Cost: mean $0.000383 per photo, total $0.0115 (Claude Haiku 5.5 $0.1 / $0.5 per million input / output tokens, prompts up to 100K tokens, checked 2026-10-23)
- Latency: p50 1.63 s, p95 2.77 s (30 requests)
- Model calls: 30 (0 photos needed the retry)
- Errors by code: none

### Misses

| Photo | Field | Expected | Got |
| --- | --- | --- | --- |
| IMG_4782.jpeg | Seasons (exact) | summer;spring;autumn | spring;summer |
| IMG_4782.jpeg | Type | blouse\|boxy\|floral | Paisley slip dress |
| IMG_4782.jpeg | Material | cotton | synthetic |
| IMG_4784.jpeg | Other colors (overlap) | grey | charcoal (overlap 0.0%) |
| IMG_4784.jpeg | Material | cotton | synthetic |
| IMG_4785.jpeg | Category | outerwear | none |
| IMG_4785.jpeg | Primary color | cream | none |
| IMG_4785.jpeg | Seasons (exact) | winter;autumn | none |
| IMG_4785.jpeg | Type | jacket\|overcoat\|zip-up | none |
| IMG_4785.jpeg | Pattern | solid | none |
| IMG_4785.jpeg | Material | wool | none |
| IMG_4785.jpeg | Fit | regular | none |
| IMG_4785.jpeg | Formality | casual | none |
| IMG_4786.jpeg | Seasons (exact) | spring;summer;autumn;winter | spring;summer;autumn |
| IMG_4786.jpeg | Pattern | other | solid |
| IMG_4786.jpeg | Material | cotton\|other | leather |
| IMG_4786.jpeg | Formality | casual | athletic |
| IMG_4787.jpeg | Type | heels\|high heels\|lace heels | Strappy sandals |
| IMG_4787.jpeg | Pattern | other | solid |
| IMG_4787.jpeg | Formality | formal | casual |
| IMG_4788.jpeg | Other colors (overlap) | white;red | red (overlap 50.0%) |
| IMG_4789.jpeg | Primary color | grey | charcoal |
| IMG_4789.jpeg | Other colors (overlap) | blue | sky-blue (overlap 0.0%) |
| IMG_4789.jpeg | Fit | regular | oversized |
| IMG_4790.jpeg | Other colors (overlap) | yellow;orange | red;yellow (overlap 33.3%) |
| IMG_4790.jpeg | Type | t-shirt\|graphic tee\|band tee\|tee | Graphic t-shirt |
| IMG_4790.jpeg | Fit | regular | relaxed |
| IMG_4791.jpeg | Other colors (overlap) | blue;purple | pink;blue (overlap 33.3%) |
| IMG_4791.jpeg | Type | t-shirt\|graphic tee\|band tee\|tee | Graphic t-shirt |
| IMG_4791.jpeg | Fit | regular | relaxed |
| IMG_4792.jpeg | Fit | regular | relaxed |
| IMG_4793.jpeg | Other colors (overlap) | red;yellow | none (overlap 0.0%) |
| IMG_4793.jpeg | Type | t-shirt\|graphic tee\|band tee\|tee | Graphic t-shirt |
| IMG_4793.jpeg | Fit | regular | oversized |
| IMG_4797.jpeg | Type | bracelet | Leather cuff bracelet |
| IMG_4798.jpeg | Type | wallet | Leather wallet |
| IMG_4799.jpeg | Primary color | green | sage |
| IMG_4799.jpeg | Other colors (overlap) | yellow\|mustard | light-grey (overlap 0.0%) |
| IMG_4799.jpeg | Type | necklace | Jade pendant necklace |
| IMG_4800.jpeg | Primary color | green | sage |
| IMG_4800.jpeg | Other colors (overlap) | yellow\|mustard | cream (overlap 0.0%) |
| IMG_4800.jpeg | Type | necklace | Jade pendant necklace |
| IMG_4802.jpeg | Other colors (overlap) | blue;purple | pink;denim-blue (overlap 0.0%) |
| IMG_4802.jpeg | Type | t-shirt\|graphic tee\|band tee\|tee | Graphic t-shirt |
| IMG_4803.jpeg | Other colors (overlap) | red;yellow | none (overlap 0.0%) |
| IMG_4803.jpeg | Type | t-shirt\|graphic tee\|band tee\|tee | Graphic t-shirt |
| IMG_4803.jpeg | Fit | regular | oversized |
| IMG_4804.jpeg | Other colors (overlap) | sage | grey (overlap 0.0%) |
| IMG_4804.jpeg | Seasons (exact) | summer;spring;autumn | spring;summer |
| IMG_4804.jpeg | Type | button-up shirt\|floral shirt\|shirt | Short-sleeve shirt |
| IMG_4804.jpeg | Fit | regular | relaxed |
| IMG_4804.jpeg | Formality | smart-casual | casual |
| IMG_4805.jpeg | Other colors (overlap) | sage | beige (overlap 0.0%) |
| IMG_4805.jpeg | Seasons (exact) | summer;spring;autumn | spring;summer |
| IMG_4805.jpeg | Type | button-up shirt\|floral shirt\|shirt | Floral button-up shirt |
| IMG_4805.jpeg | Fit | regular | relaxed |
| IMG_4805.jpeg | Formality | smart-casual | casual |
| IMG_4806.jpeg | Primary color | brown\|tan\|mustard | black |
| IMG_4806.jpeg | Seasons (exact) | summer;spring | autumn;winter |
| IMG_4806.jpeg | Type | sequin blouse\|blouse\|sequin top | Cowl neck top |
| IMG_4806.jpeg | Pattern | other | solid |
| IMG_4806.jpeg | Fit | regular | relaxed |
| IMG_4806.jpeg | Formality | formal | smart-casual |
| IMG_4807.jpeg | Primary color | brown | black |
| IMG_4807.jpeg | Type | belt | Reversible belt |
| IMG_4807.jpeg | Fit | regular | none |
| IMG_4808.jpeg | Primary color | white | cream |
| IMG_4808.jpeg | Other colors (overlap) | cream | white (overlap 0.0%) |
| IMG_4808.jpeg | Type | slippers | Quilted slippers |
| IMG_4808.jpeg | Fit | regular | none |
| IMG_4809.jpeg | Seasons (exact) | spring;summer;autumn;winter | spring;summer;autumn |
| IMG_4809.jpeg | Type | high-top sneakers\|sneakers\|high tops | Vans sneakers |
| IMG_4809.jpeg | Pattern | other | solid |
| IMG_4809.jpeg | Fit | regular | none |
| IMG_4813.jpeg | Type | messenger bag | Leather briefcase |

## Tagging eval, 2026-10-23 18:38:52 UTC — re-scored after human review

Same run, no new calls. Changes since the section above: the human accepted five model colors as alternatives (4806 black, 4807 black for a reversible belt, 4799 and 4800 sage, 4808 cream, 4789 charcoal) after reviewing the photos, and type scoring changed from exact match to "the label's words appear in order in the answer" (human, 2026-10-23). The section above keeps the raw numbers.

- Commit: `7233d765f46e` (with uncommitted changes)
- Model: claude-haiku-5-5
- Prompt hash: `e201b76717b0` (SHA-256 of `supabase/functions/tag-item/prompt.ts`, first 12 hex digits; the local file, which should match the deployed function)
- Photos: 30 scored (4 expected no tags: 4 passed), 0 errors
- Run file: `evals/tagging/runs/2026-10-23T18-38-52Z.json` (not committed)

| Field | Scored | Score | Target | Result |
| --- | --- | --- | --- | --- |
| Category | 30 | 96.7% (29/30) | >= 90% | PASS |
| Primary color | 26 | 96.2% (25/26) | >= 85% | PASS |
| Other colors (overlap) | 17 | 30.4% (mean) |  |  |
| Seasons (exact) | 26 | 73.1% (19/26) |  |  |
| Seasons (overlap) | 26 | 86.5% (mean) |  |  |
| Type | 26 | 80.8% (21/26) |  |  |
| Pattern | 21 | 76.2% (16/21) |  |  |
| Material | 23 | 82.6% (19/23) |  |  |
| Fit | 19 | 31.6% (6/19) |  |  |
| Formality | 25 | 76.0% (19/25) |  |  |

- Tokens per photo: mean 3,450 input / 75 output; total 103,500 / 2,260 (30 answers with usage)
- Cost: mean $0.000383 per photo, total $0.0115 (Claude Haiku 5.5 $0.1 / $0.5 per million input / output tokens, prompts up to 100K tokens, checked 2026-10-23)
- Latency: p50 1.63 s, p95 2.77 s (30 requests)
- Model calls: 30 (0 photos needed the retry)
- Errors by code: none

### Misses

| Photo | Field | Expected | Got |
| --- | --- | --- | --- |
| IMG_4782.jpeg | Seasons (exact) | summer;spring;autumn | spring;summer |
| IMG_4782.jpeg | Type | blouse\|boxy\|floral | Paisley slip dress |
| IMG_4782.jpeg | Material | cotton | synthetic |
| IMG_4784.jpeg | Other colors (overlap) | grey | charcoal (overlap 0.0%) |
| IMG_4784.jpeg | Material | cotton | synthetic |
| IMG_4785.jpeg | Category | outerwear | none |
| IMG_4785.jpeg | Primary color | cream | none |
| IMG_4785.jpeg | Seasons (exact) | winter;autumn | none |
| IMG_4785.jpeg | Type | jacket\|overcoat\|zip-up | none |
| IMG_4785.jpeg | Pattern | solid | none |
| IMG_4785.jpeg | Material | wool | none |
| IMG_4785.jpeg | Fit | regular | none |
| IMG_4785.jpeg | Formality | casual | none |
| IMG_4786.jpeg | Seasons (exact) | spring;summer;autumn;winter | spring;summer;autumn |
| IMG_4786.jpeg | Pattern | other | solid |
| IMG_4786.jpeg | Material | cotton\|other | leather |
| IMG_4786.jpeg | Formality | casual | athletic |
| IMG_4787.jpeg | Type | heels\|high heels\|lace heels | Strappy sandals |
| IMG_4787.jpeg | Pattern | other | solid |
| IMG_4787.jpeg | Formality | formal | casual |
| IMG_4788.jpeg | Other colors (overlap) | white;red | red (overlap 50.0%) |
| IMG_4789.jpeg | Other colors (overlap) | blue | sky-blue (overlap 0.0%) |
| IMG_4789.jpeg | Fit | regular | oversized |
| IMG_4790.jpeg | Other colors (overlap) | yellow;orange | red;yellow (overlap 33.3%) |
| IMG_4790.jpeg | Fit | regular | relaxed |
| IMG_4791.jpeg | Other colors (overlap) | blue;purple | pink;blue (overlap 33.3%) |
| IMG_4791.jpeg | Fit | regular | relaxed |
| IMG_4792.jpeg | Fit | regular | relaxed |
| IMG_4793.jpeg | Other colors (overlap) | red;yellow | none (overlap 0.0%) |
| IMG_4793.jpeg | Fit | regular | oversized |
| IMG_4799.jpeg | Other colors (overlap) | yellow\|mustard | light-grey (overlap 0.0%) |
| IMG_4800.jpeg | Other colors (overlap) | yellow\|mustard | cream (overlap 0.0%) |
| IMG_4802.jpeg | Other colors (overlap) | blue;purple | pink;denim-blue (overlap 0.0%) |
| IMG_4803.jpeg | Other colors (overlap) | red;yellow | none (overlap 0.0%) |
| IMG_4803.jpeg | Fit | regular | oversized |
| IMG_4804.jpeg | Other colors (overlap) | sage | grey (overlap 0.0%) |
| IMG_4804.jpeg | Seasons (exact) | summer;spring;autumn | spring;summer |
| IMG_4804.jpeg | Fit | regular | relaxed |
| IMG_4804.jpeg | Formality | smart-casual | casual |
| IMG_4805.jpeg | Other colors (overlap) | sage | beige (overlap 0.0%) |
| IMG_4805.jpeg | Seasons (exact) | summer;spring;autumn | spring;summer |
| IMG_4805.jpeg | Fit | regular | relaxed |
| IMG_4805.jpeg | Formality | smart-casual | casual |
| IMG_4806.jpeg | Seasons (exact) | summer;spring | autumn;winter |
| IMG_4806.jpeg | Type | sequin blouse\|blouse\|sequin top | Cowl neck top |
| IMG_4806.jpeg | Pattern | other | solid |
| IMG_4806.jpeg | Fit | regular | relaxed |
| IMG_4806.jpeg | Formality | formal | smart-casual |
| IMG_4807.jpeg | Fit | regular | none |
| IMG_4808.jpeg | Other colors (overlap) | cream | white (overlap 0.0%) |
| IMG_4808.jpeg | Fit | regular | none |
| IMG_4809.jpeg | Seasons (exact) | spring;summer;autumn;winter | spring;summer;autumn |
| IMG_4809.jpeg | Pattern | other | solid |
| IMG_4809.jpeg | Fit | regular | none |
| IMG_4813.jpeg | Type | messenger bag | Leather briefcase |
