import { getDb } from './index';
import { SELECT_INGREDIENT_TRANSLATION, UPSERT_INGREDIENT_TRANSLATION } from './sql';

export async function getCachedIngredientsTranslation(
  barcode: string,
  lang: string
): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ translated_text: string }>(SELECT_INGREDIENT_TRANSLATION, [
    barcode,
    lang,
  ]);
  return row?.translated_text ?? null;
}

export async function cacheIngredientsTranslation(
  barcode: string,
  lang: string,
  translatedText: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(UPSERT_INGREDIENT_TRANSLATION, [
    barcode,
    lang,
    translatedText,
    new Date().toISOString(),
  ]);
}
