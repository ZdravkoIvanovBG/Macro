import { View, Text, TextInput } from 'react-native';

import { theme } from '../lib/theme';

interface NumberFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  suffix?: string;
  hint?: string;
  placeholder?: string;
  /** Allow a decimal point. Integers-only fields get the plain number pad. */
  decimal?: boolean;
  error?: string;
  className?: string;
}

export default function NumberField({
  label,
  value,
  onChangeText,
  suffix,
  hint,
  placeholder,
  decimal = false,
  error,
  className,
}: NumberFieldProps) {
  return (
    <View className={className}>
      <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </Text>
      <View
        className={`h-12 flex-row items-center rounded-xl border bg-ink px-3.5 ${
          error ? 'border-red-500/60' : 'border-ink-line'
        }`}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textFaint}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          selectionColor={theme.accent}
          className="flex-1 text-base text-white"
          style={{ color: theme.text }}
        />
        {suffix ? <Text className="ml-2 text-sm text-neutral-500">{suffix}</Text> : null}
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-red-400">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-neutral-500">{hint}</Text>
      ) : null}
    </View>
  );
}
