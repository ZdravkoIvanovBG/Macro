import { addDays, daysBetween } from './date';
import type { DaySummary } from './types';

/** One calendar day in a range. `summary` is null when nothing was logged. */
export interface DayPoint {
  date: string;
  summary: DaySummary | null;
}

export interface RangeStats {
  /** Every day in the range, oldest first, including the empty ones. */
  points: DayPoint[];
  totalDays: number;
  loggedDays: number;
  /**
   * Averages are taken over logged days only. Including untracked days would
   * report a number the user never ate, which is worse than a smaller sample.
   */
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  /** Logged days whose calories landed within tolerance of the target. */
  daysOnTarget: number;
  /** Signed mean gap to the calorie target across logged days. */
  avgDeviation: number;
}

/** Fills a date range with one point per day, oldest first. */
export function buildDaySeries(
  summaries: ReadonlyArray<DaySummary>,
  fromDate: string,
  toDate: string
): DayPoint[] {
  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const span = daysBetween(fromDate, toDate);
  const points: DayPoint[] = [];
  for (let i = 0; i <= span; i += 1) {
    const date = addDays(fromDate, i);
    points.push({ date, summary: byDate.get(date) ?? null });
  }
  return points;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * @param calorieTarget the profile's target, or null when there is no profile
 * @param tolerance fraction of the target counted as "on target" either way
 */
export function summariseRange(
  points: ReadonlyArray<DayPoint>,
  calorieTarget: number | null,
  tolerance = 0.1
): RangeStats {
  const logged = points
    .map((p) => p.summary)
    .filter((s): s is DaySummary => s !== null && s.entry_count > 0);

  const band = calorieTarget !== null ? calorieTarget * tolerance : 0;
  const daysOnTarget =
    calorieTarget === null
      ? 0
      : logged.filter((s) => Math.abs(s.calories - calorieTarget) <= band).length;

  return {
    points: [...points],
    totalDays: points.length,
    loggedDays: logged.length,
    avgCalories: mean(logged.map((s) => s.calories)),
    avgProtein: mean(logged.map((s) => s.protein_g)),
    avgCarbs: mean(logged.map((s) => s.carbs_g)),
    avgFat: mean(logged.map((s) => s.fat_g)),
    daysOnTarget,
    avgDeviation:
      calorieTarget === null ? 0 : mean(logged.map((s) => s.calories - calorieTarget)),
  };
}

/**
 * Estimated weekly weight change implied by the average gap to TDEE, using the
 * conventional ~7700 kcal per kg. Null without a profile or without any data.
 */
export function projectedWeeklyChangeKg(
  stats: RangeStats,
  tdee: number | null
): number | null {
  if (tdee === null || stats.loggedDays === 0) return null;
  return ((stats.avgCalories - tdee) * 7) / 7700;
}
