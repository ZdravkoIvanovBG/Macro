import { View, Text } from 'react-native';
import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function Card({ title, subtitle, right, children, className }: CardProps) {
  const hasHeader = Boolean(title || subtitle || right);
  return (
    <View className={`rounded-2xl border border-ink-line bg-ink-soft p-4 ${className ?? ''}`}>
      {hasHeader ? (
        <View className="mb-3 flex-row items-start justify-between">
          <View className="flex-1 pr-2">
            {title ? (
              <Text className="text-base font-semibold text-white">{title}</Text>
            ) : null}
            {subtitle ? (
              <Text className="mt-0.5 text-xs leading-4 text-neutral-400">{subtitle}</Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}
