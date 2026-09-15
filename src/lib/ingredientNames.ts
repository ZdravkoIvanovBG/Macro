/**
 * Pure logic behind the ingredient names shown in the Ingredients report —
 * kept free of network/DB imports so the check scripts can run it offline.
 * The async orchestration (taxonomy/canonicalize requests, DeepL, cache)
 * lives in ingredientsTranslation.ts's `localizeIngredientTree`.
 *
 * Every visible name must be in the app's language only. Per ingredient, in
 * order:
 *  1. Open Food Facts' taxonomy name for the ingredient's own id.
 *  2. The ingredient's own label text, when it's already in that language.
 *  3. The taxonomy name for the id OFF recognises the label text as, when
 *     asked in the text's own language (`fetchCanonicalIngredientIds`) —
 *     this catches ingredients the product's parser missed because it read
 *     the label in the wrong language.
 *  4. The local glossary's name in that language.
 *  5. An E-number code ("E322") — language-neutral.
 *  6. A machine translation of the best available source name.
 *  7. Nothing (`nameSource: 'unnamed'`) — the screen shows a localized
 *     placeholder, never a name in another language.
 *
 * OFF ids only carry meaning when `is_in_taxonomy` is set; otherwise the id
 * is just "<parser language>:<text>", and the prefix is the language OFF
 * *parsed* the label in, which isn't necessarily the text's language.
 */
import type { AppLanguage } from '../i18n';
import { lookupIngredientName } from './ingredientGlossary';
import type { IngredientNode, IngredientTaxonomyName } from './off';

const CYRILLIC_PATTERN = /[Ѐ-ӿ]/;
const CYRILLIC_LETTERS = /[Ѐ-ӿ]/g;
const LATIN_LETTERS = /[A-Za-zÀ-ɏ]/g;
/** Cyrillic letters Bulgarian doesn't use (Russian, Ukrainian, Belarusian, Serbian, Macedonian). */
const NON_BULGARIAN_CYRILLIC = /[ыЫэЭёЁіІїЇєЄўЎђЂјЈљЉњЊћЋџЏґҐѓЃќЌѕЅ]/;
/** A real ingredient name has at least one word of 3+ letters — "MD", "D 1Le BG" don't. */
const NAME_WORD = /[A-Za-zÀ-ɏЀ-ӿ]{3,}/;

export function hasCyrillic(text: string): boolean {
  return CYRILLIC_PATTERN.test(text);
}

