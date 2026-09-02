import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Screen from '../components/Screen';
import Card from '../components/Card';
import Segmented from '../components/Segmented';
import EmptyState from '../components/EmptyState';
import ProgressBar from '../components/ProgressBar';
import CalorieTrendChart from '../components/CalorieTrendChart';
import { listDaySummaries } from '../db/entries';
import { useLog } from '../state/LogContext';
import { useProfile } from '../state/ProfileContext';
import { theme } from '../lib/theme';
import { fmtDecimal, fmtInt } from '../lib/format';
import { addDays, formatDayLabel, todayKey } from '../lib/date';
import { buildDaySeries, projectedWeeklyChangeKg, summariseRange } from '../lib/stats';
import type { DayPoint } from '../lib/stats';
import type { DaySummary } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

type RangeValue = (typeof RANGES)[number]['value'];

export default function HistoryScreen() {
  const navigation = useNavigation<Nav>();
  const { profile } = useProfile();
  const { setDate, version } = useLog();

  const [range, setRange] = useState<RangeValue>('7');
  const [summaries, setSummaries] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);
  /** Only the very first load blanks the screen; later ones refresh in place. */
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = Number(range);
  const today = todayKey();
  const from = addDays(today, -(days - 1));

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummaries(await listDaySummaries(from, today));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your history.');
    } finally {
      setLoading(false);
      setSettled(true);
    }
  }, [from, today]);

  // Reload on focus and after any write elsewhere in the app.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, version])
  );

  const points = useMemo(() => buildDaySeries(summaries, from, today), [summaries, from, today]);
  const stats = useMemo(
    () => summariseRange(points, profile?.calorie_target ?? null),
    [points, profile]
  );
  const projected = projectedWeeklyChangeKg(stats, profile?.tdee ?? null);

  function openDay(date: string) {
    setDate(date);
    navigation.navigate('Tabs', { screen: 'Log' });
  }

  if (loading && !settled) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <Segmented
        value={range}
        onChange={(value) => {
          setLoading(true);
          setRange(value);
        }}
        options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
      />

      {error ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
          <Text className="flex-1 text-sm text-red-300">{error}</Text>
        </View>
      ) : null}

      {stats.loggedDays === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title="No history yet"
          message={`Nothing was logged in the last ${days} days. Once you log a few days, averages and trends show up here.`}
          actionLabel="Log something"
          onAction={() => navigation.navigate('EntryForm', { date: today })}
        />
      ) : (
        <>
          <Card
            title="Calories per day"
            subtitle={`${stats.loggedDays} of ${stats.totalDays} days logged`}
          >
            <CalorieTrendChart points={points} calorieTarget={profile?.calorie_target ?? null} />
          </Card>

          <Card
            title={`${days}-day average`}
            subtitle="Averaged over logged days only, so untracked days don't drag it down."
          >
            <View className="gap-4">
              <View className="flex-row items-end gap-2">
                <Text className="text-3xl font-bold text-white">
                  {fmtInt(stats.avgCalories)}
                </Text>
                <Text className="mb-1 text-sm text-neutral-500">kcal / day</Text>
              </View>

              {profile ? (
                <>
                  <ProgressBar
                    value={stats.avgCalories}
                    max={profile.calorie_target}
                    color={theme.accent}
                    height={10}
                    label="vs target"
                    detail={`${stats.avgDeviation >= 0 ? '+' : '-'}${fmtInt(
                      Math.abs(stats.avgDeviation)
                    )} kcal/day`}
                  />
                  <View className="gap-3">
                    <ProgressBar
                      value={stats.avgProtein}
                      max={profile.protein_g_target}
                      color={theme.protein}
                      label="Protein"
                      detail={`${Math.round(stats.avgProtein)} / ${Math.round(
                        profile.protein_g_target
                      )} g`}
                    />
                    <ProgressBar
                      value={stats.avgCarbs}
                      max={profile.carb_g_target}
                      color={theme.carbs}
                      label="Carbs"
                      detail={`${Math.round(stats.avgCarbs)} / ${Math.round(
                        profile.carb_g_target
                      )} g`}
                    />
                    <ProgressBar
                      value={stats.avgFat}
                      max={profile.fat_g_target}
                      color={theme.fat}
                      label="Fat"
                      detail={`${Math.round(stats.avgFat)} / ${Math.round(
                        profile.fat_g_target
                      )} g`}
                    />
                  </View>

                  <View className="flex-row gap-2">
                    <Stat
                      label="On target"
                      value={`${stats.daysOnTarget}/${stats.loggedDays}`}
                      hint="within 10%"
                    />
                    <Stat
                      label="Projected"
                      value={
                        projected === null
                          ? '—'
                          : `${projected >= 0 ? '+' : '-'}${fmtDecimal(
                              Math.abs(projected),
                              2
                            )} kg`
                      }
                      hint="per week"
                    />
                  </View>
                </>
              ) : (
                <Text className="text-sm leading-5 text-neutral-400">
                  Set up your profile to compare these averages with targets.
                </Text>
              )}
            </View>
          </Card>

          <Text className="px-1 text-xs uppercase tracking-wide text-neutral-500">Days</Text>

          <View className="gap-2">
            {[...points]
              .reverse()
              .filter((point) => point.summary !== null)
              .map((point) => (
                <DayRow
                  key={point.date}
                  point={point}
                  calorieTarget={profile?.calorie_target ?? null}
                  onPress={() => openDay(point.date)}
                />
              ))}
          </View>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View className="flex-1 rounded-xl bg-ink px-3 py-2.5">
      <Text className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</Text>
      <Text className="mt-0.5 text-base font-semibold text-white">{value}</Text>
      <Text className="text-[11px] text-neutral-600">{hint}</Text>
    </View>
  );
}

function DayRow({
  point,
  calorieTarget,
  onPress,
}: {
  point: DayPoint;
  calorieTarget: number | null;
  onPress: () => void;
}) {
  const summary = point.summary!;
  const diff = calorieTarget !== null ? summary.calories - calorieTarget : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="rounded-2xl border border-ink-line bg-ink-soft p-3.5 active:opacity-70"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-[15px] font-medium text-white">
            {formatDayLabel(point.date)}
          </Text>
          <Text className="mt-0.5 text-xs text-neutral-500">
            {summary.entry_count} {summary.entry_count === 1 ? 'entry' : 'entries'} ·{' '}
            {Math.round(summary.protein_g)}P {Math.round(summary.carbs_g)}C{' '}
            {Math.round(summary.fat_g)}F
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[15px] font-semibold text-white">
            {fmtInt(summary.calories)}
          </Text>
          {diff !== null ? (
            <Text className={`text-[11px] ${diff > 0 ? 'text-red-400' : 'text-accent'}`}>
              {diff >= 0 ? '+' : '-'}
              {fmtInt(Math.abs(diff))}
            </Text>
          ) : (
            <Text className="text-[11px] text-neutral-600">kcal</Text>
          )}
        </View>
      </View>

      {calorieTarget !== null ? (
        <View className="mt-2.5">
          <ProgressBar value={summary.calories} max={calorieTarget} color={theme.accent} height={5} />
        </View>
      ) : null}
    </Pressable>
  );
}
