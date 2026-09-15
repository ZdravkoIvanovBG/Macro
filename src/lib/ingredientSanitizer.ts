/**
 * Conservative cleanup of Open Food Facts' structured ingredient tree.
 *
 * OFF's parser sometimes turns label text that isn't an ingredient at all —
 * addresses, contact lines, trademark notices, websites, HTML entities — into
 * `ingredients[]` rows. Every row is classified as:
 *  - VALID          — strong evidence it's a real ingredient; kept.
 *  - OBVIOUS_NOISE  — strong evidence it isn't; removed.
 *  - UNCERTAIN      — neither; kept. An unfamiliar real ingredient must never
 *                     disappear just because nothing here recognises it.
 *
 * Rules run in a fixed order, first match wins (see `classifyIngredientRow`).
 * Classification only ever reads OFF's raw `text`/`id` — never a translated
 * name, and there is no language parameter — so a row is kept or removed the
 * same way whatever language the app is in.
 *
 * Kept free of network/DB/React imports so the check scripts can run it
 * offline. Regexes avoid `\b` (ASCII-only, never matches next to Cyrillic),
 * `\p{…}` and lookbehind; keywords are matched as whole word tokens instead.
 */
import { isKnownIngredient } from './ingredientGlossary';
import type { IngredientNode } from './off';

export type IngredientClassification = 'VALID' | 'OBVIOUS_NOISE' | 'UNCERTAIN';

export interface RowClassification {
  classification: IngredientClassification;
  /** Stable rule id, e.g. "taxonomy", "address" — what tests and the debug view key on. */
  rule: string;
  /** Human-readable explanation, for debugging only. */
  reason: string;
}

export interface SanitizeContext {
  /** Every brand on the product (OFF `brands`) — a mention is a weak noise signal. */
  brands?: string[];
}

export interface IngredientDecision {
  /** 1-based position in the raw tree, e.g. "3.1" = first child of the third row. */
  path: string;
  depth: number;
  text: string;
  id: string | null;
  isInTaxonomy: boolean;
  classification: IngredientClassification;
  rule: string;
  reason: string;
  action: 'kept' | 'removed' | 'removed-children-promoted';
}

// --- text helpers ----------------------------------------------------------------

const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const TOKEN = /[0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ]+/g;
/** A real ingredient name has at least one word of 3+ letters — "MD", "D 1Le BG" don't. */
const NAME_WORD = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]{3,}/;

function normalize(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(TOKEN) ?? [];
}

/**
 * A phrase is a space-separated token sequence. A trailing "*" on a phrase's
 * last word makes it a prefix (for inflected forms: "киселин*" matches
 * "киселина", "киселини").
 */
interface Phrase {
  tokens: string[];
  prefix: boolean;
}

function phrases(list: string[]): Phrase[] {
  return list.map((entry) => {
    const prefix = entry.endsWith('*');
    return { tokens: tokenize(prefix ? entry.slice(0, -1) : entry), prefix };
  });
}

function tokenMatches(token: string, word: string, prefix: boolean): boolean {
  return prefix ? token.startsWith(word) : token === word;
}

function findPhrase(tokens: string[], list: Phrase[]): Phrase | null {
  for (const phrase of list) {
    const n = phrase.tokens.length;
    for (let start = 0; start + n <= tokens.length; start += 1) {
      let ok = true;
      for (let k = 0; k < n; k += 1) {
        if (!tokenMatches(tokens[start + k], phrase.tokens[k], phrase.prefix && k === n - 1)) {
          ok = false;
          break;
        }
      }
      if (ok) return phrase;
    }
  }
  return null;
}

function isWholePhrase(tokens: string[], list: Phrase[]): boolean {
  return list.some(
    (phrase) =>
      phrase.tokens.length === tokens.length &&
      phrase.tokens.every((word, k) => tokenMatches(tokens[k], word, phrase.prefix && k === tokens.length - 1))
  );
}

const describe = (phrase: Phrase) => `"${phrase.tokens.join(' ')}${phrase.prefix ? '…' : ''}"`;

