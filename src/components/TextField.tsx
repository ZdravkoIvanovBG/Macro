import { View, Text, TextInput } from 'react-native';

import { theme } from '../lib/theme';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  autoFocus?: boolean;
  className?: string;
}

export default function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  autoFocus,
  className,
}: TextFieldProps) {
  return (
    <View className={className}>
      <Text className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </Text>
      <View
        className={`h-12 justify-center rounded-xl border bg-ink px-3.5 ${
          error ? 'border-red-500/60' : 'border-ink-line'
        }`}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textFaint}
          selectionColor={theme.accent}
          autoFocus={autoFocus}
          autoCapitalize="sentences"
          className="text-base text-white"
          style={{ color: theme.text }}
        />
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-red-400">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-neutral-500">{hint}</Text>
      ) : null}
    </View>
  );
}
