// Checks src/lib/ingredientSanitizer.ts: rows Open Food Facts lists as
// ingredients but that clearly aren't (addresses, contact lines, trademark
// notices, websites, HTML entities) are removed, while real ingredients —
// including unfamiliar ones and place-named foods — are kept. Also checks that
// a removed row's children survive, and that order and percentages don't change.
// Run with: npm run check:ingredient-sanitizer
import { readFileSync } from 'node:fs';
import {
  classifyIngredientRow,
  sanitizeIngredientTree,
  type IngredientClassification,
} from '../src/lib/ingredientSanitizer.ts';
import { __testing, type IngredientNode } from '../src/lib/off.ts';

const { toIngredientsProduct, readIngredientTree } = __testing;

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function node(text: string, overrides: Partial<IngredientNode> = {}): IngredientNode {
  return {
    id: null,
    text,
    isInTaxonomy: false,
    hasFoodProperties: false,
    percent: null,
    percentEstimate: null,
    percentMin: null,
    percentMax: null,
    children: [],
    ...overrides,
  };
}

function expectRow(text: string, classification: IngredientClassification, rule?: string, overrides: Partial<IngredientNode> = {}) {
  const result = classifyIngredientRow(node(text, overrides));
  check(
    `${classification}${rule ? ` (${rule})` : ''}: ${JSON.stringify(text)}${overrides.isInTaxonomy ? ' [in taxonomy]' : ''}`,
    result.classification === classification && (rule === undefined || result.rule === rule),
    `${result.classification} / ${result.rule} / ${result.reason}`
  );
}

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as { product: Record<string, unknown> };

// --- REJECT ------------------------------------------------------------------------
expectRow('Ломско шосе', 'OBVIOUS_NOISE', 'address');
expectRow('КОНТАКТИ', 'OBVIOUS_NOISE', 'contact');
expectRow('Www за информация', 'OBVIOUS_NOISE', 'url');
expectRow('Nestle Good Food', 'OBVIOUS_NOISE', 'company');
expectRow('Used under licence by Froneri', 'OBVIOUS_NOISE', 'legal');
expectRow('Trademarks of Société', 'OBVIOUS_NOISE', 'legal');
expectRow('Switzerland 3A CONTACTS', 'OBVIOUS_NOISE', 'contact');
expectRow('quot', 'OBVIOUS_NOISE', 'html-entity');
expectRow('example.com', 'OBVIOUS_NOISE', 'url');
expectRow('+359 2 123 4567', 'OBVIOUS_NOISE', 'phone');
expectRow('Switzerland', 'OBVIOUS_NOISE', 'bare-location');
expectRow('Made in Bulgaria', 'OBVIOUS_NOISE', 'bare-location');
expectRow('best before see lid', 'OBVIOUS_NOISE', 'label-note');
expectRow('info@example.bg', 'OBVIOUS_NOISE', 'email');
expectRow('&amp;', 'OBVIOUS_NOISE', 'html-entity');
expectRow('Хранителна стойност на 100 г', 'OBVIOUS_NOISE', 'label-note');
expectRow('ул. Витоша 15', 'OBVIOUS_NOISE', 'address');
expectRow('Ferrero S.p.A.', 'OBVIOUS_NOISE', 'company');
expectRow('***', 'OBVIOUS_NOISE', 'empty');
check(
  'label-header: a bare "Съставки" wrapping real rows',
  classifyIngredientRow(node('Съставки', { children: [node('вода')] })).rule === 'label-header'
);
check(
  'fragment-parent: "D 1Le BG" wrapping real rows',
  classifyIngredientRow(node('D 1Le BG', { children: [node('вода')] })).rule === 'fragment-parent'
);
check(
  'hard noise wins even over a taxonomy match',
  classifyIngredientRow(node('www.nutella.com', { isInTaxonomy: true, id: 'en:sugar' })).classification === 'OBVIOUS_NOISE'
);

// --- KEEP (VALID), as unrecognised text and as taxonomy matches --------------------
for (const text of [
  'Sugar', 'Palm oil', 'Hazelnut', 'Skimmed milk powder', 'Fat-reduced cocoa', 'Soy lecithin', 'E322',
  'Modified starch', 'Natural flavouring', 'Glucose syrup', 'Citric acid', 'Swiss cheese', 'Madeira wine',
  'Yorkshire pudding', 'maltodextrin', 'stabilizer', 'acidity regulator', 'glucose-fructose syrup',
]) {
  expectRow(text, 'VALID');
  expectRow(text, 'VALID', 'taxonomy', { isInTaxonomy: true, id: 'en:x' });
}
expectRow('E 471', 'VALID', 'e-number');
expectRow('emulsifier', 'VALID', 'e-number', { id: 'en:e322' });
expectRow('huile de palme', 'VALID', 'off-food-properties', { hasFoodProperties: true });

