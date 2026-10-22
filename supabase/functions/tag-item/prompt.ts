/**
 * The fixed tagging prompt and the JSON schema that constrains the model's
 * reply (ROADMAP "Gate 2 slice 3 tagging rules"). Lives in the function, never
 * in the app. Every allowed value comes from the contract lists, so the prompt,
 * the schema and the validator cannot disagree.
 *
 * Plain TypeScript with no Deno APIs, so Jest tests it through the app.
 */
import {
  TAG_CATEGORIES,
  TAG_COLORS,
  TAG_FITS,
  TAG_FORMALITIES,
  TAG_MATERIALS,
  TAG_MAX_COLORS,
  TAG_PATTERNS,
  TAG_SEASONS,
  TAG_TYPE_MAX_LENGTH,
} from '../_shared/tag-item-contract.ts';

/** The tagging model (ROADMAP D3). Exact alias, no date suffix. */
export const TAG_MODEL = 'claude-haiku-5-5';

/** Enough for the JSON object (about 100 tokens) with a wide margin. */
export const TAG_MAX_TOKENS = 1024;

/** The keys of the model's JSON reply, in order. Same names as `ItemTags`. */
export const MODEL_TAG_KEYS = [
  'category',
  'colors',
  'seasons',
  'type',
  'pattern',
  'material',
  'fit',
  'formality',
] as const;

const list = (values: readonly string[]) => values.map((v) => `"${v}"`).join(', ');

/** Human-readable names for the color ids, so the model knows what each id means. */
const COLOR_HINTS: Readonly<Record<(typeof TAG_COLORS)[number], string>> = {
  black: 'black',
  charcoal: 'charcoal (very dark grey)',
  grey: 'grey',
  'light-grey': 'light grey',
  white: 'white',
  cream: 'cream / off-white / ivory',
  beige: 'beige',
  tan: 'tan / khaki',
  camel: 'camel',
  brown: 'brown',
  navy: 'navy (very dark blue)',
  'denim-blue': 'denim blue (mid-wash jeans)',
  blue: 'blue',
  'sky-blue': 'sky blue / light blue',
  teal: 'teal / turquoise',
  green: 'green',
  'forest-green': 'forest green (dark green)',
  olive: 'olive / khaki green',
  sage: 'sage (soft grey-green)',
  yellow: 'yellow',
  mustard: 'mustard',
  orange: 'orange',
  red: 'red',
  burgundy: 'burgundy / wine / maroon',
  pink: 'pink',
  purple: 'purple',
  lavender: 'lavender / lilac',
};

/** System prompt: what to tag, the allowed values, and the edge cases. */
export const TAG_SYSTEM_PROMPT = `You tag clothing photos for a personal digital closet app. You see one photo and answer with one JSON object that follows the given schema. Use only the allowed values listed here. Never invent other values.

Fields:
- category: one of ${list(TAG_CATEGORIES)}, or null.
  top = shirts, t-shirts, blouses, sweaters, hoodies, cardigans worn as tops. bottom = trousers, jeans, shorts, skirts. dress = dresses and jumpsuits. outerwear = coats, jackets, blazers, raincoats. shoes = all footwear. accessory = bags, belts, hats, scarves, jewelry, sunglasses, gloves, ties, socks.
- colors: the garment's visible colors, most prominent first, at most ${TAG_MAX_COLORS}, no duplicates. Each one of these ids: ${TAG_COLORS.map((id) => `"${id}" = ${COLOR_HINTS[id]}`).join('; ')}. Pick the closest id for each color. Ignore the background, hangers, skin and other items. Use [] if you cannot tell.
- seasons: the seasons the garment suits, from ${list(TAG_SEASONS)}, no duplicates. Most garments suit two or more. Use [] if you cannot tell.
- type: a short everyday name for the garment in English, in sentence case, at most ${TAG_TYPE_MAX_LENGTH} characters, for example "Hoodie", "Denim jacket", "Chelsea boots", "Pleated skirt". null if unsure.
- pattern: one of ${list(TAG_PATTERNS)}, or null.
- material: the main visible material, one of ${list(TAG_MATERIALS)}, or null. "knit" means visibly knitted (sweaters, cardigans). Use "synthetic" for polyester, nylon and similar technical fabrics.
- fit: one of ${list(TAG_FITS)}, or null. Use null when the fit cannot be judged (for example shoes, most accessories, or a garment lying flat whose cut is unclear).
- formality: one of ${list(TAG_FORMALITIES)}, or null.

Rules:
- Tag only clothing, shoes and accessories. If the photo shows no garment (for example a screenshot, a document, a pet, a landscape, food, or a person whose clothes are not visible), set every field to null and the lists to [].
- If several garments are visible, tag only the most prominent one (the largest, most central, or most in focus). Do not mix colors or details from other items.
- If the garment is being worn, tag the garment, not the person. Ignore skin, hair and the background.
- If the photo is very dark, blurred or heavily cropped, give your best guess for what you can see and use null or [] for anything you cannot judge.
- For an item without an exact category, use the nearest category: swimwear and underwear tops are "top", swim shorts are "bottom", a swimsuit is "dress", bags and other carried items are "accessory". If nothing is close, use null.
- Never use a value that is not listed. When in doubt, use null or [] rather than guessing wildly.`;

/** The text that follows the image in the user turn. */
export const TAG_USER_TEXT = 'Tag the main garment in this photo.';

const nullable = (values: readonly string[]) => ({
  anyOf: [{ type: 'string', enum: [...values] }, { type: 'null' }],
});
const enumList = (values: readonly string[]) => ({ type: 'array', items: { type: 'string', enum: [...values] } });

/**
 * JSON schema for the reply (structured outputs). Every closed field is an
 * enum; null where the contract allows null; every key required; no extra
 * keys. Lengths (type up to 30 characters, at most 3 colors, no duplicates)
 * are checked after, by `readModelTags`.
 */
export const TAG_REPLY_SCHEMA = {
  type: 'object',
  properties: {
    category: nullable(TAG_CATEGORIES),
    colors: enumList(TAG_COLORS),
    seasons: enumList(TAG_SEASONS),
    type: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    pattern: nullable(TAG_PATTERNS),
    material: nullable(TAG_MATERIALS),
    fit: nullable(TAG_FITS),
    formality: nullable(TAG_FORMALITIES),
  },
  required: [...MODEL_TAG_KEYS],
  additionalProperties: false,
} as const;

/** The Messages API request body for one photo (base64 JPEG). */
export function buildTagRequestBody(imageBase64: string): Record<string, unknown> {
  return {
    model: TAG_MODEL,
    max_tokens: TAG_MAX_TOKENS,
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TAG_REPLY_SCHEMA } },
    system: TAG_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: TAG_USER_TEXT },
        ],
      },
    ],
  };
}
