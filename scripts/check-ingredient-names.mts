// Checks the pure logic behind resolving a real, localized ingredient
// display name: src/lib/ingredientNames.ts's raw-text translation signal,
// src/lib/ingredientGlossary.ts's name extraction, and src/lib/off.ts's
// ingredient-taxonomy response parsing. The bug this guards against: a
// formatted taxonomy id (e.g. "en:cow-s-milk" -> "Cow s milk") shown as if
// it were a real ingredient name.
// Run with: npm run check:ingredient-names
import { readFileSync } from 'node:fs';
import {
  canonicalKey,
  collectCanonicalizationRequests,
  collectIngredientIds,
  collectTranslationSources,
  hasCyrillic,
  isBulgarianText,
  isTranslatableName,
  localizeTree,
  needsTranslation,
  parseLanguage,
  pickLocalizedName,
  type LocalizedIngredientNode,
} from '../src/lib/ingredientNames.ts';
import { lookupIngredientName } from '../src/lib/ingredientGlossary.ts';
import { __testing, type IngredientNode } from '../src/lib/off.ts';

const { readTaxonomyNames, toIngredientsProduct } = __testing;

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

// --- Nutella 3017620425035: names in the app language only --------------------
// Real OFF product + real v2 taxonomy response (lc=bg,en), so this runs offline.
const nutella = JSON.parse(
  readFileSync(new URL('./fixtures/off-3017620425035.json', import.meta.url), 'utf8')
) as { product: Record<string, unknown> };
const nutellaTaxonomyPayload = JSON.parse(
  readFileSync(new URL('./fixtures/off-taxonomy-3017620425035.json', import.meta.url), 'utf8')
) as unknown;
const nutellaTree = toIngredientsProduct(nutella.product, 'en')!.ingredientTree;
const noTranslations = new Map<string, string>();

function flatten(nodes: LocalizedIngredientNode[], depth = 0): Array<{ node: LocalizedIngredientNode; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}
const isENumberCode = (name: string) => /^E\d{3,4}[a-z]*$/i.test(name);
const rowsText = (rows: Array<{ node: LocalizedIngredientNode; depth: number }>) =>
  rows.map(({ node, depth }) => `${'  '.repeat(depth)}${node.displayName ?? '<unknown>'}`).join('|');
const sourceTexts = new Set(flatten(localizeTree(nutellaTree, { taxonomy: {} }, 'en')).map(({ node }) => node.text.toLowerCase()));

const nutellaEn = localizeTree(nutellaTree, { taxonomy: readTaxonomyNames(nutellaTaxonomyPayload, 'en') }, 'en');
const enRows = flatten(nutellaEn);
check(
  'Nutella en: names come from the OFF taxonomy, in OFF order, nested under their parent',
  rowsText(enRows) === 'Sugar|Palm oil|Hazelnut|Skimmed milk powder|Fat reduced cocoa|E322|  Soya lecithin|Vanillin',
  rowsText(enRows)
);
check(
  'Nutella en: every visible ingredient is English — no Cyrillic, none left in the French label text',
  enRows.every(({ node }) => node.displayName !== null && !hasCyrillic(node.displayName) && !sourceTexts.has(node.displayName.toLowerCase())),
  enRows.map(({ node }) => node.displayName).join(', ')
);
check('Nutella en: no name needed DeepL', enRows.every(({ node }) => node.nameSource === 'taxonomy'));
check(
  'Nutella en: the malformed ingredients_text_en is not what the list shows',
  !enRows.some(({ node }) => (node.displayName ?? '').includes('UARE') || node.text.includes('UARE'))
);
check(
  'Nutella en without a taxonomy response: French label text under a recognised en: id is never passed off as English',
  flatten(localizeTree(nutellaTree, { taxonomy: {} }, 'en')).every(({ node }) => node.nameSource !== 'source')
);

