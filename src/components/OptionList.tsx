import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../lib/theme';

interface OptionListProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  onChange: (value: T) => void;
}

/** A vertical radio list — for options whose labels need a line of explanation. */
export default function OptionList<T extends string>({
  value,
  options,
  onChange,
}: OptionListProps<T>) {
  return (
    <View className="overflow-hidden rounded-xl border border-ink-line">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`flex-row items-center px-3.5 py-3 ${
              index > 0 ? 'border-t border-ink-line' : ''
            } ${selected ? 'bg-accent/10' : 'active:bg-ink-line/40'}`}
          >
            <View className="flex-1 pr-3">
              <Text
                className={`text-[15px] ${
                  selected ? 'font-semibold text-white' : 'text-neutral-300'
                }`}
              >
                {option.label}
              </Text>
              {option.hint ? (
                <Text className="mt-0.5 text-xs text-neutral-500">{option.hint}</Text>
              ) : null}
            </View>
            {selected ? (
              <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
            ) : (
              <View className="h-5 w-5 rounded-full border border-ink-line" />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
