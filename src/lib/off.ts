/**
 * Open Food Facts client.
 *
 * Two different services are used, because they are the two that actually work:
 *  - Text search goes to search.openfoodfacts.org ("search-a-licious"). The old
 *    /cgi/search.pl endpoint is being retired and currently answers with an
 *    HTML "temporarily unavailable" page.
 *  - Barcode lookups go to the v2 product endpoint, which also returns the
 *    serving size that the search index does not expose.
 *
 * No API key, no account, no request body — everything is a plain GET.
 */
import i18n, { type AppLanguage } from '../i18n/index';
import {
  looksLikeNonIngredientNote,
  sanitizeIngredientTree,
  type IngredientDecision,
} from './ingredientSanitizer';
import type { EntryPrefill, Nutrition } from './types';

const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';
const TAXONOMY_URL = 'https://world.openfoodfacts.org/api/v2/taxonomy';

/** Open Food Facts asks every client to identify itself. */
const USER_AGENT = 'Micro/1.0 (personal calorie tracker; Expo)';

const REQUEST_TIMEOUT_MS = 12_000;

const SEARCH_FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'countries_tags',
  'nutriments',
  'image_url',
  'nutriscore_grade',
].join(',');

const PRODUCT_FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'countries_tags',
  'nutriments',
  'image_front_small_url',
  'image_small_url',
  'image_url',
  'serving_size',
  'serving_quantity',
  'quantity',
  'nutriscore_grade',
].join(',');

/**
 * The ingredients lookup requests every field ("all") rather than a curated
 * list, because it needs to see every `ingredients_text_<lang>` field the
 * product has — the set of languages varies per product and isn't knowable
 * in advance. See `readIngredientsTextByLanguage`.
 */
const INGREDIENTS_FIELDS = 'all';

/**
 * The search index stores country tags as `en:bulgaria`, and only that form is
 * queryable — the `countries_tags_en` field returns nothing. This is used as a
 * bias, never as an exclusion: results without it are still shown, just below.
 */
const LOCAL_COUNTRY_TAG = 'en:bulgaria';

export type OffErrorKind = 'offline' | 'timeout' | 'http' | 'malformed';

export class OffError extends Error {
  readonly kind: OffErrorKind;

  constructor(kind: OffErrorKind, message: string) {
    super(message);
    this.name = 'OffError';
    this.kind = kind;
    // Needed for `instanceof` to survive transpilation.
    Object.setPrototypeOf(this, OffError.prototype);
  }
}

export function describeOffError(err: unknown): string {
  if (err instanceof OffError) {
    switch (err.kind) {
      case 'offline':
        return i18n.t('off.errorOffline');
      case 'timeout':
        return i18n.t('off.errorTimeout');
      case 'http':
        return i18n.t('off.errorHttp', { status: err.message });
      default:
        return i18n.t('off.errorMalformed');
    }
  }
  return err instanceof Error ? err.message : i18n.t('common.somethingWrong');
}

export interface OffProduct {
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** Null when the product has no usable energy value — such rows are unloggable as-is. */
  per100: Nutrition | null;
  servingSizeG: number | null;
  servingLabel: string | null;
  countries: string[];
  /** True when the product is tagged with the local country. */
  local: boolean;
  nutriscore: string | null;
}

export interface OffSearchResult {
  products: OffProduct[];
  /** Total matches reported for the unfiltered query. */
  total: number;
}

