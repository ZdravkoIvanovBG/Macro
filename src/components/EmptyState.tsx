import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Button from './Button';
import { theme } from '../lib/theme';

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View className="items-center px-6 py-10">
      <View className="h-14 w-14 items-center justify-center rounded-2xl bg-ink-soft">
        <Ionicons name={icon} size={26} color={theme.textFaint} />
      </View>
      <Text className="mt-4 text-base font-semibold text-white">{title}</Text>
      <Text className="mt-1.5 text-center text-sm leading-5 text-neutral-500">{message}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" className="mt-5" />
      ) : null}
    </View>
  );
}
