import { getDb } from './index';
import { SELECT_SETTING, UPSERT_SETTING } from './sql';

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(SELECT_SETTING, [key]);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(UPSERT_SETTING, [key, value]);
}
