// Checks the Open Food Facts parsing layer in src/lib/off.ts against real
// response shapes, then (unless --offline) makes live calls to confirm the
// endpoints still behave as expected.
// Run with: npm run check:off  /  npm run check:off -- --offline
import { readFileSync } from 'node:fs';
import {
  fetchCanonicalIngredientIds,
  fetchIngredientsByBarcode,
  fetchIngredientTaxonomyNames,
  fetchProductByBarcode,
  formatIngredientPercent,
  looksLikeNonIngredientNote,
  productToPrefill,
  searchFoods,
  __testing,
  type IngredientNode,
} from '../src/lib/off.ts';
import {
  canonicalKey,
  collectCanonicalizationRequests,
  collectIngredientIds,
  hasCyrillic,
  isBulgarianText,
  localizeTree,
} from '../src/lib/ingredientNames.ts';

const {
  readPer100,
  readServingGrams,
  toProduct,
  readHits,
  readBrand,
  buildSearchUrl,
  readIngredients,
  readIngredientTree,
  readCanonicalTags,
  batchCanonicalizeTexts,
  toIngredientsProduct,
  readIngredientsTextByLanguage,
  selectIngredientsTextSource,
  splitIngredientsText,
  stripIngredientsLabelPrefix,
  dedupeIngredientItems,
  buildIngredientsFromSource,
  isSubstantialIngredientsText,
} = __testing;

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

// --- ingredients --------------------------------------------------------------
const noIngredients = readIngredients(undefined);
check('non-array ingredients yields empty list', noIngredients.length === 0);

const ingredientList = readIngredients([
  { id: 'en:water', text: 'Water', percent_estimate: 60.5 },
  { id: 'en:sugar', text: 'Sugar', percent: 20 },
  { text: 'Natural flavouring' },
  { id: 'en:e330' },
]);
check('ingredients keep list order (rank)', ingredientList.map((i) => i.rank).join(',') === '0,1,2,3');
check('ingredient text read', ingredientList[0].text === 'Water');
close('ingredient percent_estimate read', ingredientList[0].percentEstimate, 60.5, 0.01);
check('ingredient exact percent read', ingredientList[1].percent === 20);
check('ingredient without id falls back to text', ingredientList[2].text === 'Natural flavouring');
check('ingredient without text falls back to id', ingredientList[3].text === 'en:e330');
check(
  'entries without id or text are dropped',
  readIngredients([{ percent: 5 }, { id: 'en:salt', text: 'Salt' }]).length === 1
);

// --- ingredient name resolution inputs ---------------------------------------
check('displayName defaults to the raw text', ingredientList[0].displayName === 'Water');
check(
  'a taxonomy-matched en: id is flagged as taxonomy-recognized',
  readIngredients([{ id: 'en:skimmed-milk', text: 'Skimmed milk', is_in_taxonomy: 1 }])[0]
    .idIsTaxonomyRecognized === true
);
check(
  'an id without is_in_taxonomy: 1 is not treated as recognized',
  readIngredients([{ id: 'en:skimmed-milk', text: 'Skimmed milk' }])[0].idIsTaxonomyRecognized === false
);
check(
  'a non-en: id is not treated as recognized even if flagged in taxonomy',
  readIngredients([{ id: 'fr:koncentreret', text: 'Koncentreret', is_in_taxonomy: 0 }])[0]
    .idIsTaxonomyRecognized === false
);

const dirtyIngredients = readIngredients([
  { id: 'en:skimmed-milk', text: 'Skimmed milk', percent_estimate: 90 },
  { text: 'Unopened below +8 °C fat has a minimum shelf life of', percent_estimate: 5 },
  { text: 'see lid', percent_estimate: 3 },
  { text: '247kJ', percent_estimate: 1 },
  { text: 'EU', percent_estimate: 1 },
  { text: 'Съхранявайте на хладно място' },
]);
check('storage/date/certification notes are dropped', dirtyIngredients.length === 1, `${dirtyIngredients.length} left`);
check('genuine ingredient survives the filter', dirtyIngredients[0]?.text === 'Skimmed milk');
check('rank is re-indexed after dropping junk entries', dirtyIngredients[0]?.rank === 0);

