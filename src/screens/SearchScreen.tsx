import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import { useLog } from '../state/LogContext';
import { listRecentFoods } from '../db/entries';
import { theme } from '../lib/theme';
import { fmtInt } from '../lib/format';
import { describeOffError, productToPrefill, searchFoods, type OffProduct } from '../lib/off';
import type { EntryPrefill, FoodEntry } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEBOUNCE_MS = 450;
const MIN_QUERY_LENGTH = 2;

export default function SearchScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { date, version } = useLog();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OffProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<FoodEntry[]>([]);

  const requestRef = useRef<AbortController | null>(null);
  /** Bumped to force a re-run of the same query on Retry. */
  const [attempt, setAttempt] = useState(0);

  // Recents double as the empty state, so keep them fresh after any log write.
  const loadRecents = useCallback(async () => {
    try {
      setRecents(await listRecentFoods(12));
    } catch {
      setRecents([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecents();
    }, [loadRecents, version])
  );

  useEffect(() => {
    const trimmed = query.trim();

    requestRef.current?.abort();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const result = await searchFoods(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        setResults(result.products);
        setTotal(result.total);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(describeOffError(err));
        setResults(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, attempt]);

  useEffect(() => () => requestRef.current?.abort(), []);

  function openProduct(product: OffProduct) {
    navigation.navigate('EntryForm', {
      date,
      prefill: productToPrefill(product, 'search'),
    });
  }

  function openRecent(entry: FoodEntry) {
    // Recents are logged amounts, not per-100 g bases, so pass them through as
    // absolute nutrition for the same quantity.
    const prefill: EntryPrefill = {
      name: entry.name,
      brand: entry.brand,
      source: entry.source,
      barcode: entry.barcode,
      quantity: entry.quantity,
      unit: entry.unit,
      per100: null,
      nutrition: {
        calories: entry.calories,
        protein_g: entry.protein_g,
        carbs_g: entry.carbs_g,
        fat_g: entry.fat_g,
        fiber_g: entry.fiber_g,
      },
      serving_size_g: null,
    };
    navigation.navigate('EntryForm', { date, prefill });
  }

  const trimmed = query.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;

  const searchBar = (
    <View className="gap-3 pb-3">
      <View className="h-12 flex-row items-center gap-2.5 rounded-xl border border-ink-line bg-ink-soft px-3.5">
        <Ionicons name="search" size={18} color={theme.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
          placeholderTextColor={theme.textFaint}
          selectionColor={theme.accent}
          autoCorrect={false}
          returnKeyType="search"
          className="flex-1 text-base"
          style={{ color: theme.text }}
        />
        {loading ? <ActivityIndicator size="small" color={theme.textFaint} /> : null}
        {query !== '' && !loading ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('search.clearLabel')}>
            <Ionicons name="close-circle" size={18} color={theme.textFaint} />
          </Pressable>
        ) : null}
      </View>

      {results && results.length > 0 ? (
        <Text className="px-1 text-xs text-neutral-500">
          {total > results.length
            ? t('search.resultsCountTotal', { shown: results.length, total: fmtInt(total) })
            : t('search.resultsCountShort', { shown: results.length })}
        </Text>
      ) : null}

      {!searching && recents.length > 0 ? (
        <Text className="px-1 text-xs uppercase tracking-wide text-neutral-500">
          {t('search.recentlyLogged')}
        </Text>
      ) : null}
    </View>
  );

  function body() {
    if (error) {
      return (
        <EmptyState
          icon="cloud-offline-outline"
          title={t('search.failedTitle')}
          message={error}
          actionLabel={t('common.tryAgain')}
          onAction={() => setAttempt((a) => a + 1)}
        />
      );
    }
    if (searching && loading && !results) {
      return (
        <View className="items-center py-12">
          <ActivityIndicator color={theme.accent} />
          <Text className="mt-3 text-sm text-neutral-500">{t('search.searching')}</Text>
        </View>
      );
    }
    if (searching && results && results.length === 0) {
      return (
        <EmptyState
          icon="file-tray-outline"
          title={t('search.noMatchesTitle')}
          message={t('search.noMatchesMessage', { query: trimmed })}
          actionLabel={t('search.addManually')}
          onAction={() => navigation.navigate('EntryForm', { date })}
        />
      );
    }
    if (!searching && recents.length === 0) {
      return (
        <EmptyState icon="search-outline" title={t('search.emptyTitle')} message={t('search.emptyMessage')} />
      );
    }
    return null;
  }

  return (
    <Screen scroll={false}>
      {searching ? (
        <FlatList
          data={results ?? []}
          keyExtractor={(product) => product.code}
          contentContainerClassName="px-4 pb-28 pt-2"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={searchBar}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={body()}
          renderItem={({ item }) => (
            <ProductRow product={item} onPress={() => openProduct(item)} />
          )}
        />
      ) : (
        <FlatList
          data={recents}
          keyExtractor={(entry) => String(entry.id)}
          contentContainerClassName="px-4 pb-28 pt-2"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={searchBar}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={body()}
          renderItem={({ item }) => <RecentRow entry={item} onPress={() => openRecent(item)} />}
        />
      )}
    </Screen>
  );
}

function ProductRow({ product, onPress }: { product: OffProduct; onPress: () => void }) {
  const { t } = useTranslation();
  const per100 = product.per100;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-2xl border border-ink-line bg-ink-soft p-3 active:opacity-70"
    >
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          className="h-12 w-12 rounded-lg bg-ink"
          resizeMode="contain"
        />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-lg bg-ink">
          <Ionicons name="nutrition-outline" size={18} color={theme.textFaint} />
        </View>
      )}

      <View className="flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="flex-1 text-[15px] font-medium text-white" numberOfLines={1}>
            {product.name}
          </Text>
          {product.local ? (
            <Text className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              BG
            </Text>
          ) : null}
        </View>
        {product.brand ? (
          <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={1}>
            {product.brand}
          </Text>
        ) : null}
        {per100 ? (
          <Text className="mt-1 text-[11px] text-neutral-400">
            {fmtInt(per100.calories)} {t('units.kcal')} · {Math.round(per100.protein_g)}
            {t('units.proteinShort')} {Math.round(per100.carbs_g)}
            {t('units.carbsShort')} {Math.round(per100.fat_g)}
            {t('units.fatShort')}
            <Text className="text-neutral-600"> {t('units.per100g')}</Text>
          </Text>
        ) : (
          <Text className="mt-1 text-[11px] text-amber-400">{t('search.noNutritionData')}</Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={theme.textFaint} />
    </Pressable>
  );
}

function RecentRow({ entry, onPress }: { entry: FoodEntry; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-2xl border border-ink-line bg-ink-soft p-3 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-ink">
        <Ionicons name="repeat-outline" size={16} color={theme.textFaint} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-medium text-white" numberOfLines={1}>
          {entry.name}
        </Text>
        <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={1}>
          {entry.brand ? `${entry.brand} - ` : ''}
          {t('search.recentSubtitle', {
            calories: fmtInt(entry.calories),
            quantity: entry.quantity,
            unit: entry.unit,
          })}
        </Text>
      </View>
      <Ionicons name="add-circle-outline" size={20} color={theme.accent} />
    </Pressable>
  );
}