// --- UNCERTAIN, but kept ------------------------------------------------------------
expectRow('Kombucha', 'UNCERTAIN'); // uncommon, not in the OFF taxonomy
expectRow('Ume', 'UNCERTAIN'); // short botanical name
expectRow('Sodium carboxymethylcellulose', 'UNCERTAIN'); // technical name
expectRow('шиитаке', 'UNCERTAIN'); // transliterated
expectRow('цикламати', 'UNCERTAIN');
expectRow('Пастьоризирана', 'UNCERTAIN');

// --- false-positive guards: place-, company- and keyword-like real ingredients ------
for (const text of [
  'Rue', "St. John's wort", 'Lactic acid produced by fermentation', 'Turkey', 'Chile flakes', 'Brazil nuts',
  'Bulgarian yoghurt', 'Българско кисело мляко', 'Vitamin B12', 'Q10', 'Mineral water from Bankya',
  '7,4% cacao maigre', 'Pastel', 'Infusion', 'Champagne vinegar', 'Nestlé milk chocolate', 'Dijon mustard',
  'Actilight® (fructooligosaccharides)', 'SOJA', 'Parmigiano Reggiano', 'Ceylon cinnamon', 'Emmental',
]) {
  const result = classifyIngredientRow(node(text));
  check(`kept: ${JSON.stringify(text)}`, result.classification !== 'OBVIOUS_NOISE', `${result.classification} / ${result.rule} / ${result.reason}`);
}

// --- no language parameter: the same row, the same answer --------------------------
check(
  'classification has no language input — rows are judged on OFF\'s raw text alone',
  classifyIngredientRow.length <= 3 && sanitizeIngredientTree.length <= 2
);

// --- nesting ----------------------------------------------------------------------------
const texts = (nodes: IngredientNode[]): string =>
  nodes.map((n) => (n.children.length > 0 ? `${n.text}(${texts(n.children)})` : n.text)).join(',');

{
  const { tree, decisions } = sanitizeIngredientTree([
    node('water'),
    node('Used under licence by Froneri', { children: [node('sugar'), node('cocoa')] }),
    node('salt'),
  ]);
  check('garbage parent: its valid children take its place, in order', texts(tree) === 'water,sugar,cocoa,salt', texts(tree));
  check(
    'garbage parent: logged as removed with children promoted',
    decisions.find((d) => d.text === 'Used under licence by Froneri')?.action === 'removed-children-promoted'
  );
}
{
  const { tree } = sanitizeIngredientTree([node('E322', { id: 'en:e322', isInTaxonomy: true, children: [node('soya lecithin'), node('КОНТАКТИ')] })]);
  check('valid parent with one garbage child: parent kept, only that child removed', texts(tree) === 'E322(soya lecithin)', texts(tree));
}
{
  const { tree } = sanitizeIngredientTree([
    node('chocolate', { children: [node('sugar'), node('www.example.com', { children: [node('cocoa butter'), node('cocoa mass')] }), node('vanilla')] }),
  ]);
  check(
    'garbage row nested in a valid parent: its children move up one level, still inside that parent',
    texts(tree) === 'chocolate(sugar,cocoa butter,cocoa mass,vanilla)',
    texts(tree)
  );
}
{
  const { tree, decisions } = sanitizeIngredientTree([node('Ломско шосе'), node('quot')]);
  check('garbage rows with no children simply disappear', tree.length === 0 && decisions.every((d) => d.action === 'removed'));
}

// --- real fixtures --------------------------------------------------------------------
const rawFlat = (entries: unknown): IngredientNode[] =>
  readIngredientTree(entries).flatMap(function flat(n: IngredientNode): IngredientNode[] {
    return [n, ...n.children.flatMap(flat)];
  });
const flatNodes = (nodes: IngredientNode[]): IngredientNode[] => nodes.flatMap((n) => [n, ...flatNodes(n.children)]);

function isSubsequence(sub: string[], full: string[]): boolean {
  let i = 0;
  for (const item of full) if (i < sub.length && item === sub[i]) i += 1;
  return i === sub.length;
}

