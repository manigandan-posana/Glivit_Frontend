import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { RowCard } from '@/src/components/ui/ModulePrimitives';
import { ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { StatusPill } from '@/src/components/ui/StatusPill';
import { apiErrorMessage } from '@/src/services/apiError';
import { useGetDeviceQuery } from '@/src/services/devicesApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

export default function DeviceProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Number(params.id);
  const { data, isLoading, isError, error, refetch } = useGetDeviceQuery(id, { skip: !Number.isFinite(id) });

  if (isLoading) return <LoadingView label="Loading device profile..." />;
  if (isError || !data) return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;

  const callDriver = () => {
    if (data.driverPhone) Linking.openURL(`tel:${data.driverPhone}`).catch(() => undefined);
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
          <MaterialCommunityIcons color="#FFFFFF" name="arrow-left" size={24} />
        </Pressable>
        <View style={styles.vehicleIcon}>
          <MaterialCommunityIcons color="#FFFFFF" name="car-connected" size={40} />
        </View>
        <Text numberOfLines={1} style={styles.name}>{data.name}</Text>
        <Text numberOfLines={1} style={styles.subtitle}>IMEI {data.imei} | {data.model ?? data.category}</Text>
        <StatusPill state={data.state} />
      </View>

      <Card style={styles.actions}>
        <Button
          label="Live track"
          icon="crosshairs-gps"
          onPress={() => router.push({ pathname: '/live-track', params: { deviceId: String(data.id), name: data.name, subtitle: data.address ?? '' } })}
        />
        <Button
          label="Cinematic 3D Playback"
          icon="movie-open"
          variant="secondary"
          onPress={() => router.push({ pathname: '/trip-playback' as never, params: { deviceId: String(data.id), name: data.name } })}
        />
        <View style={styles.actionRow}>
          <Pressable accessibilityRole="button" disabled={!data.driverPhone} onPress={callDriver} style={styles.iconAction}>
            <MaterialCommunityIcons color={data.driverPhone ? c.primary : c.textMuted} name="phone" size={22} />
            <Text style={styles.iconActionText}>Call</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/reports' as never)} style={styles.iconAction}>
            <MaterialCommunityIcons color={c.info} name="file-chart-outline" size={22} />
            <Text style={styles.iconActionText}>Reports</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/commands' as never)} style={styles.iconAction}>
            <MaterialCommunityIcons color={c.warningOrange} name="console-line" size={22} />
            <Text style={styles.iconActionText}>Commands</Text>
          </Pressable>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Current State</Text>
        <Metric label="Speed" value={`${Math.round(data.speed)} ${data.speedUnit === 'MPH' ? 'mph' : 'km/h'}`} />
        <Metric label="Last update" value={formatTime(data.lastUpdate)} />
        <Metric label="Address" value={data.address ?? 'Unavailable'} />
        <Metric label="Ignition" value={data.ignition == null ? 'Unavailable' : data.ignition ? 'On' : 'Off'} />
        <Metric label="GPS" value={data.gpsValid ? 'Valid' : 'Invalid'} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Assignment</Text>
        <Metric label="Driver" value={data.driverName ?? 'Unassigned'} />
        <Metric label="Phone" value={data.driverPhone ?? 'Unavailable'} />
        <Metric label="Project" value={data.projectId ? `#${data.projectId}` : 'Unassigned'} />
        <Metric label="Group" value={data.groupId ? `#${data.groupId}` : 'Unassigned'} />
        <Metric label="Expiry" value={data.expiryDate ?? 'Unavailable'} />
      </Card>

      <RowCard icon="sim-outline" title="SIM information" meta={`${data.simNumber ?? 'No SIM'} | ${data.simProvider ?? 'Provider unavailable'}`} />
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function formatTime(iso?: string | null) {
  if (!iso) return 'No data';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'No data'
    : date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    content: { backgroundColor: c.pageBackground, gap: spacing.md, padding: spacing.md },
    header: {
      alignItems: 'center',
      backgroundColor: '#111A26',
      borderRadius: radius.lg,
      gap: spacing.sm,
      minHeight: 210,
      overflow: 'hidden',
      padding: spacing.lg,
    },
    back: { alignItems: 'center', height: 42, justifyContent: 'center', left: spacing.sm, position: 'absolute', top: spacing.sm, width: 42 },
    vehicleIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, height: 76, justifyContent: 'center', marginTop: spacing.lg, width: 76 },
    name: { color: '#FFFFFF', fontSize: typography.h2, fontWeight: '900', marginTop: spacing.sm },
    subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: typography.caption },
    actions: { gap: spacing.md },
    actionRow: { flexDirection: 'row', gap: spacing.sm },
    iconAction: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderRadius: radius.sm,
      flex: 1,
      gap: 4,
      height: 64,
      justifyContent: 'center',
    },
    iconActionText: { color: c.textPrimary, fontSize: typography.caption, fontWeight: '800' },
    card: { gap: spacing.sm },
    sectionTitle: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    metric: {
      borderTopColor: c.border,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'space-between',
      paddingTop: spacing.sm,
    },
    metricLabel: { color: c.textSecondary, fontSize: typography.caption, fontWeight: '700', width: 108 },
    metricValue: { color: c.textPrimary, flex: 1, fontSize: typography.body, fontWeight: '700', textAlign: 'right' },
  });
