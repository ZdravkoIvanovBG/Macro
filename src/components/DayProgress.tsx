import { View, Text } from 'react-native';

import ProgressBar from './ProgressBar';
import { theme } from '../lib/theme';
import { fmtInt } from '../lib/format';
import type { DayTotals, Profile } from '../lib/types';

interface DayProgressProps {
  totals: DayTotals;
  profile: Profile | null;
  /** Compact mode drops the headline number — for list rows in History. */
  compact?: boolean;
}

/** Today's intake against the saved targets. */
export default function DayProgress({ totals, profile, compact = false }: DayProgressProps) {
  if (!profile) {
    return (
      <Text className="text-sm leading-5 text-neutral-400">
        Set up your profile to see how today compares with your targets.
      </Text>
    );
  }

  const remaining = profile.calorie_target - totals.calories;
  const over = remaining < 0;

  const macros = [
    {
      key: 'Protein',
      value: totals.protein_g,
      target: profile.protein_g_target,
      color: theme.protein,
    },
    { key: 'Carbs', value: totals.carbs_g, target: profile.carb_g_target, color: theme.carbs },
    { key: 'Fat', value: totals.fat_g, target: profile.fat_g_target, color: theme.fat },
  ];

  return (
    <View className="gap-4">
      {!compact ? (
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-3xl font-bold text-white">
              {fmtInt(totals.calories)}
              <Text className="text-base font-normal text-neutral-500">
                {' '}
                / {fmtInt(profile.calorie_target)} kcal
              </Text>
            </Text>
          </View>
          <View className="items-end">
            <Text className={`text-xl font-semibold ${over ? 'text-red-400' : 'text-accent'}`}>
              {fmtInt(Math.abs(remaining))}
            </Text>
            <Text className="text-xs text-neutral-500">{over ? 'over' : 'left'}</Text>
          </View>
        </View>
      ) : null}

      <ProgressBar
        value={totals.calories}
        max={profile.calorie_target}
        color={theme.accent}
        height={10}
        label={compact ? 'Calories' : undefined}
        detail={
          compact
            ? `${fmtInt(totals.calories)} / ${fmtInt(profile.calorie_target)} kcal`
            : undefined
        }
      />

      <View className="gap-3">
        {macros.map((macro) => (
          <ProgressBar
            key={macro.key}
            value={macro.value}
            max={macro.target}
            color={macro.color}
            label={macro.key}
            detail={`${Math.round(macro.value)} / ${Math.round(macro.target)} g`}
          />
        ))}
      </View>

      {totals.fiber_g > 0 ? (
        <Text className="text-xs text-neutral-500">
          Fibre logged today: {Math.round(totals.fiber_g)} g
        </Text>
      ) : null}
    </View>
  );
}
