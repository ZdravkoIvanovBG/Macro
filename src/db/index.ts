import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'micro.db';

/**
 * Ordered schema migrations. Each entry's index + 1 is the `user_version` it
 * produces, so adding a migration is append-only — never edit an existing one.
 */
const MIGRATIONS: ReadonlyArray<string> = [
  // v1 — profile + food entries
  `
  CREATE TABLE IF NOT EXISTS profile (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    sex               TEXT    NOT NULL,
    age               INTEGER NOT NULL,
    height_cm         REAL    NOT NULL,
    weight_kg         REAL    NOT NULL,
    activity_level    TEXT    NOT NULL,
    goal              TEXT    NOT NULL,
    rate_kcal_per_day REAL    NOT NULL,
    protein_g_per_kg  REAL    NOT NULL,
    fat_g_per_kg      REAL    NOT NULL,
    bmr               REAL    NOT NULL,
    tdee              REAL    NOT NULL,
    calorie_target    REAL    NOT NULL,
    protein_g_target  REAL    NOT NULL,
    fat_g_target      REAL    NOT NULL,
    carb_g_target     REAL    NOT NULL,
    updated_at        TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS food_entry (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL,
    logged_at  TEXT NOT NULL,
    source     TEXT NOT NULL,
    name       TEXT NOT NULL,
    brand      TEXT,
    quantity   REAL NOT NULL,
    unit       TEXT NOT NULL,
    calories   REAL NOT NULL,
    protein_g  REAL NOT NULL,
    carbs_g    REAL NOT NULL,
    fat_g      REAL NOT NULL,
    fiber_g    REAL,
    barcode    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_food_entry_date ON food_entry (date);
  `,
];

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
    // PRAGMA can't be parameterised, and `version` is a loop counter, not input.
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }

  return db;
}

/** Test/debug helper: wipe all rows but keep the schema. */
export async function resetAllData(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM food_entry; DELETE FROM profile;');
}
