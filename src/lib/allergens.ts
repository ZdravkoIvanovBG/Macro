/**
 * Plain-language names for Open Food Facts' `allergens_tags` — the 14
 * EU-regulated allergens, already tagged per product. No detection logic
 * here, just translated labels for structured data OFF already provides.
 */
import type { AppLanguage } from '../i18n';

const NAMES: Record<string, { en: string; bg: string }> = {
  gluten: { en: 'Gluten', bg: 'Глутен' },
  crustaceans: { en: 'Crustaceans', bg: 'Ракообразни' },
  eggs: { en: 'Eggs', bg: 'Яйца' },
  fish: { en: 'Fish', bg: 'Риба' },
  peanuts: { en: 'Peanuts', bg: 'Фъстъци' },
  soybeans: { en: 'Soybeans', bg: 'Соя' },
  milk: { en: 'Milk', bg: 'Мляко' },
  nuts: { en: 'Tree nuts', bg: 'Ядки' },
  celery: { en: 'Celery', bg: 'Целина' },
  mustard: { en: 'Mustard', bg: 'Горчица' },
  'sesame-seeds': { en: 'Sesame seeds', bg: 'Сусамово семе' },
  'sulphur-dioxide-and-sulphites': { en: 'Sulphur dioxide and sulphites', bg: 'Серен диоксид и сулфити' },
  lupin: { en: 'Lupin', bg: 'Лупина' },
  molluscs: { en: 'Molluscs', bg: 'Мекотели' },
};

function prettify(raw: string): string {
  return raw
    .split('-')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/**
 * Translates one OFF allergen tag (e.g. "en:sesame-seeds") to a display
 * label. Falls back to a prettified version of the raw tag when it's not one
 * of the 14 EU-regulated allergens OFF normally tags.
 */
export function describeAllergen(tag: string, lang: AppLanguage): string {
  const key = tag.replace(/^[a-z]{2}:/i, '').toLowerCase();
  const entry = NAMES[key];
  if (entry) return entry[lang];
  return prettify(key);
}
