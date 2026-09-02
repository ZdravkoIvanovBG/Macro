import type { ReactNode } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';

import { theme } from '../lib/theme';

interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView. Turn off for screens that own a FlatList. */
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}

export default function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  className,
}: ScreenProps) {
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName={`px-4 pb-28 pt-2 gap-4 ${className ?? ''}`}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textDim}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 ${className ?? ''}`}>{children}</View>
  );

  return (
    <View className="flex-1 bg-ink">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {body}
      </KeyboardAvoidingView>
    </View>
  );
}
