import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../lib/theme';
import ProfileScreen from '../screens/ProfileScreen';
import LogScreen from '../screens/LogScreen';
import SearchScreen from '../screens/SearchScreen';
import ScanScreen from '../screens/ScanScreen';
import HistoryScreen from '../screens/HistoryScreen';

export type RootTabParamList = {
  Log: undefined;
  Search: undefined;
  Scan: undefined;
  History: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

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

export default function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        initialRouteName="Log"
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: theme.bg },
          headerTitleStyle: { color: theme.text, fontWeight: '700' },
          headerShadowVisible: false,
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
    </NavigationContainer>
  );
}