export interface OffIngredient {
  /** OFF taxonomy id, e.g. "en:e330" — present for recognised ingredients. */
  id: string | null;
  /**
   * Display text as OFF has it — verbatim from the product's own label, in
   * whatever language that happened to be entered in. NOT translated by the
   * `lc` request param (only `ingredients_text_*` and `product_name_*` are);
   * unrelated ingredients on the same product routinely arrive in different
   * languages. Never rendered directly — see `displayName`.
   */
  text: string;
  /** List position — the label order, most to least by quantity. */
  rank: number;
  /** Disclosed exact percentage, when the manufacturer publishes one. */
  percent: number | null;
  /** OFF's own estimate when no exact percentage is disclosed. */
  percentEstimate: number | null;
  /**
   * True when `id` is a genuine taxonomy match (OFF's `is_in_taxonomy`) on
   * the `en:` (English-canonical) taxonomy, meaning a reliable, language-
   * neutral display name can be derived from `id` alone. False for ids OFF
   * invented from unrecognised free text (see `text`'s caveat above).
   */
  idIsTaxonomyRecognized: boolean;
  /**
   * Name to show the user, resolved to the app's target language. Defaults
   * to `text` until the name-resolution layer (native/DB-backed, called from
   * the screen) has a chance to look up a real translated name via
   * `fetchIngredientTaxonomyNames` and/or the local glossary — mirrors
   * `ingredientsTextTranslated`'s pattern.
   */
  displayName: string;
  /**
   * True when `displayName` could not be resolved to the app's target
   * language and is instead a real (taxonomy-sourced, never formatted-from-
   * id) English name shown as a last resort — the UI must label this
   * visibly rather than presenting it as if it were a correct translation.
   */
  displayNameIsFallback: boolean;
}

/**
 * One entry of OFF's structured `ingredients[]` array, read as-is — the source
 * of the ingredient list the report screen shows. Unlike `OffIngredient`, it
 * is never re-aligned against free text, and it keeps OFF's nesting (e.g.
 * "E322" containing "soya lecithin").
 */
export interface IngredientNode {
  /** OFF canonical id, e.g. "en:palm-oil". */
  id: string | null;
  /** Label text in the product's ingredients language — never shown as a name. */
  text: string;
  /** OFF's `is_in_taxonomy`: the id is a real taxonomy entry, not one derived from free text. */
  isInTaxonomy: boolean;
  /**
   * OFF attached food data to this row (`ciqual_food_code`, `vegan`,
   * `vegetarian`, `from_palm_oil` or `additive_class`) — it only does that for
   * ingredients it recognised, so it's a "real ingredient" signal.
   */
  hasFoodProperties: boolean;
  percent: number | null;
  percentEstimate: number | null;
  percentMin: number | null;
  percentMax: number | null;
  children: IngredientNode[];
}

export type IngredientPercent =
  | { kind: 'exact'; value: number }
  | { kind: 'estimate'; value: number }
  | { kind: 'max'; value: number }
  | { kind: 'none' };

