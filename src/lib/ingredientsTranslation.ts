/**
 * Last-resort translation for the ingredient scanner. Only called when
 * off.ts's own field-based language fallback already failed — i.e.
 * `product.ingredientsTextLanguageGap` is true — so a scan never spends
 * DeepL quota on a product Open Food Facts already had in the right
 * language.
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
import { needsTranslation } from './ingredientNames';
import { lookupIngredientName } from './ingredientGlossary';
import { fetchIngredientTaxonomyNames, type OffIngredient, type OffIngredientsProduct } from './off';

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

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

interface NameResolution {
  displayName: string;
  displayNameIsFallback: boolean;
}

/**
 * Resolves every ingredient's `displayName` to `lang`, so the name always
 * reads in the same language as the description/tier the glossary already
 * resolves for it — and never as a formatted taxonomy id (e.g. "Cow s milk"
 * from "en:cow-s-milk"), which is not a real ingredient name in any
 * language. `id`/`text` themselves are left untouched — the glossary lookup
 * keys off those, not the display name.
 *
 * In order:
 *  1. Open Food Facts' own ingredient taxonomy (`fetchIngredientTaxonomyNames`)
 *     — the authoritative source of real translated names, one batched
 *     request for every id on the product.
 *  2. The local glossary's name (`lookupIngredientName`), when the taxonomy
 *     has no translation for `lang`.
 *  3. The taxonomy's own English name — real, never id-formatted — shown as
 *     a last resort and flagged via `displayNameIsFallback` so the UI can
 *     label it rather than presenting it as a correct translation.
 *  4. The ingredient's raw label text (no id match at all), translated only
 *     when its script doesn't already match `lang`.
 */
export async function resolveIngredientNames(
  ingredients: OffIngredient[],
  lang: AppLanguage,
  signal?: AbortSignal
): Promise<OffIngredient[]> {
  const ids = Array.from(new Set(ingredients.map((i) => i.id).filter((id): id is string => id !== null)));

  let taxonomyNames: Record<string, { localized: string | null; english: string | null }> = {};
  if (ids.length > 0) {
    try {
      taxonomyNames = await fetchIngredientTaxonomyNames(ids, lang, signal);
    } catch {
      // Best-effort — falls through to the glossary / raw-text paths below.
    }
  }

  const resolved: Array<NameResolution | null> = ingredients.map((ingredient) => {
    const taxonomy = ingredient.id ? taxonomyNames[ingredient.id] : undefined;
    if (taxonomy?.localized) {
      return { displayName: capitalizeFirst(taxonomy.localized), displayNameIsFallback: false };
    }

    const glossaryName = lookupIngredientName(ingredient, lang);
    if (glossaryName) {
      return { displayName: capitalizeFirst(glossaryName), displayNameIsFallback: false };
    }

    if (taxonomy?.english) {
      return { displayName: capitalizeFirst(taxonomy.english), displayNameIsFallback: lang !== 'en' };
    }

    return null;
  });

  // Ingredients with no taxonomy/glossary name at all fall back to their raw
  // label text, translated only when its script doesn't already match `lang`.
  const rawBases = Array.from(
    new Set(
      ingredients
        .filter((_, i) => resolved[i] === null)
        .map((ingredient) => ingredient.text)
        .filter((text) => needsTranslation(text, lang))
    )
  );

  const rawTranslations = new Map<string, string>();
  const uncached: string[] = [];

  for (const base of rawBases) {
    try {
      const cached = await getCachedIngredientNameTranslation(base, lang);
      if (cached) {
        rawTranslations.set(base, cached);
        continue;
      }
    } catch {
      // A cache read failure shouldn't stop a live translation attempt.
    }
    uncached.push(base);
  }

  if (uncached.length > 0) {
    const translations = await translateTexts(uncached, lang, signal);
    for (let i = 0; i < uncached.length; i += 1) {
      const translated = translations[i];
      if (!translated) continue;
      rawTranslations.set(uncached[i], translated);
      try {
        await cacheIngredientNameTranslation(uncached[i], lang, translated);
      } catch {
        // Best-effort cache write — the translation is still usable this once.
      }
    }
  }

  return ingredients.map((ingredient, i) => {
    const r = resolved[i];
    if (r) return { ...ingredient, ...r };
    return {
      ...ingredient,
      displayName: rawTranslations.get(ingredient.text) ?? ingredient.text,
      displayNameIsFallback: false,
    };
  });
}
