export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type Goal = 'cut' | 'maintain' | 'bulk';

export type EntrySource = 'manual' | 'search' | 'barcode';

/** The values the user actually controls. Everything else is derived. */
export interface ProfileInput {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  /**
   * Magnitude of the daily deficit (cut) or surplus (bulk) in kcal.
   * Always stored positive; `goal` decides the direction.
   */
  rate_kcal_per_day: number;
  protein_g_per_kg: number;
  fat_g_per_kg: number;
}

/** Derived from ProfileInput and cached on the profile row. */
export interface Targets {
  bmr: number;
  tdee: number;
  calorie_target: number;
  protein_g_target: number;
  fat_g_target: number;
  carb_g_target: number;
}

export type Profile = ProfileInput & Targets & { updated_at: string };

export interface FoodEntry {
  id: number;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** ISO timestamp of when it was logged. */
  logged_at: string;
  source: EntrySource;
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  barcode: string | null;
}

export type NewFoodEntry = Omit<FoodEntry, 'id' | 'logged_at'> & {
  logged_at?: string;
};

/** Aggregate of a day's entries. Derived by query, never stored. */
export interface DayTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export interface DaySummary extends DayTotals {
  date: string;
  entry_count: number;
}
