import { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, Image, ActivityIndicator, ScrollView, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { useSettings } from '../state/SettingsContext';
import { theme } from '../lib/theme';
import { fmtDecimal } from '../lib/format';
import {
  describeOffError,
  fetchIngredientsByBarcode,
  type OffIngredient,
  type OffIngredientsProduct,
} from '../lib/off';
import { resolveIngredientNames, withTranslationFallback } from '../lib/ingredientsTranslation';
import { lookupIngredientInfo, type ConcernNote as ConcernNoteResult, type RiskTier } from '../lib/ingredientGlossary';
import { assessProductRisk, type Verdict } from '../lib/ingredientRisk';
import { describeAllergen } from '../lib/allergens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IngredientsReport'>;

type LoadState =
  | { phase: 'loading' }
  | { phase: 'not-found' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; product: OffIngredientsProduct };

export default function IngredientsReportScreen({ route, navigation }: Props) {
  const { barcode } = route.params;
  const { t } = useTranslation();
  const { language } = useSettings();
  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ phase: 'loading' });
      try {
        const product = await fetchIngredientsByBarcode(barcode, language);
        if (cancelled) return;
        if (!product) {
          setState({ phase: 'not-found' });
          return;
        }
        const translated = await withTranslationFallback(product, language);
        if (cancelled) return;
        const ingredients = await resolveIngredientNames(translated.ingredients, language);
        if (cancelled) return;
        setState({ phase: 'ready', product: { ...translated, ingredients } });
      } catch (err) {
        if (cancelled) return;
        setState({ phase: 'error', message: describeOffError(err) });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [barcode, language]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: state.phase === 'ready' ? state.product.name : t('ingredients.reportTitle'),
    });
  }, [navigation, state, t]);

  function retry() {
    setState({ phase: 'loading' });
    void fetchIngredientsByBarcode(barcode, language)
      .then(async (product) => {
        if (!product) {
          setState({ phase: 'not-found' });
          return;
        }
        const translated = await withTranslationFallback(product, language);
        const ingredients = await resolveIngredientNames(translated.ingredients, language);
        setState({ phase: 'ready', product: { ...translated, ingredients } });
      })
      .catch((err) => setState({ phase: 'error', message: describeOffError(err) }));
  }

  if (state.phase === 'loading') {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
          <Text className="mt-3 text-sm text-neutral-500">{t('ingredients.loading')}</Text>
        </View>
      </Screen>
    );
  }

  if (state.phase === 'not-found') {
    return (
      <Screen>
        <EmptyState
          icon="file-tray-outline"
          title={t('ingredients.notFoundTitle')}
          message={t('ingredients.notFoundMessage', { code: barcode })}
          actionLabel={t('ingredients.scanAnother')}
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  if (state.phase === 'error') {
    return (
      <Screen>
        <EmptyState
          icon="cloud-offline-outline"
          title={t('ingredients.lookupFailedTitle')}
          message={state.message}
          actionLabel={t('common.tryAgain')}
          onAction={retry}
        />
      </Screen>
    );
  }

  const { product } = state;
  const hasStructured = product.ingredients.length > 0;
  const hasAnyData = hasStructured || Boolean(product.ingredientsText);
  const assessment = assessProductRisk(
    product.ingredients,
    product.novaGroup,
    product.nutriscoreGrade,
    product.allergensTags,
    language
  );

  return (
    <Screen>
      <View className="flex-row items-center gap-3 rounded-2xl border border-ink-line bg-ink-soft p-3">
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
          <Text className="text-[15px] font-medium text-white" numberOfLines={1}>
            {product.name}
          </Text>
          {product.brand ? (
            <Text className="mt-0.5 text-xs text-neutral-500" numberOfLines={1}>
              {product.brand}
            </Text>
          ) : null}
        </View>
      </View>

      <ScoreHeader assessment={assessment} />

      {!hasAnyData ? (
        <EmptyState
          icon="list-outline"
          title={t('ingredients.noIngredientsTitle')}
          message={t('ingredients.noIngredientsMessage')}
        />
      ) : (
        <>
          {hasStructured ? (
            <>
              <Text className="px-1 text-xs leading-4 text-neutral-500">
                {t('ingredients.orderNote')}
              </Text>
              <IngredientList ingredients={product.ingredients} language={language} />
            </>
          ) : null}

          {product.ingredientsText ? (
            <Card title={hasStructured ? t('ingredients.rawTextTitle') : undefined}>
              <Text className="text-sm leading-5 text-neutral-300">{product.ingredientsText}</Text>
              {product.ingredientsTextTranslated ? (
                <Text className="mt-2 text-xs leading-4 text-neutral-500">
                  {t('ingredients.translatedNote')}
                </Text>
              ) : product.ingredientsTextLanguageGap ? (
                <Text className="mt-2 text-xs leading-4 text-neutral-500">
                  {t('ingredients.languageGapNote')}
                </Text>
              ) : null}
            </Card>
          ) : null}
        </>
      )}

      {product.allergensTags.length > 0 ? (
        <Card title={t('ingredients.allergensTitle')}>
          <View className="flex-row flex-wrap gap-2">
            {product.allergensTags.map((tag) => (
              <View key={tag} className="rounded-full bg-ink px-3 py-1.5">
                <Text className="text-xs font-medium text-white">{describeAllergen(tag, language)}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Text className="px-1 text-xs leading-4 text-neutral-500">{t('ingredients.disclaimer')}</Text>

      <Button label={t('ingredients.scanAnother')} variant="secondary" onPress={() => navigation.goBack()} />
    </Screen>
  );
}

const RISK_COLORS: Record<RiskTier | 'unrated', string> = {
  low: theme.accent,
  moderate: theme.carbs,
  high: theme.danger,
  unrated: theme.textFaint,
};

const VERDICT_COLORS: Record<Verdict, string> = {
  good: theme.accent,
  someConcerns: theme.carbs,
  manyConcerns: theme.danger,
  unrated: theme.textFaint,
};

function ScoreHeader({ assessment }: { assessment: { score: number | null; verdict: Verdict } }) {
  const { t } = useTranslation();
  const color = VERDICT_COLORS[assessment.verdict];
  const verdictLabel =
    assessment.verdict === 'good'
      ? t('ingredients.verdictGood')
      : assessment.verdict === 'someConcerns'
        ? t('ingredients.verdictSomeConcerns')
        : assessment.verdict === 'manyConcerns'
          ? t('ingredients.verdictManyConcerns')
          : t('ingredients.verdictUnrated');

  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-ink-line bg-ink-soft p-3.5">
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: `${color}22` }}
      >
        <Text className="text-lg font-bold" style={{ color }}>
          {assessment.score ?? '–'}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-xs uppercase tracking-wide text-neutral-500">{t('ingredients.scoreTitle')}</Text>
        <Text className="mt-0.5 text-[15px] font-semibold" style={{ color }}>
          {verdictLabel}
        </Text>
        {assessment.verdict === 'unrated' ? (
          <Text className="mt-0.5 text-xs leading-4 text-neutral-500">{t('ingredients.scoreUnratedNote')}</Text>
        ) : null}
      </View>
    </View>
  );
}

function RiskBadge({ tier }: { tier: RiskTier | 'unrated' }) {
  const { t } = useTranslation();
  const label =
    tier === 'low'
      ? t('ingredients.riskLow')
      : tier === 'moderate'
        ? t('ingredients.riskModerate')
        : tier === 'high'
          ? t('ingredients.riskHigh')
          : t('ingredients.riskUnrated');
  const color = RISK_COLORS[tier];

  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${color}22` }}
    >
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

const INITIAL_VISIBLE_COUNT = 5;

function IngredientList({
  ingredients,
  language,
}: {
  ingredients: OffIngredient[];
  language: 'en' | 'bg';
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? ingredients : ingredients.slice(0, INITIAL_VISIBLE_COUNT);
  const remaining = ingredients.length - visible.length;

  return (
    <View className="gap-2">
      {visible.map((ingredient) => (
        <IngredientRow
          key={`${ingredient.rank}-${ingredient.id ?? ingredient.text}`}
          ingredient={ingredient}
          language={language}
        />
      ))}
      {!expanded && remaining > 0 ? (
        <Button
          label={t('ingredients.showMore', { count: remaining })}
          variant="secondary"
          onPress={() => setExpanded(true)}
        />
      ) : null}
    </View>
  );
}

function IngredientRow({
  ingredient,
  language,
}: {
  ingredient: OffIngredient;
  language: 'en' | 'bg';
}) {
  const { t } = useTranslation();
  const percent = ingredient.percent ?? ingredient.percentEstimate;
  const percentLabel =
    percent === null
      ? null
      : ingredient.percent !== null
        ? t('ingredients.percentExact', { percent: fmtDecimal(percent, 1) })
        : t('ingredients.percentEstimated', { percent: fmtDecimal(percent, 1) });
  const info = lookupIngredientInfo(ingredient, language);

  return (
    <View className="flex-row items-start gap-3 rounded-2xl border border-ink-line bg-ink-soft p-3.5">
      <View className="h-6 w-6 items-center justify-center rounded-full bg-ink">
        <Text className="text-[11px] font-semibold text-neutral-400">{ingredient.rank + 1}</Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-start justify-between gap-2">
          <View className="flex-1 flex-row flex-wrap items-baseline gap-x-1.5">
            <Text className="text-[15px] font-medium text-white">{ingredient.displayName}</Text>
            {ingredient.displayNameIsFallback ? (
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {t('ingredients.nameFallbackTag')}
              </Text>
            ) : null}
          </View>
          {percentLabel ? (
            <Text className="text-xs text-neutral-500">{percentLabel}</Text>
          ) : null}
        </View>
        <View className="mt-1.5">
          <RiskBadge tier={info?.tier ?? 'unrated'} />
        </View>
        {info ? (
          <Text className="mt-1.5 text-xs leading-4 text-neutral-400">{info.description}</Text>
        ) : null}
        {info ? <ConcernNote concernNote={info.concernNote} /> : null}
        {ingredient.displayNameIsFallback ? (
          <Text className="mt-1.5 text-xs leading-4 text-neutral-500">
            {t('ingredients.nameFallbackNote')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The "why is this a concern" note for one additive, sourced from EFSA's
 * OpenFoodTox database — never shown for a non-additive ingredient
 * ('not-applicable'), and never invented when OpenFoodTox has no matching,
 * verifiable entry ('not-found' is shown honestly instead of a guess).
 */
function ConcernNote({ concernNote }: { concernNote: ConcernNoteResult }) {
  const { t } = useTranslation();
  const { language } = useSettings();

  if (concernNote.status === 'not-applicable') return null;

  if (concernNote.status === 'not-found') {
    return (
      <Text className="mt-1.5 text-xs italic leading-4 text-neutral-500">{t('ingredients.concernNotFound')}</Text>
    );
  }

  return (
    <View className="mt-1.5">
      <Text className="text-xs leading-4 text-neutral-400">{concernNote[language]}</Text>
      <Pressable onPress={() => void Linking.openURL(concernNote.sourceUrl)}>
        <Text className="mt-0.5 text-[11px] leading-4 text-neutral-500 underline">
          {t('ingredients.concernSourceLabel', { title: concernNote.sourceTitle, year: concernNote.year })}
        </Text>
      </Pressable>
    </View>
  );
}
