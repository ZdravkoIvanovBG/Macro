import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Segmented from '../components/Segmented';
import NumberField from '../components/NumberField';
import TextField from '../components/TextField';
import { getEntry } from '../db/entries';
import { useLog } from '../state/LogContext';
import { theme } from '../lib/theme';
import { fmtDecimal, fmtInt, parseNumber } from '../lib/format';
import { formatDayLabel } from '../lib/date';
import type { EntrySource, Nutrition, NewFoodEntry } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EntryForm'>;

const UNITS = ['g', 'ml', 'serving', 'piece'] as const;

type Unit = (typeof UNITS)[number];

interface FormState {
  name: string;
  brand: string;
  quantity: string;
  unit: Unit;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fiber_g: string;
}

const BLANK: FormState = {
  name: '',
  brand: '',
  quantity: '100',
  unit: 'g',
  calories: '',
  protein_g: '',
  carbs_g: '',
  fat_g: '',
  fiber_g: '',
};

/** How many grams the quantity represents, or null when it can't be known. */
function gramsFor(quantity: number, unit: Unit, servingSizeG: number | null): number | null {
  if (unit === 'g' || unit === 'ml') return quantity;
  if (servingSizeG && servingSizeG > 0) return quantity * servingSizeG;
  return null;
}

function scale(per100: Nutrition, grams: number): Nutrition {
  const factor = grams / 100;
  return {
    calories: per100.calories * factor,
    protein_g: per100.protein_g * factor,
    carbs_g: per100.carbs_g * factor,
    fat_g: per100.fat_g * factor,
    fiber_g: per100.fiber_g === null ? null : per100.fiber_g * factor,
  };
}

function nutritionToForm(n: Nutrition): Pick<
  FormState,
  'calories' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'
> {
  return {
    calories: fmtDecimal(n.calories, 1),
    protein_g: fmtDecimal(n.protein_g, 1),
    carbs_g: fmtDecimal(n.carbs_g, 1),
    fat_g: fmtDecimal(n.fat_g, 1),
    fiber_g: n.fiber_g === null ? '' : fmtDecimal(n.fiber_g, 1),
  };
}

