/**
 * Translation for the ingredient scanner. `localizeIngredientTree` names the
 * structured ingredient list. `withTranslationFallback` covers the free-text
 * list, shown only when OFF has no structured ingredients, and only runs when
 * off.ts's own field-based language fallback already failed — i.e.
 * `product.ingredientsTextLanguageGap` is true — so a scan never spends DeepL
 * quota on a product Open Food Facts already had in the right language.
 */
import type { AppLanguage } from '../i18n/index';
import {
  cacheIngredientsTranslation,
  getCachedIngredientsTranslation,
} from '../db/ingredientTranslations';
import {
  cacheIngredientNameTranslation,
  getCachedIngredientNameTranslation,
} from '../db/ingredientNameTranslations';
import { translateIngredientsText, translateTexts } from './deepl';
import {
  canonicalKey,
  collectCanonicalizationRequests,
  collectIngredientIds,
  collectTranslationSources,
  localizeTree,
  type LocalizedIngredientNode,
} from './ingredientNames';
import {
  fetchCanonicalIngredientIds,
  fetchIngredientTaxonomyNames,
  type IngredientNode,
  type IngredientTaxonomyName,
  type OffIngredientsProduct,
} from './off';

export async function withTranslationFallback(
  product: OffIngredientsProduct,
  lang: AppLanguage,
  signal?: AbortSignal
): Promise<OffIngredientsProduct> {
  if (!product.ingredientsTextLanguageGap || !product.ingredientsText) return product;

  try {
    const cached = await getCachedIngredientsTranslation(product.code, lang);
    if (cached) {
      return {
        ...product,
        ingredientsText: cached,
        ingredientsTextLanguageGap: false,
        ingredientsTextTranslated: true,
      };
    }
  } catch {
    // A cache read failure shouldn't stop a live translation attempt.
  }

  const translated = await translateIngredientsText(product.ingredientsText, lang, signal);
  if (!translated) return product;

  try {
    await cacheIngredientsTranslation(product.code, lang, translated);
  } catch {
    // Best-effort cache write — the translation is still usable this once.
  }

  return {
    ...product,
    ingredientsText: translated,
    ingredientsTextLanguageGap: false,
    ingredientsTextTranslated: true,
  };
}

/** Steers DeepL on short fragments ("ciclamati" is otherwise read as Italian). */
const INGREDIENT_NAME_CONTEXT = 'Each text is one ingredient name from the ingredient list on a food product label.';

/**
 * Machine-translates ingredient names into `lang`, checking the local cache
 * first. Names DeepL can't translate (no key, offline, quota) are simply
 * absent from the result — the caller decides the fallback.
 */
async function translateNames(
  texts: string[],
  lang: AppLanguage,
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uncached: string[] = [];

  for (const text of texts) {
    try {
      const cached = await getCachedIngredientNameTranslation(text, lang);
      if (cached) {
        result.set(text, cached);
        continue;
      }
    } catch {
      // A cache read failure shouldn't stop a live translation attempt.
    }
    uncached.push(text);
  }

  if (uncached.length === 0) return result;

  const translations = await translateTexts(uncached, lang, signal, INGREDIENT_NAME_CONTEXT);
  for (let i = 0; i < uncached.length; i += 1) {
    const translated = translations[i];
    if (!translated) continue;
    result.set(uncached[i], translated);
    try {
      await cacheIngredientNameTranslation(uncached[i], lang, translated);
    } catch {
      // Best-effort cache write — the translation is still usable this once.
    }
  }
  return result;
}

async function fetchTaxonomyNamesSafely(
  ids: string[],
  lang: AppLanguage,
  signal?: AbortSignal
): Promise<Record<string, IngredientTaxonomyName>> {
  if (ids.length === 0) return {};
  try {
    return await fetchIngredientTaxonomyNames(ids, lang, signal);
  } catch {
    // Best-effort — later steps (label text, glossary, translation) still apply.
    return {};
  }
}

/**
 * Resolves a display name in `lang` for every ingredient in OFF's structured
 * tree, nested ones included (see ingredientNames.ts for the order):
 *  1. taxonomy names for the recognised ids on the product;
 *  2. OFF recognition of the remaining label texts, per text language;
 *  3. taxonomy names for the ids that recognition found;
 *  4. DeepL for whatever is still unnamed.
 * Every step is best-effort; a failed one only means fewer names resolve.
 */
export async function localizeIngredientTree(
  tree: IngredientNode[],
  lang: AppLanguage,
  signal?: AbortSignal
): Promise<LocalizedIngredientNode[]> {
  if (tree.length === 0) return [];

  const taxonomy = await fetchTaxonomyNamesSafely(collectIngredientIds(tree), lang, signal);

  const canonical = new Map<string, string>();
  const requests = collectCanonicalizationRequests(tree, taxonomy, lang);
  await Promise.all(
    Array.from(requests, async ([lc, texts]) => {
      try {
        const found = await fetchCanonicalIngredientIds(texts, lc, signal);
        for (const [text, id] of found) canonical.set(canonicalKey(lc, text), id);
      } catch {
        // Best-effort — these texts fall through to glossary / translation.
      }
    })
  );

  const newIds = Array.from(new Set(canonical.values())).filter((id) => !taxonomy[id]);
  Object.assign(taxonomy, await fetchTaxonomyNamesSafely(newIds, lang, signal));

  const ctx = { taxonomy, canonical };
  const sources = collectTranslationSources(tree, ctx, lang);
  const translations = sources.length > 0 ? await translateNames(sources, lang, signal) : new Map<string, string>();

  return localizeTree(tree, { ...ctx, translations }, lang);
}
