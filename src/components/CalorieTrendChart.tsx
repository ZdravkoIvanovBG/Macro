import { View, Text } from 'react-native';

import { theme } from '../lib/theme';
import { fmtInt } from '../lib/format';
import { keyToDate } from '../lib/date';
import type { DayPoint } from '../lib/stats';

interface CalorieTrendChartProps {
  /** Oldest first. */
  points: ReadonlyArray<DayPoint>;
  calorieTarget: number | null;
  height?: number;
}

/**
 * A plain bar chart drawn with views — no chart library for one small figure.
 * Days with nothing logged are drawn as a faint stub so gaps stay visible
 * instead of reading as a zero-calorie day.
 */
export default function CalorieTrendChart({
  points,
  calorieTarget,
  height = 120,
}: CalorieTrendChartProps) {
  const values = points.map((p) => p.summary?.calories ?? 0);
  const peak = Math.max(...values, calorieTarget ?? 0, 1);
  // Headroom so a record day doesn't touch the top edge.
  const scaleMax = peak * 1.12;

  const targetRatio = calorieTarget !== null ? calorieTarget / scaleMax : null;
  // Label every Nth bar so a 30-day range doesn't turn into a smear.
  const labelEvery = points.length > 14 ? 7 : points.length > 7 ? 2 : 1;

  return (
    <View>
      <View style={{ height }} className="flex-row items-end gap-[3px]">
        {targetRatio !== null ? (
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 border-t border-dashed border-neutral-600"
            style={{ bottom: targetRatio * height }}
          />
        ) : null}

        {points.map((point) => {
          const calories = point.summary?.calories ?? 0;
          const logged = point.summary !== null && point.summary.entry_count > 0;
          const over = calorieTarget !== null && calories > calorieTarget;
          const barHeight = logged ? Math.max(3, (calories / scaleMax) * height) : 3;

          return (
            <View
              key={point.date}
              className="flex-1 justify-end"
              accessibilityLabel={`${point.date}: ${logged ? `${Math.round(calories)} kcal` : 'nothing logged'}`}
            >
              <View
                className="w-full rounded-sm"
                style={{
                  height: barHeight,
                  backgroundColor: !logged
                    ? theme.line
                    : over
                      ? theme.danger
                      : theme.accent,
                  opacity: logged ? 1 : 0.7,
                }}
              />
            </View>
          );
        })}
      </View>

      <View className="mt-1.5 flex-row gap-[3px]">
        {points.map((point, index) => (
          <View key={point.date} className="flex-1 items-center">
            {index % labelEvery === 0 ? (
              <Text className="text-[9px] text-neutral-600">
                {keyToDate(point.date).getDate()}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {calorieTarget !== null ? (
        <View className="mt-2 flex-row items-center gap-1.5">
          <View className="h-px w-4 border-t border-dashed border-neutral-600" />
          <Text className="text-[11px] text-neutral-500">
            Target {fmtInt(calorieTarget)} kcal
          </Text>
        </View>
      ) : null}
    </View>
  );
}
