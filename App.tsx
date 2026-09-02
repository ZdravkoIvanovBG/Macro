import './global.css';

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';
import { ProfileProvider } from './src/state/ProfileContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ProfileProvider>
        <RootNavigator />
      </ProfileProvider>
    </SafeAreaProvider>
  );
}
