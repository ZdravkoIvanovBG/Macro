// Checks the NOVA / Nutri-Score indicators on the Ingredients report
// (src/lib/productIndicators.ts): normalizing Open Food Facts' values, the
// localized labels, and that the app's own safety score is unaffected.
// Run with: npm run check:product-indicators
import { readFileSync } from 'node:fs';
import { en } from '../src/i18n/locales/en.ts';
import { bg } from '../src/i18n/locales/bg.ts';
import { assessProductRisk } from '../src/lib/ingredientRisk.ts';
import { __testing } from '../src/lib/off.ts';
import {
  normalizeNovaGroup,
  normalizeNutriScore,
  novaDescriptionKey,
  nutriScoreDescriptionKey,
} from '../src/lib/productIndicators.ts';

const { toIngredientsProduct } = __testing;

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const fixture = (code: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/off-${code}.json`, import.meta.url), 'utf8')) as {
    product: Record<string, unknown>;
  };

/** The indicators exactly as the report screen derives them from a product. */
function indicatorsOf(raw: Record<string, unknown>) {
  const product = toIngredientsProduct({ code: '1', product_name: 'X', ...raw }, 'en')!;
  return { nova: normalizeNovaGroup(product.novaGroup), nutriScore: normalizeNutriScore(product.nutriscoreGrade) };
}

/** Resolves an "ingredients.<key>" i18n key against a locale object. */
function label(locale: typeof en, key: string): string | undefined {
  const [namespace, name] = key.split('.');
  return (locale as unknown as Record<string, Record<string, string>>)[namespace]?.[name];
}

// --- 1. both present: Nutella 3017620425035 (real OFF response) -----------------
const nutella = fixture('3017620425035').product;
const nutellaIndicators = indicatorsOf(nutella);
check('Nutella: NOVA 4 from OFF', nutellaIndicators.nova === 4, JSON.stringify(nutellaIndicators));
check('Nutella: Nutri-Score E from OFF', nutellaIndicators.nutriScore === 'e');

const cappyIndicators = indicatorsOf(fixture('5449000147417').product);
check('Cappy PULPY: NOVA 4, Nutri-Score C (current 2023 grade)', cappyIndicators.nova === 4 && cappyIndicators.nutriScore === 'c');

// --- 2-4. partial and missing data ---------------------------------------------
const novaOnly = indicatorsOf({ nova_group: 3 });
check('NOVA without Nutri-Score', novaOnly.nova === 3 && novaOnly.nutriScore === null);
const nutriOnly = indicatorsOf({ nutriscore_grade: 'b' });
check('Nutri-Score without NOVA', nutriOnly.nova === null && nutriOnly.nutriScore === 'b');
const neither = indicatorsOf({});
check('neither present -> both unavailable', neither.nova === null && neither.nutriScore === null);
check('missing NOVA uses the "unavailable" label', novaDescriptionKey(neither.nova) === 'ingredients.novaUnavailable');
check('missing Nutri-Score uses the "unavailable" label', nutriScoreDescriptionKey(neither.nutriScore) === 'ingredients.nutriScoreUnavailable');
check('OFF "unknown" Nutri-Score is unavailable, not guessed', indicatorsOf({ nutriscore_grade: 'unknown' }).nutriScore === null);
check('OFF "not-applicable" Nutri-Score is unavailable', indicatorsOf({ nutriscore_grade: 'not-applicable' }).nutriScore === null);

// --- 5. invalid NOVA values ---------------------------------------------------------
for (const value of [0, 5, 4.5, -1, Number.NaN, 'unknown', '', ' ', '4a', null, undefined, {}, [4]]) {
  check(`NOVA ${JSON.stringify(value) ?? String(value)} is unavailable`, normalizeNovaGroup(value) === null);
}
check('NOVA "4" (numeric string) is accepted', normalizeNovaGroup('4') === 4);
check('NOVA 1–4 are accepted', [1, 2, 3, 4].every((g) => normalizeNovaGroup(g) === g));

// --- 6. invalid Nutri-Score values ------------------------------------------------
for (const value of ['unknown', 'not-applicable', 'f', 'ab', '', 3, null, undefined, {}]) {
  check(`Nutri-Score ${JSON.stringify(value) ?? String(value)} is unavailable`, normalizeNutriScore(value) === null);
}
check('Nutri-Score " E " is normalized to "e"', normalizeNutriScore(' E ') === 'e');
check('Nutri-Score a–e are accepted', ['a', 'b', 'c', 'd', 'e'].every((g) => normalizeNutriScore(g) === g));

// --- 7-8. localization ------------------------------------------------------------
const expected = {
  en: {
    nova: ['Unprocessed or minimally processed food', 'Processed culinary ingredient', 'Processed food', 'Ultra-processed food'],
    novaUnavailable: 'Processing level unavailable',
    nutri: ['Very good nutritional quality', 'Good nutritional quality', 'Average nutritional quality', 'Low nutritional quality', 'Very low nutritional quality'],
    nutriUnavailable: 'Nutri-Score unavailable',
  },
  bg: {
    nova: ['Непреработена или минимално преработена храна', 'Преработена кулинарна съставка', 'Преработена храна', 'Ултрапреработена храна'],
    novaUnavailable: 'Няма данни за степента на преработка',
    nutri: ['Много добро хранително качество', 'Добро хранително качество', 'Средно хранително качество', 'Ниско хранително качество', 'Много ниско хранително качество'],
    nutriUnavailable: 'Няма данни за Nutri-Score',
  },
} as const;

for (const [lang, locale] of [['en', en], ['bg', bg]] as const) {
  const want = expected[lang];
  ([1, 2, 3, 4] as const).forEach((group, i) => {
    const got = label(locale, novaDescriptionKey(group));
    check(`${lang}: NOVA ${group} -> "${want.nova[i]}"`, got === want.nova[i], got);
  });
  check(`${lang}: NOVA unavailable label`, label(locale, novaDescriptionKey(null)) === want.novaUnavailable);
  (['a', 'b', 'c', 'd', 'e'] as const).forEach((grade, i) => {
    const got = label(locale, nutriScoreDescriptionKey(grade));
    check(`${lang}: Nutri-Score ${grade.toUpperCase()} -> "${want.nutri[i]}"`, got === want.nutri[i], got);
  });
  check(`${lang}: Nutri-Score unavailable label`, label(locale, nutriScoreDescriptionKey(null)) === want.nutriUnavailable);
  check(`${lang}: badges keep the recognizable names`, locale.ingredients.novaBadge === 'NOVA {{group}}' && locale.ingredients.nutriScoreBadge === 'Nutri-Score {{grade}}');
}
check('bg labels are Bulgarian, not English', !/[A-Za-z]{3,}/.test(bg.ingredients.nova4 + bg.ingredients.nutriScoreD + bg.ingredients.processingTitle + bg.ingredients.nutritionTitle));
check('neither row is labelled as safety or health', !/safety|health/i.test(en.ingredients.processingTitle + en.ingredients.nutritionTitle));

// --- 9. the safety score is unchanged -----------------------------------------------
// Golden values captured from these real fixtures before the indicators were
// added. The score keeps reading the raw product fields, as before.
const golden = [
  { code: '3017620425035', name: 'Nutella', score: 49, verdict: 'manyConcerns' },
  { code: '5449000147417', name: 'Cappy PULPY', score: 65, verdict: 'someConcerns' },
] as const;
for (const { code, name, score, verdict } of golden) {
  for (const lang of ['en', 'bg'] as const) {
    const product = toIngredientsProduct(fixture(code).product, lang)!;
    const assessment = assessProductRisk(product.ingredients, product.novaGroup, product.nutriscoreGrade, product.allergensTags, lang);
    check(`${name} ${lang}: safety score is still ${score} (${verdict})`, assessment.score === score && assessment.verdict === verdict, JSON.stringify(assessment));
  }
}

console.log(failures === 0 ? '\nALL PRODUCT INDICATOR CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
