import { Pressable, Text, ActivityIndicator, View } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-accent',
  secondary: 'bg-ink-line',
  danger: 'bg-red-500/15 border border-red-500/40',
  ghost: 'bg-transparent',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-ink',
  secondary: 'text-white',
  danger: 'text-red-400',
  ghost: 'text-neutral-300',
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  className,
}: ButtonProps) {
  const inert = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      disabled={inert}
      onPress={onPress}
      className={`h-12 flex-row items-center justify-center rounded-xl px-5 ${CONTAINER[variant]} ${
        inert ? 'opacity-40' : 'active:opacity-80'
      } ${className ?? ''}`}
    >
      {loading ? (
        <View className="mr-2">
          <ActivityIndicator size="small" color={variant === 'primary' ? '#0f1115' : '#f4f5f7'} />
        </View>
      ) : null}
      <Text className={`text-[15px] font-semibold ${LABEL[variant]}`}>{label}</Text>
    </Pressable>
  );
}
