import { calcTargets } from '../lib/calc';
import type { Profile, ProfileInput } from '../lib/types';
import { getDb } from './index';
import { SELECT_PROFILE, UPSERT_PROFILE, upsertProfileParams } from './sql';

interface ProfileRow extends Profile {
  id: number;
}

export async function getProfile(): Promise<Profile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ProfileRow>(SELECT_PROFILE);
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

  await db.runAsync(UPSERT_PROFILE, upsertProfileParams(input, targets, updated_at));

  return { ...input, ...targets, updated_at };
}