/** Whether raw label `text` needs translating to read naturally as `lang`. */
export function needsTranslation(text: string, lang: AppLanguage): boolean {
  return lang === 'en' ? hasCyrillic(text) : !hasCyrillic(text);
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * Bulgarian by script: mostly Cyrillic (a Latin "L-" or "К"/"K" mix-up is
 * fine) and none of the letters only other Cyrillic languages use.
 */
export function isBulgarianText(text: string): boolean {
  const cyrillic = countMatches(text, CYRILLIC_LETTERS);
  return cyrillic > 0 && cyrillic >= countMatches(text, LATIN_LETTERS) && !NON_BULGARIAN_CYRILLIC.test(text);
}

function isLatinText(text: string): boolean {
  return countMatches(text, LATIN_LETTERS) > 0 && !hasCyrillic(text);
}

/**
 * The language OFF parsed this ingredient in, from its id prefix ("fr:вода"
 * -> "fr"). Only unrecognised ids carry it: a recognised id is always the
 * canonical "en:…" one (Nutella's "en:sugar" has the text "Sucre").
 */
export function parseLanguage(node: IngredientNode): string | null {
  if (node.isInTaxonomy) return null;
  return node.id?.match(/^([a-z]{2,3}):/i)?.[1].toLowerCase() ?? null;
}

/**
 * The language `node.text` is written in, as far as can be told without a
 * detector: Bulgarian by script; Latin-script text is taken to be in the
 * language OFF parsed it in. Anything else is unknown.
 */
export function textLanguage(node: IngredientNode): string | null {
  if (isBulgarianText(node.text)) return 'bg';
  if (isLatinText(node.text)) return parseLanguage(node);
  return null;
}

export function isTextInLanguage(node: IngredientNode, lang: AppLanguage): boolean {
  return textLanguage(node) === lang;
}

/** Whether `text` looks like an ingredient name worth sending to a translator. */
export function isTranslatableName(text: string): boolean {
  return NAME_WORD.test(text);
}

export type IngredientNameSource =
  | 'taxonomy'
  | 'source'
  | 'canonical'
  | 'glossary'
  | 'code'
  | 'translated'
  | 'unnamed';

export interface LocalizedIngredientNode extends Omit<IngredientNode, 'children'> {
  /** Null only when `nameSource` is 'unnamed'. */
  displayName: string | null;
  nameSource: IngredientNameSource;
  children: LocalizedIngredientNode[];
}

type TaxonomyNames = Record<string, IngredientTaxonomyName>;

export interface IngredientNameContext {
  /** Taxonomy names for both the nodes' own ids and any canonical ids found for their text. */
  taxonomy: TaxonomyNames;
  /** `canonicalKey(lc, text)` -> the taxonomy id OFF recognised that text as. */
  canonical?: ReadonlyMap<string, string>;
  /** Source name (see `translationSourceText`) -> its machine translation into the app language. */
  translations?: ReadonlyMap<string, string>;
}

export function canonicalKey(lc: string, text: string): string {
  return `${lc}|${text.trim()}`;
}

const E_NUMBER_ID = /^[a-z]{2,3}:(e\d{3,4}[a-z]*)$/i;
const E_NUMBER_TEXT = /^(e\s?\d{3,4}[a-z]*)$/i;
const CANONICAL_LOOKING_ID = /^en:[a-z0-9-]+$/;

/** "en:e322i" / "E 322" -> "E322i"; null for anything that isn't a bare E-number. */
function eNumberCode(node: IngredientNode): string | null {
  const match = node.id?.match(E_NUMBER_ID) ?? node.text.trim().match(E_NUMBER_TEXT);
  if (!match) return null;
  const code = match[1].replace(/\s/g, '');
  return `E${code.slice(1).toLowerCase()}`;
}

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** DeepL punctuates short fragments like sentences ("Sugar.") — a name has no full stop. */
function cleanTranslatedName(text: string): string {
  return text.replace(/\.\s*$/, '').trim();
}

/**
 * Every id worth a taxonomy lookup, nested ones included, deduped: OFF-
 * recognised ids, plus canonical-looking ones in case `is_in_taxonomy` is
 * missing. "<lc>:<free text>" wrappers are skipped. A lookup for an id the
 * taxonomy doesn't know just comes back empty.
 */
export function collectIngredientIds(tree: IngredientNode[]): string[] {
  const ids = new Set<string>();
  const walk = (nodes: IngredientNode[]) => {
    for (const node of nodes) {
      if (node.id && (node.isInTaxonomy || CANONICAL_LOOKING_ID.test(node.id))) ids.add(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return Array.from(ids);
}

function canonicalIdFor(node: IngredientNode, ctx: IngredientNameContext): string | null {
  const lc = textLanguage(node);
  return lc ? (ctx.canonical?.get(canonicalKey(lc, node.text)) ?? null) : null;
}

/** The text a machine translation starts from: a taxonomy English name when there is one, else the label text. */
export function translationSourceText(node: IngredientNode, ctx: IngredientNameContext): string {
  const own = node.id ? ctx.taxonomy[node.id]?.english : null;
  if (own) return own;
  const canonicalId = canonicalIdFor(node, ctx);
  return (canonicalId ? ctx.taxonomy[canonicalId]?.english : null) ?? node.text.trim();
}

function ownTaxonomyName(node: IngredientNode, ctx: IngredientNameContext): string | null {
  return node.id ? (ctx.taxonomy[node.id]?.localized ?? null) : null;
}

function deterministicName(
  node: IngredientNode,
  ctx: IngredientNameContext,
  lang: AppLanguage
): { displayName: string; nameSource: IngredientNameSource } | null {
  const own = ownTaxonomyName(node, ctx);
  if (own) return { displayName: capitalizeFirst(own), nameSource: 'taxonomy' };

  if (isTextInLanguage(node, lang) && isTranslatableName(node.text)) {
    return { displayName: capitalizeFirst(node.text.trim()), nameSource: 'source' };
  }

  const canonicalId = canonicalIdFor(node, ctx);
  const canonical = canonicalId ? ctx.taxonomy[canonicalId]?.localized : null;
  if (canonical) return { displayName: capitalizeFirst(canonical), nameSource: 'canonical' };

  const glossaryName = lookupIngredientName(node, lang);
  if (glossaryName) return { displayName: capitalizeFirst(glossaryName), nameSource: 'glossary' };

  const code = eNumberCode(node);
  if (code) return { displayName: code, nameSource: 'code' };

  return null;
}

/**
 * Label texts OFF should try to recognise, grouped by the language they're
 * written in — only for nodes with no taxonomy name of their own and text
 * not already in `lang`.
 */
export function collectCanonicalizationRequests(
  tree: IngredientNode[],
  taxonomy: TaxonomyNames,
  lang: AppLanguage
): Map<string, string[]> {
  const requests = new Map<string, Set<string>>();
  const walk = (nodes: IngredientNode[]) => {
    for (const node of nodes) {
      const lc = textLanguage(node);
      const text = node.text.trim();
      if (
        lc &&
        !ownTaxonomyName(node, { taxonomy }) &&
        !isTextInLanguage(node, lang) &&
        isTranslatableName(text) &&
        !text.includes(',')
      ) {
        if (!requests.has(lc)) requests.set(lc, new Set());
        requests.get(lc)!.add(text);
      }
      walk(node.children);
    }
  };
  walk(tree);
  return new Map(Array.from(requests, ([lc, texts]) => [lc, Array.from(texts)]));
}

/** Source names, deduped, for every node with no deterministic name in `lang` that looks worth translating. */
export function collectTranslationSources(
  tree: IngredientNode[],
  ctx: IngredientNameContext,
  lang: AppLanguage
): string[] {
  const sources = new Set<string>();
  const walk = (nodes: IngredientNode[]) => {
    for (const node of nodes) {
      if (!deterministicName(node, ctx, lang)) {
        const source = translationSourceText(node, ctx);
        if (isTranslatableName(source)) sources.add(source);
      }
      walk(node.children);
    }
  };
  walk(tree);
  return Array.from(sources);
}

/** Picks one ingredient's display name in `lang` (see the module comment for the order). */
export function pickLocalizedName(
  node: IngredientNode,
  ctx: IngredientNameContext,
  lang: AppLanguage
): { displayName: string | null; nameSource: IngredientNameSource } {
  const deterministic = deterministicName(node, ctx, lang);
  if (deterministic) return deterministic;

  const translated = ctx.translations?.get(translationSourceText(node, ctx));
  const cleaned = translated ? cleanTranslatedName(translated) : '';
  if (cleaned !== '') return { displayName: capitalizeFirst(cleaned), nameSource: 'translated' };

  return { displayName: null, nameSource: 'unnamed' };
}

export function localizeTree(
  tree: IngredientNode[],
  ctx: IngredientNameContext,
  lang: AppLanguage
): LocalizedIngredientNode[] {
  return tree.map((node) => ({
    ...node,
    ...pickLocalizedName(node, ctx, lang),
    children: localizeTree(node.children, ctx, lang),
  }));
}
