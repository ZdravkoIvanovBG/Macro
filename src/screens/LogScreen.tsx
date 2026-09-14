import { useCallback } from 'react';
import { View, Text, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import Card from '../components/Card';
import DayProgress from '../components/DayProgress';
import FoodEntryRow from '../components/FoodEntryRow';
import EmptyState from '../components/EmptyState';
import { useLog } from '../state/LogContext';
import { useProfile } from '../state/ProfileContext';
import { theme } from '../lib/theme';
import { addDays, formatDayLabel, formatLongDate, todayKey } from '../lib/date';
import type { FoodEntry } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function LogScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { date, setDate, entries, totals, loading, error, refresh, removeEntry } = useLog();
  const { profile } = useProfile();

  const today = todayKey();
  const isToday = date === today;

  const openEntry = useCallback(
    (entry: FoodEntry) => navigation.navigate('EntryForm', { date, entryId: entry.id }),
    [navigation, date]
  );

  const confirmDelete = useCallback(
    (entry: FoodEntry) => {
      Alert.alert(t('log.deleteTitle'), t('log.deleteMessage', { name: entry.name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeEntry(entry.id);
            } catch (err) {
              Alert.alert(
                t('log.deleteFailedTitle'),
                err instanceof Error ? err.message : t('log.deleteFailedDefault')
              );
            }
          },
        },
      ]);
    },
    [removeEntry, t]
  );

  const header = (
    <View className="gap-4 pb-4">
      {/* Day stepper — lets you fix yesterday without leaving the Log tab. */}
      <View className="flex-row items-center justify-between rounded-2xl border border-ink-line bg-ink-soft px-2 py-2">
        <StepButton icon="chevron-back" onPress={() => setDate(addDays(date, -1))} />
        <Pressable
          onPress={() => setDate(today)}
          disabled={isToday}
          className="flex-1 items-center active:opacity-70"
        >
          <Text className="text-base font-semibold text-white">{formatDayLabel(date)}</Text>
          <Text className="text-[11px] text-neutral-500">
            {isToday ? formatLongDate(date) : t('log.tapForToday', { date: formatLongDate(date) })}
          </Text>
        </Pressable>
        <StepButton
          icon="chevron-forward"
          disabled={isToday}
          onPress={() => setDate(addDays(date, 1))}
        />
      </View>

      {error ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
          <Text className="flex-1 text-sm text-red-300">{error}</Text>
        </View>
      ) : null}

      <Card>
        <DayProgress totals={totals} profile={profile} />
      </Card>

      {!profile ? (
        <Pressable
          onPress={() => navigation.navigate('Tabs', { screen: 'Profile' })}
          className="flex-row items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 active:opacity-70"
        >
          <Ionicons name="person-add-outline" size={18} color={theme.accent} />
          <Text className="flex-1 text-sm text-accent">{t('log.setupProfile')}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.accent} />
        </Pressable>
      ) : null}

      <View className="flex-row gap-2">
        <ActionTile
          icon="add-circle-outline"
          label={t('log.actionManual')}
          onPress={() => navigation.navigate('EntryForm', { date })}
        />
        <ActionTile
          icon="search-outline"
          label={t('log.actionSearch')}
          onPress={() => navigation.navigate('Tabs', { screen: 'Search' })}
        />
        <ActionTile
          icon="barcode-outline"
          label={t('log.actionScan')}
          onPress={() => navigation.navigate('Scan')}
        />
      </View>

      {entries.length > 0 ? (
        <Text className="px-1 text-xs uppercase tracking-wide text-neutral-500">
          {t('common.entryCount', { count: entries.length })}
        </Text>
      ) : null}
    </View>
  );

  if (loading && entries.length === 0) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={entries}
        keyExtractor={(entry) => String(entry.id)}
        contentContainerClassName="px-4 pb-28 pt-2"
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View className="h-2" />}
        renderItem={({ item }) => (
          <FoodEntryRow
            entry={item}
            onPress={() => openEntry(item)}
            onDelete={() => confirmDelete(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="restaurant-outline"
            title={isToday ? t('log.emptyTitleToday') : t('log.emptyTitleOther')}
            message={t('log.emptyMessage')}
            actionLabel={t('log.addFoodManually')}
            onAction={() => navigation.navigate('EntryForm', { date })}
          />
        }
        refreshing={loading}
        onRefresh={refresh}
      />
    </Screen>
  );
}

function StepButton({
  icon,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      className={`h-10 w-10 items-center justify-center rounded-xl ${
        disabled ? 'opacity-25' : 'active:bg-ink-line'
      }`}
    >
      <Ionicons name={icon} size={20} color={theme.textDim} />
    </Pressable>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-1 items-center gap-1.5 rounded-2xl border border-ink-line bg-ink-soft py-3.5 active:opacity-70"
    >
      <Ionicons name={icon} size={20} color={theme.accent} />
      <Text className="text-xs font-medium text-neutral-300">{label}</Text>
    </Pressable>
  );
}
