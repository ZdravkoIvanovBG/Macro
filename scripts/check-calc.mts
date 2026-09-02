// Regression checks for the nutrition formulas in src/lib/calc.ts.
// Run with: npm run check:calc   (uses Node's built-in TypeScript stripping)
import {
  calcBmr, calcTdee, calcTargets, maxDeficitKcal, activityMultiplier,
} from '../src/lib/calc.ts';

let failures = 0;
function eq(label: string, actual: number, expected: number, tol = 0.51) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ~${expected}`);
}

// Mifflin-St Jeor, male: 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
eq('BMR male 80kg/180cm/30y', calcBmr({ sex: 'male', weight_kg: 80, height_cm: 180, age: 30 }), 1780);
// female: 800 + 1125 - 150 - 161 = 1614
eq('BMR female 80kg/180cm/30y', calcBmr({ sex: 'female', weight_kg: 80, height_cm: 180, age: 30 }), 1614);
// female 60kg/165cm/28y: 600 + 1031.25 - 140 - 161 = 1330.25
eq('BMR female 60kg/165cm/28y', calcBmr({ sex: 'female', weight_kg: 60, height_cm: 165, age: 28 }), 1330.25);

// Multipliers
eq('mult sedentary', activityMultiplier('sedentary'), 1.2, 0);
eq('mult light', activityMultiplier('light'), 1.375, 0);
eq('mult moderate', activityMultiplier('moderate'), 1.55, 0);
eq('mult active', activityMultiplier('active'), 1.725, 0);
eq('mult very_active', activityMultiplier('very_active'), 1.9, 0);

// TDEE 1780 * 1.55 = 2759
eq('TDEE moderate', calcTdee(1780, 'moderate'), 2759, 0.01);

// Full target set: male 80/180/30 moderate, cut 500
const t = calcTargets({
  sex: 'male', age: 30, height_cm: 180, weight_kg: 80,
  activity_level: 'moderate', goal: 'cut', rate_kcal_per_day: 500,
  protein_g_per_kg: 2.0, fat_g_per_kg: 0.8,
});
eq('cut bmr', t.bmr, 1780);
eq('cut tdee', t.tdee, 2759);
eq('cut calorie_target', t.calorie_target, 2259);       // 2759 - 500
eq('cut protein g', t.protein_g_target, 160);           // 2.0 * 80
eq('cut fat g', t.fat_g_target, 64);                    // 0.8*80=64 vs floor 0.2*2259/9=50.2 -> 64
// carbs = (2259 - 160*4 - 64*9)/4 = (2259 - 640 - 576)/4 = 1043/4 = 260.75
eq('cut carbs g', t.carb_g_target, 261);

// Deficit cap: target must never fall below BMR
eq('maxDeficit', maxDeficitKcal(2759, 1780), 979, 0.01);
const capped = calcTargets({
  sex: 'male', age: 30, height_cm: 180, weight_kg: 80,
  activity_level: 'moderate', goal: 'cut', rate_kcal_per_day: 5000,
  protein_g_per_kg: 2.0, fat_g_per_kg: 0.8,
});
eq('absurd deficit clamps to BMR', capped.calorie_target, 1780);

// Fat floor kicks in when g/kg is very low
const lowFat = calcTargets({
  sex: 'male', age: 30, height_cm: 180, weight_kg: 80,
  activity_level: 'moderate', goal: 'maintain', rate_kcal_per_day: 0,
  protein_g_per_kg: 2.0, fat_g_per_kg: 0.2,
});
// floor = 0.2 * 2759 / 9 = 61.3 ; user value 0.2*80 = 16 -> floor wins
eq('fat floor applied', lowFat.fat_g_target, 61);
eq('maintain target == tdee', lowFat.calorie_target, 2759);

// Bulk adds the surplus
const bulk = calcTargets({
  sex: 'female', age: 28, height_cm: 165, weight_kg: 60,
  activity_level: 'light', goal: 'bulk', rate_kcal_per_day: 300,
  protein_g_per_kg: 2.0, fat_g_per_kg: 0.8,
});
// bmr 1330.25 * 1.375 = 1828.59 ; +300 = 2128.59
eq('bulk calorie_target', bulk.calorie_target, 2129);

// Carbs never go negative
const overshoot = calcTargets({
  sex: 'male', age: 30, height_cm: 180, weight_kg: 80,
  activity_level: 'sedentary', goal: 'cut', rate_kcal_per_day: 400,
  protein_g_per_kg: 4, fat_g_per_kg: 3,
});
eq('carbs clamped at 0', Math.max(0, overshoot.carb_g_target), overshoot.carb_g_target, 0);
console.log(overshoot.carb_g_target >= 0 ? 'PASS  carbs non-negative' : 'FAIL  carbs negative');

console.log(failures === 0 ? '\nALL CALC CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
