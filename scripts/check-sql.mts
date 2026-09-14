// Runs every statement in src/db/sql.ts against Node's built-in SQLite so that
// syntax errors, column-name typos, and bind-order mistakes fail here instead
// of on a phone. Run with: npm run check:sql
import { DatabaseSync } from 'node:sqlite';

import {
  DELETE_ALL,
  DELETE_ENTRY,
  INSERT_ENTRY,
  MIGRATIONS,
  SELECT_DAY_SUMMARIES,
  SELECT_DAY_TOTALS,
  SELECT_ENTRIES_FOR_DATE,
  SELECT_ENTRY_BY_ID,
  SELECT_INGREDIENT_NAME_TRANSLATION,
  SELECT_INGREDIENT_TRANSLATION,
  SELECT_PROFILE,
  SELECT_RECENT_FOODS,
  SELECT_SETTING,
  UPDATE_ENTRY,
  UPSERT_INGREDIENT_NAME_TRANSLATION,
  UPSERT_INGREDIENT_TRANSLATION,
  UPSERT_PROFILE,
  UPSERT_SETTING,
  insertEntryParams,
  updateEntryParams,
  upsertProfileParams,
} from '../src/db/sql.ts';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function eq(label: string, actual: unknown, expected: unknown) {
  check(label, Object.is(actual, expected), `got ${String(actual)}, expected ${String(expected)}`);
}

const db = new DatabaseSync(':memory:');

// --- migrations -------------------------------------------------------------
let version = 0;
for (const migration of MIGRATIONS) {
  db.exec(migration);
  version += 1;
  db.exec(`PRAGMA user_version = ${version}`);
}
eq('user_version after migrating', db.prepare('PRAGMA user_version').get()!.user_version, 4);

// Re-running is a no-op (IF NOT EXISTS), which is what a reopened app does.
for (const migration of MIGRATIONS) db.exec(migration);
check('migrations are idempotent', true);

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((r: any) => r.name);
check('profile table exists', tables.includes('profile'), tables.join(', '));
check('food_entry table exists', tables.includes('food_entry'), tables.join(', '));
check('settings table exists', tables.includes('settings'), tables.join(', '));
check('ingredient_translation table exists', tables.includes('ingredient_translation'), tables.join(', '));
check(
  'ingredient_name_translation table exists',
  tables.includes('ingredient_name_translation'),
  tables.join(', ')
);

const indexes = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'food_entry'")
  .all()
  .map((r: any) => r.name);
check('date index exists', indexes.includes('idx_food_entry_date'), indexes.join(', '));

// --- profile upsert ---------------------------------------------------------
const input = {
  sex: 'male',
  age: 30,
  height_cm: 180,
  weight_kg: 80,
  activity_level: 'moderate',
  goal: 'cut',
  rate_kcal_per_day: 500,
  protein_g_per_kg: 2,
  fat_g_per_kg: 0.8,
};
const targets = {
  bmr: 1780,
  tdee: 2759,
  calorie_target: 2259,
  protein_g_target: 160,
  fat_g_target: 64,
  carb_g_target: 261,
};

db.prepare(UPSERT_PROFILE).run(...(upsertProfileParams(input, targets, '2026-09-02T10:00:00Z') as any));
let profile: any = db.prepare(SELECT_PROFILE).get();
eq('profile weight persisted', profile.weight_kg, 80);
eq('profile calorie_target persisted', profile.calorie_target, 2259);
eq('profile goal persisted', profile.goal, 'cut');

// Upserting again must update in place, not insert a second row.
db.prepare(UPSERT_PROFILE).run(
  ...(upsertProfileParams(
    { ...input, weight_kg: 78, goal: 'maintain' },
    { ...targets, calorie_target: 2700 },
    '2026-09-03T10:00:00Z'
  ) as any)
);
eq('profile row count stays 1', db.prepare('SELECT COUNT(*) AS n FROM profile').get()!.n, 1);
profile = db.prepare(SELECT_PROFILE).get();
eq('profile weight updated', profile.weight_kg, 78);
eq('profile goal updated', profile.goal, 'maintain');
eq('profile calorie_target updated', profile.calorie_target, 2700);
eq('profile updated_at updated', profile.updated_at, '2026-09-03T10:00:00Z');

// --- food entries -----------------------------------------------------------
const entry = (over: Partial<Record<string, any>> = {}) => ({
  date: '2026-09-02',
  source: 'manual',
  name: 'Greek yoghurt',
  brand: 'Olympus',
  quantity: 200,
  unit: 'g',
  calories: 118,
  protein_g: 20,
  carbs_g: 7,
  fat_g: 2,
  fiber_g: null,
  barcode: null,
  ...over,
});

