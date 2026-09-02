import './global.css';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ProfileProvider } from './src/state/ProfileContext';
import { LogProvider } from './src/state/LogContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ErrorBoundary>
        <ProfileProvider>
          <LogProvider>
            <RootNavigator />
          </LogProvider>
        </ProfileProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
