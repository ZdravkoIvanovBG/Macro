import { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Linking } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import EmptyState from '../components/EmptyState';
import BarcodeCameraView from '../components/BarcodeCameraView';
import { theme } from '../lib/theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The Ingredients tab. Camera-only — a successful scan hands the barcode
 * straight to the report screen, which owns the Open Food Facts lookup. This
 * screen never touches the log.
 */
export default function IngredientsScanScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [permission, requestPermission] = useCameraPermissions();
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      busy.current = false;
      return () => {
        busy.current = true;
      };
    }, [])
  );

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      const code = data.trim();
      if (busy.current || code === '') return;
      busy.current = true;
      navigation.navigate('IngredientsReport', { barcode: code });
    },
    [navigation]
  );

  if (!permission) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={theme.accent} />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <EmptyState
          icon="camera-outline"
          title={t('scan.permissionTitle')}
          message={
            permission.canAskAgain ? t('scan.permissionMessageAsk') : t('scan.permissionMessageDenied')
          }
          actionLabel={permission.canAskAgain ? t('scan.allowCamera') : t('scan.openSettings')}
          onAction={() => {
            if (permission.canAskAgain) void requestPermission();
            else void Linking.openSettings();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View className="flex-1 px-4 pb-24 pt-2">
        <BarcodeCameraView scanning onBarcodeScanned={onScanned} />
        <Text className="mt-4 text-center text-xs leading-5 text-neutral-500">
          {t('ingredients.instructions')}
        </Text>
      </View>
    </Screen>
  );
}