const first = db
  .prepare(INSERT_ENTRY)
  .run(...(insertEntryParams(entry(), '2026-09-02T08:30:00.000Z') as any));
const firstId = Number(first.lastInsertRowid);
check('insert returns a rowid', firstId > 0, String(firstId));

db.prepare(INSERT_ENTRY).run(
  ...(insertEntryParams(
    entry({ name: 'Chicken breast', brand: null, calories: 330, protein_g: 62, carbs_g: 0, fat_g: 7 }),
    '2026-09-02T13:00:00.000Z'
  ) as any)
);
db.prepare(INSERT_ENTRY).run(
  ...(insertEntryParams(
    entry({ date: '2026-09-01', name: 'Oats', calories: 380, protein_g: 13, carbs_g: 60, fat_g: 7, fiber_g: 10 }),
    '2026-09-01T07:00:00.000Z'
  ) as any)
);

// Bind order must match the column list, so read a field back by name.
const stored: any = db.prepare(SELECT_ENTRY_BY_ID).get(firstId);
eq('insert bind order: name', stored.name, 'Greek yoghurt');
eq('insert bind order: brand', stored.brand, 'Olympus');
eq('insert bind order: quantity', stored.quantity, 200);
eq('insert bind order: unit', stored.unit, 'g');
eq('insert bind order: calories', stored.calories, 118);
eq('insert bind order: protein_g', stored.protein_g, 20);
eq('insert bind order: carbs_g', stored.carbs_g, 7);
eq('insert bind order: fat_g', stored.fat_g, 2);
eq('insert bind order: fiber_g null', stored.fiber_g, null);
eq('insert bind order: logged_at', stored.logged_at, '2026-09-02T08:30:00.000Z');

const dayRows: any[] = db.prepare(SELECT_ENTRIES_FOR_DATE).all('2026-09-02');
eq('entries for date count', dayRows.length, 2);
eq('entries ordered by time', dayRows[0].name, 'Greek yoghurt');

const totals: any = db.prepare(SELECT_DAY_TOTALS).get('2026-09-02');
eq('day totals calories', totals.calories, 448);
eq('day totals protein', totals.protein_g, 82);
eq('day totals carbs', totals.carbs_g, 7);
eq('day totals fat', totals.fat_g, 9);
eq('day totals fibre coalesces null to 0', totals.fiber_g, 0);

const emptyDay: any = db.prepare(SELECT_DAY_TOTALS).get('2026-08-01');
eq('totals for a day with no entries', emptyDay.calories, 0);

// --- update -----------------------------------------------------------------
db.prepare(UPDATE_ENTRY).run(
  ...(updateEntryParams(
    entry({ name: 'Greek yoghurt 2%', quantity: 150, calories: 89, protein_g: 15, fiber_g: 0 }),
    firstId
  ) as any)
);
const updated: any = db.prepare(SELECT_ENTRY_BY_ID).get(firstId);
eq('update bind order: name', updated.name, 'Greek yoghurt 2%');
eq('update bind order: quantity', updated.quantity, 150);
eq('update bind order: calories', updated.calories, 89);
eq('update bind order: protein_g', updated.protein_g, 15);
eq('update preserves logged_at', updated.logged_at, '2026-09-02T08:30:00.000Z');

// --- summaries and recents --------------------------------------------------
const summaries: any[] = db.prepare(SELECT_DAY_SUMMARIES).all('2026-08-27', '2026-09-02');
eq('summary day count', summaries.length, 2);
eq('summaries newest first', summaries[0].date, '2026-09-02');
eq('summary entry_count', summaries[0].entry_count, 2);
eq('summary calories', summaries[0].calories, 419);
eq('older day summary calories', summaries[1].calories, 380);

const outOfRange: any[] = db.prepare(SELECT_DAY_SUMMARIES).all('2026-09-02', '2026-09-02');
eq('range filter excludes earlier days', outOfRange.length, 1);

// A repeat of an existing food must not produce two "recent" rows.
db.prepare(INSERT_ENTRY).run(
  ...(insertEntryParams(entry({ name: 'OATS', date: '2026-09-02' }), '2026-09-02T19:00:00.000Z') as any)
);
const recents: any[] = db.prepare(SELECT_RECENT_FOODS).all(10);
const oatsRows = recents.filter((r) => r.name.toLowerCase() === 'oats');
eq('recent foods dedupes case-insensitively', oatsRows.length, 1);
eq('recent foods keeps the newest of a duplicate', oatsRows[0].date, '2026-09-02');
check('recent foods newest first', recents[0].logged_at >= recents[recents.length - 1].logged_at);

