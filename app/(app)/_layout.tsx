import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { AppDrawerContent } from '@/src/components/AppDrawerContent';
import { baseApi } from '@/src/services/baseApi';
import { useAppSelector, useHasTenant, useIsAuthenticated } from '@/src/store/hooks';
import { store } from '@/src/store/store';
import { useTheme } from '@/src/theme/ThemeProvider';

function HeaderReloadButton() {
  const [reloading, setReloading] = React.useState(false);
  const { colors: c } = useTheme();

  const handleReload = React.useCallback(async () => {
    if (reloading) return;
    setReloading(true);
    try {
      store.dispatch(
        baseApi.util.invalidateTags([
          'Device',
          'Geofence',
          'Report',
          'Command',
          'User',
          'Project',
          'Group',
          'Audit',
          'Dashboard',
          'Settings',
        ])
      );
      await new Promise((resolve) => setTimeout(resolve, 650));
    } catch {
      // Catch any unexpected store or network error gracefully
    } finally {
      setReloading(false);
    }
  }, [reloading]);

  return (
    <Pressable
      accessibilityLabel="Reload page data"
      accessibilityRole="button"
      disabled={reloading}
      hitSlop={12}
      onPress={handleReload}
      style={{ paddingHorizontal: 12, opacity: reloading ? 0.75 : 1 }}>
      {reloading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <MaterialCommunityIcons color="#FFFFFF" name="refresh" size={22} />
      )}
    </Pressable>
  );
}

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
        headerRight: () => <HeaderReloadButton />,
      }}>
      <Drawer.Screen name="map" options={{ headerShown: false }} />
      <Drawer.Screen name="ai-chat" options={{ title: 'AI Assistant' }} />
      <Drawer.Screen name="vehicles" options={{ title: 'All Vehicles' }} />
      <Drawer.Screen name="geofences" options={{ title: 'Geofences' }} />
      <Drawer.Screen name="reports" options={{ title: 'Reports' }} />
      <Drawer.Screen name="commands" options={{ title: 'Device Commands' }} />
      <Drawer.Screen name="management" options={{ title: 'Management' }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
    </Drawer>
  );
}