// Nutella: every row recognised by OFF — nothing may change.
{
  const product = fixture('off-3017620425035').product;
  const raw = readIngredientTree(product['ingredients']);
  const sanitized = toIngredientsProduct(product, 'en')!;
  check('Nutella: sanitized tree is identical to the raw tree', JSON.stringify(sanitized.ingredientTree) === JSON.stringify(raw));
  check('Nutella: no row removed', sanitized.ingredientDecisions.every((d) => d.action === 'kept'));
}

// Cappy: OFF's parser turned label headers and fragments into wrapper rows.
{
  const product = fixture('off-5449000147417').product;
  const sanitized = toIngredientsProduct(product, 'bg')!;
  const removed = sanitized.ingredientDecisions.filter((d) => d.classification === 'OBVIOUS_NOISE').map((d) => d.text);
  check(
    'Cappy: exactly the header and fragment wrapper rows are removed',
    removed.join('|') === 'D 1Le BG|Съставки|MD|Ingrediente',
    removed.join('|')
  );
  const top = sanitized.ingredientTree.map((n) => n.text);
  check(
    'Cappy: their children are promoted into their places',
    top[0] === 'Негазирана напитка със сок от портокал от концентрат' &&
      top.indexOf('вода') === top.indexOf('Пастьоризирана') + 1 &&
      top.indexOf('apã') === top.indexOf('Produs pasteurizat') + 1,
    top.slice(0, 8).join(' | ')
  );
  check(
    'Cappy: no real ingredient is lost',
    flatNodes(sanitized.ingredientTree).length === rawFlat(product['ingredients']).length - removed.length
  );
}

// The synthetic noise sample: every reported garbage row, plus nesting and percents.
{
  const product = fixture('off-noise-sample').product;
  const raw = rawFlat(product['ingredients']);
  const sanitized = toIngredientsProduct(product, 'en')!;
  const kept = flatNodes(sanitized.ingredientTree);

  check(
    'noise sample: the cleaned tree',
    texts(sanitized.ingredientTree) ===
      'sugar,skimmed milk powder,fat-reduced cocoa,emulsifier(soya lecithin),hazelnuts,kombucha,palm oil',
    texts(sanitized.ingredientTree)
  );
  check(
    'order unchanged: remaining rows appear in OFF\'s order',
    isSubsequence(kept.map((n) => n.text), raw.map((n) => n.text))
  );

  const percentKey = (n: IngredientNode) => JSON.stringify([n.text, n.percent, n.percentEstimate, n.percentMin, n.percentMax]);
  const rawByText = new Map(raw.map((n) => [n.text, percentKey(n)]));
  check(
    'percentages unchanged on every remaining row, promoted children included',
    kept.every((n) => rawByText.get(n.text) === percentKey(n)),
    kept.filter((n) => rawByText.get(n.text) !== percentKey(n)).map((n) => n.text).join(', ')
  );
  check('percentages are not redistributed: removed rows\' shares simply vanish', kept.reduce((sum, n) => sum + (n.percentEstimate ?? 0), 0) < raw.reduce((sum, n) => sum + (n.percentEstimate ?? 0), 0));

  check('debug: one decision per raw row', sanitized.ingredientDecisions.length === raw.length);
  check('debug: every decision has a rule and a reason', sanitized.ingredientDecisions.every((d) => d.rule !== '' && d.reason !== ''));
  check(
    'debug: paths are unique',
    new Set(sanitized.ingredientDecisions.map((d) => d.path)).size === sanitized.ingredientDecisions.length
  );
  check(
    'debug: a decision carries the original OFF text and id',
    JSON.stringify(
      (({ path, text, id, classification, rule, action }) => ({ path, text, id, classification, rule, action }))(
        sanitized.ingredientDecisions.find((d) => d.text === 'Ломско шосе')!
      )
    ) === JSON.stringify({ path: '5', text: 'Ломско шосе', id: 'bg:Ломско шосе', classification: 'OBVIOUS_NOISE', rule: 'address', action: 'removed' })
  );
  check('the raw tree is not mutated', readIngredientTree(product['ingredients']).length === 12);
}

// --- language independence --------------------------------------------------------------
for (const name of ['off-3017620425035', 'off-5449000147417', 'off-noise-sample']) {
  const product = fixture(name).product;
  const en = toIngredientsProduct(product, 'en')!;
  const bg = toIngredientsProduct(product, 'bg')!;
  check(
    `${name}: the same rows are kept and removed in English and Bulgarian`,
    JSON.stringify(en.ingredientTree) === JSON.stringify(bg.ingredientTree) &&
      JSON.stringify(en.ingredientDecisions) === JSON.stringify(bg.ingredientDecisions)
  );
}

console.log(failures === 0 ? '\nALL INGREDIENT SANITIZER CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
