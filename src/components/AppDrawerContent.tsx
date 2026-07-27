import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  DrawerContentScrollView,
  type DrawerContentComponentProps,
} from '@react-navigation/drawer';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { P } from '@/src/constants/permissions';
import { apiErrorMessage } from '@/src/services/apiError';
import { authStorage } from '@/src/services/authStorage';
import { useLogoutMutation } from '@/src/services/authApi';
import { baseApi } from '@/src/services/baseApi';
import { clearSession, clearTenant } from '@/src/store/authSlice';
import { useAppDispatch, useAppSelector, useHasPermission } from '@/src/store/hooks';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

type DrawerLink = {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  route:
    | '/vehicles'
    | '/map'
    | '/geofences'
    | '/reports'
    | '/commands'
    | '/management'
    | '/settings';
  permission?: string;
  module?: string;
};

// The All Vehicles Map is the app home. Live fleet tracking, events, maintenance
// alerts and the AI Command Centre are surfaced there (map + notification bell),
// so they no longer need their own drawer destinations.
//
// Drivers are not a destination of their own: a driver is a user with the DRIVER
// role, so the whole lifecycle lives under Management > Users.
const LINKS: DrawerLink[] = [
  { label: 'Live Map (Home)', icon: 'map-marker-radius-outline', route: '/map', permission: P.VIEW_ALL_VEHICLES },
  { label: 'All Vehicles', icon: 'car-multiple', route: '/vehicles', permission: P.VIEW_ALL_VEHICLES },
  { label: 'Geofences', icon: 'vector-polygon', route: '/geofences', permission: P.MANAGE_GEOFENCES, module: 'geofences' },
  { label: 'All Vehicles Report', icon: 'file-chart-outline', route: '/reports', permission: P.VIEW_REPORTS, module: 'reports' },
  { label: 'Device Commands', icon: 'console-line', route: '/commands', permission: P.SEND_COMMANDS },
  { label: 'Management', icon: 'shield-account-outline', route: '/management', permission: P.MANAGE_DEVICES },
  { label: 'Settings', icon: 'cog-outline', route: '/settings' },
];

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const tenant = useAppSelector((s) => s.auth.tenantConfig);
  const companyCode = useAppSelector((s) => s.auth.companyCode);
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
          dispatch(clearSession());
          dispatch(baseApi.util.resetApiState());
          await authStorage.clearSession().catch(() => undefined);
          router.replace('/login');
        },
      },
    ]);
  };

  const onSwitchCompany = () => {
    Alert.alert(
      'Switch Company',
      'You will be signed out before selecting another company.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          style: 'destructive',
          onPress: async () => {
            dispatch(clearTenant());
            dispatch(baseApi.util.resetApiState());
            await authStorage.clearAll().catch(() => undefined);
            router.replace('/company-code');
          },
        },
      ]
    );
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
            <MaterialCommunityIcons color="#FFFFFF" name="crosshairs-gps" size={30} />
          )}
        </View>
        <Text numberOfLines={1} style={styles.tenantName}>
          {tenant?.appName ?? 'Glivt'}
        </Text>
        <Text numberOfLines={1} style={styles.userName}>
          {user?.name ?? user?.username ?? ''} | {formatRole(user?.role)}
        </Text>
        <Text numberOfLines={1} style={styles.companyCode}>
          Company: {companyCode ?? '-'}
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
        <DrawerRow icon="office-building-cog-outline" label="Switch Company" onPress={onSwitchCompany} />
        <DrawerRow icon="headset" label="Contact Service Provider" onPress={contactProvider} />
      </DrawerContentScrollView>

      <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logout}>
        <MaterialCommunityIcons color={c.danger} name="logout" size={22} />
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
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surfaceAlt }]}>
      <MaterialCommunityIcons color={c.primary} name={icon} size={22} />
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

function formatRole(role?: string) {
  if (!role) return '';
  return role.charAt(0) + role.slice(1).toLowerCase().replace('_', ' ');
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.surface },
    header: {
      backgroundColor: c.primary,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
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
    tenantName: { color: '#FFFFFF', fontSize: typography.title, fontWeight: '800', marginTop: spacing.sm },
    userName: { color: 'rgba(255,255,255,0.9)', fontSize: typography.caption, marginTop: 2 },
    companyCode: {
      color: 'rgba(255,255,255,0.72)',
      fontSize: 10,
      fontWeight: '700',
      marginTop: 4,
    },
    items: { paddingTop: spacing.sm },
    row: {
      alignItems: 'center',
      borderRadius: radius.sm,
      flexDirection: 'row',
      gap: spacing.md,
      marginHorizontal: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    rowLabel: { color: c.textPrimary, fontSize: typography.body, fontWeight: '600' },
    divider: {
      backgroundColor: c.border,
      height: StyleSheet.hairlineWidth * 2,
      marginHorizontal: spacing.lg,
      marginVertical: spacing.sm,
    },
    logout: {
      alignItems: 'center',
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    logoutText: { color: c.danger, fontSize: typography.body, fontWeight: '700' },
  });
