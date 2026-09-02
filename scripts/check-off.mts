// Checks the Open Food Facts parsing layer in src/lib/off.ts against real
// response shapes, then (unless --offline) makes live calls to confirm the
// endpoints still behave as expected.
// Run with: npm run check:off  /  npm run check:off -- --offline
import {
  fetchProductByBarcode,
  productToPrefill,
  searchFoods,
  __testing,
} from '../src/lib/off.ts';

const { readPer100, readServingGrams, toProduct, readHits, readBrand, buildSearchUrl } = __testing;

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function close(label: string, actual: number | null | undefined, expected: number, tol = 0.5) {
  check(label, actual != null && Math.abs(actual - expected) <= tol, `got ${String(actual)}`);
}

// --- energy parsing ---------------------------------------------------------
close('kcal read directly', readPer100({ 'energy-kcal_100g': 539 })?.calories, 539);
close(
  'kJ converted when kcal missing',
  readPer100({ 'energy-kj_100g': 2252 })?.calories,
  2252 / 4.184
);
close(
  'energy_100g with kJ unit converted',
  readPer100({ energy_100g: 1597, energy_unit: 'kJ' })?.calories,
  1597 / 4.184
);
close(
  'energy_100g with kcal unit taken as-is',
  readPer100({ energy_100g: 379, energy_unit: 'kcal' })?.calories,
  379
);
check('no energy at all yields null', readPer100({ proteins_100g: 8 }) === null);
check('non-object nutriments yields null', readPer100(undefined) === null);

const full = readPer100({
  'energy-kcal_100g': 379,
  proteins_100g: 8.9,
  carbohydrates_100g: 68,
  fat_100g: 6.4,
  fiber_100g: 9.1,
})!;
close('protein read', full.protein_g, 8.9, 0.01);
close('carbs read', full.carbs_g, 68, 0.01);
close('fat read', full.fat_g, 6.4, 0.01);
close('fibre read', full.fiber_g, 9.1, 0.01);

const missingMacros = readPer100({ 'energy-kcal_100g': 100 })!;
check('missing macros default to 0', missingMacros.protein_g === 0 && missingMacros.fat_g === 0);
check('missing fibre stays null', missingMacros.fiber_g === null);
const negative = readPer100({ 'energy-kcal_100g': 100, proteins_100g: -5 })!;
check('negative macros clamped to 0', negative.protein_g === 0);

// String values appear in the wild for numeric fields.
close('string energy parsed', readPer100({ 'energy-kcal_100g': '250' })?.calories, 250);
close('comma decimal parsed', readPer100({ 'energy-kcal_100g': '250,5' })?.calories, 250.5);

// --- serving size -----------------------------------------------------------
close('serving_quantity used', readServingGrams({ serving_quantity: 30 }), 30);
close('serving_size "30 g" parsed', readServingGrams({ serving_size: '30 g' }), 30);
close('serving_size "1 cup (240 ml)" parsed', readServingGrams({ serving_size: '1 cup (240 ml)' }), 240);
close('serving_size decimal parsed', readServingGrams({ serving_size: '12.5 g' }), 12.5);
check('serving_size without units yields null', readServingGrams({ serving_size: '1 biscuit' }) === null);
check('no serving info yields null', readServingGrams({}) === null);

// --- brands -----------------------------------------------------------------
check('brand array takes the first', readBrand(['Chobani', 'Other']) === 'Chobani');
check('brand string splits on comma', readBrand('Nutella, Ferrero') === 'Nutella');
check('empty brand yields null', readBrand('') === null);
check('missing brand yields null', readBrand(undefined) === null);

// --- response envelopes -----------------------------------------------------
check('status 0 is treated as no results', readHits({ status: 0, status_verbose: 'not found' }).hits.length === 0);
check('search-a-licious hits read', readHits({ hits: [{}, {}], count: 42 }).hits.length === 2);
check('search-a-licious count read', readHits({ hits: [{}], count: 42 }).count === 42);
check('legacy products array read', readHits({ products: [{}, {}, {}] }).hits.length === 3);
check('garbage envelope yields no hits', readHits('nonsense').hits.length === 0);
check('empty hits list is fine', readHits({ hits: [], count: 0 }).hits.length === 0);