const nutellaBg = localizeTree(nutellaTree, { taxonomy: readTaxonomyNames(nutellaTaxonomyPayload, 'bg') }, 'bg');
const bgRows = flatten(nutellaBg);
check(
  'Nutella bg: every visible ingredient is Bulgarian (or a language-neutral E-number)',
  bgRows.every(({ node }) => node.displayName !== null && (hasCyrillic(node.displayName) || isENumberCode(node.displayName))),
  bgRows.map(({ node }) => node.displayName).join(', ')
);
check(
  'Nutella bg: names come from the OFF taxonomy, capitalized',
  bgRows.map(({ node }) => node.displayName).join('|') ===
    'Захар|Палмово масло|Лешник|Обезмаслено сухо мляко|Какао с намалено съдържание на мазнини|E322|Соев лецитин|Ванилин',
  bgRows.map(({ node }) => node.displayName).join('|')
);
check(
  'Nutella bg: the same records as en — same ids, same percent data, same nesting',
  JSON.stringify(bgRows.map(({ node, depth }) => [node.id, node.percent, node.percentEstimate, depth])) ===
    JSON.stringify(enRows.map(({ node, depth }) => [node.id, node.percent, node.percentEstimate, depth]))
);
check('Nutella: no taxonomy request needed for anything but its 8 ids', collectIngredientIds(nutellaTree).length === 8);
check(
  'Nutella: nothing needs OFF text recognition or a translation service in either language',
  (['bg', 'en'] as const).every(
    (lang) =>
      collectCanonicalizationRequests(nutellaTree, readTaxonomyNames(nutellaTaxonomyPayload, lang), lang).size === 0 &&
      collectTranslationSources(nutellaTree, { taxonomy: readTaxonomyNames(nutellaTaxonomyPayload, lang) }, lang).length === 0
  )
);

// --- Cappy PULPY 5449000147417: real source text is never discarded ------------
// A multi-language label (BG + Romanian block) that OFF parsed with its French
// parser, so 53 of 54 ingredients are unrecognised "fr:<text>" ids. Real
// product + the real OFF canonicalize and taxonomy responses.
const cappy = JSON.parse(readFileSync(new URL('./fixtures/off-5449000147417.json', import.meta.url), 'utf8')) as {
  product: Record<string, unknown>;
};
const cappyOff = JSON.parse(readFileSync(new URL('./fixtures/off-canonical-5449000147417.json', import.meta.url), 'utf8')) as {
  canonical: Record<string, Record<string, string>>;
  taxonomy: unknown;
};
const cappyTree = toIngredientsProduct(cappy.product, 'bg')!.ingredientTree;
const cappyCanonical = new Map(
  Object.entries(cappyOff.canonical).flatMap(([lc, byText]) =>
    Object.entries(byText).map(([text, id]) => [canonicalKey(lc, text), id] as [string, string])
  )
);
const cappyCtx = (lang: 'en' | 'bg', translations: ReadonlyMap<string, string> = noTranslations) => ({
  taxonomy: readTaxonomyNames(cappyOff.taxonomy, lang),
  canonical: cappyCanonical,
  translations,
});
const flatTree = (nodes: IngredientNode[], depth = 0): Array<{ node: IngredientNode; depth: number }> =>
  nodes.flatMap((node) => [{ node, depth }, ...flatTree(node.children, depth + 1)]);
const cappyBgRows = flatten(localizeTree(cappyTree, cappyCtx('bg'), 'bg'));
const cappyEnRows = flatten(localizeTree(cappyTree, cappyCtx('en'), 'en'));
const nameOf = (rows: typeof cappyBgRows, text: string) => rows.find(({ node }) => node.text === text)?.node.displayName;