// --- ingredients text: per-language field discovery ---------------------------
const byLang = readIngredientsTextByLanguage({
  ingredients_text_en: 'Sugar, palm oil, hazelnuts',
  ingredients_text_bg: 'Захар, палмово масло, лешници',
  ingredients_text_fr: 'Sucre, huile de palme, noisettes',
  ingredients_text_de: '',
  ingredients_text_en_ocr_1642445989: 'ingredients: sugar, palm oil',
  ingredients_text_en_ocr_1642445989_result: 'Sugar, palm oil',
  ingredients_text_with_allergens: 'Sugar, <span>palm oil</span>',
  ingredients_text_fr_imported: 'Sucre, huile de palme',
});
check('language fields are discovered for en/bg/fr', Object.keys(byLang).sort().join(',') === 'bg,en,fr');
check('an empty-string language field is dropped', !('de' in byLang));
check('an OCR debug field is not treated as its own language', !('en_ocr_1642445989' in byLang));
check('a "with_allergens" field is not treated as a language field', Object.keys(byLang).every((k) => k.length <= 3));
check('an "_imported"-suffixed field is not treated as its own language', !('fr_imported' in byLang));

check('a one-word fragment is not substantial', isSubstantialIngredientsText('Salt') === false);
check('a real ingredient list is substantial', isSubstantialIngredientsText('Sugar, palm oil, hazelnuts') === true);
check(
  'a thin fragment is excluded from the language map entirely',
  Object.keys(readIngredientsTextByLanguage({ ingredients_text_it: 'Sale' })).length === 0
);

// --- ingredients text: single-source-of-truth language selection --------------
check(
  'selection prefers the target language',
  selectIngredientsTextSource({ en: 'Sugar, salt, water', bg: 'Захар, сол, вода' }, 'bg')?.lang === 'bg'
);
check(
  'selection falls back to the other supported language',
  selectIngredientsTextSource({ en: 'Sugar, salt, water, oil' }, 'bg')?.lang === 'en'
);
check(
  'selection falls back to the fullest remaining language, ignoring thin ones',
  selectIngredientsTextSource(
    { fr: 'Sucre, sel', de: 'Zucker, Salz, Wasser, noch mehr Text hier' },
    'bg'
  )?.lang === 'de'
);
check('no candidates at all resolves to null', selectIngredientsTextSource({}, 'bg') === null);

// --- ingredients text: split -> filter -> dedupe pipeline ---------------------
check(
  'splits on top-level commas only, keeping parenthetical sub-lists intact',
  splitIngredientsText('Sugar, vegetable fat (palm, shea), hazelnuts').join('|') ===
    'Sugar|vegetable fat (palm, shea)|hazelnuts'
);
check(
  'a European-style decimal comma in an unparenthesized percentage is not treated as a separator',
  splitIngredientsText('Sugar, cacao maigre 7,4%, milk powder').join('|') === 'Sugar|cacao maigre|milk powder'
);
check(
  'a trailing percent annotation is stripped (percent comes from the matched structured entry instead)',
  splitIngredientsText('Hazelnuts (13%), cocoa 7,4%').join('|') === 'Hazelnuts|cocoa'
);
check(
  'a leading "Ingredients:" label is stripped before splitting',
  stripIngredientsLabelPrefix('Ingredients: Sugar, salt') === 'Sugar, salt'
);
check(
  'the existing non-ingredient-note filter drops boilerplate mixed into the split items',
  splitIngredientsText('Sugar, best before see lid, salt')
    .filter((item) => !looksLikeNonIngredientNote(item))
    .join('|') === 'Sugar|salt'
);
check(
  'exact case/punctuation-insensitive duplicates are removed',
  dedupeIngredientItems(['Sugar', 'salt', 'SUGAR.', 'Salt']).join('|') === 'Sugar|salt'
);

