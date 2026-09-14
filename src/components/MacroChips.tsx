import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { theme } from '../lib/theme';
import { fmtGrams } from '../lib/format';

interface MacroChipsProps {
  protein: number;
  carbs: number;
  fat: number;
  /** Optional second line per macro, e.g. the target it counts against. */
  proteinOf?: number;
  carbsOf?: number;
  fatOf?: number;
}

export default function MacroChips({
  protein,
  carbs,
  fat,
  proteinOf,
  carbsOf,
  fatOf,
}: MacroChipsProps) {
  const { t } = useTranslation();
  const items = [
    { label: t('macro.protein'), value: protein, of: proteinOf, color: theme.protein },
    { label: t('macro.carbs'), value: carbs, of: carbsOf, color: theme.carbs },
    { label: t('macro.fat'), value: fat, of: fatOf, color: theme.fat },
  ];

  return (
    <View className="flex-row gap-2">
      {items.map((item) => (
        <View key={item.label} className="flex-1 rounded-xl bg-ink px-3 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <View
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <Text className="text-[11px] uppercase tracking-wide text-neutral-500">
              {item.label}
            </Text>
          </View>
          <Text className="mt-1 text-base font-semibold text-white">
            {fmtGrams(item.value)}
          </Text>
          {item.of !== undefined ? (
            <Text className="text-[11px] text-neutral-500">
              {t('macroChips.of', { value: fmtGrams(item.of) })}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
