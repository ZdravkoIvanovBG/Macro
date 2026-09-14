import { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import Screen from '../components/Screen';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import BarcodeCameraView from '../components/BarcodeCameraView';
import { useLog } from '../state/LogContext';
import { theme } from '../lib/theme';
import { describeOffError, fetchProductByBarcode, productToPrefill } from '../lib/off';
import type { EntryPrefill } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type ScanState =
  | { phase: 'scanning' }
  | { phase: 'looking-up'; code: string }
  | { phase: 'error'; code: string; message: string };

export default function ScanScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { date } = useLog();
  const [permission, requestPermission] = useCameraPermissions();

  const [state, setState] = useState<ScanState>({ phase: 'scanning' });
  /**
   * The camera fires continuously while a barcode is in frame; this latch keeps
   * one scan from starting a dozen lookups.
   */
  const busy = useRef(false);

  // Re-arm whenever this screen is returned to, including after logging an entry.
  useFocusEffect(
    useCallback(() => {
      busy.current = false;
      setState({ phase: 'scanning' });
      return () => {
        busy.current = true;
      };
    }, [])
  );

  /** Opens the entry form with whatever is known, even if that is only the code. */
  const openForm = useCallback(
    (prefill: EntryPrefill) => {
      navigation.navigate('EntryForm', { date, prefill });
    },
    [navigation, date]
  );

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      const code = data.trim();
      if (busy.current || code === '') return;
      busy.current = true;
      setState({ phase: 'looking-up', code });

      try {
        const product = await fetchProductByBarcode(code);
        if (product) {
          openForm(productToPrefill(product, 'barcode'));
          return;
        }
        // Not in the database — hand the code to the manual form rather than
        // dropping the scan on the floor.
        openForm({
          name: '',
          brand: null,
          source: 'barcode',
          barcode: code,
          quantity: 100,
          unit: 'g',
          per100: null,
          nutrition: null,
          serving_size_g: null,
        });
      } catch (err) {
        setState({ phase: 'error', code, message: describeOffError(err) });
        busy.current = false;
      }
    },
    [openForm]
  );

  function rescan() {
    busy.current = false;
    setState({ phase: 'scanning' });
  }

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
        <Button
          label={t('scan.addManuallyInstead')}
          variant="ghost"
          onPress={() => navigation.navigate('EntryForm', { date })}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View className="flex-1 px-4 pb-24 pt-2">
        <BarcodeCameraView
          scanning={state.phase === 'scanning'}
          onBarcodeScanned={onScanned}
          overlay={
            <>
              {state.phase === 'looking-up' ? (
                <View className="absolute inset-0 items-center justify-center bg-black/70">
                  <ActivityIndicator color={theme.accent} />
                  <Text className="mt-3 text-sm text-white">
                    {t('scan.lookingUp', { code: state.code })}
                  </Text>
                </View>
              ) : null}

              {state.phase === 'error' ? (
                <View className="absolute inset-0 items-center justify-center bg-black/85 px-6">
                  <Ionicons name="cloud-offline-outline" size={28} color={theme.danger} />
                  <Text className="mt-3 text-center text-sm font-semibold text-white">
                    {t('scan.lookupFailedTitle', { code: state.code })}
                  </Text>
                  <Text className="mt-1.5 text-center text-xs leading-5 text-neutral-400">
                    {state.message}
                  </Text>
                  <View className="mt-5 w-full gap-2">
                    <Button label={t('common.tryAgain')} onPress={rescan} />
                    <Button
                      label={t('scan.enterManually')}
                      variant="secondary"
                      onPress={() =>
                        openForm({
                          name: '',
                          brand: null,
                          source: 'barcode',
                          barcode: state.code,
                          quantity: 100,
                          unit: 'g',
                          per100: null,
                          nutrition: null,
                          serving_size_g: null,
                        })
                      }
                    />
                  </View>
                </View>
              ) : null}
            </>
          }
        />

        <Text className="mt-4 text-center text-xs leading-5 text-neutral-500">
          {t('scan.instructions')}
        </Text>
      </View>
    </Screen>
  );
}
