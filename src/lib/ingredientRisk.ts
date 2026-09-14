/**
 * Composite safety score for the Ingredients report: combines the worst
 * risk tier among identified ingredients (primary factor) with the OFF
 * `nova_group` processing classification (secondary, heavily weighted
 * toward group 4), declared allergens (minor factor), and `nutriscore_grade`
 * (optional minor factor). This is a simplified, informational guide, not a
 * certified nutrition or medical assessment.
 */
import type { AppLanguage } from '../i18n';
import { lookupIngredientInfo, type RiskTier } from './ingredientGlossary';
import type { OffIngredient } from './off';

export type Verdict = 'good' | 'someConcerns' | 'manyConcerns' | 'unrated';

export interface RiskAssessment {
  /** Null only for the 'unrated' verdict — no usable signal was found at all. */
  score: number | null;
  verdict: Verdict;
}

const TIER_PENALTY: Record<RiskTier, number> = { low: 0, moderate: 25, high: 50 };
const NOVA_PENALTY: Record<number, number> = { 1: 0, 2: 5, 3: 15, 4: 35 };
const NUTRISCORE_ADJUSTMENT: Record<string, number> = { a: 5, b: 2, c: 0, d: -5, e: -10 };
/** Declared allergens are a minor signal, capped so they can't dominate the score. */
const ALLERGEN_PENALTY_PER_TAG = 2;
const ALLERGEN_PENALTY_CAP = 6;

function worstIdentifiedTier(ingredients: OffIngredient[], lang: AppLanguage): RiskTier | null {
  let worst: RiskTier | null = null;
  for (const ingredient of ingredients) {
    const info = lookupIngredientInfo(ingredient, lang);
    if (!info) continue;
    if (info.tier === 'high') return 'high';
    if (info.tier === 'moderate') worst = 'moderate';
    else if (worst === null) worst = 'low';
  }
  return worst;
}

/**
 * Scores from whatever of the three inputs is actually available — a
 * product with only a NOVA group, or only a couple of recognised
 * ingredients plus declared allergens, still gets a real score. Only when
 * none of the three are present at all does this fall back to 'unrated',
 * rather than collapsing to it just because some ingredients went
 * unrecognised.
 */
export function assessProductRisk(
  ingredients: OffIngredient[],
  novaGroup: number | null,
  nutriscoreGrade: string | null,
  allergensTags: string[],
  lang: AppLanguage
): RiskAssessment {
  const worstTier = worstIdentifiedTier(ingredients, lang);
  const hasAllergenData = allergensTags.length > 0;

  if (worstTier === null && novaGroup === null && !hasAllergenData) {
    return { score: null, verdict: 'unrated' };
  }

  let score = 100;
  if (worstTier !== null) score -= TIER_PENALTY[worstTier];
  if (novaGroup !== null) score -= NOVA_PENALTY[novaGroup] ?? 0;
  if (hasAllergenData) score -= Math.min(ALLERGEN_PENALTY_CAP, allergensTags.length * ALLERGEN_PENALTY_PER_TAG);
  if (nutriscoreGrade) score += NUTRISCORE_ADJUSTMENT[nutriscoreGrade.toLowerCase()] ?? 0;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const verdict: Verdict = score >= 80 ? 'good' : score >= 50 ? 'someConcerns' : 'manyConcerns';
  return { score, verdict };
}
