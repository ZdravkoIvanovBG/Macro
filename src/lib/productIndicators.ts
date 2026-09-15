/**
 * Product-level indicators shown next to the app's own safety score on the
 * Ingredients report: Open Food Facts' NOVA processing group and Nutri-Score
 * grade, taken as OFF reports them — never calculated or guessed here.
 *
 * Display only. The safety score (ingredientRisk.ts) keeps reading the raw
 * `novaGroup` / `nutriscoreGrade` product fields exactly as before; nothing
 * here feeds into it.
 */

export type NovaGroup = 1 | 2 | 3 | 4;
export type NutriScoreGrade = 'a' | 'b' | 'c' | 'd' | 'e';

/** OFF's `nova_group`: 1–4, as a number or a numeric string. Anything else is unavailable. */
export function normalizeNovaGroup(raw: unknown): NovaGroup | null {
  const value = typeof raw === 'string' && /^\s*\d+\s*$/.test(raw) ? Number(raw) : raw;
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

/**
 * OFF's `nutriscore_grade`: a single letter a–e. OFF also sends "unknown" and
 * "not-applicable" when there's no grade — those, and anything else, are
 * unavailable.
 */
export function normalizeNutriScore(raw: unknown): NutriScoreGrade | null {
  if (typeof raw !== 'string') return null;
  const grade = raw.trim().toLowerCase();
  return grade === 'a' || grade === 'b' || grade === 'c' || grade === 'd' || grade === 'e' ? grade : null;
}

export type NovaDescriptionKey =
  | 'ingredients.nova1'
  | 'ingredients.nova2'
  | 'ingredients.nova3'
  | 'ingredients.nova4'
  | 'ingredients.novaUnavailable';

export function novaDescriptionKey(group: NovaGroup | null): NovaDescriptionKey {
  switch (group) {
    case 1:
      return 'ingredients.nova1';
    case 2:
      return 'ingredients.nova2';
    case 3:
      return 'ingredients.nova3';
    case 4:
      return 'ingredients.nova4';
    default:
      return 'ingredients.novaUnavailable';
  }
}

export type NutriScoreDescriptionKey =
  | 'ingredients.nutriScoreA'
  | 'ingredients.nutriScoreB'
  | 'ingredients.nutriScoreC'
  | 'ingredients.nutriScoreD'
  | 'ingredients.nutriScoreE'
  | 'ingredients.nutriScoreUnavailable';

export function nutriScoreDescriptionKey(grade: NutriScoreGrade | null): NutriScoreDescriptionKey {
  switch (grade) {
    case 'a':
      return 'ingredients.nutriScoreA';
    case 'b':
      return 'ingredients.nutriScoreB';
    case 'c':
      return 'ingredients.nutriScoreC';
    case 'd':
      return 'ingredients.nutriScoreD';
    case 'e':
      return 'ingredients.nutriScoreE';
    default:
      return 'ingredients.nutriScoreUnavailable';
  }
}
