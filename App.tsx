import './global.css';

import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { theme } from './src/lib/theme';
import { ProfileProvider } from './src/state/ProfileContext';
import { LogProvider } from './src/state/LogContext';
import { SettingsProvider, useSettings } from './src/state/SettingsContext';

/**
 * Gates rendering until the persisted/detected language is applied, so
 * nothing ever flashes in the wrong language on first launch.
 */
function AppGate() {
  const { loading } = useSettings();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-ink">
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ProfileProvider>
      <LogProvider>
        <RootNavigator />
      </LogProvider>
    </ProfileProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ErrorBoundary>
        <SettingsProvider>
          <AppGate />
        </SettingsProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
