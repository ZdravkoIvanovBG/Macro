/**
 * Every SQL statement the app runs, in one place and free of any Expo import.
 * scripts/check-sql.mts executes this same text against Node's built-in SQLite,
 * so syntax and column errors surface on the desktop instead of on device.
 */

/**
 * Ordered schema migrations. Each entry's index + 1 is the `user_version` it
 * produces, so adding a migration is append-only — never edit an existing one.
 */
export const MIGRATIONS: ReadonlyArray<string> = [
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

export const SELECT_PROFILE = 'SELECT * FROM profile WHERE id = 1';

export const UPSERT_PROFILE = `
  INSERT INTO profile (
    id, sex, age, height_cm, weight_kg, activity_level, goal,
    rate_kcal_per_day, protein_g_per_kg, fat_g_per_kg,
    bmr, tdee, calorie_target, protein_g_target, fat_g_target, carb_g_target,
    updated_at
  ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    sex = excluded.sex,
    age = excluded.age,
    height_cm = excluded.height_cm,
    weight_kg = excluded.weight_kg,
    activity_level = excluded.activity_level,
    goal = excluded.goal,
    rate_kcal_per_day = excluded.rate_kcal_per_day,
    protein_g_per_kg = excluded.protein_g_per_kg,
    fat_g_per_kg = excluded.fat_g_per_kg,
    bmr = excluded.bmr,
    tdee = excluded.tdee,
    calorie_target = excluded.calorie_target,
    protein_g_target = excluded.protein_g_target,
    fat_g_target = excluded.fat_g_target,
    carb_g_target = excluded.carb_g_target,
    updated_at = excluded.updated_at`;

export const SELECT_ENTRIES_FOR_DATE =
  'SELECT * FROM food_entry WHERE date = ? ORDER BY logged_at ASC, id ASC';

export const SELECT_ENTRY_BY_ID = 'SELECT * FROM food_entry WHERE id = ?';

export const INSERT_ENTRY = `
  INSERT INTO food_entry
    (date, logged_at, source, name, brand, quantity, unit,
     calories, protein_g, carbs_g, fat_g, fiber_g, barcode)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const UPDATE_ENTRY = `
  UPDATE food_entry SET
    date = ?, source = ?, name = ?, brand = ?, quantity = ?, unit = ?,
    calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, fiber_g = ?, barcode = ?
  WHERE id = ?`;

export const DELETE_ENTRY = 'DELETE FROM food_entry WHERE id = ?';

export const SELECT_DAY_TOTALS = `
  SELECT
    COALESCE(SUM(calories), 0)  AS calories,
    COALESCE(SUM(protein_g), 0) AS protein_g,
    COALESCE(SUM(carbs_g), 0)   AS carbs_g,
    COALESCE(SUM(fat_g), 0)     AS fat_g,
    COALESCE(SUM(fiber_g), 0)   AS fiber_g
  FROM food_entry WHERE date = ?`;

export const SELECT_DAY_SUMMARIES = `
  SELECT
    date,
    COUNT(*)                    AS entry_count,
    COALESCE(SUM(calories), 0)  AS calories,
    COALESCE(SUM(protein_g), 0) AS protein_g,
    COALESCE(SUM(carbs_g), 0)   AS carbs_g,
    COALESCE(SUM(fat_g), 0)     AS fat_g,
    COALESCE(SUM(fiber_g), 0)   AS fiber_g
  FROM food_entry
  WHERE date BETWEEN ? AND ?
  GROUP BY date
  ORDER BY date DESC`;

/**
 * Distinct foods logged before, most recently used first — the basis for
 * "log it again" shortcuts without a separate foods table.
 */
export const SELECT_RECENT_FOODS = `
  SELECT * FROM food_entry
  WHERE id IN (
    SELECT MAX(id) FROM food_entry GROUP BY LOWER(name), COALESCE(LOWER(brand), '')
  )
  ORDER BY logged_at DESC
  LIMIT ?`;

export const DELETE_ALL = 'DELETE FROM food_entry; DELETE FROM profile;';

/**
 * Parameter builders live next to their statements so column order and bind
 * order can never drift apart.
 */
export function insertEntryParams(
  entry: {
    date: string; source: string; name: string; brand: string | null;
    quantity: number; unit: string; calories: number; protein_g: number;
    carbs_g: number; fat_g: number; fiber_g: number | null; barcode: string | null;
  },
  logged_at: string
) {
  return [
    entry.date,
    logged_at,
    entry.source,
    entry.name,
    entry.brand ?? null,
    entry.quantity,
    entry.unit,
    entry.calories,
    entry.protein_g,
    entry.carbs_g,
    entry.fat_g,
    entry.fiber_g ?? null,
    entry.barcode ?? null,
  ];
}

/** No logged_at, so list ordering stays stable across edits. */
export function updateEntryParams(
  entry: {
    date: string; source: string; name: string; brand: string | null;
    quantity: number; unit: string; calories: number; protein_g: number;
    carbs_g: number; fat_g: number; fiber_g: number | null; barcode: string | null;
  },
  id: number
) {
  return [
    entry.date,
    entry.source,
    entry.name,
    entry.brand ?? null,
    entry.quantity,
    entry.unit,
    entry.calories,
    entry.protein_g,
    entry.carbs_g,
    entry.fat_g,
    entry.fiber_g ?? null,
    entry.barcode ?? null,
    id,
  ];
}

export function upsertProfileParams(
  input: {
    sex: string; age: number; height_cm: number; weight_kg: number;
    activity_level: string; goal: string; rate_kcal_per_day: number;
    protein_g_per_kg: number; fat_g_per_kg: number;
  },
  targets: {
    bmr: number; tdee: number; calorie_target: number;
    protein_g_target: number; fat_g_target: number; carb_g_target: number;
  },
  updated_at: string
) {
  return [
    input.sex,
    input.age,
    input.height_cm,
    input.weight_kg,
    input.activity_level,
    input.goal,
    input.rate_kcal_per_day,
    input.protein_g_per_kg,
    input.fat_g_per_kg,
    targets.bmr,
    targets.tdee,
    targets.calorie_target,
    targets.protein_g_target,
    targets.fat_g_target,
    targets.carb_g_target,
    updated_at,
  ];
}
