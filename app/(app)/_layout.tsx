import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { Pressable } from 'react-native';

import { AppDrawerContent } from '@/src/components/AppDrawerContent';
import { baseApi } from '@/src/services/baseApi';
import { useAppSelector, useIsAuthenticated } from '@/src/store/hooks';
import { store } from '@/src/store/store';
import { defaultColors } from '@/src/theme/tokens';

export default function AppLayout() {
  const authed = useIsAuthenticated();
  const tenant = useAppSelector((s) => s.auth.tenantConfig);

  // Defensive guard: never render the authenticated area without a session.
  if (!authed) {
    return <Redirect href="/login" />;
  }

  const refresh = () => store.dispatch(baseApi.util.invalidateTags(['Dashboard', 'Device']));

  return (
    <Drawer
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: defaultColors.primary },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '800' },
        drawerActiveTintColor: defaultColors.primary,
        headerRight: () => (
          <Pressable accessibilityLabel="Refresh" hitSlop={12} onPress={refresh} style={{ paddingHorizontal: 12 }}>
            <MaterialCommunityIcons color="#FFFFFF" name="refresh" size={22} />
          </Pressable>
        ),
      }}>
      <Drawer.Screen name="dashboard" options={{ title: tenant?.appName ?? 'Home' }} />
      <Drawer.Screen name="vehicles" options={{ title: 'All Vehicles' }} />
      <Drawer.Screen name="map" options={{ headerShown: false }} />
    </Drawer>
  );
}