export default function EntryFormScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { date, entryId, prefill } = route.params;
  const isEdit = entryId !== undefined;
  const { addEntry, editEntry, removeEntry } = useLog();

  const [form, setForm] = useState<FormState>(BLANK);
  const [source, setSource] = useState<EntrySource>(prefill?.source ?? 'manual');
  const [barcode, setBarcode] = useState<string | null>(prefill?.barcode ?? null);
  const [per100, setPer100] = useState<Nutrition | null>(prefill?.per100 ?? null);
  const [servingSizeG, setServingSizeG] = useState<number | null>(
    prefill?.serving_size_g ?? null
  );
  /** While linked, nutrition follows the per-100g basis as the quantity changes. */
  const [linked, setLinked] = useState<boolean>(Boolean(prefill?.per100));
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? t('entryForm.titleEdit') : t('entryForm.titleAdd') });
  }, [navigation, isEdit, t]);

  // Seed the form: an existing entry in edit mode, otherwise the prefill.
  useEffect(() => {
    let cancelled = false;

    async function seed() {
      if (isEdit) {
        try {
          const entry = await getEntry(entryId!);
          if (cancelled) return;
          if (!entry) {
            Alert.alert(t('entryForm.notFoundTitle'), t('entryForm.notFoundMessage'));
            navigation.goBack();
            return;
          }
          setSource(entry.source);
          setBarcode(entry.barcode);
          setForm({
            name: entry.name,
            brand: entry.brand ?? '',
            quantity: fmtDecimal(entry.quantity, 2),
            unit: (UNITS.find((u) => u === entry.unit) ?? 'g') as Unit,
            ...nutritionToForm(entry),
          });
        } catch (err) {
          if (!cancelled) {
            Alert.alert(
              t('entryForm.openFailedTitle'),
              err instanceof Error ? err.message : t('common.unknownError')
            );
            navigation.goBack();
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (prefill) {
        const quantity = prefill.quantity;
        const grams = gramsFor(quantity, prefill.unit as Unit, prefill.serving_size_g);
        const nutrition =
          prefill.per100 && grams !== null
            ? scale(prefill.per100, grams)
            : (prefill.nutrition ?? null);
        setForm({
          name: prefill.name,
          brand: prefill.brand ?? '',
          quantity: fmtDecimal(quantity, 2),
          unit: (UNITS.find((u) => u === prefill.unit) ?? 'g') as Unit,
          ...(nutrition
            ? nutritionToForm(nutrition)
            : { calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' }),
        });
        setPer100(prefill.per100);
        setServingSizeG(prefill.serving_size_g);
        setLinked(Boolean(prefill.per100));
      }
    }

    void seed();
    return () => {
      cancelled = true;
    };
  }, [isEdit, entryId, prefill, navigation, t]);

  const quantity = parseNumber(form.quantity);
  const grams = quantity !== null ? gramsFor(quantity, form.unit, servingSizeG) : null;

  const errors = useMemo(() => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim() === '') next.name = t('entryForm.errors.name');
    if (quantity === null || quantity <= 0) next.quantity = t('entryForm.errors.quantity');
    const calories = parseNumber(form.calories);
    if (calories === null) next.calories = t('common.required');
    else if (calories < 0) next.calories = t('entryForm.errors.caloriesNegative');
    (['protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const).forEach((key) => {
      const value = parseNumber(form[key]);
      if (value !== null && value < 0) next[key] = t('common.cannotBeNegative');
    });
    return next;
  }, [form, quantity, t]);

  const isValid = Object.keys(errors).length === 0;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /** Editing nutrition by hand detaches the entry from the per-100g basis. */
  function setNutritionField(key: keyof FormState, value: string) {
    setLinked(false);
    set(key, value);
  }

  function applyBasis(nextQuantity: string, nextUnit: Unit) {
    const qty = parseNumber(nextQuantity);
    if (!per100 || !linked || qty === null || qty <= 0) return;
    const g = gramsFor(qty, nextUnit, servingSizeG);
    if (g === null) return;
    setForm((prev) => ({ ...prev, ...nutritionToForm(scale(per100, g)) }));
  }

  function onQuantityChange(value: string) {
    set('quantity', value);
    applyBasis(value, form.unit);
  }

  function onUnitChange(unit: Unit) {
    set('unit', unit);
    applyBasis(form.quantity, unit);
  }

  function relink() {
    if (!per100 || quantity === null || grams === null) return;
    setLinked(true);
    setForm((prev) => ({ ...prev, ...nutritionToForm(scale(per100, grams)) }));
  }

  async function onSave() {
    setSubmitted(true);
    if (!isValid || quantity === null) return;
    setSaving(true);
    try {
      const entry: NewFoodEntry = {
        date,
        source,
        name: form.name.trim(),
        brand: form.brand.trim() === '' ? null : form.brand.trim(),
        quantity,
        unit: form.unit,
        calories: parseNumber(form.calories) ?? 0,
        protein_g: parseNumber(form.protein_g) ?? 0,
        carbs_g: parseNumber(form.carbs_g) ?? 0,
        fat_g: parseNumber(form.fat_g) ?? 0,
        fiber_g: parseNumber(form.fiber_g),
        barcode,
      };
      if (isEdit) await editEntry(entryId!, entry);
      else await addEntry(entry);
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        t('entryForm.saveFailedTitle'),
        err instanceof Error ? err.message : t('entryForm.saveFailedDefault')
      );
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    Alert.alert(t('log.deleteTitle'), t('log.deleteMessage', { name: form.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeEntry(entryId!);
            navigation.goBack();
          } catch (err) {
            Alert.alert(
              t('log.deleteFailedTitle'),
              err instanceof Error ? err.message : t('log.deleteFailedDefault')
            );
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      </Screen>
    );
  }

  const show = (key: keyof FormState) => (submitted ? errors[key] : undefined);

  return (
    <Screen>
      <Text className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        {t('entryForm.loggingTo', { date: formatDayLabel(date) })}
      </Text>

      {barcode ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-ink-line bg-ink-soft px-3 py-2.5">
          <Ionicons name="barcode-outline" size={16} color={theme.textFaint} />
          <Text className="text-xs text-neutral-400">{t('entryForm.barcodeLabel', { code: barcode })}</Text>
        </View>
      ) : null}

      <Card title={t('entryForm.foodTitle')}>
        <View className="gap-4">
          <TextField
            label={t('entryForm.nameLabel')}
            value={form.name}
            onChangeText={(value) => set('name', value)}
            placeholder={t('entryForm.namePlaceholder')}
            error={show('name')}
            autoFocus={!isEdit && (!prefill || prefill.name.trim() === '')}
          />
          <TextField
            label={t('entryForm.brandLabel')}
            value={form.brand}
            onChangeText={(value) => set('brand', value)}
            placeholder={t('common.optional')}
          />
        </View>
      </Card>

      <Card
        title={t('entryForm.amountTitle')}
        subtitle={
          per100
            ? linked
              ? t('entryForm.rescalesAuto')
              : t('entryForm.manuallyOverridden')
            : undefined
        }
      >
        <View className="gap-4">
          <NumberField
            label={t('entryForm.quantityLabel')}
            decimal
            value={form.quantity}
            onChangeText={onQuantityChange}
            error={show('quantity')}
            hint={
              grams !== null && form.unit !== 'g' && form.unit !== 'ml'
                ? t('entryForm.aboutGrams', { grams: Math.round(grams) })
                : undefined
            }
          />
          <View>
            <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
              {t('entryForm.unitLabel')}
            </Text>
            <Segmented
              value={form.unit}
              onChange={onUnitChange}
              options={UNITS.map((unit) => ({ value: unit, label: t(`units.${unit}`) }))}
            />
            {per100 && grams === null ? (
              <Text className="mt-1.5 text-xs text-amber-400">{t('entryForm.noServingWeight')}</Text>
            ) : null}
          </View>
        </View>
      </Card>

      <Card
        title={t('entryForm.nutritionTitle')}
        subtitle={t('entryForm.forQuantity', { quantity: form.quantity || '0', unit: t(`units.${form.unit}`) })}
        right={
          per100 && !linked ? (
            <Pressable onPress={relink} hitSlop={8} className="active:opacity-60">
              <Text className="text-xs font-semibold text-accent">{t('entryForm.recalculate')}</Text>
            </Pressable>
          ) : undefined
        }
      >
        <View className="gap-4">
          <NumberField
            label={t('entryForm.caloriesLabel')}
            suffix={t('units.kcal')}
            decimal
            value={form.calories}
            onChangeText={(value) => setNutritionField('calories', value)}
            error={show('calories')}
          />
          <View className="flex-row gap-3">
            <NumberField
              className="flex-1"
              label={t('macro.protein')}
              suffix={t('units.g')}
              decimal
              value={form.protein_g}
              onChangeText={(value) => setNutritionField('protein_g', value)}
              error={show('protein_g')}
            />
            <NumberField
              className="flex-1"
              label={t('macro.carbs')}
              suffix={t('units.g')}
              decimal
              value={form.carbs_g}
              onChangeText={(value) => setNutritionField('carbs_g', value)}
              error={show('carbs_g')}
            />
          </View>
          <View className="flex-row gap-3">
            <NumberField
              className="flex-1"
              label={t('macro.fat')}
              suffix={t('units.g')}
              decimal
              value={form.fat_g}
              onChangeText={(value) => setNutritionField('fat_g', value)}
              error={show('fat_g')}
            />
            <NumberField
              className="flex-1"
              label={t('entryForm.fibreLabel')}
              suffix={t('units.g')}
              decimal
              placeholder={t('common.optional')}
              value={form.fiber_g}
              onChangeText={(value) => setNutritionField('fiber_g', value)}
              error={show('fiber_g')}
            />
          </View>

          {per100 ? (
            <Text className="text-xs text-neutral-500">
              {t('entryForm.per100Summary', {
                calories: fmtInt(per100.calories),
                protein: Math.round(per100.protein_g),
                carbs: Math.round(per100.carbs_g),
                fat: Math.round(per100.fat_g),
              })}
            </Text>
          ) : null}
        </View>
      </Card>

      <Button
        label={isEdit ? t('common.saveChanges') : t('entryForm.addToLog')}
        onPress={onSave}
        loading={saving}
        disabled={submitted && !isValid}
      />

      {isEdit ? <Button label={t('entryForm.deleteEntry')} onPress={onDelete} variant="danger" /> : null}
    </Screen>
  );
}
