import { useCallback, useState, type ReactNode } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, type BarcodeType } from 'expo-camera';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { theme } from '../lib/theme';

/** The formats food packaging actually uses. */
const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14'];

interface BarcodeCameraViewProps {
  /** Whether a scan is currently being accepted — also drives the frame color. */
  scanning: boolean;
  onBarcodeScanned: (event: { data: string }) => void;
  /** Rendered over the camera for phase-specific states (looking-up spinner, error card). */
  overlay?: ReactNode;
}

/**
 * The camera chrome shared by the calorie-log barcode scanner and the
 * read-only ingredient scanner: live preview, scan frame, and a torch toggle.
 * Callers own their own state machine and just say whether to accept scans.
 */
export default function BarcodeCameraView({
  scanning,
  onBarcodeScanned,
  overlay,
}: BarcodeCameraViewProps) {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const [torch, setTorch] = useState(false);

  useFocusEffect(
    useCallback(() => {
      return () => setTorch(false);
    }, [])
  );

  return (
    <View className="flex-1 overflow-hidden rounded-3xl border border-ink-line bg-black">
      {/* Unmounting when unfocused releases the camera and stops the torch. */}
      {isFocused ? (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={scanning ? onBarcodeScanned : undefined}
        />
      ) : null}

      <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
        <View
          className={`h-44 w-64 rounded-2xl border-2 ${
            scanning ? 'border-white/70' : 'border-accent'
          }`}
        />
      </View>

      {overlay}

      <Pressable
        onPress={() => setTorch((on) => !on)}
        accessibilityRole="button"
        accessibilityLabel={torch ? t('scan.torchOn') : t('scan.torchOff')}
        className="absolute right-4 top-4 h-11 w-11 items-center justify-center rounded-full bg-black/60 active:opacity-70"
      >
        <Ionicons
          name={torch ? 'flashlight' : 'flashlight-outline'}
          size={20}
          color={torch ? theme.accent : '#ffffff'}
        />
      </Pressable>
    </View>
  );
}