check(
  'Cappy fixture really is the mis-parsed one — its "D 1Le BG" wrapper row is sanitized away, its child promoted',
  cappyTree.length > 20 &&
    (cappy.product['ingredients'] as Array<{ id: string }>)[0].id === 'fr:D 1Le BG' &&
    cappyTree[0].id === 'fr:Негазирана напитка със сок от портокал от концентрат'
);
check(
  'Cappy bg: no Bulgarian label text is replaced by "unknown" — top level or nested',
  cappyBgRows.filter(({ node }) => isBulgarianText(node.text)).every(({ node }) => node.displayName !== null),
  cappyBgRows.filter(({ node }) => isBulgarianText(node.text) && node.displayName === null).map(({ node }) => node.text).join(', ')
);
check('Cappy bg: "фруктозо-глюкозен сироп" is shown as its own text', nameOf(cappyBgRows, 'фруктозо-глюкозен сироп') === 'Фруктозо-глюкозен сироп');
check(
  'Cappy bg: nested ingredients keep their parent ("Стабилизатори" -> "Акациева гума")',
  (() => {
    const i = cappyBgRows.findIndex(({ node }) => node.text === 'стабилизатори');
    return cappyBgRows[i]?.node.displayName === 'Стабилизатори' && cappyBgRows[i + 1]?.node.displayName === 'Акациева гума' && cappyBgRows[i + 1]?.depth === 1;
  })()
);
check('Cappy bg: "arome" (recognised en:flavouring) gets its Bulgarian taxonomy name', nameOf(cappyBgRows, 'arome') === 'Аромат');
check(
  'Cappy bg: without a translator, nothing non-Bulgarian leaks into the list',
  cappyBgRows.every(({ node }) => node.displayName === null || isBulgarianText(node.displayName) || isENumberCode(node.displayName)),
  cappyBgRows.filter(({ node }) => node.displayName !== null && !isBulgarianText(node.displayName)).map(({ node }) => node.displayName).join(', ')
);

check('Cappy en: "вода" resolves through OFF text recognition to "Water"', nameOf(cappyEnRows, 'вода') === 'Water');
check(
  'Cappy en: "фруктозо-глюкозен сироп" -> "Glucose-fructose syrup"',
  nameOf(cappyEnRows, 'фруктозо-глюкозен сироп') === 'Glucose-fructose syrup'
);
check('Cappy en: "лимонена киселина" -> "E330"', nameOf(cappyEnRows, 'лимонена киселина') === 'E330');
check(
  'Cappy en: no Cyrillic anywhere in the English list',
  cappyEnRows.every(({ node }) => !hasCyrillic(node.displayName ?? '')),
  cappyEnRows.map(({ node }) => node.displayName).filter((n) => hasCyrillic(n ?? '')).join(', ')
);
check('Cappy en: a Bulgarian name OFF can\'t recognise is unknown without a translation', nameOf(cappyEnRows, 'цикламати') === null);
const cappyEnTranslated = flatten(localizeTree(cappyTree, cappyCtx('en', new Map([['цикламати', 'Cyclamates.']])), 'en'));
check('Cappy en: ...and translated when a translation is available', nameOf(cappyEnTranslated, 'цикламати') === 'Cyclamates');
check(
  'Cappy en: label junk is never sent for translation',
  !collectTranslationSources(cappyTree, cappyCtx('en'), 'en').some((s) => s === 'D 1Le BG' || s === 'MD')
);
check(
  'Cappy: localizing never changes percentages, order, or nesting',
  (['bg', 'en'] as const).every((lang) => {
    const localized = flatten(localizeTree(cappyTree, cappyCtx(lang), lang));
    const parsed = flatTree(cappyTree);
    return JSON.stringify(localized.map(({ node, depth }) => [node.id, node.percent, node.percentEstimate, node.percentMax, depth])) ===
      JSON.stringify(parsed.map(({ node, depth }) => [node.id, node.percent, node.percentEstimate, node.percentMax, depth]));
  })
);
check(
  'Cappy: only Bulgarian text is sent for bg recognition, and Romanian text is tried as the parser\'s language',
  (() => {
    const requests = collectCanonicalizationRequests(cappyTree, readTaxonomyNames(cappyOff.taxonomy, 'en'), 'en');
    return (requests.get('bg') ?? []).includes('вода') && (requests.get('fr') ?? []).includes('sirop de glucozã-fructozã');
  })()
);

