import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { theme } from '../lib/theme';
import { fmtInt, fmtQuantity } from '../lib/format';
import { formatTime } from '../lib/date';
import type { EntrySource, FoodEntry } from '../lib/types';

const SOURCE_ICON: Record<EntrySource, keyof typeof Ionicons.glyphMap> = {
  manual: 'create-outline',
  search: 'search-outline',
  barcode: 'barcode-outline',
};

interface FoodEntryRowProps {
  entry: FoodEntry;
  onPress: () => void;
  onDelete: () => void;
}

export default function FoodEntryRow({ entry, onPress, onDelete }: FoodEntryRowProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('foodEntryRow.editLabel', { name: entry.name })}
      className="flex-row items-center gap-3 rounded-2xl border border-ink-line bg-ink-soft p-3.5 active:opacity-70"
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-ink">
        <Ionicons name={SOURCE_ICON[entry.source]} size={16} color={theme.textFaint} />
      </View>

      <View className="flex-1">
        <Text className="text-[15px] font-medium text-white" numberOfLines={1}>
          {entry.name}
        </Text>
        <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={1}>
          {entry.brand ? `${entry.brand} - ` : ''}
          {fmtQuantity(entry.quantity, entry.unit)} - {formatTime(entry.logged_at)}
        </Text>
        <View className="mt-1.5 flex-row gap-2.5">
          <MacroTag value={entry.protein_g} suffix={t('units.proteinShort')} color={theme.protein} />
          <MacroTag value={entry.carbs_g} suffix={t('units.carbsShort')} color={theme.carbs} />
          <MacroTag value={entry.fat_g} suffix={t('units.fatShort')} color={theme.fat} />
        </View>
      </View>

      <View className="items-end gap-2">
        <Text className="text-[15px] font-semibold text-white">{fmtInt(entry.calories)}</Text>
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={t('foodEntryRow.deleteLabel', { name: entry.name })}
          hitSlop={10}
          className="active:opacity-60"
        >
          <Ionicons name="trash-outline" size={16} color={theme.textFaint} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function MacroTag({
  value,
  suffix,
  color,
}: {
  value: number;
  suffix: string;
  color: string;
}) {
  return (
    <Text className="text-[11px] text-neutral-400">
      <Text style={{ color }}>{suffix}</Text> {Math.round(value)}g
    </Text>
  );
}
