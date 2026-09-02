import { calcTargets } from '../lib/calc';
import type { Profile, ProfileInput } from '../lib/types';
import { getDb } from './index';

interface ProfileRow extends Profile {
  id: number;
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM profile WHERE id = 1');
  if (!row) return null;
  const { id: _id, ...profile } = row;
  return profile;
}

/**
 * Upserts the single profile row, recomputing every derived target from the
 * supplied input. Targets are only ever written here, so the cached columns
 * cannot drift from the formulas.
 */
export async function saveProfile(input: ProfileInput): Promise<Profile> {
  const db = await getDb();
  const targets = calcTargets(input);
  const updated_at = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO profile (
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
       updated_at = excluded.updated_at`,
    [
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
    ]
  );

  return { ...input, ...targets, updated_at };
}
