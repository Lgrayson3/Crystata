import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from './src/theme';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HistoryScreen }   from './src/screens/HistoryScreen';
import { AdvisorScreen }   from './src/screens/AdvisorScreen';
import { SettingsScreen }  from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.bg,
    card: COLORS.surface,
    border: COLORS.border,
    text: COLORS.text,
    primary: COLORS.accent,
  },
};

export default function App() {
  return (
    <NavigationContainer theme={NavTheme}>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
          tabBarActiveTintColor: COLORS.accent,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, string> = {
              Dashboard: 'stats-chart',
              History:   'calendar',
              Advisor:   'sparkles',
              Settings:  'settings-outline',
            };
            return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardScreen} />
        <Tab.Screen name="History"   component={HistoryScreen} />
        <Tab.Screen name="Advisor"   component={AdvisorScreen} />
        <Tab.Screen name="Settings"  component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
