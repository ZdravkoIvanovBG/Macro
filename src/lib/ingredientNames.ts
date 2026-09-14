/**
 * Last-resort translation signal for ingredients that have no taxonomy id
 * match at all (see off.ts's `fetchIngredientTaxonomyNames` and
 * ingredientGlossary.ts's `lookupIngredientName` for the primary/secondary
 * sources of a real display name). For genuinely raw label text — never a
 * formatted taxonomy id, which is never treated as a name — this decides
 * whether it's worth spending a translation call: Cyrillic presence is used
 * as the signal, consistent with the Bulgarian detection used elsewhere in
 * this codebase.
 */
import type { AppLanguage } from '../i18n';

const CYRILLIC_PATTERN = /[Ѐ-ӿ]/;

export function hasCyrillic(text: string): boolean {
  return CYRILLIC_PATTERN.test(text);
}

/** Whether raw label `text` needs translating to read naturally as `lang`. */
export function needsTranslation(text: string, lang: AppLanguage): boolean {
  return lang === 'en' ? hasCyrillic(text) : !hasCyrillic(text);
}