const built = buildIngredientsFromSource(
  { lang: 'en', text: 'Sugar, palm oil, hazelnuts' },
  [
    {
      id: 'en:sugar',
      text: 'Sucre',
      rank: 0,
      percent: null,
      percentEstimate: 55,
      idIsTaxonomyRecognized: true,
      displayName: 'Sucre',
      displayNameIsFallback: false,
    },
    {
      id: 'en:palm-oil',
      text: 'Huile de palme',
      rank: 1,
      percent: null,
      percentEstimate: 30,
      idIsTaxonomyRecognized: true,
      displayName: 'Huile de palme',
      displayNameIsFallback: false,
    },
  ]
);
check('built ingredients follow the split order, not the structured array\'s own text', built.map((i) => i.text).join('|') === 'Sugar|palm oil|hazelnuts');
check('percent data is matched onto the cleaned list by position', built[0].percentEstimate === 55 && built[1].percentEstimate === 30);
check('taxonomy id is carried over by position (id is language-neutral, unlike text)', built[0].id === 'en:sugar' && built[0].idIsTaxonomyRecognized === true);
check('an item past the structured array\'s end has no percent or id', built[2].percentEstimate === null && built[2].id === null);

// --- full product assembly: single source of truth end to end -----------------
const ingredientsProduct = toIngredientsProduct({
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Ferrero',
  ingredients_text: 'Sugar, palm oil, hazelnuts',
  ingredients_text_en: 'Sugar, palm oil, hazelnuts',
  ingredients: [
    { id: 'en:sugar', text: 'Sugar', percent_estimate: 55 },
    { id: 'en:palm-oil', text: 'Palm oil', percent_estimate: 30 },
  ],
})!;
check('ingredients product name read', ingredientsProduct.name === 'Nutella');
check('ingredients product text read', ingredientsProduct.ingredientsText === 'Sugar, palm oil, hazelnuts');
check(
  'ingredients product list is built from ingredients_text, not the structured array\'s own length',
  ingredientsProduct.ingredients.length === 3
);
check('ingredients product without code is dropped', toIngredientsProduct({ product_name: 'X' }) === null);
check(
  'ingredients product with no ingredients_text in any language reports no data, ignoring the structured array',
  toIngredientsProduct({
    code: '9',
    product_name: 'X',
    ingredients: [{ id: 'en:sugar', text: 'Sugar', percent_estimate: 55 }],
  })?.ingredients.length === 0
);
check(
  'a bare ingredients_text field with no language suffix is still used as a last resort',
  toIngredientsProduct({ code: '10', product_name: 'X', ingredients_text: 'Sugar, salt, water, oil' })
    ?.ingredientsText === 'Sugar, salt, water, oil'
);

const bgProduct = toIngredientsProduct(
  {
    code: '3017620422003',
    product_name: 'Nutella',
    product_name_bg: 'Нутела',
    ingredients_text: 'Захар, палмово масло, лешници',
    ingredients_text_bg: 'Захар, палмово масло, лешници',
  },
  'bg'
)!;
check('bg lookup prefers product_name_bg', bgProduct.name === 'Нутела');
check('bg lookup prefers ingredients_text_bg', bgProduct.ingredientsText === 'Захар, палмово масло, лешници');
check('bg text from its own field is not flagged as a language gap', bgProduct.ingredientsTextLanguageGap === false);
check('bg ingredients list is built from the bg text, not the (absent here) structured array', bgProduct.ingredients.length === 3);

const bgProductEnOnly = toIngredientsProduct(
  {
    code: '3017620422003',
    product_name: 'Nutella',
    ingredients_text: 'Sugar, palm oil, hazelnuts',
    ingredients_text_en: 'Sugar, palm oil, hazelnuts',
  },
  'bg'
)!;
check(
  'bg lookup falls back to English before any third language',
  bgProductEnOnly.ingredientsText === 'Sugar, palm oil, hazelnuts'
);
check(
  'falling back to the other supported language is flagged as a language gap',
  bgProductEnOnly.ingredientsTextLanguageGap === true
);

const bgProductThirdLanguageOnly = toIngredientsProduct(
  {
    code: '3017620422003',
    product_name: 'Nutella',
    ingredients_text: 'Zucker, Palmöl, Haselnüsse',
    ingredients_text_de: 'Zucker, Palmöl, Haselnüsse',
  },
  'bg'
)!;
check(
  'bg lookup falls back to a third language when neither bg nor en is available',
  bgProductThirdLanguageOnly.ingredientsText === 'Zucker, Palmöl, Haselnüsse'
);
check(
  'falling back to a third language is flagged as a language gap',
  bgProductThirdLanguageOnly.ingredientsTextLanguageGap === true
);
check(
  'the ingredient list is still built (split from the German text) even though it needs translating',
  bgProductThirdLanguageOnly.ingredients.map((i) => i.text).join('|') === 'Zucker|Palmöl|Haselnüsse'
);