// --- unrecognised ids with real text: the user's example ----------------------
const unrecognizedEnglish: IngredientNode = {
  id: 'en:some-unrecognized-tag',
  text: 'glucose-fructose syrup',
  isInTaxonomy: false,
  hasFoodProperties: false,
  percent: null,
  percentEstimate: 16,
  percentMin: null,
  percentMax: null,
  children: [],
};
const glucoseTaxonomy = readTaxonomyNames(
  { 'en:glucose-fructose-syrup': { name: { bg: 'глюкозо-фруктозен сироп', en: 'glucose-fructose syrup' } } },
  'bg'
);
check(
  'unrecognised en: tag in bg -> recognised from its text, shown in Bulgarian',
  JSON.stringify(
    pickLocalizedName(
      unrecognizedEnglish,
      { taxonomy: glucoseTaxonomy, canonical: new Map([[canonicalKey('en', 'glucose-fructose syrup'), 'en:glucose-fructose-syrup']]) },
      'bg'
    )
  ) === JSON.stringify({ displayName: 'Глюкозо-фруктозен сироп', nameSource: 'canonical' })
);
check(
  'unrecognised en: tag in en -> its own English text is shown',
  JSON.stringify(pickLocalizedName(unrecognizedEnglish, { taxonomy: {} }, 'en')) ===
    JSON.stringify({ displayName: 'Glucose-fructose syrup', nameSource: 'source' })
);
check(
  'it is sent for OFF recognition in English when the app is in Bulgarian',
  (collectCanonicalizationRequests([unrecognizedEnglish], {}, 'bg').get('en') ?? []).join('|') === 'glucose-fructose syrup'
);
check(
  'Latin text under an fr: parse is not assumed to be English',
  pickLocalizedName({ ...unrecognizedEnglish, id: 'fr:sirop de glucose', text: 'sirop de glucose' }, { taxonomy: {} }, 'en').displayName === null
);

// --- language detection & junk guard ----------------------------------------------
check('Bulgarian text is Bulgarian', isBulgarianText('фруктозо-глюкозен сироп'));
check('Bulgarian with a Latin "L-" is still Bulgarian', isBulgarianText('L-аскорбинова киселина'));
check('Russian-only letters are not Bulgarian', !isBulgarianText('подсластитель ы') && !isBulgarianText('мёд'));
check('Ukrainian-only letters are not Bulgarian', !isBulgarianText('цукор і сіль'));
check('Latin text is not Bulgarian', !isBulgarianText('water'));
check('parse language comes from an unrecognised id prefix', parseLanguage({ ...unrecognizedEnglish, id: 'fr:вода' }) === 'fr');
check('a recognised id says nothing about the text language', parseLanguage({ ...unrecognizedEnglish, isInTaxonomy: true, id: 'en:sugar' }) === null);
check('label junk "D 1Le BG" is not a translatable name', !isTranslatableName('D 1Le BG'));
check('label junk "MD" is not a translatable name', !isTranslatableName('MD'));
check('"цикламати" is a translatable name', isTranslatableName('цикламати'));
check('"acid citric" is a translatable name', isTranslatableName('acid citric'));
check('"vitamin B12" is a translatable name', isTranslatableName('vitamin B12'));

// --- missing translations: controlled fallback, never mixed languages -----------
const baobab: IngredientNode = {
  id: 'en:baobab-fruit-pulp',
  text: 'pulpe de fruit de baobab',
  isInTaxonomy: true,
  hasFoodProperties: false,
  percent: null,
  percentEstimate: 1,
  percentMin: null,
  percentMax: null,
  children: [],
};
const baobabCtx = { taxonomy: readTaxonomyNames({ 'en:baobab-fruit-pulp': { name: { en: 'baobab fruit pulp' } } }, 'bg') };
check(
  'no bg taxonomy name -> the translation source is the English taxonomy name, not the French label text',
  collectTranslationSources([baobab], baobabCtx, 'bg').join('|') === 'baobab fruit pulp'
);
check(
  'no bg taxonomy name and no translation available -> unnamed placeholder, not English',
  JSON.stringify(pickLocalizedName(baobab, baobabCtx, 'bg')) === JSON.stringify({ displayName: null, nameSource: 'unnamed' })
);
check(
  'a machine translation is used when available, with DeepL\'s sentence full stop removed',
  JSON.stringify(pickLocalizedName(baobab, { ...baobabCtx, translations: new Map([['baobab fruit pulp', 'Пулп от плод на баобаб.']]) }, 'bg')) ===
    JSON.stringify({ displayName: 'Пулп от плод на баобаб', nameSource: 'translated' })
);

