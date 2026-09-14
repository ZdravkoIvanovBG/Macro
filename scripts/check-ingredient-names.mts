// Checks the pure logic behind resolving a real, localized ingredient
// display name: src/lib/ingredientNames.ts's raw-text translation signal,
// src/lib/ingredientGlossary.ts's name extraction, and src/lib/off.ts's
// ingredient-taxonomy response parsing. The bug this guards against: a
// formatted taxonomy id (e.g. "en:cow-s-milk" -> "Cow s milk") shown as if
// it were a real ingredient name.
// Run with: npm run check:ingredient-names
import { hasCyrillic, needsTranslation } from '../src/lib/ingredientNames.ts';
import { lookupIngredientName } from '../src/lib/ingredientGlossary.ts';
import { __testing } from '../src/lib/off.ts';

const { readTaxonomyNames } = __testing;

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// --- Cyrillic detection -------------------------------------------------------
check('detects Cyrillic text', hasCyrillic('Мляко') === true);
check('does not flag Latin text', hasCyrillic('Milk') === false);
check('does not flag empty text', hasCyrillic('') === false);

// --- raw-text translation need -------------------------------------------------
check('raw Cyrillic text does not need translating to Bulgarian', needsTranslation('Мляко', 'bg') === false);
check('raw non-Cyrillic text needs translating to Bulgarian', needsTranslation('Lait', 'bg') === true);
check('raw Cyrillic text needs translating to English', needsTranslation('Мляко', 'en') === true);
check(
  'raw non-Cyrillic text is left as-is for English (best effort, not re-verified)',
  needsTranslation('Lait', 'en') === false
);

// --- glossary name extraction --------------------------------------------------
check(
  'extracts the name before the em dash for a "Name — description" entry',
  lookupIngredientName({ id: 'en:e100', text: 'Curcumin' }, 'en') === 'Curcumin'
);
check(
  'extracts the bg name before the em dash too',
  lookupIngredientName({ id: 'en:e100', text: 'Curcumin' }, 'bg') === 'Куркумин'
);
check(
  'a bare "Name." entry (no dash) is used as-is, period stripped',
  lookupIngredientName({ id: 'en:milk', text: 'Milk' }, 'en') === 'Milk'
);
check(
  'the bg bare-name form too',
  lookupIngredientName({ id: 'en:milk', text: 'Milk' }, 'bg') === 'Мляко'
);
check(
  'an ingredient the glossary has never heard of yields null, never a guess',
  lookupIngredientName({ id: 'en:some-unmapped-taxonomy-id', text: 'Some unmapped ingredient' }, 'en') === null
);

// --- taxonomy API response parsing ----------------------------------------------
const parsed = readTaxonomyNames(
  {
    'en:cow-s-milk': { name: { bg: 'краве мляко', en: "cow's milk" }, parents: [] },
    'en:sugar': { name: { bg: 'Захар', en: 'sugar' }, parents: [] },
    'en:microbial-rennet': { name: { en: 'microbial rennet' }, parents: [] },
    'en:some-totally-fake-ingredient': {},
  },
  'bg'
);
check('a translated id yields both the localized and English names', parsed['en:cow-s-milk']?.localized === 'краве мляко');
check('the English name is always carried alongside', parsed['en:cow-s-milk']?.english === "cow's milk");
check(
  'an id with no bg translation yields a null localized name, but keeps English',
  parsed['en:microbial-rennet']?.localized === null && parsed['en:microbial-rennet']?.english === 'microbial rennet'
);
check(
  'an id the taxonomy has never heard of is simply absent from the result',
  parsed['en:some-totally-fake-ingredient'] === undefined
);
check('non-object payload yields an empty result', Object.keys(readTaxonomyNames('oops', 'bg')).length === 0);
check('null payload yields an empty result', Object.keys(readTaxonomyNames(null, 'bg')).length === 0);

const enOnly = readTaxonomyNames({ 'en:sugar': { name: { en: 'sugar' } } }, 'en');
check('requesting English reads the English name as localized too', enOnly['en:sugar']?.localized === 'sugar');

console.log(failures === 0 ? '\nALL INGREDIENT NAME CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