const noStructuredIngredients = toIngredientsProduct(
  { code: '3017620422003', product_name: 'Nutella', ingredients_text: 'Sugar, palm oil, hazelnuts' },
  'en'
)!;
check(
  'a product with ingredients_text but no structured array still gets a full item list, just with no percent data',
  noStructuredIngredients.ingredients.map((i) => i.text).join('|') === 'Sugar|palm oil|hazelnuts' &&
    noStructuredIngredients.ingredients.every((i) => i.percent === null && i.percentEstimate === null)
);

// --- structured ingredient tree: Nutella 3017620425035 (real OFF response) ----
const nutellaFixture = JSON.parse(
  readFileSync(new URL('./fixtures/off-3017620425035.json', import.meta.url), 'utf8')
) as { product: Record<string, unknown> };
const nutellaProduct = toIngredientsProduct(nutellaFixture.product, 'en')!;
const nutellaTree = nutellaProduct.ingredientTree;
const nutellaNode = (id: string) => {
  const walk = (nodes: IngredientNode[]): IngredientNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = walk(node.children);
      if (found) return found;
    }
    return undefined;
  };
  return walk(nutellaTree);
};

check(
  'Nutella: the tree keeps OFF order, top level only',
  nutellaTree.map((n) => n.id).join('|') ===
    'en:sugar|en:palm-oil|en:hazelnut|en:skimmed-milk-powder|en:fat-reduced-cocoa|en:e322|en:vanillin',
  nutellaTree.map((n) => n.id).join('|')
);
check(
  'Nutella: soya lecithin stays nested under E322, not flattened into the top level',
  nutellaNode('en:e322')?.children.map((c) => c.id).join('|') === 'en:soya-lecithin'
);
check(
  'Nutella: the malformed ingredients_text_en is nowhere in the tree',
  !JSON.stringify(nutellaTree).includes('UARE') &&
    !JSON.stringify(nutellaTree).includes(String(nutellaFixture.product['ingredients_text_en']))
);
check('Nutella: the fixture really carries the malformed en text', String(nutellaFixture.product['ingredients_text_en']).startsWith('UARE ALLE CAD'));
check('Nutella: the taxonomy flag is read', nutellaTree.every((n) => n.isInTaxonomy));

const percentOf = (id: string) => formatIngredientPercent(nutellaNode(id)!);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
check('exact percent stays exact (hazelnut 13%)', sameJson(percentOf('en:hazelnut'), { kind: 'exact', value: 13 }));
check('exact percent stays exact (skimmed milk powder 8.7%)', sameJson(percentOf('en:skimmed-milk-powder'), { kind: 'exact', value: 8.7 }));
check('exact percent stays exact (fat-reduced cocoa 7.4%)', sameJson(percentOf('en:fat-reduced-cocoa'), { kind: 'exact', value: 7.4 }));
check('no exact percent -> the estimate, marked as one (sugar)', sameJson(percentOf('en:sugar'), { kind: 'estimate', value: 50.96 }));
check('a nested ingredient keeps its own estimate (soya lecithin)', sameJson(percentOf('en:soya-lecithin'), { kind: 'estimate', value: 5.33 }));
check('an estimate of 0 shows no percentage rather than an invented one (vanillin)', percentOf('en:vanillin').kind === 'none');

const bareNode: IngredientNode = {
  id: 'en:salt',
  text: 'salt',
  isInTaxonomy: true,
  hasFoodProperties: false,
  percent: null,
  percentEstimate: null,
  percentMin: 0,
  percentMax: 2,
  children: [],
};
check('only an upper bound -> shown as a maximum (<2%)', sameJson(formatIngredientPercent(bareNode), { kind: 'max', value: 2 }));
check('an upper bound of 100 says nothing', formatIngredientPercent({ ...bareNode, percentMax: 100 }).kind === 'none');
check('an exact percent wins over an estimate and a bound', formatIngredientPercent({ ...bareNode, percent: 1.5, percentEstimate: 1 }).kind === 'exact');
check('no structured array -> an empty tree', toIngredientsProduct({ code: '1', product_name: 'X' }, 'en')!.ingredientTree.length === 0);
check(
  'the raw tree reader keeps every row — filtering is the sanitizer\'s job',
  readIngredientTree([{ id: 'en:sugar', text: 'sugar' }, { text: 'best before see lid' }]).length === 2
);
check(
  'non-ingredient boilerplate is dropped from the product\'s tree',
  toIngredientsProduct(
    { code: '1', product_name: 'X', ingredients: [{ id: 'en:sugar', text: 'sugar', is_in_taxonomy: 1 }, { text: 'best before see lid' }] },
    'en'
  )!.ingredientTree.map((node) => node.text).join('|') === 'sugar'
);
check(
  'OFF food data on a row is read as a signal',
  readIngredientTree([{ id: 'en:sugar', text: 'sugar', ciqual_food_code: '31016' }, { text: 'kombucha' }])
    .map((node) => node.hasFoodProperties).join('|') === 'true|false'
);