// --- delete -----------------------------------------------------------------
db.prepare(DELETE_ENTRY).run(firstId);
eq('entry deleted', db.prepare(SELECT_ENTRY_BY_ID).get(firstId), undefined);

// --- settings ----------------------------------------------------------------
db.prepare(UPSERT_SETTING).run('language', 'en');
eq('setting inserted', (db.prepare(SELECT_SETTING).get('language') as any)?.value, 'en');
db.prepare(UPSERT_SETTING).run('language', 'bg');
eq('setting row count stays 1', db.prepare('SELECT COUNT(*) AS n FROM settings').get()!.n, 1);
eq('setting updated in place', (db.prepare(SELECT_SETTING).get('language') as any)?.value, 'bg');
eq('missing setting reads as undefined', db.prepare(SELECT_SETTING).get('nope'), undefined);

// --- ingredient translation cache --------------------------------------------
db.prepare(UPSERT_INGREDIENT_TRANSLATION).run('3017620422003', 'bg', 'Захар, палмово масло', '2026-09-07T10:00:00Z');
eq(
  'translation cached',
  (db.prepare(SELECT_INGREDIENT_TRANSLATION).get('3017620422003', 'bg') as any)?.translated_text,
  'Захар, палмово масло'
);
eq(
  'translation cache is keyed by language too',
  db.prepare(SELECT_INGREDIENT_TRANSLATION).get('3017620422003', 'en'),
  undefined
);
db.prepare(UPSERT_INGREDIENT_TRANSLATION).run('3017620422003', 'bg', 'Захар, палмово масло, лешници', '2026-09-08T10:00:00Z');
eq(
  'translation row count stays 1 per barcode+lang',
  db.prepare("SELECT COUNT(*) AS n FROM ingredient_translation WHERE barcode = '3017620422003' AND lang = 'bg'").get()!.n,
  1
);
eq(
  're-upserting a translation updates it in place',
  (db.prepare(SELECT_INGREDIENT_TRANSLATION).get('3017620422003', 'bg') as any)?.translated_text,
  'Захар, палмово масло, лешници'
);

// --- ingredient name translation cache (keyed by source text, not barcode) --
db.prepare(UPSERT_INGREDIENT_NAME_TRANSLATION).run('Skimmed milk powder', 'bg', 'Обезмаслено мляко на прах', '2026-09-07T10:00:00Z');
eq(
  'name translation cached',
  (db.prepare(SELECT_INGREDIENT_NAME_TRANSLATION).get('Skimmed milk powder', 'bg') as any)?.translated_text,
  'Обезмаслено мляко на прах'
);
eq(
  'name translation cache is keyed by language too',
  db.prepare(SELECT_INGREDIENT_NAME_TRANSLATION).get('Skimmed milk powder', 'en'),
  undefined
);
db.prepare(UPSERT_INGREDIENT_NAME_TRANSLATION).run('Skimmed milk powder', 'bg', 'Обезмаслено сухо мляко', '2026-09-08T10:00:00Z');
eq(
  'name translation row count stays 1 per source+lang',
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM ingredient_name_translation WHERE source_text = 'Skimmed milk powder' AND lang = 'bg'"
    )
    .get()!.n,
  1
);
eq(
  're-upserting a name translation updates it in place',
  (db.prepare(SELECT_INGREDIENT_NAME_TRANSLATION).get('Skimmed milk powder', 'bg') as any)?.translated_text,
  'Обезмаслено сухо мляко'
);

db.exec(DELETE_ALL);
eq('reset clears entries', db.prepare('SELECT COUNT(*) AS n FROM food_entry').get()!.n, 0);
eq('reset clears profile', db.prepare('SELECT COUNT(*) AS n FROM profile').get()!.n, 0);
eq(
  'reset does not clear settings',
  db.prepare('SELECT COUNT(*) AS n FROM settings').get()!.n,
  1
);
eq(
  'reset does not clear cached translations',
  db.prepare('SELECT COUNT(*) AS n FROM ingredient_translation').get()!.n,
  1
);
eq(
  'reset does not clear cached name translations',
  db.prepare('SELECT COUNT(*) AS n FROM ingredient_name_translation').get()!.n,
  1
);

console.log(failures === 0 ? '\nALL SQL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
