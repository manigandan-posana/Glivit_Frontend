import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { P } from '@/src/constants/permissions';
import { apiErrorMessage } from '@/src/services/apiError';
import { authStorage } from '@/src/services/authStorage';
import { useLogoutMutation } from '@/src/services/authApi';
import { clearSession } from '@/src/store/authSlice';
import { useAppDispatch, useAppSelector, useHasPermission } from '@/src/store/hooks';
import { defaultColors, palette, spacing, typography } from '@/src/theme/tokens';

type DrawerLink = {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  route:
    | '/dashboard'
    | '/vehicles'
    | '/map'
    | '/events'
    | '/geofences'
    | '/reports'
    | '/commands'
    | '/management'
    | '/settings';
  permission?: string;
  module?: string;
};

const LINKS: DrawerLink[] = [
  { label: 'Home', icon: 'view-dashboard-outline', route: '/dashboard' },
  { label: 'All Vehicles', icon: 'car-multiple', route: '/vehicles', permission: P.VIEW_ALL_VEHICLES },
  { label: 'All Vehicles Map', icon: 'map-outline', route: '/map', permission: P.VIEW_ALL_VEHICLES },
  { label: 'Events', icon: 'bell-alert-outline', route: '/events', permission: P.VIEW_LIVE_LOCATION },
  { label: 'Geofences', icon: 'vector-polygon', route: '/geofences', permission: P.MANAGE_GEOFENCES, module: 'geofences' },
  { label: 'All Vehicles Report', icon: 'file-chart-outline', route: '/reports', permission: P.VIEW_REPORTS, module: 'reports' },
  { label: 'Device Commands', icon: 'console-line', route: '/commands', permission: P.SEND_COMMANDS },
  { label: 'Management', icon: 'shield-account-outline', route: '/management', permission: P.MANAGE_DEVICES },
  { label: 'Settings', icon: 'cog-outline', route: '/settings' },
];

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const tenant = useAppSelector((s) => s.auth.tenantConfig);
  const user = useAppSelector((s) => s.auth.user);
  const [logout] = useLogoutMutation();

  // Permission checks (hooks must be called unconditionally, so evaluate all).
  const canViewAll = useHasPermission(P.VIEW_ALL_VEHICLES);
  const canLive = useHasPermission(P.VIEW_LIVE_LOCATION);
  const canGeofence = useHasPermission(P.MANAGE_GEOFENCES);
  const canReports = useHasPermission(P.VIEW_REPORTS);
  const canCommands = useHasPermission(P.SEND_COMMANDS);
  const canManageDevices = useHasPermission(P.MANAGE_DEVICES);
  const permissionMap: Record<string, boolean> = { [P.VIEW_ALL_VEHICLES]: canViewAll };
  permissionMap[P.VIEW_LIVE_LOCATION] = canLive;
  permissionMap[P.MANAGE_GEOFENCES] = canGeofence;
  permissionMap[P.VIEW_REPORTS] = canReports;
  permissionMap[P.SEND_COMMANDS] = canCommands;
  permissionMap[P.MANAGE_DEVICES] = canManageDevices;
  const enabledModules = new Set((tenant?.enabledModules ?? []).map((m) => m.toLowerCase()));

  const go = (route: DrawerLink['route']) => {
    props.navigation.closeDrawer();
    router.push(route as never);
  };

  const onLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout().unwrap();
          } catch {
            // Best-effort; clear the local session regardless.
          }
          await authStorage.clearSession();
          dispatch(clearSession());
          router.replace('/login');
        },
      },
    ]);
  };

  const contactProvider = () => {
    if (tenant?.supportPhone) Linking.openURL(`tel:${tenant.supportPhone}`).catch(() => undefined);
    else if (tenant?.supportEmail)
      Linking.openURL(`mailto:${tenant.supportEmail}`).catch(() => undefined);
    else Alert.alert('Contact Service Provider', apiErrorMessage(null, 'No support contact configured.'));
  };

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <View style={styles.logo}>
          {tenant?.logoUrl ? (
            <Image contentFit="contain" source={{ uri: tenant.logoUrl }} style={styles.logoImage} />
          ) : (
            <MaterialCommunityIcons color={palette.white} name="crosshairs-gps" size={30} />
          )}
        </View>
        <Text numberOfLines={1} style={styles.tenantName}>
          {tenant?.appName ?? 'Glivt'}
        </Text>
        <Text numberOfLines={1} style={styles.userName}>
          {user?.name ?? user?.username ?? ''} · {formatRole(user?.role)}
        </Text>
      </View>

      <DrawerContentScrollView {...props} contentContainerStyle={styles.items}>
        {LINKS.filter((l) => {
          const allowed = !l.permission || permissionMap[l.permission];
          const moduleEnabled = !l.module || enabledModules.size === 0 || enabledModules.has(l.module);
          return allowed && moduleEnabled;
        }).map((link) => (
          <DrawerRow key={link.route} icon={link.icon} label={link.label} onPress={() => go(link.route)} />
        ))}
        <View style={styles.divider} />
        <DrawerRow icon="headset" label="Contact Service Provider" onPress={contactProvider} />
      </DrawerContentScrollView>

      <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logout}>
        <MaterialCommunityIcons color={palette.errorRed} name="logout" size={22} />
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </View>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <MaterialCommunityIcons color={defaultColors.primary} name={icon} size={22} />
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

function formatRole(role?: string) {
  if (!role) return '';
  return role.charAt(0) + role.slice(1).toLowerCase().replace('_', ' ');
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: palette.cardBackground },
  header: {
    backgroundColor: defaultColors.primary,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.md,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  logoImage: { height: 56, width: 56 },
  tenantName: { color: palette.white, fontSize: typography.title, fontWeight: '800', marginTop: spacing.sm },
  userName: { color: 'rgba(255,255,255,0.9)', fontSize: typography.caption, marginTop: 2 },
  items: { paddingTop: spacing.sm },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLabel: { color: palette.textPrimary, fontSize: typography.body, fontWeight: '600' },
  divider: {
    backgroundColor: palette.divider,
    height: 1,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  logout: {
    alignItems: 'center',
    borderTopColor: palette.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  logoutText: { color: palette.errorRed, fontSize: typography.body, fontWeight: '700' },
});
