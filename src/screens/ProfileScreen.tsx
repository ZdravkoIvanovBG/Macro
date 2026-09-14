import { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import Card from '../components/Card';
import Button from '../components/Button';
import Segmented from '../components/Segmented';
import OptionList from '../components/OptionList';
import NumberField from '../components/NumberField';
import MacroChips from '../components/MacroChips';
import { useProfile } from '../state/ProfileContext';
import { useSettings } from '../state/SettingsContext';
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
  age: { min: 14, max: 100 },
  height_cm: { min: 120, max: 230 },
  weight_kg: { min: 30, max: 300 },
  protein_g_per_kg: { min: 0.5, max: 4 },
  fat_g_per_kg: { min: 0.2, max: 3 },
} as const;

type NumericKey = keyof typeof LIMITS;

/** Autonyms — each language names itself, so this list never gets translated. */
const LANGUAGE_OPTIONS = [
  { value: 'en' as const, label: 'English' },
  { value: 'bg' as const, label: 'Български' },
];

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
  const { t } = useTranslation();
  const { profile, loading, error, save } = useProfile();
  const { language, setLanguage } = useSettings();
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_PROFILE_INPUT));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Adopt the stored profile once it loads. Later edits stay local until saved.
  useEffect(() => {
    if (profile) setDraft(toDraft(profile));
  }, [profile]);

  const fieldErrors = useMemo(() => {
    const errors: Partial<Record<NumericKey, string>> = {};
    (Object.keys(LIMITS) as NumericKey[]).forEach((key) => {
      const value = parseNumber(draft[key]);
      if (value === null) {
        errors[key] = t('common.required');
      } else if (value < LIMITS[key].min || value > LIMITS[key].max) {
        errors[key] = t(`profile.limits.${key}`, { min: LIMITS[key].min, max: LIMITS[key].max });
      }
    });
    return errors;
  }, [draft, t]);

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

  const overshoot = targets ? macrosOvershoot(targets) : false;

  const dirty = useMemo(() => {
    if (!profile) return true;
    const saved = toDraft(profile);
    return (Object.keys(saved) as (keyof Draft)[]).some((key) => saved[key] !== draft[key]);
  }, [profile, draft]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
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
    } catch (err) {
      const message = err instanceof Error ? err.message : t('profile.saveFailedDefault');
      setSaveError(message);
      Alert.alert(t('profile.saveFailedTitle'), message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
          <Text className="mt-3 text-sm text-neutral-500">{t('profile.loading')}</Text>
        </View>
      </Screen>
    );
  }

  const goalLabel = t(`goals.${draft.goal}.label`);
  const goalVerb = t(`goals.${draft.goal}.verb`);
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
          <Text className="flex-1 text-sm leading-5 text-accent">{t('profile.welcome')}</Text>
        </View>
      ) : null}

      {/* Live preview — recomputes from the draft on every keystroke. */}
      <Card
        title={t('profile.targetsTitle')}
        subtitle={
          targets
            ? t('profile.targetsSubtitleReady', { goal: goalLabel.toLowerCase() })
            : t('profile.targetsSubtitleInvalid')
        }
      >
        {targets ? (
          <View className="gap-3">
            <View className="flex-row items-end gap-2">
              <Text className="text-4xl font-bold text-accent">
                {fmtInt(targets.calorie_target)}
              </Text>
              <Text className="mb-1.5 text-sm text-neutral-500">{t('common.kcalPerDay')}</Text>
            </View>

            <MacroChips
              protein={targets.protein_g_target}
              carbs={targets.carb_g_target}
              fat={targets.fat_g_target}
            />

            <View className="flex-row gap-2">
              <Stat label={t('profile.bmr')} value={`${fmtInt(targets.bmr)} ${t('units.kcal')}`} />
              <Stat label={t('profile.tdee')} value={`${fmtInt(targets.tdee)} ${t('units.kcal')}`} />
              <Stat
                label={goalVerb}
                value={
                  draft.goal === 'maintain'
                    ? t('profile.none')
                    : `${draft.goal === 'cut' ? '-' : '+'}${fmtInt(effectiveRate)}`
                }
              />
            </View>

            {draft.goal !== 'maintain' && weeklyChange > 0 ? (
              <Text className="text-xs text-neutral-500">
                {t('profile.weeklyChange', {
                  value: fmtDecimal(weeklyChange, 2),
                  direction: t(draft.goal === 'cut' ? 'profile.loss' : 'profile.gain'),
                })}
              </Text>
            ) : null}

            {overshoot ? (
              <View className="flex-row items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5">
                <Ionicons name="warning-outline" size={16} color="#fbbf24" />
                <Text className="flex-1 text-xs leading-4 text-amber-300">
                  {t('profile.overshootWarning')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text className="text-sm text-neutral-500">{t('profile.targetsEmpty')}</Text>
        )}
      </Card>

      <Card title={t('profile.aboutYouTitle')}>
        <View className="gap-4">
          <View>
            <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
              {t('profile.sexLabel')}
            </Text>
            <Segmented
              value={draft.sex}
              onChange={(value) => set('sex', value)}
              options={[
                { value: 'male', label: t('profile.male') },
                { value: 'female', label: t('profile.female') },
              ]}
            />
            <Text className="mt-1 text-xs text-neutral-500">{t('profile.sexHint')}</Text>
          </View>

          <View className="flex-row gap-3">
            <NumberField
              className="flex-1"
              label={t('profile.ageLabel')}
              suffix={t('units.yrs')}
              value={draft.age}
              onChangeText={(value) => set('age', value)}
              error={fieldErrors.age}
            />
            <NumberField
              className="flex-1"
              label={t('profile.heightLabel')}
              suffix={t('units.cm')}
              decimal
              value={draft.height_cm}
              onChangeText={(value) => set('height_cm', value)}
              error={fieldErrors.height_cm}
            />
          </View>

          <NumberField
            label={t('profile.weightLabel')}
            suffix={t('units.kg')}
            decimal
            value={draft.weight_kg}
            onChangeText={(value) => set('weight_kg', value)}
            error={fieldErrors.weight_kg}
            hint={t('profile.weightHint')}
          />
        </View>
      </Card>

      <Card title={t('profile.activityTitle')} subtitle={t('profile.activitySubtitle')}>
        <OptionList
          value={draft.activity_level}
          onChange={(value) => set('activity_level', value)}
          options={ACTIVITY_LEVELS.map((level) => ({
            value: level.value,
            label: `${t(`activity.${level.value}.label`)}  x${level.multiplier}`,
            hint: t(`activity.${level.value}.hint`),
          }))}
        />
      </Card>

      <Card title={t('profile.goalTitle')}>
        <View className="gap-4">
          <Segmented
            value={draft.goal}
            onChange={onGoalChange}
            options={GOALS.map((goal) => ({ value: goal.value, label: t(`goals.${goal.value}.label`) }))}
          />

          {draft.goal === 'maintain' ? (
            <Text className="text-sm text-neutral-500">{t('profile.maintainNote')}</Text>
          ) : (
            <>
              <NumberField
                label={t('profile.dailyRate', { verb: goalVerb.toLowerCase() })}
                suffix={t('units.kcal')}
                value={draft.rate_kcal_per_day}
                onChangeText={(value) => set('rate_kcal_per_day', value)}
                hint={
                  draft.goal === 'cut'
                    ? t('profile.rateHintCut', { cap: fmtInt(rateCap) })
                    : t('profile.rateHintOther', { cap: fmtInt(rateCap) })
                }
                error={
                  rateIsCapped
                    ? draft.goal === 'cut'
                      ? t('profile.rateCappedCut', { cap: fmtInt(rateCap) })
                      : t('profile.rateCappedBulk', { cap: fmtInt(rateCap) })
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

      <Card title={t('profile.macrosTitle')} subtitle={t('profile.macrosSubtitle')}>
        <View className="gap-4">
          <NumberField
            label={t('profile.proteinLabel')}
            suffix={t('units.gPerKg')}
            decimal
            value={draft.protein_g_per_kg}
            onChangeText={(value) => set('protein_g_per_kg', value)}
            error={fieldErrors.protein_g_per_kg}
            hint={
              targets
                ? t('profile.proteinHintWithTarget', { grams: Math.round(targets.protein_g_target) })
                : t('profile.proteinHintDefault')
            }
          />
          <NumberField
            label={t('profile.fatLabel')}
            suffix={t('units.gPerKg')}
            decimal
            value={draft.fat_g_per_kg}
            onChangeText={(value) => set('fat_g_per_kg', value)}
            error={fieldErrors.fat_g_per_kg}
            hint={
              targets
                ? t('profile.fatHintWithTarget', { grams: Math.round(targets.fat_g_target) })
                : t('profile.fatHintDefault')
            }
          />
        </View>
      </Card>

      {/* Its own section (not folded into another card) so more settings can
          land here later without restructuring the screen. */}
      <Card title={t('settings.title')}>
        <View>
          <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {t('settings.languageLabel')}
          </Text>
          <Segmented value={language} onChange={(value) => void setLanguage(value)} options={LANGUAGE_OPTIONS} />
        </View>
      </Card>

      {saveError ? <Text className="text-sm text-red-400">{saveError}</Text> : null}

      <Button
        label={profile ? (dirty ? t('common.saveChanges') : t('common.saved')) : t('profile.saveProfile')}
        onPress={onSave}
        loading={saving}
        disabled={!isValid || (Boolean(profile) && !dirty)}
      />
      {profile && dirty ? (
        <Text className="-mt-2 text-center text-xs text-amber-400">{t('profile.unsavedNote')}</Text>
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
  const { t } = useTranslation();
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
      {t('common.kcalValue', { value: kcal })}
    </Text>
  );
}
