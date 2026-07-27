import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { Pressable } from 'react-native';

import { AppDrawerContent } from '@/src/components/AppDrawerContent';
import { baseApi } from '@/src/services/baseApi';
import { useAppSelector, useHasTenant, useIsAuthenticated } from '@/src/store/hooks';
import { store } from '@/src/store/store';
import { useTheme } from '@/src/theme/ThemeProvider';

export default function AppLayout() {
  const authed = useIsAuthenticated();
  const hasTenant = useHasTenant();
  const bootstrapped = useAppSelector((s) => s.auth.bootstrapped);
  const { colors: c } = useTheme();

  if (!bootstrapped) {
    return null;
  }
  if (!hasTenant) {
    return <Redirect href="/company-code" />;
  }
  // Defensive guard: never render the authenticated area with an unbound session.
  if (!authed) {
    return <Redirect href="/login" />;
  }

  const refresh = () => store.dispatch(baseApi.util.invalidateTags(['Dashboard', 'Device']));

  return (
    <Drawer
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: c.primary },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        drawerActiveTintColor: c.primary,
        drawerInactiveTintColor: c.textSecondary,
        drawerStyle: { backgroundColor: c.surface },
        headerRight: () => (
          <Pressable accessibilityLabel="Refresh" hitSlop={12} onPress={refresh} style={{ paddingHorizontal: 12 }}>
            <MaterialCommunityIcons color="#FFFFFF" name="refresh" size={22} />
          </Pressable>
        ),
      }}>
      <Drawer.Screen name="map" options={{ headerShown: false }} />
      <Drawer.Screen name="ai-chat" options={{ title: 'AI Assistant' }} />
      <Drawer.Screen name="vehicles" options={{ title: 'All Vehicles' }} />
      <Drawer.Screen name="drivers" options={{ title: 'Drivers' }} />
      <Drawer.Screen name="geofences" options={{ title: 'Geofences' }} />
      <Drawer.Screen name="reports" options={{ title: 'Reports' }} />
      <Drawer.Screen name="commands" options={{ title: 'Device Commands' }} />
      <Drawer.Screen name="management" options={{ title: 'Management' }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
    </Drawer>
  );
}
