import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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

const UNITS = [
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'serving', label: 'serving' },
  { value: 'piece', label: 'piece' },
] as const;

type Unit = (typeof UNITS)[number]['value'];

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
    navigation.setOptions({ title: isEdit ? 'Edit entry' : 'Add food' });
  }, [navigation, isEdit]);

  // Seed the form: an existing entry in edit mode, otherwise the prefill.
  useEffect(() => {
    let cancelled = false;

    async function seed() {
      if (isEdit) {
        try {
          const entry = await getEntry(entryId!);
          if (cancelled) return;
          if (!entry) {
            Alert.alert('Entry not found', 'It may have been deleted already.');
            navigation.goBack();
            return;
          }
          setSource(entry.source);
          setBarcode(entry.barcode);
          setForm({
            name: entry.name,
            brand: entry.brand ?? '',
            quantity: fmtDecimal(entry.quantity, 2),
            unit: (UNITS.find((u) => u.value === entry.unit)?.value ?? 'g') as Unit,
            ...nutritionToForm(entry),
          });
        } catch (err) {
          if (!cancelled) {
            Alert.alert(
              'Could not open entry',
              err instanceof Error ? err.message : 'Unknown error.'
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
          unit: (UNITS.find((u) => u.value === prefill.unit)?.value ?? 'g') as Unit,
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
  }, [isEdit, entryId, prefill, navigation]);

  const quantity = parseNumber(form.quantity);
  const grams = quantity !== null ? gramsFor(quantity, form.unit, servingSizeG) : null;

  const errors = useMemo(() => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.name.trim() === '') next.name = 'Give this entry a name.';
    if (quantity === null || quantity <= 0) next.quantity = 'Enter a quantity above zero.';
    const calories = parseNumber(form.calories);
    if (calories === null) next.calories = 'Required.';
    else if (calories < 0) next.calories = 'Calories cannot be negative.';
    (['protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const).forEach((key) => {
      const value = parseNumber(form[key]);
      if (value !== null && value < 0) next[key] = 'Cannot be negative.';
    });
    return next;
  }, [form, quantity]);

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
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Could not save the entry.');
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    Alert.alert('Delete entry', `Remove "${form.name}" from your log?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeEntry(entryId!);
            navigation.goBack();
          } catch (err) {
            Alert.alert(
              'Delete failed',
              err instanceof Error ? err.message : 'Could not delete the entry.'
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
        Logging to {formatDayLabel(date)}
      </Text>

      {barcode ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-ink-line bg-ink-soft px-3 py-2.5">
          <Ionicons name="barcode-outline" size={16} color={theme.textFaint} />
          <Text className="text-xs text-neutral-400">Barcode {barcode}</Text>
        </View>
      ) : null}

      <Card title="Food">
        <View className="gap-4">
          <TextField
            label="Name"
            value={form.name}
            onChangeText={(value) => set('name', value)}
            placeholder="e.g. Greek yoghurt 2%"
            error={show('name')}
            autoFocus={!isEdit && (!prefill || prefill.name.trim() === '')}
          />
          <TextField
            label="Brand"
            value={form.brand}
            onChangeText={(value) => set('brand', value)}
            placeholder="Optional"
          />
        </View>
      </Card>

      <Card
        title="Amount"
        subtitle={
          per100
            ? linked
              ? 'Nutrition rescales automatically from this product per 100 g.'
              : 'Nutrition is manually overridden.'
            : undefined
        }
      >
        <View className="gap-4">
          <NumberField
            label="Quantity"
            decimal
            value={form.quantity}
            onChangeText={onQuantityChange}
            error={show('quantity')}
            hint={
              grams !== null && form.unit !== 'g' && form.unit !== 'ml'
                ? `About ${Math.round(grams)} g`
                : undefined
            }
          />
          <View>
            <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Unit
            </Text>
            <Segmented
              value={form.unit}
              onChange={onUnitChange}
              options={UNITS.map((unit) => ({ value: unit.value, label: unit.label }))}
            />
            {per100 && grams === null ? (
              <Text className="mt-1.5 text-xs text-amber-400">
                This product has no serving weight, so nutrition can&apos;t be rescaled for this
                unit. Enter the values by hand.
              </Text>
            ) : null}
          </View>
        </View>
      </Card>

      <Card
        title="Nutrition"
        subtitle={`For ${form.quantity || '0'} ${form.unit}`}
        right={
          per100 && !linked ? (
            <Pressable onPress={relink} hitSlop={8} className="active:opacity-60">
              <Text className="text-xs font-semibold text-accent">Recalculate</Text>
            </Pressable>
          ) : undefined
        }
      >
        <View className="gap-4">
          <NumberField
            label="Calories"
            suffix="kcal"
            decimal
            value={form.calories}
            onChangeText={(value) => setNutritionField('calories', value)}
            error={show('calories')}
          />
          <View className="flex-row gap-3">
            <NumberField
              className="flex-1"
              label="Protein"
              suffix="g"
              decimal
              value={form.protein_g}
              onChangeText={(value) => setNutritionField('protein_g', value)}
              error={show('protein_g')}
            />
            <NumberField
              className="flex-1"
              label="Carbs"
              suffix="g"
              decimal
              value={form.carbs_g}
              onChangeText={(value) => setNutritionField('carbs_g', value)}
              error={show('carbs_g')}
            />
          </View>
          <View className="flex-row gap-3">
            <NumberField
              className="flex-1"
              label="Fat"
              suffix="g"
              decimal
              value={form.fat_g}
              onChangeText={(value) => setNutritionField('fat_g', value)}
              error={show('fat_g')}
            />
            <NumberField
              className="flex-1"
              label="Fibre"
              suffix="g"
              decimal
              placeholder="Optional"
              value={form.fiber_g}
              onChangeText={(value) => setNutritionField('fiber_g', value)}
              error={show('fiber_g')}
            />
          </View>

          {per100 ? (
            <Text className="text-xs text-neutral-500">
              Per 100 g: {fmtInt(per100.calories)} kcal - {Math.round(per100.protein_g)}P -{' '}
              {Math.round(per100.carbs_g)}C - {Math.round(per100.fat_g)}F
            </Text>
          ) : null}
        </View>
      </Card>

      <Button
        label={isEdit ? 'Save changes' : 'Add to log'}
        onPress={onSave}
        loading={saving}
        disabled={submitted && !isValid}
      />

      {isEdit ? (
        <Button label="Delete entry" onPress={onDelete} variant="danger" />
      ) : null}
    </Screen>
  );
}
