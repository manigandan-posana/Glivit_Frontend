import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type DrawerContentComponentProps } from '@react-navigation/drawer';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { P } from '@/src/constants/permissions';
import { apiErrorMessage } from '@/src/services/apiError';
import { authStorage } from '@/src/services/authStorage';
import { useLogoutMutation } from '@/src/services/authApi';
import { baseApi } from '@/src/services/baseApi';
import { clearSession } from '@/src/store/authSlice';
import { clearActiveTenant } from '@/src/store/tenantSlice';
import { useAppDispatch, useAppSelector, useHasPermission } from '@/src/store/hooks';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

type DrawerRoute =
  | '/vehicles'
  | '/map'
  | '/geofences'
  | '/reports'
  | '/commands'
  | '/management'
  | '/manage-tenants'
  | '/settings';

type DrawerLink = {
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  route: DrawerRoute;
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
  { label: 'Live Map', icon: 'map-marker-radius-outline', route: '/map', permission: P.VIEW_ALL_VEHICLES },
  { label: 'All Vehicles', icon: 'car-multiple', route: '/vehicles', permission: P.VIEW_ALL_VEHICLES },
  { label: 'Geofences', icon: 'vector-polygon', route: '/geofences', permission: P.MANAGE_GEOFENCES, module: 'geofences' },
  { label: 'Reports', icon: 'file-chart-outline', route: '/reports', permission: P.VIEW_REPORTS, module: 'reports' },
  { label: 'Device Commands', icon: 'console-line', route: '/commands', permission: P.SEND_COMMANDS },
  { label: 'Management', icon: 'shield-account-outline', route: '/management', permission: P.MANAGE_DEVICES },
];

