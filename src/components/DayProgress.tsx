import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  if (!profile) {
    return <Text className="text-sm leading-5 text-neutral-400">{t('dayProgress.setupProfile')}</Text>;
  }

  const remaining = profile.calorie_target - totals.calories;
  const over = remaining < 0;

  const macros = [
    {
      key: t('macro.protein'),
      value: totals.protein_g,
      target: profile.protein_g_target,
      color: theme.protein,
    },
    { key: t('macro.carbs'), value: totals.carbs_g, target: profile.carb_g_target, color: theme.carbs },
    { key: t('macro.fat'), value: totals.fat_g, target: profile.fat_g_target, color: theme.fat },
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
            <Text className="text-xs text-neutral-500">{over ? t('dayProgress.over') : t('dayProgress.left')}</Text>
          </View>
        </View>
      ) : null}

      <ProgressBar
        value={totals.calories}
        max={profile.calorie_target}
        color={theme.accent}
        height={10}
        label={compact ? t('common.calories') : undefined}
        detail={
          compact
            ? `${fmtInt(totals.calories)} / ${fmtInt(profile.calorie_target)} ${t('units.kcal')}`
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
          {t('dayProgress.fibreLogged', { grams: Math.round(totals.fiber_g) })}
        </Text>
      ) : null}
    </View>
  );
}