// --- product mapping --------------------------------------------------------
check('product without a code is dropped', toProduct({ product_name: 'X' }) === null);
check('product without a name is dropped', toProduct({ code: '1' }) === null);
check(
  'generic_name is used when product_name is absent',
  toProduct({ code: '1', generic_name: 'Yoghurt' })?.name === 'Yoghurt'
);

const mapped = toProduct({
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Ferrero',
  countries_tags: ['en:bulgaria', 'en:france'],
  nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3 },
  serving_size: '15 g',
  image_url: 'https://example.test/a.jpg',
})!;
check('local country tag detected', mapped.local === true);
check('non-local product not flagged', toProduct({ code: '2', product_name: 'X', countries_tags: ['en:france'] })?.local === false);
check('missing countries_tags is safe', toProduct({ code: '3', product_name: 'X' })?.local === false);
close('mapped serving grams', mapped.servingSizeG, 15);
check('mapped image url', mapped.imageUrl === 'https://example.test/a.jpg');
check('product with no nutriments still maps', toProduct({ code: '4', product_name: 'X' })?.per100 === null);

// --- prefill ----------------------------------------------------------------
const prefill = productToPrefill(mapped, 'search');
check('prefill defaults to 100 g', prefill.quantity === 100 && prefill.unit === 'g');
check('prefill carries the per-100 basis', prefill.per100?.calories === 539);
check('prefill records the barcode', prefill.barcode === '3017620422003');
check('prefill records the source', prefill.source === 'search');
check('prefill carries serving size', prefill.serving_size_g === 15);

// --- query building ---------------------------------------------------------
const localUrl = buildSearchUrl('oats', 12, 'en:bulgaria');
check('country tag is added as a filter', localUrl.includes('countries_tags'), localUrl);
check('country tag value is encoded', localUrl.includes('en%3Abulgaria'), localUrl);
// `countries_tags` also appears in the `fields` list, so assert on `q` alone.
const qOf = (url: string) => new URL(url).searchParams.get('q') ?? '';
check('filtered q carries the country tag', qOf(localUrl).includes('countries_tags:"en:bulgaria"'), qOf(localUrl));
check('unfiltered q has no country tag', !qOf(buildSearchUrl('oats', 30)).includes('countries_tags'), qOf(buildSearchUrl('oats', 30)));
check('page size is passed', buildSearchUrl('oats', 30).includes('page_size=30'));
check('query is url-encoded', buildSearchUrl('greek yogurt', 5).includes('greek+yogurt'));

// --- live endpoints ---------------------------------------------------------
if (process.argv.includes('--offline')) {
  console.log('\n(skipping live API checks: --offline)');
} else {
  console.log('\n--- live Open Food Facts ---');
  try {
    const found = await fetchProductByBarcode('3017620422003');
    check('known barcode resolves', found !== null, found?.name ?? 'null');
    check('known barcode has per-100 nutrition', (found?.per100?.calories ?? 0) > 0);

    const missing = await fetchProductByBarcode('0000000000000');
    check('unknown barcode resolves to null (status 0)', missing === null);

    const results = await searchFoods('greek yogurt');
    check('text search returns products', results.products.length > 0, `${results.products.length} products`);
    check('every result has a code and a name', results.products.every((p) => p.code && p.name));
    check('most results carry nutrition', results.products.filter((p) => p.per100).length > 0);
    const codes = results.products.map((p) => p.code);
    check('results are deduped', new Set(codes).size === codes.length);
    const firstNonLocal = results.products.findIndex((p) => !p.local);
    const lastLocal = results.products.map((p) => p.local).lastIndexOf(true);
    check(
      'local products sort ahead of the rest',
      firstNonLocal === -1 || lastLocal === -1 || lastLocal < firstNonLocal
    );

    const nothing = await searchFoods('zzzqqqxxnotathing');
    check('a no-match search returns an empty list, not an error', nothing.products.length === 0);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  live checks threw — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(failures === 0 ? '\nALL OFF CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
