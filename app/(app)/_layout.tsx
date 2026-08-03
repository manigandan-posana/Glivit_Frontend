import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { DrawerToggleButton } from '@react-navigation/drawer';
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'expo-image';

import { AppDrawerContent } from '@/src/components/AppDrawerContent';
import { ProfilePanel } from '@/src/components/ProfilePanel';
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
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
    </View>
  );
}

const PROFILE_IMG_KEY = 'glivt.profile.imageUri';

function HeaderRight({ onProfilePress }: { onProfilePress: () => void }) {
  const [profileUri, setProfileUri] = useState<string | null>(null);

  // Poll for changes when the panel is closed, since this is in the header
  useEffect(() => {
    let interval = setInterval(() => {
      SecureStore.getItemAsync(PROFILE_IMG_KEY).then(uri => {
        if (uri && uri !== profileUri) setProfileUri(uri);
      }).catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [profileUri]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}>
      <HeaderReloadButton />
      <Pressable onPress={onProfilePress} hitSlop={12} style={{ paddingHorizontal: 12 }}>
        {profileUri ? (
          <Image source={{ uri: profileUri }} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }} contentFit="cover" />
        ) : (
          <MaterialCommunityIcons color="#FFFFFF" name="account-circle" size={28} />
        )}
      </Pressable>
    </View>
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

  const [profileVisible, setProfileVisible] = useState(false);

  return (
    <>
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
        headerTitleAlign: 'center',
        headerLeft: () => <DrawerToggleButton tintColor="#FFFFFF" />,
        headerRight: () => <HeaderRight onProfilePress={() => setProfileVisible(true)} />,
      }}>
      <Drawer.Screen name="map" options={{ headerShown: false }} />
      <Drawer.Screen name="ai-chat" options={{ title: 'AI Assistant', headerTitle: 'AI Assistant' }} />
      <Drawer.Screen name="vehicles" options={{ title: 'All Vehicles', headerTitle: 'All Vehicles' }} />
      <Drawer.Screen name="geofences" options={{ title: 'Geofences', headerTitle: 'Geofences' }} />
      <Drawer.Screen name="reports" options={{ title: 'Reports', headerTitle: 'Reports' }} />
      <Drawer.Screen name="commands" options={{ title: 'Device Commands', headerTitle: 'Device Commands' }} />
      <Drawer.Screen name="management" options={{ title: 'Management', headerTitle: 'Management' }} />
      <Drawer.Screen name="manage-tenants" options={{ title: 'Manage Tenants', headerTitle: 'Manage Tenants' }} />
      <Drawer.Screen name="settings" options={{ title: 'Settings', headerTitle: 'Settings' }} />
      <Drawer.Screen name="timeline" options={{ title: 'Timeline', headerTitle: 'Timeline' }} />
    </Drawer>
    <ProfilePanel visible={profileVisible} onClose={() => setProfileVisible(false)} />
    </>
  );
}
