import { View, Text, Pressable } from 'react-native';

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** Stack vertically instead of side by side — for long labels. */
  vertical?: boolean;
}

export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  vertical = false,
}: SegmentedProps<T>) {
  return (
    <View
      className={`rounded-xl bg-ink p-1 ${vertical ? 'flex-col gap-1' : 'flex-row gap-1'}`}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`${vertical ? 'w-full' : 'flex-1'} items-center justify-center rounded-lg px-3 py-2.5 ${
              selected ? 'bg-ink-line' : 'active:bg-ink-line/40'
            }`}
          >
            <Text
              className={`text-[13px] ${
                selected ? 'font-semibold text-white' : 'text-neutral-400'
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
