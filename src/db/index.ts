import * as SQLite from 'expo-sqlite';

import { DELETE_ALL, MIGRATIONS } from './sql';

export const DATABASE_NAME = 'micro.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens (once) and migrates the database. Every repository call funnels through
 * here, so the schema is guaranteed ready before the first query runs.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((err) => {
      // Don't cache a failed open — let the next caller retry.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (let i = version; i < MIGRATIONS.length; i += 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[i]);
    });
    version = i + 1;
    // PRAGMA can't take a bound parameter, and `version` is a loop counter.
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }

  return db;
}

/** Wipes all rows but keeps the schema. */
export async function resetAllData(): Promise<void> {
  const db = await getDb();
  await db.execAsync(DELETE_ALL);
}