const unknownFrench: IngredientNode = { ...baobab, id: 'fr:truc-inconnu', text: 'truc inconnu', isInTaxonomy: false };
check(
  'an ingredient in another language is never shown as its raw label text in English',
  pickLocalizedName(unknownFrench, { taxonomy: {} }, 'en').displayName === null
);
check(
  'its raw label text is the translation source only because no taxonomy name exists',
  collectTranslationSources([unknownFrench], { taxonomy: {} }, 'en').join('|') === 'truc inconnu'
);
check(
  'the glossary names an ingredient in the app language when the taxonomy can\'t',
  JSON.stringify(pickLocalizedName({ ...baobab, id: 'en:milk', text: 'lait' }, { taxonomy: {} }, 'bg')) ===
    JSON.stringify({ displayName: 'Мляко', nameSource: 'glossary' })
);
check(
  'a bare E-number with no taxonomy or glossary name is shown as its code',
  pickLocalizedName({ ...baobab, id: 'en:e9999', text: 'E 9999' }, { taxonomy: {} }, 'bg').displayName === 'E9999'
);
const parentWithUnnamedChild = localizeTree(
  [{ ...nutellaTree[5], children: [unknownFrench] }],
  { taxonomy: readTaxonomyNames(nutellaTaxonomyPayload, 'bg') },
  'bg'
);
check(
  'an unnamed nested ingredient stays under its parent',
  parentWithUnnamedChild[0].displayName === 'E322' && parentWithUnnamedChild[0].children[0]?.nameSource === 'unnamed'
);

// --- localization after sanitization -----------------------------------------------
// The tree is sanitized in toIngredientsProduct, before any naming happens, so
// removed rows can't come back through a translation and promoted children
// are named like any other row.
const noiseSample = JSON.parse(readFileSync(new URL('./fixtures/off-noise-sample.json', import.meta.url), 'utf8')) as {
  product: Record<string, unknown>;
};
const noiseTaxonomyPayload = {
  'en:sugar': { name: { en: 'sugar', bg: 'захар' } },
  'en:skimmed-milk-powder': { name: { en: 'skimmed milk powder', bg: 'обезмаслено сухо мляко' } },
  'en:fat-reduced-cocoa': { name: { en: 'fat reduced cocoa', bg: 'какао с намалено съдържание на мазнини' } },
  'en:e322': { name: { en: 'E322', bg: 'E322' } },
  'en:soya-lecithin': { name: { en: 'soya lecithin', bg: 'соев лецитин' } },
  'en:hazelnut': { name: { en: 'hazelnut', bg: 'лешник' } },
  'en:palm-oil': { name: { en: 'palm oil', bg: 'палмово масло' } },
};
const noiseRemovedTexts = [
  'Used under licence by Froneri', 'КОНТАКТИ', 'Ломско шосе', 'Www за информация', 'Nestle Good Food',
  'Trademarks of Société', 'Switzerland 3A CONTACTS', 'quot',
];
for (const lang of ['en', 'bg'] as const) {
  const product = toIngredientsProduct(noiseSample.product, lang)!;
  const rows = flatten(localizeTree(product.ingredientTree, { taxonomy: readTaxonomyNames(noiseTaxonomyPayload, lang) }, lang));
  check(
    `noise sample ${lang}: no removed row is named or shown`,
    rows.every(({ node }) => !noiseRemovedTexts.includes(node.text)),
    rows.map(({ node }) => node.text).join(', ')
  );
  check(
    `noise sample ${lang}: promoted and nested ingredients are named in the app language, in OFF order`,
    rowsText(rows) ===
      (lang === 'en'
        ? 'Sugar|Skimmed milk powder|Fat reduced cocoa|E322|  Soya lecithin|Hazelnut|Kombucha|Palm oil'
        : 'Захар|Обезмаслено сухо мляко|Какао с намалено съдържание на мазнини|E322|  Соев лецитин|Лешник|<unknown>|Палмово масло'),
    rowsText(rows)
  );
}

console.log(failures === 0 ? '\nALL INGREDIENT NAME CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
