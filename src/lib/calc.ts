import type {
  ActivityLevel,
  Goal,
  ProfileInput,
  Sex,
  Targets,
} from './types';

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Fat is never allowed to drop below this share of the calorie target. */
export const MIN_FAT_CALORIE_SHARE = 0.2;

export const DEFAULT_PROTEIN_G_PER_KG = 2.0;
export const DEFAULT_FAT_G_PER_KG = 0.8;
export const DEFAULT_RATE_KCAL = 500;
/** Ceiling for a bulk surplus; there is no physiological anchor, this is just sane. */
export const MAX_SURPLUS_KCAL = 1000;

/**
 * Display copy (label/hint) lives in the i18n resources under `activity.<value>`,
 * looked up by callers — this file stays pure data + logic for check-calc.mts.
 */
export const ACTIVITY_LEVELS: ReadonlyArray<{
  value: ActivityLevel;
  multiplier: number;
}> = [
  { value: 'sedentary', multiplier: 1.2 },
  { value: 'light', multiplier: 1.375 },
  { value: 'moderate', multiplier: 1.55 },
  { value: 'active', multiplier: 1.725 },
  { value: 'very_active', multiplier: 1.9 },
];

/** Display copy (label/verb) lives in the i18n resources under `goals.<value>`. */
export const GOALS: ReadonlyArray<{ value: Goal }> = [
  { value: 'cut' },
  { value: 'maintain' },
  { value: 'bulk' },
];

export function activityMultiplier(level: ActivityLevel): number {
  return ACTIVITY_LEVELS.find((a) => a.value === level)?.multiplier ?? 1.2;
}

/** Mifflin-St Jeor. */
export function calcBmr(args: {
  sex: Sex;
  weight_kg: number;
  height_cm: number;
  age: number;
}): number {
  const base = 10 * args.weight_kg + 6.25 * args.height_cm - 5 * args.age;
  return args.sex === 'male' ? base + 5 : base - 161;
}

export function calcTdee(bmr: number, level: ActivityLevel): number {
  return bmr * activityMultiplier(level);
}

/**
 * Largest deficit that still leaves the calorie target at or above BMR.
 * The Profile UI clamps its input to this so the target can never go lower.
 */
export function maxDeficitKcal(tdee: number, bmr: number): number {
  return Math.max(0, tdee - bmr);
}

export function maxRateKcal(goal: Goal, tdee: number, bmr: number): number {
  if (goal === 'cut') return maxDeficitKcal(tdee, bmr);
  if (goal === 'bulk') return MAX_SURPLUS_KCAL;
  return 0;
}

/**
 * Roughly how much bodyweight a given daily deficit/surplus moves per week,
 * using the conventional ~7700 kcal per kg of body mass.
 */
export function weeklyWeightChangeKg(ratePerDay: number): number {
  return (ratePerDay * 7) / 7700;
}

export function calcTargets(input: ProfileInput): Targets {
  const bmr = calcBmr(input);
  const tdee = calcTdee(bmr, input.activity_level);

  // Clamp defensively: the UI caps this too, but stored targets must always be sane.
  const rate = Math.max(0, input.rate_kcal_per_day);
  const cappedRate = Math.min(rate, maxRateKcal(input.goal, tdee, bmr));
  const signedRate = input.goal === 'cut' ? -cappedRate : input.goal === 'bulk' ? cappedRate : 0;
  const calorieTarget = tdee + signedRate;

  const proteinG = input.protein_g_per_kg * input.weight_kg;

  // Fat has a floor as a share of calories so a low g/kg setting on a light
  // person can't drive dietary fat down to an unhealthy level.
  const fatFloorG = (MIN_FAT_CALORIE_SHARE * calorieTarget) / KCAL_PER_G.fat;
  const fatG = Math.max(input.fat_g_per_kg * input.weight_kg, fatFloorG);

  // Carbs absorb whatever calories protein and fat leave behind.
  const remaining = calorieTarget - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;
  const carbG = Math.max(0, remaining / KCAL_PER_G.carbs);

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    calorie_target: round(calorieTarget),
    protein_g_target: round(proteinG),
    fat_g_target: round(fatG),
    carb_g_target: round(carbG),
  };
}

/**
 * True when protein + fat alone already meet or exceed the calorie target,
 * which leaves no room for carbohydrate. Worth warning about in the UI.
 */
export function macrosOvershoot(targets: Targets): boolean {
  const fromProteinFat =
    targets.protein_g_target * KCAL_PER_G.protein + targets.fat_g_target * KCAL_PER_G.fat;
  return fromProteinFat >= targets.calorie_target;
}

function round(n: number): number {
  return Math.round(n);
}

export const DEFAULT_PROFILE_INPUT: ProfileInput = {
  sex: 'male',
  age: 30,
  height_cm: 180,
  weight_kg: 80,
  activity_level: 'moderate',
  goal: 'cut',
  rate_kcal_per_day: DEFAULT_RATE_KCAL,
  protein_g_per_kg: DEFAULT_PROTEIN_G_PER_KG,
  fat_g_per_kg: DEFAULT_FAT_G_PER_KG,
};
