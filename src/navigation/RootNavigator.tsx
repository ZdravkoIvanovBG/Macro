import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../lib/theme';
import ProfileScreen from '../screens/ProfileScreen';
import LogScreen from '../screens/LogScreen';
import SearchScreen from '../screens/SearchScreen';
import ScanScreen from '../screens/ScanScreen';
import HistoryScreen from '../screens/HistoryScreen';
import EntryFormScreen from '../screens/EntryFormScreen';
import type { RootStackParamList, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Log: 'today-outline',
  Search: 'search-outline',
  Scan: 'barcode-outline',
  History: 'stats-chart-outline',
  Profile: 'person-outline',
};

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.bg,
    card: theme.surface,
    text: theme.text,
    border: theme.line,
    primary: theme.accent,
  },
};

const headerStyles = {
  headerStyle: { backgroundColor: theme.bg },
  headerTitleStyle: { color: theme.text, fontWeight: '700' as const },
  headerTintColor: theme.accent,
  headerShadowVisible: false,
};

function Tabs() {
  return (
    <Tab.Navigator
      initialRouteName="Log"
      screenOptions={({ route }) => ({
        ...headerStyles,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.line,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textFaint,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Log" component={LogScreen} options={{ title: 'Today' }} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Scan" component={ScanScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={headerStyles}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="EntryForm"
          component={EntryFormScreen}
          options={{ presentation: 'modal', title: 'Add food' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