// --- hard noise: patterns no ingredient can ever have -------------------------------

const URL_SCHEME = /https?:\/\//i;
const DOMAIN =
  /(^|[\s(,;:])[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(com|net|org|info|eu|bg|de|fr|es|uk|ro|gr|ch|nl|be|pl|hu|cz|ru|io|biz)($|[\s/),;:])/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const DIGIT_RUN = /\+?\d[\d\s().\/-]*\d/g;
const MIN_PHONE_DIGITS = 7;
const HTML_ENTITY_WORDS = new Set(['quot', 'amp', 'nbsp', 'lt', 'gt', 'apos']);
const HTML_ENTITY = /&(#\d+|[a-z]+);/i;

function hardNoise(text: string, tokens: string[]): RowClassification | null {
  const noise = (rule: string, reason: string): RowClassification => ({ classification: 'OBVIOUS_NOISE', rule, reason });

  if (tokens.includes('www') || URL_SCHEME.test(text) || DOMAIN.test(text)) return noise('url', 'website / URL');
  if (EMAIL.test(text)) return noise('email', 'email address');
  if (!text.includes('%')) {
    for (const run of text.match(DIGIT_RUN) ?? []) {
      if ((run.match(/\d/g)?.length ?? 0) >= MIN_PHONE_DIGITS) {
        return noise('phone', 'phone number / long digit code');
      }
    }
  }
  if (HTML_ENTITY_WORDS.has(text.toLowerCase().replace(/[&;\s]/g, '')) || HTML_ENTITY.test(text)) {
    return noise('html-entity', 'HTML entity / OCR artifact');
  }
  if (!LETTER.test(text)) return noise('empty', 'no letters');
  return null;
}

// --- strong positive signals ------------------------------------------------------

const E_NUMBER_ID = /^[a-z]{2,3}:e\d{3,4}[a-z]*$/i;
const E_NUMBER_TEXT = /^e[\s-]?\d{3,4}[a-z]{0,4}$/i;

function strongPositive(node: IngredientNode, text: string): RowClassification | null {
  const valid = (rule: string, reason: string): RowClassification => ({ classification: 'VALID', rule, reason });

  if (node.isInTaxonomy) return valid('taxonomy', `recognised OFF taxonomy id ${node.id ?? ''}`.trim());
  if ((node.id && E_NUMBER_ID.test(node.id)) || E_NUMBER_TEXT.test(text.replace(/[.,;:]+$/, ''))) {
    return valid('e-number', 'E-number additive');
  }
  if (node.hasFoodProperties) return valid('off-food-properties', 'OFF attached food properties (CIQUAL / vegan / additive class)');
  if (isKnownIngredient({ id: node.isInTaxonomy ? node.id : null, text })) return valid('glossary', 'known ingredient (glossary)');
  return null;
}

// --- food phrases -----------------------------------------------------------------

/**
 * Head nouns of food phrases, English and Bulgarian plus a few label-language
 * neighbours. Never a dictionary — only enough to protect place- and
 * company-like wording ("Swiss cheese", "Madeira wine") and to label rows
 * VALID rather than UNCERTAIN. "food" is deliberately absent.
 */
const FOOD_NOUNS = phrases([
  // en
  'sugar', 'oil', 'flour', 'milk', 'cream', 'cheese', 'butter', 'wine', 'pudding', 'salt', 'water', 'juice',
  'syrup', 'starch', 'acid', 'extract', 'powder', 'fat', 'protein', 'fibre', 'fiber', 'egg', 'meat', 'fruit',
  'nut', 'hazelnut', 'almond', 'peanut', 'seed', 'cocoa', 'cacao', 'chocolate', 'coffee', 'tea', 'rice', 'wheat',
  'corn', 'maize', 'oat', 'barley', 'rye', 'potato', 'potatoes', 'tomato', 'tomatoes', 'vinegar', 'yeast', 'gum',
  'lecithin', 'lecithins', 'flavouring', 'flavoring', 'flavour', 'flavor', 'aroma', 'colour', 'color', 'colouring',
  'coloring', 'emulsifier', 'stabiliser', 'stabilizer', 'thickener', 'preservative', 'antioxidant', 'sweetener',
  'vitamin', 'spice', 'herb', 'pepper', 'honey', 'gelatine', 'gelatin', 'pectin', 'glucose', 'fructose', 'dextrose',
  'lactose', 'sucrose', 'maltodextrin', 'regulator', 'agent', 'cabbage', 'mustard', 'yoghurt', 'yogurt', 'whey',
  'casein', 'cereal', 'bread', 'pasta', 'onion', 'garlic', 'vegetable', 'bean', 'soy', 'soya', 'pork', 'beef',
  'chicken', 'fish', 'lemon', 'orange', 'apple', 'berry', 'berries', 'strawberry', 'banana', 'raisin', 'cinnamon',
  'vanilla', 'vanillin', 'malt', 'lard', 'margarine', 'sauce', 'noodle', 'biscuit', 'wafer', 'caramel', 'jam',
  'puree', 'purée', 'concentrate', 'pulp', 'peel', 'root', 'kernel', 'grain', 'bran',
  // bg
  'захар*', 'олио', 'масл*', 'брашн*', 'мляк*', 'млечн*', 'сметан*', 'сирен*', 'кашкавал', 'вино', 'вина', 'сол',
  'вода', 'сок', 'сокове', 'сироп*', 'нишесте*', 'киселин*', 'екстракт*', 'прах', 'мазнин*', 'белтък*',
  'протеин*', 'яйц*', 'яйчен*', 'месо', 'месн*', 'плод*', 'ядк*', 'лешни*', 'бадем*', 'семе', 'семена', 'какао',
  'шоколад*', 'кафе', 'чай', 'ориз*', 'пшени*', 'царевиц*', 'картоф*', 'домат*', 'оцет', 'мая', 'гума',
  'лецитин*', 'аромат*', 'оцветител*', 'емулгатор*', 'стабилизатор*', 'сгъстител*', 'консервант*',
  'антиоксидант*', 'подсладител*', 'витамин*', 'подправк*', 'мед', 'желатин*', 'пектин*', 'глюкоз*', 'фруктоз*',
  'декстроз*', 'лактоз*', 'малтодекстрин*', 'регулатор*', 'набухвател*', 'зеленчу*', 'ванили*', 'суроватк*',
  'портокал*', 'лимон*', 'ябълк*',
  // fr / de / ro
  'sucre', 'huile', 'lait', 'farine', 'eau', 'sel', 'zucker', 'milch', 'mehl', 'wasser', 'salz', 'zahăr', 'apă',
  'ulei', 'lapte', 'făină',
]);

function hasFoodNoun(tokens: string[]): Phrase | null {
  // Simple English plurals ("nuts", "seeds", "spices") without listing each.
  const singular = tokens.map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
  return findPhrase(tokens, FOOD_NOUNS) ?? findPhrase(singular, FOOD_NOUNS);
}

// --- strong-soft noise: one match is enough, unless a positive signal applied -----

const LABEL_HEADERS = phrases([
  'ingredients', 'ingredient', 'ingrédients', 'zutaten', 'ingredienti', 'ingredientes', 'ingrediente',
  'съставки', 'съставка', 'składniki', 'sastojci', 'sestavine', 'összetevők', 'složení',
]);

const LEGAL = phrases([
  'trademark', 'trademarks', 'trade mark', 'trade marks', 'registered trademark', 'used under licence',
  'used under license', 'under licence', 'under license', 'licensed by', 'licenced by', 'copyright',
  'all rights reserved', 'manufactured by', 'manufactured for', 'distributed by', 'imported by', 'packed for',
  'marque déposée', 'marques déposées', 'търговска марка', 'търговски марки', 'регистрирана марка', 'лиценз*',
  'всички права запазени', 'производител', 'вносител', 'внесено от', 'дистрибутор', 'дистрибутирано от',
]);

const CONTACT = phrases([
  'contact', 'contacts', 'contact us', 'contactez', 'kontakt', 'kontakte', 'контакт', 'контакти', 'information',
  'informations', 'info', 'informații', 'информация', 'customer service', 'consumer service', 'customer care',
  'consumer care', 'service consommateurs', 'verbraucherservice', 'hotline', 'гореща линия', 'tel', 'fax',
  'телефон', 'тел', 'email', 'e mail', 'address', 'adresse', 'адрес',
]);

const COMPANY = phrases([
  'gmbh', 'ltd', 'llc', 'inc', 'plc', 'sas', 'société', 'societe', 'оод', 'еоод', 'ад', 'еад',
  'nestle', 'nestlé', 'froneri', 'ferrero', 'mondelez', 'mondelēz', 'unilever', 'pepsico', 'lactalis',
]);
const DOTTED_COMPANY_SUFFIX = /(^|[\s,(])(s\.a\.|s\.p\.a\.?|s\.r\.l\.?|b\.v\.|n\.v\.)($|[\s,)])/i;

const STREET = phrases([
  'street', 'road', 'avenue', 'boulevard', 'blvd', 'straße', 'strasse', 'шосе', 'улица', 'ул', 'бул', 'булевард',
  'площад', 'жк', 'strada', 'calea', 'p o box', 'po box', 'пощенска кутия',
]);

/**
 * Whole-row place names only. Names that double as foods (turkey, chile,
 * jamaica, guinea, madeira, champagne, cognac, porto, java, ceylon, cayenne,
 * parma, dijon) are deliberately left out.
 */
const PLACES = phrases([
  'switzerland', 'schweiz', 'suisse', 'svizzera', 'швейцария', 'france', 'франция', 'germany', 'deutschland',
  'германия', 'italy', 'italia', 'италия', 'spain', 'españa', 'испания', 'bulgaria', 'българия', 'poland', 'polska',
  'полша', 'romania', 'românia', 'румъния', 'greece', 'гърция', 'austria', 'österreich', 'австрия', 'netherlands',
  'holland', 'нидерландия', 'холандия', 'belgium', 'belgique', 'белгия', 'united kingdom', 'uk', 'great britain',
  'england', 'великобритания', 'ireland', 'hungary', 'унгария', 'czech republic', 'czechia', 'чехия', 'slovakia',
  'serbia', 'сърбия', 'croatia', 'хърватия', 'slovenia', 'portugal', 'португалия', 'denmark', 'дания', 'sweden',
  'швеция', 'norway', 'finland', 'north macedonia', 'северна македония', 'macedonia', 'македония', 'usa',
  'united states', 'сащ', 'china', 'китай', 'india', 'индия', 'eu', 'european union', 'европейски съюз', 'ес',
  'ec', 'бг',
]);
const PLACE_PREFIXES = phrases([
  'made in', 'produced in', 'product of', 'country of origin', 'origin', 'произведено в', 'произход', 'страна на произход',
]);

/** Storage, dates, energy values — the thin filter this module replaced, kept verbatim. */
const NON_INGREDIENT_PATTERNS: RegExp[] = [
  /\d\s*°\s*[CF]\b/i,
  /\bkj\b|\bkcal\b|\d\s*k(j|cal)\b/i,
  /\b(best[\s-]?before|use by|sell by|expiry|expires?|shelf life|minimum durability|net weight|store(d)?\s+(below|above|in|at)|keep refrigerated|keep frozen|once opened|unopened|see lid|see (top|bottom|base|packaging))\b/i,
  // Cyrillic letters fall outside \w in non-unicode regex mode, so \b never
  // asserts around them — matched as plain substrings instead.
  /(съхранявайте|срок на годност|годен до|дата на производство|минимален срок)/i,
  /^\s*(eu|ec|бг|ес)\s*$/i,
];

const PER_100 = /(per|на)\s*100\s*(g|ml|г|мл)(?![A-Za-zА-яЁё])/i;

const LABEL_NOTES = phrases([
  'nutrition facts', 'nutrition information', 'nutritional information', 'nutrition declaration', 'energy value',
  'average values', 'typical values', 'хранителна стойност', 'енергийна стойност', 'средни стойности', 'recycle',
  'recyclable', 'рециклирай*', 'партида', 'lot', 'ean', 'barcode', 'баркод',
]);

/**
 * Whether a piece of label text is storage/date/energy boilerplate rather than
 * an ingredient. Also used for the free-text ingredient list in off.ts.
 */
export function looksLikeNonIngredientNote(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return true;
  return NON_INGREDIENT_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function strongSoftNoise(node: IngredientNode, text: string, tokens: string[], foodNoun: Phrase | null): RowClassification | null {
  const noise = (rule: string, reason: string): RowClassification => ({ classification: 'OBVIOUS_NOISE', rule, reason });

  if (isWholePhrase(tokens, LABEL_HEADERS)) return noise('label-header', 'the "Ingredients:" label itself');

  const legal = findPhrase(tokens, LEGAL);
  if (legal) return noise('legal', `legal / trademark text (${describe(legal)})`);

  const contact = findPhrase(tokens, CONTACT);
  if (contact) return noise('contact', `contact / information text (${describe(contact)})`);

  if (looksLikeNonIngredientNote(text)) return noise('label-note', 'storage / date / energy note');
  if (PER_100.test(text)) return noise('label-note', 'nutrition-table text ("per 100 g")');
  const note = findPhrase(tokens, LABEL_NOTES);
  if (note) return noise('label-note', `nutrition-table / packaging text (${describe(note)})`);

  if (!foodNoun) {
    const company = findPhrase(tokens, COMPANY);
    if (company) return noise('company', `company / manufacturer name (${describe(company)})`);
    if (DOTTED_COMPANY_SUFFIX.test(text)) return noise('company', 'company legal-entity suffix');

    const street = findPhrase(tokens, STREET);
    if (street && tokens.length > street.tokens.length) {
      return noise('address', `address / street fragment (${describe(street)})`);
    }

    let placeTokens = tokens;
    for (const prefix of PLACE_PREFIXES) {
      if (prefix.tokens.every((word, k) => tokens[k] === word)) {
        placeTokens = tokens.slice(prefix.tokens.length);
        break;
      }
    }
    if (placeTokens.length > 0 && isWholePhrase(placeTokens, PLACES)) {
      return noise('bare-location', 'a place name on its own, not a food phrase');
    }
  }

  if (node.children.length > 0 && !NAME_WORD.test(text)) {
    return noise('fragment-parent', 'label fragment with no real word, wrapping other rows');
  }
  return null;
}

// --- weak signals: only a combination of them counts ----------------------------

const MIN_SENTENCE_TOKENS = 10;
const POSTCODE_AND_PLACE = /\d{4,5}\s+[A-ZÀ-ÞА-Я][a-zß-ÿа-я]/;
const TRADEMARK_SYMBOL = /[®™©]/;

function weakSignals(node: IngredientNode, text: string, tokens: string[], ctx: SanitizeContext): string[] {
  const signals: string[] = [];
  if (tokens.length >= MIN_SENTENCE_TOKENS && !text.includes('(')) signals.push('sentence-length text');
  if (/[!?]/.test(text)) signals.push('sentence punctuation');
  if (POSTCODE_AND_PLACE.test(text)) signals.push('postcode-like number before a name');
  if (TRADEMARK_SYMBOL.test(text)) signals.push('trademark symbol');
  if (node.children.length === 0 && !NAME_WORD.test(text)) signals.push('no word of 3+ letters');

  const letters = text.replace(/[^A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g, '');
  if (tokens.length >= 2 && letters.length > 0 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    signals.push('all-caps multi-word text');
  }

  const brand = phrases((ctx.brands ?? []).filter((b) => b.trim().length >= 3));
  const brandHit = findPhrase(tokens, brand.filter((b) => b.tokens.length > 0));
  if (brandHit) signals.push(`mentions the product's brand (${describe(brandHit)})`);
  return signals;
}

// --- classification ---------------------------------------------------------------

/**
 * Classifies one ingredient row, in order (first match wins):
 *  1. hard noise (URL, email, phone, HTML entity, no letters) — even over the taxonomy;
 *  2. strong positive (taxonomy, E-number, OFF food properties, glossary) → VALID;
 *  3. strong-soft noise (label header, legal, contact, label note, company,
 *     address, bare place name, fragment parent) → OBVIOUS_NOISE; company and
 *     place rules only when the row has no food noun;
 *  4. two or more weak signals, with no food noun, exact percent or valid child → OBVIOUS_NOISE;
 *  5. a food noun → VALID;
 *  6. otherwise UNCERTAIN.
 * `validChildCount` is how many of the row's (already sanitized) children are VALID.
 */
export function classifyIngredientRow(
  node: IngredientNode,
  ctx: SanitizeContext = {},
  validChildCount = 0
): RowClassification {
  const text = normalize(node.text);
  const tokens = tokenize(text);

  const hard = hardNoise(text, tokens);
  if (hard) return hard;

  const positive = strongPositive(node, text);
  if (positive) return positive;

  const foodNoun = hasFoodNoun(tokens);
  const soft = strongSoftNoise(node, text, tokens, foodNoun);
  if (soft) return soft;

  const weak = weakSignals(node, text, tokens, ctx);
  if (weak.length >= 2 && !foodNoun && node.percent === null && validChildCount === 0) {
    return { classification: 'OBVIOUS_NOISE', rule: 'weak-signals', reason: weak.join(' + ') };
  }

  if (foodNoun) {
    return { classification: 'VALID', rule: 'food-phrase', reason: `plausible ingredient / food phrase (${describe(foodNoun)})` };
  }
  return {
    classification: 'UNCERTAIN',
    rule: 'unrecognised',
    reason: weak.length > 0 ? `not recognised; weak signals only: ${weak.join(' + ')}` : 'not recognised, no noise signals',
  };
}

interface SanitizedEntry {
  node: IngredientNode;
  classification: IngredientClassification;
}

/**
 * Removes OBVIOUS_NOISE rows from the tree, recursively, keeping OFF's order.
 * A removed row's own (sanitized) children take its place in its parent's
 * list, so a garbage label never takes real ingredients down with it. Nodes
 * are copied, never mutated, and no percentage is touched or recomputed.
 * `decisions` has one entry per raw row, parents before their children.
 */
export function sanitizeIngredientTree(
  tree: IngredientNode[],
  ctx: SanitizeContext = {}
): { tree: IngredientNode[]; decisions: IngredientDecision[] } {
  const decisions: IngredientDecision[] = [];

  const walk = (nodes: IngredientNode[], parentPath: string, depth: number): SanitizedEntry[] => {
    const out: SanitizedEntry[] = [];
    nodes.forEach((node, index) => {
      const path = parentPath === '' ? String(index + 1) : `${parentPath}.${index + 1}`;
      const slot = decisions.length;
      decisions.push(null as unknown as IngredientDecision); // parent listed before its children

      const children = walk(node.children, path, depth + 1);
      const validChildCount = children.filter((c) => c.classification === 'VALID').length;
      const result = classifyIngredientRow(node, ctx, validChildCount);
      const removed = result.classification === 'OBVIOUS_NOISE';

      decisions[slot] = {
        path,
        depth,
        text: node.text,
        id: node.id,
        isInTaxonomy: node.isInTaxonomy,
        ...result,
        action: !removed ? 'kept' : children.length > 0 ? 'removed-children-promoted' : 'removed',
      };

      if (removed) {
        out.push(...children);
      } else {
        out.push({
          node: { ...node, children: children.map((c) => c.node) },
          classification: result.classification,
        });
      }
    });
    return out;
  };

  return { tree: walk(tree, '', 0).map((entry) => entry.node), decisions };
}

export const __testing = { normalize, tokenize, hasFoodNoun };