// --- OFF text recognition (taxonomy_canonicalize_tags) ---------------------------
const rawCanonicalize = JSON.parse(
  readFileSync(new URL('./fixtures/off-canonicalize-raw-bg.json', import.meta.url), 'utf8')
) as { texts: string[]; response: unknown };
const recognized = readCanonicalTags(rawCanonicalize.response, rawCanonicalize.texts);
check('real response: вода is recognised as en:water', recognized.get('вода') === 'en:water');
check('real response: фруктозо-глюкозен сироп -> en:glucose-fructose-syrup', recognized.get('фруктозо-глюкозен сироп') === 'en:glucose-fructose-syrup');
check('real response: an unrecognised text (echoed back as bg:…) is left out', !recognized.has('цикламати') && !recognized.has('D 1Le BG'));
check(
  'a response that doesn\'t line up with the request is ignored rather than misassigned',
  readCanonicalTags({ canonical_tags: [{ exists_in_taxonomy: true, tag: 'en:water' }] }, ['вода', 'сол']).size === 0
);
check('a non-object response yields nothing', readCanonicalTags('oops', ['вода']).size === 0);
check(
  'texts containing a comma are never sent (the list is comma-separated)',
  batchCanonicalizeTexts(['вода', 'сол, йодирана', 'захар']).flat().join('|') === 'вода|захар'
);
check('duplicate and blank texts are dropped', batchCanonicalizeTexts(['вода', ' вода ', '']).flat().join('|') === 'вода');
check(
  'long lists are split into several URL-sized batches without losing a text',
  (() => {
    const texts = Array.from({ length: 80 }, (_, i) => `съставка номер ${i}`);
    const batches = batchCanonicalizeTexts(texts);
    return batches.length > 1 && batches.flat().length === 80 && batches.every((b) => b.join(',').length <= 620);
  })()
);

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

    const foundIngredients = await fetchIngredientsByBarcode('3017620422003');
    check('known barcode resolves ingredients', foundIngredients !== null, foundIngredients?.name ?? 'null');
    check(
      'known barcode has ingredient text or a structured list',
      Boolean(foundIngredients?.ingredientsText) || (foundIngredients?.ingredients.length ?? 0) > 0
    );
    check(
      'the built ingredient list is entirely a single, consistent language (every item, not the mix the raw structured array carries)',
      (foundIngredients?.ingredients.length ?? 0) > 0,
      JSON.stringify(foundIngredients?.ingredients.map((i) => i.text))
    );
    check(
      'at least one item in a well-known product carries a percent/percentEstimate matched from the structured array',
      (foundIngredients?.ingredients.some((i) => i.percent !== null || i.percentEstimate !== null) ?? false),
      JSON.stringify(foundIngredients?.ingredients.map((i) => [i.text, i.percent, i.percentEstimate]))
    );

    const foundIngredientsBg = await fetchIngredientsByBarcode('3017620422003', 'bg');
    check(
      'the same barcode requested in bg resolves too, and its ingredient list is non-empty',
      (foundIngredientsBg?.ingredients.length ?? 0) > 0,
      JSON.stringify(foundIngredientsBg?.ingredients.map((i) => i.text))
    );

    const taxonomyNames = await fetchIngredientTaxonomyNames(['en:cow-s-milk', 'en:sugar'], 'bg');
    check(
      'taxonomy lookup returns a real localized name (with the apostrophe intact, unlike a formatted id)',
      taxonomyNames['en:cow-s-milk']?.localized === 'краве мляко',
      JSON.stringify(taxonomyNames['en:cow-s-milk'])
    );
    check(
      'taxonomy lookup carries the English name alongside the Bulgarian one',
      taxonomyNames['en:cow-s-milk']?.english === "cow's milk"
    );
    check('taxonomy lookup resolves a second common ingredient too', typeof taxonomyNames['en:sugar']?.localized === 'string');

    // Nutella 3017620425035 end to end: structured tree + OFF taxonomy names, no DeepL.
    const liveNutella = await fetchIngredientsByBarcode('3017620425035', 'en');
    const liveTree = liveNutella?.ingredientTree ?? [];
    check(
      'Nutella (live): structured tree has E322 with soya lecithin nested under it',
      liveTree.find((n) => n.id === 'en:e322')?.children.some((c) => c.id === 'en:soya-lecithin') ?? false,
      JSON.stringify(liveTree.map((n) => [n.id, n.children.map((c) => c.id)]))
    );
    for (const lang of ['en', 'bg'] as const) {
      const names = await fetchIngredientTaxonomyNames(collectIngredientIds(liveTree), lang);
      const flat: string[] = [];
      const walk = (nodes: ReturnType<typeof localizeTree>) =>
        nodes.forEach((n) => {
          flat.push(n.displayName ?? '<unnamed>');
          walk(n.children);
        });
      walk(localizeTree(liveTree, { taxonomy: names }, lang));
      const inLanguage = flat.every((name) =>
        /^E\d{3,4}[a-z]*$/i.test(name) ? true : lang === 'bg' ? hasCyrillic(name) : !hasCyrillic(name) && name !== '<unnamed>'
      );
      check(`Nutella (live): every ingredient is named in ${lang} from OFF taxonomy alone`, flat.length > 0 && inLanguage, flat.join(', '));
    }

    // Cappy PULPY 5449000147417: a label OFF parsed in the wrong language —
    // names must come from the label text and OFF text recognition, not "unknown".
    const liveCappy = await fetchIngredientsByBarcode('5449000147417', 'bg');
    const cappyTree = liveCappy?.ingredientTree ?? [];
    for (const lang of ['bg', 'en'] as const) {
      const taxonomy = await fetchIngredientTaxonomyNames(collectIngredientIds(cappyTree), lang);
      const canonical = new Map<string, string>();
      for (const [lc, texts] of collectCanonicalizationRequests(cappyTree, taxonomy, lang)) {
        for (const [text, id] of await fetchCanonicalIngredientIds(texts, lc)) canonical.set(canonicalKey(lc, text), id);
      }
      Object.assign(taxonomy, await fetchIngredientTaxonomyNames(Array.from(new Set(canonical.values())), lang));
      const rows: Array<{ text: string; name: string | null }> = [];
      const walk = (nodes: ReturnType<typeof localizeTree>) =>
        nodes.forEach((n) => {
          rows.push({ text: n.text, name: n.displayName });
          walk(n.children);
        });
      walk(localizeTree(cappyTree, { taxonomy, canonical }, lang));
      if (lang === 'bg') {
        const unnamedBulgarian = rows.filter((r) => isBulgarianText(r.text) && r.name === null);
        check('Cappy (live) bg: no Bulgarian label text shows as unknown', rows.length > 0 && unnamedBulgarian.length === 0, unnamedBulgarian.map((r) => r.text).join(', '));
      } else {
        const nameFor = (text: string) => rows.find((r) => r.text === text)?.name;
        check(
          'Cappy (live) en: OFF recognises the Bulgarian label text (вода -> Water, фруктозо-глюкозен сироп -> Glucose-fructose syrup)',
          nameFor('вода') === 'Water' && nameFor('фруктозо-глюкозен сироп') === 'Glucose-fructose syrup',
          `${nameFor('вода')} / ${nameFor('фруктозо-глюкозен сироп')}`
        );
        check('Cappy (live) en: no Cyrillic in the English list', rows.every((r) => !hasCyrillic(r.name ?? '')));
      }
    }

    const emptyTaxonomy = await fetchIngredientTaxonomyNames([], 'bg');
    check('an empty id list makes no request and returns an empty result', Object.keys(emptyTaxonomy).length === 0);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  live checks threw — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(failures === 0 ? '\nALL OFF CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
