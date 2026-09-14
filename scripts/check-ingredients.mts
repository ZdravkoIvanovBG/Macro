// Checks the ingredient glossary lookup and the composite risk score against
// the shapes Open Food Facts actually returns (hyphenated taxonomy ids, in
// particular). Run with: npm run check:ingredients
import { lookupIngredientInfo } from '../src/lib/ingredientGlossary.ts';
import { assessProductRisk } from '../src/lib/ingredientRisk.ts';
import type { OffIngredient } from '../src/lib/off.ts';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function ingredient(over: Partial<OffIngredient> = {}): OffIngredient {
  return {
    id: null,
    text: 'X',
    rank: 0,
    percent: null,
    percentEstimate: null,
    idIsTaxonomyRecognized: false,
    displayName: over.text ?? 'X',
    displayNameIsFallback: false,
    ...over,
  };
}

// --- glossary: hyphenated taxonomy ids must resolve -------------------------
check(
  'hyphenated id matches a multi-word glossary entry (palm oil)',
  lookupIngredientInfo({ id: 'en:palm-oil', text: 'Palm oil' }, 'en')?.tier === 'moderate'
);
check(
  'hyphenated id matches a common staple (skimmed milk)',
  lookupIngredientInfo({ id: 'en:skimmed-milk', text: 'Skimmed milk' }, 'en')?.tier === 'low'
);
check(
  'hyphenated id matches lactic ferments (seen on real Skyr products)',
  lookupIngredientInfo({ id: 'en:lactic-ferments', text: 'Ferments lactiques' }, 'en')?.tier === 'low'
);
check(
  'hyphenated id matches microbial rennet',
  lookupIngredientInfo({ id: 'en:microbial-rennet', text: 'Enzyme coagulante' }, 'en')?.tier === 'low'
);
check(
  'plain id (no hyphen) still matches',
  lookupIngredientInfo({ id: 'en:water', text: 'Water' }, 'en')?.tier === 'low'
);
check(
  'e-number id still matches regardless of the hyphen fix',
  lookupIngredientInfo({ id: 'en:e330', text: 'Citric acid' }, 'en')?.tier === 'low'
);
check(
  'falls back to text when the id has no match',
  lookupIngredientInfo({ id: 'en:some-unmapped-taxonomy-id', text: 'Sugar' }, 'en')?.tier === 'low'
);
check(
  'truly unknown ingredient stays unmatched (never defaults to a tier)',
  lookupIngredientInfo({ id: 'en:some-unmapped-taxonomy-id', text: 'Some unmapped ingredient' }, 'en') === null
);
check(
  'bulgarian description is returned for the bg language',
  lookupIngredientInfo({ id: 'en:milk', text: 'Milk' }, 'bg')?.description === 'Мляко.'
);

// --- glossary: roman-numeral E-number sub-variants fall back to the base ----
// OFF splits some additives into numbered sub-variants (distinct salts within
// the same E-number family) that this glossary doesn't break out
// individually. These must still resolve to the base E-number's rating
// rather than going unmatched.
check(
  'e500ii (a specific carbonate salt) falls back to the base E500 rating',
  lookupIngredientInfo({ id: 'en:e500ii', text: 'Sodium carbonate' }, 'en')?.tier === 'low'
);
check(
  'e450iii (a specific diphosphate salt) falls back to the base E450 rating',
  lookupIngredientInfo({ id: 'en:e450iii', text: 'Diphosphate' }, 'en')?.tier === 'moderate'
);
check(
  'e451i falls back to the base E451 rating',
  lookupIngredientInfo({ id: 'en:e451i', text: 'Triphosphate' }, 'en')?.tier === 'moderate'
);
check(
  'e-number with a parenthesised roman-numeral suffix in raw text still matches',
  lookupIngredientInfo({ id: null, text: 'E450 (iii)' }, 'en')?.tier === 'moderate'
);
check(
  'exact sub-variant entries (e.g. E150a-d) still take priority over the base',
  lookupIngredientInfo({ id: 'en:e150a', text: 'Caramel colour' }, 'en')?.tier === 'moderate'
);

// --- EFSA OpenFoodTox concern notes -----------------------------------------
// A sourced note must be traceable to a real EFSA opinion (never invented),
// a covered additive without a match must say so honestly, and a non-additive
// staple ingredient (no E-number) must show no concern section at all.
const sodiumBenzoate = lookupIngredientInfo({ id: 'en:e211', text: 'Sodium benzoate' }, 'en');
check('sodium benzoate (E211) has a sourced EFSA concern note', sodiumBenzoate?.concernNote.status === 'sourced');
check(
  'the sourced note links to a real, checkable EFSA DOI',
  sodiumBenzoate?.concernNote.status === 'sourced' &&
    sodiumBenzoate.concernNote.sourceUrl.startsWith('https://doi.org/10.2903/')
);

const tartrazine = lookupIngredientInfo({ id: 'en:e102', text: 'Tartrazine' }, 'en');
check(
  'an additive with no validated EFSA match is honestly "not-found", not a fabricated note',
  tartrazine?.concernNote.status === 'not-found'
);

const milk = lookupIngredientInfo({ id: 'en:milk', text: 'Milk' }, 'en');
check(
  'a non-additive staple ingredient shows no concern section at all',
  milk?.concernNote.status === 'not-applicable'
);

// --- risk score: resilience under partial data -------------------------------
const noSignalAtAll = assessProductRisk([], null, null, [], 'en');
check('no signal at all yields the unrated verdict', noSignalAtAll.verdict === 'unrated');
check('no signal at all yields a null score', noSignalAtAll.score === null);

const onlyNova = assessProductRisk([], 3, null, [], 'en');
check('nova group alone is enough to score (not unrated)', onlyNova.verdict !== 'unrated');
check('nova group alone yields a numeric score', typeof onlyNova.score === 'number');

const onlyAllergens = assessProductRisk([], null, null, ['en:milk', 'en:gluten'], 'en');
check('allergens alone are enough to score (not unrated)', onlyAllergens.verdict !== 'unrated');
check('allergen-only score is penalized but not zeroed out', (onlyAllergens.score ?? 0) < 100 && (onlyAllergens.score ?? 0) > 0);

const mostlyUnknownIngredients = assessProductRisk(
  [
    ingredient({ id: 'en:some-unmapped-a', text: 'Unmapped A', rank: 0 }),
    ingredient({ id: 'en:some-unmapped-b', text: 'Unmapped B', rank: 1 }),
    ingredient({ id: 'en:sugar', text: 'Sugar', rank: 2 }),
  ],
  null,
  null,
  [],
  'en'
);
check(
  'a couple of unmatched ingredients does not collapse the score to unrated when one matched',
  mostlyUnknownIngredients.verdict !== 'unrated'
);

const worstTierWins = assessProductRisk(
  [
    ingredient({ id: 'en:water', text: 'Water', rank: 0 }),
    ingredient({ id: 'en:e102', text: 'Tartrazine', rank: 1 }),
  ],
  4,
  null,
  [],
  'en'
);
check('a single high-tier ingredient drives the verdict down', worstTierWins.verdict === 'manyConcerns');

console.log(failures === 0 ? '\nALL INGREDIENT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
