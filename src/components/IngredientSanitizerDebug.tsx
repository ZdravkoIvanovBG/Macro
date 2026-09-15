import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';

import { theme } from '../lib/theme';
import type { IngredientClassification, IngredientDecision } from '../lib/ingredientSanitizer';

const CLASSIFICATION_COLORS: Record<IngredientClassification, string> = {
  VALID: theme.accent,
  UNCERTAIN: theme.carbs,
  OBVIOUS_NOISE: theme.danger,
};

/**
 * Development-only view of why each raw Open Food Facts ingredient row was
 * kept or removed. Mount it behind `__DEV__` only — its text is deliberately
 * untranslated debugging output, never meant for users.
 */
export default function IngredientSanitizerDebug({ decisions }: { decisions: IngredientDecision[] }) {
  const [open, setOpen] = useState(false);
  const removed = decisions.filter((d) => d.classification === 'OBVIOUS_NOISE').length;
  const uncertain = decisions.filter((d) => d.classification === 'UNCERTAIN').length;

  return (
    <View className="rounded-2xl border border-dashed border-ink-line p-3">
      <Pressable onPress={() => setOpen((value) => !value)}>
        <Text className="text-xs font-semibold text-neutral-400">
          [DEV] Ingredient sanitizer — {decisions.length} rows, {removed} removed, {uncertain} uncertain {open ? '▲' : '▼'}
        </Text>
      </Pressable>
      {open ? (
        <View className="mt-2 gap-2">
          {decisions.map((d) => (
            <View key={d.path} style={{ marginLeft: d.depth * 12 }}>
              <Text className="text-xs text-white">
                <Text style={{ color: CLASSIFICATION_COLORS[d.classification] }}>{d.classification}</Text> {d.path}{' '}
                {JSON.stringify(d.text)}
              </Text>
              <Text className="text-[11px] leading-4 text-neutral-500">
                {d.rule} · {d.action} · {d.id ?? 'no id'}
                {d.isInTaxonomy ? ' (taxonomy)' : ''} — {d.reason}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