export interface OffIngredientsProduct {
  code: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /**
   * OFF's structured ingredient list, in label order, with rows that are
   * obviously not ingredients removed — see `sanitizeIngredientTree`.
   */
  ingredientTree: IngredientNode[];
  /** Why each raw row was kept or removed — for debugging only, never shown in production. */
  ingredientDecisions: IngredientDecision[];
  /** Free-text ingredient list as OFF has it, when there's no structured breakdown. */
  ingredientsText: string | null;
  /**
   * True when `ingredientsText` had to fall back past both the requested
   * language and the other supported language to the product's untranslated
   * default field — meaning the text shown is not confirmed to be in a
   * language the user reads.
   */
  ingredientsTextLanguageGap: boolean;
  /**
   * True when `ingredientsText` was machine-translated (via DeepL) rather
   * than sourced directly from Open Food Facts, because neither the
   * requested nor the other supported language was available. Set by the
   * translation fallback layer, never by this module.
   */
  ingredientsTextTranslated: boolean;
  ingredients: OffIngredient[];
  /** NOVA processing classification, 1 (unprocessed) to 4 (ultra-processed). */
  novaGroup: number | null;
  /** OFF taxonomy allergen tags, e.g. "en:milk", "en:gluten". */
  allergensTags: string[];
  nutriscoreGrade: string | null;
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new OffError('http', `HTTP ${response.status}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // A maintenance page or a proxy interstitial lands here.
      throw new OffError('malformed', 'Response was not JSON');
    }
  } catch (err) {
    if (err instanceof OffError) throw err;
    // The caller aborting is a cancellation, not a failure — re-throw as-is so
    // callers can ignore it.
    if (signal?.aborted) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OffError('timeout', 'Request timed out');
    }
    throw new OffError('offline', err instanceof Error ? err.message : 'Network request failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const KJ_PER_KCAL = 4.184;

/** Reads per-100 g nutrition, converting kJ when kcal is not published. */
function readPer100(raw: unknown): Nutrition | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Record<string, unknown>;

  let kcal = num(n['energy-kcal_100g']) ?? num(n['energy-kcal']);
  if (kcal === null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy-kj']);
    if (kj !== null) kcal = kj / KJ_PER_KCAL;
  }
  if (kcal === null) {
    const energy = num(n['energy_100g']) ?? num(n['energy']);
    if (energy !== null) {
      const unit = typeof n['energy_unit'] === 'string' ? n['energy_unit'].toLowerCase() : 'kj';
      kcal = unit === 'kcal' ? energy : energy / KJ_PER_KCAL;
    }
  }
  if (kcal === null || kcal < 0) return null;

  return {
    calories: kcal,
    protein_g: Math.max(0, num(n['proteins_100g']) ?? 0),
    carbs_g: Math.max(0, num(n['carbohydrates_100g']) ?? 0),
    fat_g: Math.max(0, num(n['fat_100g']) ?? 0),
    fiber_g: num(n['fiber_100g']),
  };
}

/** "30 g", "1 cup (240 ml)" -> grams, when a number and a gram unit are present. */
function readServingGrams(raw: Record<string, unknown>): number | null {
  const quantity = num(raw['serving_quantity']);
  if (quantity !== null && quantity > 0) return quantity;

  const label = raw['serving_size'];
  if (typeof label === 'string') {
    const match = label.match(/([\d.,]+)\s*(g|ml)\b/i);
    if (match) {
      const value = num(match[1]);
      if (value !== null && value > 0) return value;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/** Every brand on the product, not just the first — `brands` is a comma-joined string or an array. */
function readAllBrands(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  return list
    .filter((b): b is string => typeof b === 'string')
    .map((b) => b.trim())
    .filter(Boolean);
}

/** `brands` is a comma-joined string on v2 and an array in the search index. */
function readBrand(raw: unknown): string | null {
  if (Array.isArray(raw)) {
    const cleaned = raw
      .filter((b): b is string => typeof b === 'string')
      .map((b) => b.trim())
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned[0] : null;
  }
  if (typeof raw === 'string' && raw.trim() !== '') return raw.split(',')[0].trim();
  return null;
}

function toProduct(raw: unknown): OffProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  const code = firstString(p['code'], p['_id']);
  const name = firstString(p['product_name'], p['product_name_en'], p['generic_name']);
  // A row with no name is unusable in a results list, and one with no code
  // cannot be re-fetched or attributed.
  if (!code || !name) return null;

  const countries = Array.isArray(p['countries_tags'])
    ? (p['countries_tags'] as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  return {
    code,
    name,
    brand: readBrand(p['brands']),
    imageUrl: firstString(p['image_front_small_url'], p['image_small_url'], p['image_url']),
    per100: readPer100(p['nutriments']),
    servingSizeG: readServingGrams(p),
    servingLabel: firstString(p['serving_size']),
    countries,
    local: countries.includes(LOCAL_COUNTRY_TAG),
    nutriscore: firstString(p['nutriscore_grade']),
  };
}

export { looksLikeNonIngredientNote };

const FOOD_PROPERTY_FIELDS = ['ciqual_food_code', 'vegan', 'vegetarian', 'from_palm_oil', 'additive_class'];

const MIN_SUBSTANTIAL_INGREDIENTS_TEXT_LENGTH = 15;

/** A stray one-word fragment left behind in an otherwise-unedited language field isn't a usable ingredient list. */
function isSubstantialIngredientsText(text: string): boolean {
  return text.trim().length >= MIN_SUBSTANTIAL_INGREDIENTS_TEXT_LENGTH;
}

/**
 * Open Food Facts keeps one `ingredients_text_<lang>` field per language a
 * contributor has entered, each independently editable — which is exactly
 * why a product's structured `ingredients[]` array (built by parsing
 * whichever of these was edited most recently) can mix languages between
 * items (see `OffIngredient.text`'s caveat). This reads every such field
 * directly off the raw product payload, keyed by language code, as the
 * single source of truth `selectIngredientsTextSource` picks from instead.
 *
 * OFF also emits debug/import variants sharing the same prefix
 * (`ingredients_text_en_ocr_<timestamp>`, `ingredients_text_with_allergens`,
 * `ingredients_text_fr_imported`) — the regex's exact `{2,3}`-letter anchor
 * excludes all of them, leaving only genuine language-code fields.
 */
function readIngredientsTextByLanguage(raw: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const match = key.match(/^ingredients_text_([a-z]{2,3})$/);
    if (!match) continue;
    const text = firstString(value);
    if (text && isSubstantialIngredientsText(text)) result[match[1]] = text;
  }
  return result;
}

export interface IngredientsTextSource {
  /** Language code as OFF names it in the field suffix, e.g. "en", "fr" — not necessarily an `AppLanguage`. */
  lang: string;
  text: string;
}

/**
 * Picks exactly one language as the single source of truth for a product's
 * ingredient list, so nothing downstream ever mixes languages within one
 * product: the app's target language first, then its other supported
 * language, and only then whichever remaining language has the fullest
 * text — `byLang` has already dropped thin/near-empty entries (see
 * `isSubstantialIngredientsText`), so "fullest" never means "only a stray
 * fragment survived."
 */
function selectIngredientsTextSource(
  byLang: Record<string, string>,
  targetLang: AppLanguage
): IngredientsTextSource | null {
  const otherLang: AppLanguage = targetLang === 'bg' ? 'en' : 'bg';
  if (byLang[targetLang]) return { lang: targetLang, text: byLang[targetLang] };
  if (byLang[otherLang]) return { lang: otherLang, text: byLang[otherLang] };

  let best: IngredientsTextSource | null = null;
  for (const [lang, text] of Object.entries(byLang)) {
    if (!best || text.length > best.text.length) best = { lang, text };
  }
  return best;
}

const INGREDIENTS_LABEL_PREFIX =
  /^\s*(ingredients?|ingr[ée]dients?|zutaten|ingredienti|ingredientes|съставки)\s*:\s*/iu;

/** Strips a leading "Ingredients:"-style label so it doesn't get glued onto the first split item. */
function stripIngredientsLabelPrefix(text: string): string {
  return text.replace(INGREDIENTS_LABEL_PREFIX, '');
}

/**
 * Splits ingredients text into one entry per top-level item. Commas inside
 * "(...)" or "[...]" — a sub-ingredient breakdown like "vegetable fat
 * (palm, shea)" — are kept intact rather than treated as new items, and so
 * is a comma used as a European-style decimal separator in an unparenthesized
 * percentage ("cacao maigre 7,4%" is one item, not "7" and "4%").
 */
function splitIngredientsText(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1);

    const isDecimalComma = char === ',' && /\d/.test(current.slice(-1)) && /\d/.test(text[i + 1] ?? '');
    if (char === ',' && depth === 0 && !isDecimalComma) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map(cleanIngredientItem).filter((item) => item !== '');
}

/**
 * A standalone "(13%)" or trailing "13%" is dropped — percent is shown from
 * the matched structured entry instead (see `buildIngredientsFromSource`),
 * so keeping it in the label text would just show it twice.
 */
function cleanIngredientItem(raw: string): string {
  return raw
    .replace(/\(\s*\d+([.,]\d+)?\s*%\s*\)\s*$/u, '')
    .replace(/\d+([.,]\d+)?\s*%\s*$/u, '')
    .replace(/^[\s:.-]+|[\s.]+$/gu, '')
    .trim();
}

/** Case/punctuation-insensitive exact-duplicate removal — not fuzzy synonym matching. */
function dedupeIngredientItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item
      .toLowerCase()
      .replace(/[.,;:()[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

/**
 * Builds the ingredient list shown to the user from the single chosen
 * source-language text (translate → dedupe → filter): split into items,
 * drop non-ingredient boilerplate, remove exact duplicates. Percent,
 * quantity, and taxonomy id still come from the structured `ingredients[]`
 * array as before — matched by position, since that data isn't the
 * language-inconsistent part, only that array's own per-item name/text is.
 * A product whose structured array parses to a different item count than
 * this split naturally loses alignment past the shorter list; percent/id
 * are simply absent for whichever side runs out first.
 */
function buildIngredientsFromSource(
  source: IngredientsTextSource,
  structured: OffIngredient[]
): OffIngredient[] {
  const items = dedupeIngredientItems(
    splitIngredientsText(stripIngredientsLabelPrefix(source.text)).filter(
      (item) => !looksLikeNonIngredientNote(item)
    )
  );

  return items.map((text, index) => {
    const match = structured[index];
    return {
      id: match?.id ?? null,
      text,
      rank: index,
      percent: match?.percent ?? null,
      percentEstimate: match?.percentEstimate ?? null,
      idIsTaxonomyRecognized: match?.idIsTaxonomyRecognized ?? false,
      displayName: text,
      displayNameIsFallback: false,
    };
  });
}

function readIngredients(raw: unknown): OffIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): Omit<OffIngredient, 'rank'> | null => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const text = firstString(e['text'], e['id']);
      if (!text || looksLikeNonIngredientNote(text)) return null;
      const id = firstString(e['id']);
      return {
        id,
        text,
        percent: num(e['percent']),
        percentEstimate: num(e['percent_estimate']),
        idIsTaxonomyRecognized: num(e['is_in_taxonomy']) === 1 && /^en:/i.test(id ?? ''),
        displayName: text,
        displayNameIsFallback: false,
      };
    })
    .filter((i): i is Omit<OffIngredient, 'rank'> => i !== null)
    .map((i, index) => ({ ...i, rank: index }));
}

/** Guards against a malformed, self-nesting payload; real products nest one or two levels. */
const MAX_INGREDIENT_DEPTH = 5;

/**
 * Reads OFF's structured `ingredients[]` array into a tree, keeping OFF's
 * order (the label order, most to least by quantity) and nesting. Reads every
 * row as-is — deciding which rows aren't really ingredients is
 * `sanitizeIngredientTree`'s job, so a bad row's children aren't lost with it.
 */
function readIngredientTree(raw: unknown, depth = 0): IngredientNode[] {
  if (!Array.isArray(raw) || depth > MAX_INGREDIENT_DEPTH) return [];
  const nodes: IngredientNode[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    nodes.push({
      id: firstString(e['id']),
      text: firstString(e['text'], e['id']) ?? '',
      isInTaxonomy: num(e['is_in_taxonomy']) === 1,
      hasFoodProperties: FOOD_PROPERTY_FIELDS.some((field) => firstString(e[field]) !== null),
      percent: num(e['percent']),
      percentEstimate: num(e['percent_estimate']),
      percentMin: num(e['percent_min']),
      percentMax: num(e['percent_max']),
      children: readIngredientTree(e['ingredients'], depth + 1),
    });
  }
  return nodes;
}

/**
 * Which percentage to show, without inventing one: the disclosed exact value,
 * else OFF's estimate, else OFF's upper bound. An estimate of 0 carries no
 * information (OFF's own site shows nothing for it), and an upper bound of
 * 100 says nothing either.
 */
export function formatIngredientPercent(node: IngredientNode): IngredientPercent {
  if (node.percent !== null) return { kind: 'exact', value: node.percent };
  if (node.percentEstimate !== null && node.percentEstimate > 0) {
    return { kind: 'estimate', value: node.percentEstimate };
  }
  if (node.percentMax !== null && node.percentMax > 0 && node.percentMax < 100) {
    return { kind: 'max', value: node.percentMax };
  }
  return { kind: 'none' };
}

/**
 * Builds the ingredients product, preferring Bulgarian-language fields when
 * `lang` is 'bg' and falling back to the product's default-language field
 * only when no Bulgarian version exists.
 *
 * Both the free-text ingredient list shown to the user and the raw-text card
 * beneath it are built from the *same* single chosen source language (see
 * `selectIngredientsTextSource`), so the two can never disagree about what
 * language the product's ingredients are shown in.
 */
function toIngredientsProduct(raw: unknown, lang: AppLanguage = 'en'): OffIngredientsProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  const code = firstString(p['code'], p['_id']);
  const name =
    lang === 'bg'
      ? firstString(p['product_name_bg'], p['product_name'], p['product_name_en'], p['generic_name'])
      : firstString(p['product_name'], p['product_name_en'], p['generic_name']);
  if (!code || !name) return null;

  const allergensTags = Array.isArray(p['allergens_tags'])
    ? (p['allergens_tags'] as unknown[]).filter((a): a is string => typeof a === 'string')
    : [];

  // Strictly try the requested language, then the other supported language,
  // and only then whichever remaining language has the fullest text — which
  // may be in neither of the app's languages (e.g. a product entered only in
  // Slovenian or German). Falling that far is a real gap in this product's
  // data, flagged via `ingredientsTextLanguageGap` rather than silently
  // presented as if it were the requested language.
  const textByLang = readIngredientsTextByLanguage(p);
  let source = selectIngredientsTextSource(textByLang, lang);
  if (!source) {
    // Rare, but a product can carry the bare (unsuffixed) field with no
    // matching `ingredients_text_<lang>` counterpart — e.g. an older import.
    // Its language is unknown, so it's used only as an absolute last resort,
    // and always flagged as a gap (never assumed to already be `lang`).
    const bareText = firstString(p['ingredients_text']);
    if (bareText && isSubstantialIngredientsText(bareText)) source = { lang: 'unknown', text: bareText };
  }
  const ingredientsText = source?.text ?? null;
  const ingredientsTextLanguageGap = source !== null && source.lang !== lang;
  const structuredIngredients = readIngredients(p['ingredients']);
  const ingredients = source ? buildIngredientsFromSource(source, structuredIngredients) : [];
  const sanitized = sanitizeIngredientTree(readIngredientTree(p['ingredients']), {
    brands: readAllBrands(p['brands']),
  });

  return {
    code,
    name,
    brand: readBrand(p['brands']),
    imageUrl: firstString(p['image_front_small_url'], p['image_small_url'], p['image_url']),
    ingredientTree: sanitized.tree,
    ingredientDecisions: sanitized.decisions,
    ingredientsText,
    ingredientsTextLanguageGap,
    ingredientsTextTranslated: false,
    ingredients,
    novaGroup: num(p['nova_group']),
    allergensTags,
    nutriscoreGrade: firstString(p['nutriscore_grade']),
  };
}

export interface IngredientTaxonomyName {
  /** The taxonomy's name for this id in the requested language, when a translation exists. */
  localized: string | null;
  /**
   * The taxonomy's own canonical English name (e.g. "cow's milk" for
   * "en:cow-s-milk") — a real, correctly-formatted name, never one derived
   * by reformatting the id itself. Used as a last-resort, clearly-labeled
   * fallback when `localized` is null.
   */
  english: string | null;
}

function readTaxonomyNames(payload: unknown, lang: AppLanguage): Record<string, IngredientTaxonomyName> {
  const result: Record<string, IngredientTaxonomyName> = {};
  if (!payload || typeof payload !== 'object') return result;

  for (const [id, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const name = (value as Record<string, unknown>)['name'];
    if (!name || typeof name !== 'object') continue;
    const names = name as Record<string, unknown>;
    result[id] = {
      localized: firstString(names[lang]),
      english: firstString(names['en']),
    };
  }
  return result;
}

/**
 * Looks up display names for taxonomy ingredient ids (e.g. "en:cow-s-milk")
 * straight from Open Food Facts' ingredient taxonomy — the authoritative
 * source of translated ingredient names. This is distinct from a product's
 * own `ingredients[].text`, which is never translated by the `lc` param (see
 * the caveat on `OffIngredient.text`) — this is the real fix for that gap.
 * Requests both the target language and English in a single call, so
 * callers always have a genuine (not formatted-from-id) English name ready
 * as a fallback when no translation exists. Ids the taxonomy doesn't
 * recognise are simply absent from the result, never an error.
 */
export async function fetchIngredientTaxonomyNames(
  ids: string[],
  lang: AppLanguage,
  signal?: AbortSignal
): Promise<Record<string, IngredientTaxonomyName>> {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id !== '')));
  if (unique.length === 0) return {};

  const lc = lang === 'en' ? 'en' : `${lang},en`;
  const params = new URLSearchParams({
    tagtype: 'ingredients',
    tags: unique.join(','),
    fields: 'name',
    lc,
  });

  const payload = await getJson(`${TAXONOMY_URL}?${params.toString()}`, signal);
  return readTaxonomyNames(payload, lang);
}

const CANONICALIZE_URL = 'https://world.openfoodfacts.org/api/v3/taxonomy_canonicalize_tags';

/**
 * Keeps each GET well under common URL limits — Cyrillic text percent-encodes
 * to ~6 bytes a character.
 */
const MAX_CANONICALIZE_BATCH_CHARS = 600;

/**
 * Reads a `taxonomy_canonicalize_tags` response, whose `canonical_tags` line
 * up by position with the requested list. Only genuine taxonomy matches are
 * kept — for an unknown string OFF just echoes it back as "<lc>:<text>".
 */
function readCanonicalTags(payload: unknown, texts: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const tags =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>)['canonical_tags'] : null;
  if (!Array.isArray(tags) || tags.length !== texts.length) return result;

  tags.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    const e = entry as Record<string, unknown>;
    const tag = firstString(e['tag']);
    if (e['exists_in_taxonomy'] === true && tag) result.set(texts[i], tag);
  });
  return result;
}

/** Splits texts into request-sized batches; texts with a comma can't be sent (the list is comma-separated). */
function batchCanonicalizeTexts(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of Array.from(new Set(texts.map((t) => t.trim())))) {
    if (text === '' || text.includes(',')) continue;
    if (current.length > 0 && chars + text.length > MAX_CANONICALIZE_BATCH_CHARS) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length + 1;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Asks Open Food Facts to recognise free ingredient text written in language
 * `lc` (e.g. "вода" in bg -> "en:water"). This is OFF's own taxonomy
 * matching, so it recognises ingredients that the product's parser missed
 * because it parsed the label in the wrong language. Texts OFF doesn't
 * recognise are simply absent from the result. Batches that fail are skipped.
 */
export async function fetchCanonicalIngredientIds(
  texts: string[],
  lc: string,
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const batch of batchCanonicalizeTexts(texts)) {
    const params = new URLSearchParams({ tagtype: 'ingredients', lc, local_tags_list: batch.join(',') });
    try {
      const payload = await getJson(`${CANONICALIZE_URL}?${params.toString()}`, signal);
      for (const [text, id] of readCanonicalTags(payload, batch)) result.set(text, id);
    } catch (err) {
      if (signal?.aborted) throw err;
    }
  }
  return result;
}

function readHits(payload: unknown): { hits: unknown[]; count: number } {
  if (!payload || typeof payload !== 'object') return { hits: [], count: 0 };
  const body = payload as Record<string, unknown>;

  // The v0/v1 endpoints signal "nothing matched" with status 0 rather than an
  // empty list; treat it as no results instead of trying to read `hits`.
  if (body['status'] === 0) return { hits: [], count: 0 };

  const hits = Array.isArray(body['hits'])
    ? (body['hits'] as unknown[])
    : Array.isArray(body['products'])
      ? (body['products'] as unknown[])
      : [];

  return { hits, count: num(body['count']) ?? hits.length };
}

function buildSearchUrl(query: string, pageSize: number, countryTag?: string): string {
  const q = countryTag ? `${query} countries_tags:"${countryTag}"` : query;
  const params = new URLSearchParams({
    q,
    page_size: String(pageSize),
    fields: SEARCH_FIELDS,
  });
  return `${SEARCH_URL}?${params.toString()}`;
}

/**
 * Full-text search, biased toward local products.
 *
 * Two requests run in parallel: one restricted to the local country tag and one
 * unrestricted. Local matches are listed first, then everything else, deduped
 * by barcode — so the bias changes the order without hiding anything.
 */
export async function searchFoods(
  query: string,
  signal?: AbortSignal
): Promise<OffSearchResult> {
  const trimmed = query.trim();
  if (trimmed === '') return { products: [], total: 0 };

  const [localResult, globalResult] = await Promise.allSettled([
    getJson(buildSearchUrl(trimmed, 12, LOCAL_COUNTRY_TAG), signal),
    getJson(buildSearchUrl(trimmed, 30), signal),
  ]);

  // The unfiltered query is the one that matters; if it failed, the search failed.
  if (globalResult.status === 'rejected') throw globalResult.reason;

  const local = localResult.status === 'fulfilled' ? readHits(localResult.value) : { hits: [], count: 0 };
  const global = readHits(globalResult.value);

  const seen = new Set<string>();
  const products: OffProduct[] = [];

  for (const raw of [...local.hits, ...global.hits]) {
    const product = toProduct(raw);
    if (!product || seen.has(product.code)) continue;
    seen.add(product.code);
    products.push(product);
  }

  return { products, total: global.count };
}

/**
 * Looks a barcode up. Resolves to null when Open Food Facts has no such
 * product (`status: 0`) — the caller offers manual entry instead.
 */
export async function fetchProductByBarcode(
  barcode: string,
  signal?: AbortSignal
): Promise<OffProduct | null> {
  const code = barcode.trim();
  if (code === '') return null;

  const params = new URLSearchParams({ fields: PRODUCT_FIELDS });
  const payload = await getJson(
    `${PRODUCT_URL}/${encodeURIComponent(code)}.json?${params.toString()}`,
    signal
  );

  if (!payload || typeof payload !== 'object') {
    throw new OffError('malformed', 'Unexpected product response');
  }
  const body = payload as Record<string, unknown>;
  if (body['status'] === 0 || !body['product']) return null;

  return toProduct(body['product']);
}

/**
 * Looks up a barcode for its ingredient breakdown, not its calorie/macro data.
 * `lang` is sent as OFF's `lc` param so taxonomized fields (recognised
 * ingredients, in particular) come back translated, and is also used to pick
 * between the language-suffixed fields on the raw response. Resolves to null
 * when Open Food Facts has no such product (`status: 0`).
 */
export async function fetchIngredientsByBarcode(
  barcode: string,
  lang: AppLanguage = 'en',
  signal?: AbortSignal
): Promise<OffIngredientsProduct | null> {
  const code = barcode.trim();
  if (code === '') return null;

  const params = new URLSearchParams({ fields: INGREDIENTS_FIELDS, lc: lang });
  const payload = await getJson(
    `${PRODUCT_URL}/${encodeURIComponent(code)}.json?${params.toString()}`,
    signal
  );

  if (!payload || typeof payload !== 'object') {
    throw new OffError('malformed', 'Unexpected product response');
  }
  const body = payload as Record<string, unknown>;
  if (body['status'] === 0 || !body['product']) return null;

  return toIngredientsProduct(body['product'], lang);
}

/** Seeds the entry form from a product, defaulting to a 100 g portion. */
export function productToPrefill(
  product: OffProduct,
  source: 'search' | 'barcode',
  quantity = 100
): EntryPrefill {
  return {
    name: product.name,
    brand: product.brand,
    source,
    barcode: product.code,
    quantity,
    unit: 'g',
    per100: product.per100,
    nutrition: null,
    serving_size_g: product.servingSizeG,
    imageUrl: product.imageUrl,
  };
}

export const __testing = {
  readPer100,
  readServingGrams,
  toProduct,
  readHits,
  readBrand,
  readAllBrands,
  buildSearchUrl,
  readIngredients,
  readIngredientTree,
  toIngredientsProduct,
  readTaxonomyNames,
  readCanonicalTags,
  batchCanonicalizeTexts,
  readIngredientsTextByLanguage,
  selectIngredientsTextSource,
  splitIngredientsText,
  stripIngredientsLabelPrefix,
  dedupeIngredientItems,
  buildIngredientsFromSource,
  isSubstantialIngredientsText,
};
