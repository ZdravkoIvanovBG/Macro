import { getDb } from './index';
import { SELECT_INGREDIENT_NAME_TRANSLATION, UPSERT_INGREDIENT_NAME_TRANSLATION } from './sql';

export async function getCachedIngredientNameTranslation(
  sourceText: string,
  lang: string
): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ translated_text: string }>(SELECT_INGREDIENT_NAME_TRANSLATION, [
    sourceText,
    lang,
  ]);
  return row?.translated_text ?? null;
}

export async function cacheIngredientNameTranslation(
  sourceText: string,
  lang: string,
  translatedText: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(UPSERT_INGREDIENT_NAME_TRANSLATION, [
    sourceText,
    lang,
    translatedText,
    new Date().toISOString(),
  ]);
}
