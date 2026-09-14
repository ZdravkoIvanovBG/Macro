import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { theme } from '../lib/theme';
import ProfileScreen from '../screens/ProfileScreen';
import LogScreen from '../screens/LogScreen';
import SearchScreen from '../screens/SearchScreen';
import ScanScreen from '../screens/ScanScreen';
import HistoryScreen from '../screens/HistoryScreen';
import EntryFormScreen from '../screens/EntryFormScreen';
import IngredientsScanScreen from '../screens/IngredientsScanScreen';
import IngredientsReportScreen from '../screens/IngredientsReportScreen';
import type { RootStackParamList, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const ICONS: Record<keyof RootTabParamList, keyof typeof Ionicons.glyphMap> = {
  Log: 'today-outline',
  Search: 'search-outline',
  Ingredients: 'list-outline',
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
  const { t } = useTranslation();
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
      <Tab.Screen name="Log" component={LogScreen} options={{ title: t('nav.log') }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: t('nav.search') }} />
      <Tab.Screen
        name="Ingredients"
        component={IngredientsScanScreen}
        options={{ title: t('ingredients.scanTitle'), tabBarLabel: t('nav.ingredients') }}
      />
      <Tab.Screen name="History" component={HistoryScreen} options={{ title: t('nav.history') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { t } = useTranslation();
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={headerStyles}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="EntryForm"
          component={EntryFormScreen}
          options={{ presentation: 'modal', title: t('entryForm.titleAdd') }}
        />
        <Stack.Screen name="Scan" component={ScanScreen} options={{ title: t('nav.scan') }} />
        <Stack.Screen
          name="IngredientsReport"
          component={IngredientsReportScreen}
          options={{ title: t('ingredients.reportTitle') }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
