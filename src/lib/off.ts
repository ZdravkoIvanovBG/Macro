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
import type { EntryPrefill, Nutrition } from './types';

const SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product';

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
        return 'No connection. Search and barcode lookups need the internet — everything else in the app works offline.';
      case 'timeout':
        return 'Open Food Facts took too long to answer. Try again in a moment.';
      case 'http':
        return `Open Food Facts returned an error (${err.message}).`;
      default:
        return 'Open Food Facts sent something this app could not read.';
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
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

export const __testing = { readPer100, readServingGrams, toProduct, readHits, readBrand, buildSearchUrl };
