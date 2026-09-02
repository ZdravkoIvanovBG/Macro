// Checks the history aggregation in src/lib/stats.ts and the date helpers it
// builds on. Run with: npm run check:stats
import { buildDaySeries, projectedWeeklyChangeKg, summariseRange } from '../src/lib/stats.ts';
import { addDays, daysBetween, dateKey, formatDayLabel, keyToDate } from '../src/lib/date.ts';

let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function close(label: string, actual: number | null, expected: number, tol = 0.01) {
  check(label, actual !== null && Math.abs(actual - expected) <= tol, `got ${String(actual)}`);
}

// --- date helpers -----------------------------------------------------------
check('addDays forward', addDays('2026-09-02', 3) === '2026-09-05');
check('addDays backward', addDays('2026-09-02', -3) === '2026-08-30');
check('addDays across a month end', addDays('2026-08-31', 1) === '2026-09-01');
check('addDays across a year end', addDays('2026-12-31', 1) === '2027-01-01');
check('addDays across a leap day', addDays('2028-02-28', 1) === '2028-02-29');
check('daysBetween inclusive span', daysBetween('2026-09-01', '2026-09-07') === 6);
check('daysBetween same day', daysBetween('2026-09-02', '2026-09-02') === 0);
check('dateKey pads month and day', dateKey(new Date(2026, 0, 5)) === '2026-01-05');
check('keyToDate round-trips', dateKey(keyToDate('2026-09-02')) === '2026-09-02');
check('formatDayLabel today', formatDayLabel('2026-09-02', '2026-09-02') === 'Today');
check('formatDayLabel yesterday', formatDayLabel('2026-09-01', '2026-09-02') === 'Yesterday');
check(
  'formatDayLabel older day',
  formatDayLabel('2026-08-30', '2026-09-02') === 'Sun 30 Aug',
  formatDayLabel('2026-08-30', '2026-09-02')
);

// A DST boundary must not shift a day key (these are local calendar dates).
check('addDays over a DST change', addDays('2026-03-28', 1) === '2026-03-29');
check('addDays over the autumn DST change', addDays('2026-10-24', 1) === '2026-10-25');

// --- series building --------------------------------------------------------
const summary = (date: string, calories: number, entry_count = 2) => ({
  date,
  entry_count,
  calories,
  protein_g: calories / 20,
  carbs_g: calories / 10,
  fat_g: calories / 40,
  fiber_g: 5,
});

const rows = [summary('2026-09-02', 2000), summary('2026-08-31', 2400)];
const points = buildDaySeries(rows, '2026-08-30', '2026-09-02');

check('series covers every day in the range', points.length === 4, String(points.length));
check('series is oldest first', points[0].date === '2026-08-30' && points[3].date === '2026-09-02');
check('missing days are null, not zero', points[0].summary === null);
check('present days are attached', points[3].summary?.calories === 2000);
check('order of input rows does not matter', points[1].summary?.calories === 2400);
check('single-day range works', buildDaySeries(rows, '2026-09-02', '2026-09-02').length === 1);
check('empty input still fills the range', buildDaySeries([], '2026-09-01', '2026-09-03').length === 3);

// --- summarising ------------------------------------------------------------
const stats = summariseRange(points, 2200);
check('total days counts the whole range', stats.totalDays === 4);
check('logged days counts only days with entries', stats.loggedDays === 2);
// The key behaviour: 2000 and 2400 average to 2200, NOT (2000+2400)/4 = 1100.
close('average ignores untracked days', stats.avgCalories, 2200);
close('average protein', stats.avgProtein, (2000 / 20 + 2400 / 20) / 2);
close('average deviation from target', stats.avgDeviation, 0);
check('both days land within 10% of target', stats.daysOnTarget === 2);

const tight = summariseRange(points, 1800);
check('days outside tolerance are not counted', tight.daysOnTarget === 0, String(tight.daysOnTarget));
close('deviation is signed', tight.avgDeviation, 400);

// A day row with zero entries must not count as a logged day.
const withEmptyRow = buildDaySeries([summary('2026-09-02', 0, 0)], '2026-09-01', '2026-09-02');
check('zero-entry day is not counted as logged', summariseRange(withEmptyRow, 2000).loggedDays === 0);

const noProfile = summariseRange(points, null);
check('no target yields no on-target count', noProfile.daysOnTarget === 0);
close('no target yields zero deviation', noProfile.avgDeviation, 0);
close('averages still work without a target', noProfile.avgCalories, 2200);

const empty = summariseRange(buildDaySeries([], '2026-09-01', '2026-09-07'), 2200);
check('empty range reports 7 days', empty.totalDays === 7);
check('empty range reports 0 logged', empty.loggedDays === 0);
close('empty range averages to 0, not NaN', empty.avgCalories, 0);

// --- projection -------------------------------------------------------------
// Eating 2200 against a 2700 TDEE is -500/day => -3500/week => -0.4545 kg.
close('projected loss from a deficit', projectedWeeklyChangeKg(stats, 2700), (-500 * 7) / 7700);
close('projected gain from a surplus', projectedWeeklyChangeKg(stats, 1900), (300 * 7) / 7700);
check('no TDEE yields no projection', projectedWeeklyChangeKg(stats, null) === null);
check('no logged days yields no projection', projectedWeeklyChangeKg(empty, 2700) === null);

console.log(failures === 0 ? '\nALL STATS CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
