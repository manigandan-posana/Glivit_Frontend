import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { AppDrawerContent } from '@/src/components/AppDrawerContent';
import { baseApi } from '@/src/services/baseApi';
import {
  useAppSelector,
  useHasTenant,
  useIsAuthenticated,
  useTenantEpoch,
} from '@/src/store/hooks';
import { store } from '@/src/store/store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

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
  const tenantEpoch = useTenantEpoch();
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
    // Keying the whole authenticated navigator on the tenant epoch reinitialises
    // navigation and every screen inside it when the tenant changes. This is what
    // clears screen-level local state — selected vehicle, map camera, filters,
    // pagination, search text — in one place, instead of relying on each screen to
    // remember to reset itself. RTK Query state is reset separately by the switch.
    <Drawer
      key={`tenant-${tenantEpoch}`}
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: c.primary },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        drawerActiveTintColor: c.primary,
        drawerInactiveTintColor: c.textSecondary,
        // The panel fills the full screen height and clips its children, so the
        // drawer content reaches the bottom edge cleanly. The rounded right edge
        // is applied here (with overflow hidden) rather than on the header or the
        // footer, so no child can leave an uneven notch in the silhouette.
        drawerStyle: {
          backgroundColor: c.surface,
          borderBottomRightRadius: radius.lg,
          borderTopRightRadius: radius.lg,
          overflow: 'hidden',
          width: 300,
        },
        headerRight: () => <HeaderReloadButton />,
      }}>
      <Drawer.Screen name="map" options={{ headerShown: false }} />
      <Drawer.Screen name="ai-chat" options={{ title: 'AI Assistant' }} />
      <Drawer.Screen name="vehicles" options={{ title: 'All Vehicles' }} />
      <Drawer.Screen name="geofences" options={{ title: 'Geofences' }} />
      <Drawer.Screen name="reports" options={{ title: 'Reports' }} />
      <Drawer.Screen name="commands" options={{ title: 'Device Commands' }} />
      <Drawer.Screen name="management" options={{ title: 'Management' }} />
      <Drawer.Screen name="manage-tenants" options={{ title: 'Manage Tenants' }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings' }} />
    </Drawer>
  );
}