/** Account/platform destinations, separated from the fleet modules by a divider. */
const ACCOUNT_LINKS: DrawerLink[] = [
  { label: 'Manage Tenants', icon: 'office-building-cog-outline', route: '/manage-tenants' },
  { label: 'Settings', icon: 'cog-outline', route: '/settings' },
];

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const tenant = useAppSelector((s) => s.auth.tenantConfig);
  const companyCode = useAppSelector((s) => s.auth.companyCode);
  const user = useAppSelector((s) => s.auth.user);
  const activeTenantCode = useAppSelector((s) => s.tenant.activeTenantCode);
  const activeTenantName = useAppSelector((s) => s.tenant.activeTenantName);
  const activeCompanyName = useAppSelector((s) => s.tenant.activeCompanyName);
  // True while acting inside a tenant other than the one that owns the login.
  const isSwitchedTenant = useAppSelector(
    (s) =>
      s.auth.user?.homeTenantId != null && s.auth.user.homeTenantId !== s.tenant.activeTenantId
  );
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

  /**
   * Route name of the focused screen, used to highlight the active row.
   *
   * Taken from the navigator's own state rather than tracked separately, so the
   * highlight cannot drift out of step with what is actually on screen.
   */
  const activeRouteName = props.state.routeNames[props.state.index];

  const visible = (links: DrawerLink[]) =>
    links.filter((link) => {
      const allowed = !link.permission || permissionMap[link.permission];
      const moduleEnabled =
        !link.module || enabledModules.size === 0 || enabledModules.has(link.module);
      return allowed && moduleEnabled;
    });

  const go = (route: DrawerRoute) => {
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
          // The active tenant is part of the session, not of the app: it must not
          // survive a sign-out into the next user's session.
          dispatch(clearActiveTenant());
          dispatch(baseApi.util.resetApiState());
          await authStorage.clearSession().catch(() => undefined);
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

  const displayName = user?.name ?? user?.username ?? 'Signed in';
  const tenantLabel = activeTenantName ?? tenant?.appName ?? 'Glivt';
  const tenantCodeLabel = activeTenantCode ?? companyCode ?? '-';

  return (
    // The drawer owns the full height. `paddingTop` carries the status-bar inset so
    // the green header reaches the top edge without the content sitting under the
    // clock, and the footer carries the bottom inset so it clears the gesture bar.
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            {tenant?.logoUrl ? (
              <Image contentFit="cover" source={{ uri: tenant.logoUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>{initials(displayName)}</Text>
            )}
          </View>
          <View style={styles.identityText}>
            <Text numberOfLines={1} style={styles.tenantName}>
              {tenantLabel}
            </Text>
            {activeCompanyName ? (
              <Text numberOfLines={1} style={styles.companyName}>
                {activeCompanyName}
              </Text>
            ) : null}
          </View>
        </View>

        <Text numberOfLines={1} style={styles.userName}>
          {displayName}
        </Text>

        {/* Compact metadata chips: role, tenant code, and a switched-tenant marker. */}
        <View style={styles.chipRow}>
          <Chip icon="shield-account-outline" label={formatRole(user?.role)} />
          <Chip icon="identifier" label={tenantCodeLabel} />
          {isSwitchedTenant ? <Chip icon="swap-horizontal" label="Switched" /> : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.items}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        <Text style={styles.sectionHeading}>Fleet</Text>
        {visible(LINKS).map((link) => (
          <DrawerRow
            active={activeRouteName === routeKey(link.route)}
            icon={link.icon}
            key={link.route}
            label={link.label}
            onPress={() => go(link.route)}
          />
        ))}

        <View style={styles.divider} />
        <Text style={styles.sectionHeading}>Account</Text>
        {visible(ACCOUNT_LINKS).map((link) => (
          <DrawerRow
            active={activeRouteName === routeKey(link.route)}
            icon={link.icon}
            key={link.route}
            label={link.label}
            onPress={() => go(link.route)}
          />
        ))}
        <DrawerRow icon="headset" label="Contact Service Provider" onPress={contactProvider} />
      </ScrollView>

      {/*
        Fixed footer. It sits outside the ScrollView so Logout is always reachable,
        spans the full drawer width, and pads by the bottom safe-area inset so it
        never sits under the Android gesture bar or the iOS home indicator.
      */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={({ pressed }) => [styles.logout, pressed && { backgroundColor: c.surfaceAlt }]}>
          <MaterialCommunityIcons color={c.danger} name="logout" size={20} />
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Chip({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  if (!label) return null;
  return (
    <View style={styles.chip}>
      <MaterialCommunityIcons color="rgba(255,255,255,0.92)" name={icon} size={12} />
      <Text numberOfLines={1} style={styles.chipText}>
        {label}
      </Text>
    </View>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && !active && { backgroundColor: c.surfaceAlt },
      ]}>
      <MaterialCommunityIcons
        color={active ? c.primary : c.textSecondary}
        name={icon}
        size={21}
      />
      <Text numberOfLines={1} style={[styles.rowLabel, active && styles.rowLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Drawer routes are registered by file name, so `/map` is the `map` screen. */
function routeKey(route: DrawerRoute): string {
  return route.replace(/^\//, '');
}

function formatRole(role?: string) {
  if (!role) return '';
  return role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** Up to two initials for the avatar fallback when the tenant has no logo. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { backgroundColor: c.surface, flex: 1 },

    // --- Header ---------------------------------------------------------
    // A flat block with square edges. The previous version used large bottom
    // corner radii, which read as an oversized floating badge rather than a
    // header and left an uneven notch against the menu below it.
    header: {
      backgroundColor: c.primary,
      gap: spacing.sm,
      paddingBottom: spacing.md,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    identityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    avatar: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderColor: 'rgba(255,255,255,0.35)',
      borderRadius: radius.pill,
      borderWidth: 1,
      height: 44,
      justifyContent: 'center',
      overflow: 'hidden',
      width: 44,
    },
    avatarImage: { height: 44, width: 44 },
    avatarInitials: { color: '#FFFFFF', fontSize: typography.label, fontWeight: '900' },
    identityText: { flex: 1, minWidth: 0 },
    tenantName: { color: '#FFFFFF', fontSize: typography.title, fontWeight: '800' },
    companyName: {
      color: 'rgba(255,255,255,0.82)',
      fontSize: typography.caption,
      marginTop: 1,
    },
    userName: {
      color: '#FFFFFF',
      fontSize: typography.label,
      fontWeight: '600',
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderRadius: radius.pill,
      flexDirection: 'row',
      gap: 4,
      maxWidth: '100%',
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    chipText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.3,
    },

    // --- Menu -----------------------------------------------------------
    scroll: { flex: 1 },
    items: { paddingBottom: spacing.md, paddingTop: spacing.sm },
    sectionHeading: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
      paddingBottom: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
      textTransform: 'uppercase',
    },
    row: {
      alignItems: 'center',
      borderColor: 'transparent',
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.md,
      marginHorizontal: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
    },
    // Active tab: soft brand-tinted fill plus a visible border, so the current
    // screen is obvious without relying on colour alone.
    rowActive: {
      backgroundColor: c.accentSoft,
      borderColor: c.primary,
    },
    rowLabel: { color: c.textPrimary, flex: 1, fontSize: typography.body, fontWeight: '600' },
    rowLabelActive: { color: c.primary, fontWeight: '800' },
    divider: {
      backgroundColor: c.border,
      height: StyleSheet.hairlineWidth * 2,
      marginHorizontal: spacing.md,
      marginVertical: spacing.sm,
    },

    // --- Footer ---------------------------------------------------------
    footer: {
      backgroundColor: c.surface,
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
    },
    logout: {
      alignItems: 'center',
      borderRadius: radius.sm,
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      width: '100%',
    },
    logoutText: { color: c.danger, fontSize: typography.body, fontWeight: '700' },
  });
