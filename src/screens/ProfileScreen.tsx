import { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Segmented from '../components/Segmented';
import OptionList from '../components/OptionList';
import NumberField from '../components/NumberField';
import MacroChips from '../components/MacroChips';
import { useProfile } from '../state/ProfileContext';
import { theme } from '../lib/theme';
import { fmtDecimal, fmtInt, parseNumber } from '../lib/format';
import {
  ACTIVITY_LEVELS,
  DEFAULT_PROFILE_INPUT,
  GOALS,
  calcTargets,
  macrosOvershoot,
  maxRateKcal,
  weeklyWeightChangeKg,
} from '../lib/calc';
import type { ActivityLevel, Goal, ProfileInput, Sex } from '../lib/types';

interface Draft {
  sex: Sex;
  age: string;
  height_cm: string;
  weight_kg: string;
  activity_level: ActivityLevel;
  goal: Goal;
  rate_kcal_per_day: string;
  protein_g_per_kg: string;
  fat_g_per_kg: string;
}

const LIMITS = {
  age: { min: 14, max: 100, label: 'Age must be between 14 and 100.' },
  height_cm: { min: 120, max: 230, label: 'Height must be between 120 and 230 cm.' },
  weight_kg: { min: 30, max: 300, label: 'Weight must be between 30 and 300 kg.' },
  protein_g_per_kg: { min: 0.5, max: 4, label: 'Protein must be between 0.5 and 4 g/kg.' },
  fat_g_per_kg: { min: 0.2, max: 3, label: 'Fat must be between 0.2 and 3 g/kg.' },
} as const;

type NumericKey = keyof typeof LIMITS;

function toDraft(input: ProfileInput): Draft {
  return {
    sex: input.sex,
    age: String(input.age),
    height_cm: fmtDecimal(input.height_cm, 1),
    weight_kg: fmtDecimal(input.weight_kg, 1),
    activity_level: input.activity_level,
    goal: input.goal,
    rate_kcal_per_day: String(Math.round(input.rate_kcal_per_day)),
    protein_g_per_kg: fmtDecimal(input.protein_g_per_kg, 2),
    fat_g_per_kg: fmtDecimal(input.fat_g_per_kg, 2),
  };
}

export default function ProfileScreen() {
  const { profile, loading, error, save } = useProfile();
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_PROFILE_INPUT));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Adopt the stored profile once it loads. Later edits stay local until saved.
  useEffect(() => {
    if (profile) setDraft(toDraft(profile));
  }, [profile]);

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<NumericKey, string>> = {};
    (Object.keys(LIMITS) as NumericKey[]).forEach((key) => {
      const value = parseNumber(draft[key]);
      if (value === null) {
        errors[key] = 'Required.';
      } else if (value < LIMITS[key].min || value > LIMITS[key].max) {
        errors[key] = LIMITS[key].label;
      }
    });
    return errors;
  }, [draft]);

  const isValid = Object.keys(fieldErrors).length === 0;

  const input = useMemo<ProfileInput | null>(() => {
    if (!isValid) return null;
    return {
      sex: draft.sex,
      age: parseNumber(draft.age)!,
      height_cm: parseNumber(draft.height_cm)!,
      weight_kg: parseNumber(draft.weight_kg)!,
      activity_level: draft.activity_level,
      goal: draft.goal,
      rate_kcal_per_day:
        draft.goal === 'maintain' ? 0 : (parseNumber(draft.rate_kcal_per_day) ?? 0),
      protein_g_per_kg: parseNumber(draft.protein_g_per_kg)!,
      fat_g_per_kg: parseNumber(draft.fat_g_per_kg)!,
    };
  }, [draft, isValid]);

  const targets = useMemo(() => (input ? calcTargets(input) : null), [input]);

  // The deficit ceiling that keeps the calorie target at or above BMR.
  const rateCap = useMemo(
    () => (targets && input ? maxRateKcal(input.goal, targets.tdee, targets.bmr) : 0),
    [targets, input]
  );
  const typedRate = parseNumber(draft.rate_kcal_per_day) ?? 0;
  const rateIsCapped = input !== null && draft.goal !== 'maintain' && typedRate > rateCap + 0.5;

  const overshoot = input && targets ? macrosOvershoot(input, targets) : false;

  const dirty = useMemo(() => {
    if (!profile) return true;
    const saved = toDraft(profile);
    return (Object.keys(saved) as (keyof Draft)[]).some((key) => saved[key] !== draft[key]);
  }, [profile, draft]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setJustSaved(false);
    setSaveError(null);
  }

  function onGoalChange(goal: Goal) {
    setDraft((prev) => ({
      ...prev,
      goal,
      // Coming back from Maintain, restore a usable default rather than 0.
      rate_kcal_per_day:
        goal === 'maintain'
          ? '0'
          : prev.rate_kcal_per_day === '0'
            ? String(DEFAULT_PROFILE_INPUT.rate_kcal_per_day)
            : prev.rate_kcal_per_day,
    }));
    setJustSaved(false);
  }

  async function onSave() {
    if (!input) return;
    setSaving(true);
    setSaveError(null);
    try {
      // calcTargets clamps too, but store the clamped rate so the form and the
      // saved targets agree the next time this screen loads.
      const clampedRate = Math.max(0, Math.min(input.rate_kcal_per_day, rateCap));
      await save({ ...input, rate_kcal_per_day: clampedRate });
      setJustSaved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your profile.';
      setSaveError(message);
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
          <Text className="mt-3 text-sm text-neutral-500">Loading your profile…</Text>
        </View>
      </Screen>
    );
  }

  const goalMeta = GOALS.find((g) => g.value === draft.goal)!;
  const effectiveRate = Math.max(0, Math.min(typedRate, rateCap));
  const weeklyChange = weeklyWeightChangeKg(effectiveRate);

  return (
    <Screen>
      {error ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
          <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
          <Text className="flex-1 text-sm text-red-300">{error}</Text>
        </View>
      ) : null}

      {!profile ? (
        <View className="flex-row items-start gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3">
          <Ionicons name="sparkles-outline" size={18} color={theme.accent} />
          <Text className="flex-1 text-sm leading-5 text-accent">
            Welcome. Fill in your details and save to start tracking against real targets.
          </Text>
        </View>
      ) : null}

      {/* Live preview — recomputes from the draft on every keystroke. */}
      <Card
        title="Daily targets"
        subtitle={
          targets
            ? `Mifflin-St Jeor - ${goalMeta.label.toLowerCase()}`
            : 'Fix the highlighted fields to see your targets'
        }
      >
        {targets ? (
          <View className="gap-3">
            <View className="flex-row items-end gap-2">
              <Text className="text-4xl font-bold text-accent">
                {fmtInt(targets.calorie_target)}
              </Text>
              <Text className="mb-1.5 text-sm text-neutral-500">kcal / day</Text>
            </View>

            <MacroChips
              protein={targets.protein_g_target}
              carbs={targets.carb_g_target}
              fat={targets.fat_g_target}
            />

            <View className="flex-row gap-2">
              <Stat label="BMR" value={`${fmtInt(targets.bmr)} kcal`} />
              <Stat label="TDEE" value={`${fmtInt(targets.tdee)} kcal`} />
              <Stat
                label={goalMeta.verb}
                value={
                  draft.goal === 'maintain'
                    ? 'None'
                    : `${draft.goal === 'cut' ? '-' : '+'}${fmtInt(effectiveRate)}`
                }
              />
            </View>

            {draft.goal !== 'maintain' && weeklyChange > 0 ? (
              <Text className="text-xs text-neutral-500">
                About {fmtDecimal(weeklyChange, 2)} kg/week{' '}
                {draft.goal === 'cut' ? 'loss' : 'gain'} at this rate.
              </Text>
            ) : null}

            {overshoot ? (
              <View className="flex-row items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                <Ionicons name="warning-outline" size={16} color="#fbbf24" />
                <Text className="flex-1 text-xs leading-4 text-amber-300">
                  Protein and fat already use your whole calorie target, leaving no carbs. Lower
                  one of them or raise your calories.
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text className="text-sm text-neutral-500">
            Enter valid values below and your targets will appear here.
          </Text>
        )}
      </Card>

      <Card title="About you">
        <View className="gap-4">
          <View>
            <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Sex
            </Text>
            <Segmented
              value={draft.sex}
              onChange={(value) => set('sex', value)}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
            <Text className="mt-1 text-xs text-neutral-500">
              Sets the Mifflin-St Jeor constant (+5 for male, -161 for female).
            </Text>
          </View>

          <View className="flex-row gap-3">
            <NumberField
              className="flex-1"
              label="Age"
              suffix="yrs"
              value={draft.age}
              onChangeText={(value) => set('age', value)}
              error={fieldErrors.age}
            />
            <NumberField
              className="flex-1"
              label="Height"
              suffix="cm"
              decimal
              value={draft.height_cm}
              onChangeText={(value) => set('height_cm', value)}
              error={fieldErrors.height_cm}
            />
          </View>

          <NumberField
            label="Weight"
            suffix="kg"
            decimal
            value={draft.weight_kg}
            onChangeText={(value) => set('weight_kg', value)}
            error={fieldErrors.weight_kg}
            hint="Protein and fat targets scale off this."
          />
        </View>
      </Card>

      <Card title="Activity level" subtitle="Multiplies your BMR to give TDEE.">
        <OptionList
          value={draft.activity_level}
          onChange={(value) => set('activity_level', value)}
          options={ACTIVITY_LEVELS.map((level) => ({
            value: level.value,
            label: `${level.label}  x${level.multiplier}`,
            hint: level.hint,
          }))}
        />
      </Card>

      <Card title="Goal">
        <View className="gap-4">
          <Segmented
            value={draft.goal}
            onChange={onGoalChange}
            options={GOALS.map((goal) => ({ value: goal.value, label: goal.label }))}
          />

          {draft.goal === 'maintain' ? (
            <Text className="text-sm text-neutral-500">Your target is your TDEE, unchanged.</Text>
          ) : (
            <>
              <NumberField
                label={`Daily ${goalMeta.verb.toLowerCase()}`}
                suffix="kcal"
                value={draft.rate_kcal_per_day}
                onChangeText={(value) => set('rate_kcal_per_day', value)}
                hint={
                  draft.goal === 'cut'
                    ? `Up to ${fmtInt(rateCap)} kcal - your target never drops below your BMR.`
                    : `Up to ${fmtInt(rateCap)} kcal.`
                }
                error={
                  rateIsCapped
                    ? `Capped at ${fmtInt(rateCap)} kcal. ${
                        draft.goal === 'cut'
                          ? 'A bigger deficit would push your target below your BMR.'
                          : 'Larger surpluses mostly add fat, not muscle.'
                      }`
                    : undefined
                }
              />
              <View className="flex-row gap-2">
                {[250, 500, 750].map((preset) => (
                  <PresetChip
                    key={preset}
                    kcal={preset}
                    active={typedRate === preset}
                    disabled={preset > rateCap}
                    onPress={() => set('rate_kcal_per_day', String(preset))}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </Card>

      <Card
        title="Macro preferences"
        subtitle="Carbs fill whatever calories protein and fat leave behind."
      >
        <View className="gap-4">
          <NumberField
            label="Protein"
            suffix="g / kg"
            decimal
            value={draft.protein_g_per_kg}
            onChangeText={(value) => set('protein_g_per_kg', value)}
            error={fieldErrors.protein_g_per_kg}
            hint={
              targets
                ? `${Math.round(targets.protein_g_target)} g/day - default 2.0 g/kg`
                : 'Default 2.0 g/kg'
            }
          />
          <NumberField
            label="Fat"
            suffix="g / kg"
            decimal
            value={draft.fat_g_per_kg}
            onChangeText={(value) => set('fat_g_per_kg', value)}
            error={fieldErrors.fat_g_per_kg}
            hint={
              targets
                ? `${Math.round(targets.fat_g_target)} g/day - floored at 20% of calories`
                : 'Default 0.8 g/kg, floored at 20% of calories'
            }
          />
        </View>
      </Card>

      {saveError ? <Text className="text-sm text-red-400">{saveError}</Text> : null}

      <Button
        label={profile ? (dirty ? 'Save changes' : justSaved ? 'Saved' : 'Saved') : 'Save profile'}
        onPress={onSave}
        loading={saving}
        disabled={!isValid || (Boolean(profile) && !dirty)}
      />
      {profile && dirty ? (
        <Text className="-mt-2 text-center text-xs text-amber-400">
          Unsaved changes - your log still uses the saved targets.
        </Text>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-xl bg-ink px-3 py-2.5">
      <Text className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</Text>
      <Text className="mt-0.5 text-sm font-semibold text-white">{value}</Text>
    </View>
  );
}

function PresetChip({
  kcal,
  active,
  disabled,
  onPress,
}: {
  kcal: number;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Text
      onPress={disabled ? undefined : onPress}
      className={`rounded-full border px-3 py-1.5 text-xs ${
        disabled
          ? 'border-ink-line text-neutral-700'
          : active
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-ink-line text-neutral-400'
      }`}
    >
      {kcal} kcal
    </Text>
  );
}
