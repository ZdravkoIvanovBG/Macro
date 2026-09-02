import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Screen from '../components/Screen';
import Button from '../components/Button';
import EmptyState from '../components/EmptyState';
import { useLog } from '../state/LogContext';
import { theme } from '../lib/theme';
import { describeOffError, fetchProductByBarcode, productToPrefill } from '../lib/off';
import type { EntryPrefill } from '../lib/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The formats food packaging actually uses. */
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14'];

type ScanState =
  | { phase: 'scanning' }
  | { phase: 'looking-up'; code: string }
  | { phase: 'error'; code: string; message: string };

export default function ScanScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { date } = useLog();
  const [permission, requestPermission] = useCameraPermissions();

  const [state, setState] = useState<ScanState>({ phase: 'scanning' });
  const [torch, setTorch] = useState(false);
  /**
   * The camera fires continuously while a barcode is in frame; this latch keeps
   * one scan from starting a dozen lookups.
   */
  const busy = useRef(false);

  // Re-arm whenever the tab is returned to, including after logging an entry.
  useFocusEffect(
    useCallback(() => {
      busy.current = false;
      setState({ phase: 'scanning' });
      return () => {
        busy.current = true;
        setTorch(false);
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
          title="Camera access needed"
          message={
            permission.canAskAgain
              ? 'Micro uses the camera only to read barcodes. Nothing is recorded or uploaded.'
              : 'Camera access is turned off for Micro. Enable it in Settings to scan barcodes.'
          }
          actionLabel={permission.canAskAgain ? 'Allow camera' : 'Open Settings'}
          onAction={() => {
            if (permission.canAskAgain) void requestPermission();
            else void Linking.openSettings();
          }}
        />
        <Button
          label="Add food manually instead"
          variant="ghost"
          onPress={() => navigation.navigate('EntryForm', { date })}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View className="flex-1 px-4 pb-24 pt-2">
        <View className="flex-1 overflow-hidden rounded-3xl border border-ink-line bg-black">
          {/* Unmounting when unfocused releases the camera and stops the torch. */}
          {isFocused ? (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={state.phase === 'scanning' ? onScanned : undefined}
            />
          ) : null}

          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <View
              className={`h-44 w-64 rounded-2xl border-2 ${
                state.phase === 'scanning' ? 'border-white/70' : 'border-accent'
              }`}
            />
          </View>

          {state.phase === 'looking-up' ? (
            <View className="absolute inset-0 items-center justify-center bg-black/70">
              <ActivityIndicator color={theme.accent} />
              <Text className="mt-3 text-sm text-white">Looking up {state.code}…</Text>
            </View>
          ) : null}

          {state.phase === 'error' ? (
            <View className="absolute inset-0 items-center justify-center bg-black/85 px-6">
              <Ionicons name="cloud-offline-outline" size={28} color={theme.danger} />
              <Text className="mt-3 text-center text-sm font-semibold text-white">
                Couldn&apos;t look up {state.code}
              </Text>
              <Text className="mt-1.5 text-center text-xs leading-5 text-neutral-400">
                {state.message}
              </Text>
              <View className="mt-5 w-full gap-2">
                <Button label="Try again" onPress={rescan} />
                <Button
                  label="Enter it manually"
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

          <Pressable
            onPress={() => setTorch((on) => !on)}
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
            className="absolute right-4 top-4 h-11 w-11 items-center justify-center rounded-full bg-black/60 active:opacity-70"
          >
            <Ionicons
              name={torch ? 'flashlight' : 'flashlight-outline'}
              size={20}
              color={torch ? theme.accent : '#ffffff'}
            />
          </Pressable>
        </View>

        <Text className="mt-4 text-center text-xs leading-5 text-neutral-500">
          Point the camera at a product barcode. Found products are pre-filled from Open Food
          Facts; anything missing falls back to manual entry.
        </Text>
      </View>
    </Screen>
  );
}
