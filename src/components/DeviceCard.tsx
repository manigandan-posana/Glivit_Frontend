import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusPill } from '@/src/components/ui/StatusPill';
import type { DeviceSummary } from '@/src/types/api';
import { palette, radius, spacing, typography } from '@/src/theme/tokens';

const CATEGORY_ICON: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  CAR: 'car',
  TRUCK: 'truck',
  BUS: 'bus',
  MIXER_TRUCK: 'truck-cargo-container',
  BIKE: 'motorbike',
  HEAVY_MACHINERY: 'excavator',
  GPS_DEVICE: 'crosshairs-gps',
  GPS: 'crosshairs-gps',
};

export function DeviceCard({ device, onPress }: { device: DeviceSummary; onPress: () => void }) {
  const online = device.gpsValid && device.state !== 'NO_DATA' && device.state !== 'INACTIVE';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons
          color={palette.primaryGreen}
          name={CATEGORY_ICON[device.category] ?? 'crosshairs-gps'}
          size={28}
        />
        <View style={[styles.onlineDot, { backgroundColor: online ? palette.primaryGreen : palette.textSecondary }]} />
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text numberOfLines={1} style={styles.name}>
            {device.name}
          </Text>
          <StatusPill state={device.state} />
        </View>
        <Text numberOfLines={1} style={styles.imei}>
          IMEI {device.imei}
        </Text>
        <Text numberOfLines={1} style={styles.address}>
          {device.address ?? 'Address unavailable'}
        </Text>
        <View style={styles.metaRow}>
          <Meta icon="speedometer" text={`${Math.round(device.speed)} km/h`} />
          <Meta icon="clock-outline" text={formatUpdate(device.lastUpdate)} />
        </View>
      </View>
    </Pressable>
  );
}

function Meta({
  icon,
  text,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  text: string;
}) {
  return (
    <View style={styles.meta}>
      <MaterialCommunityIcons color={palette.textSecondary} name={icon} size={14} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

function formatUpdate(iso?: string | null) {
  if (!iso) return 'No data';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No data';
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.cardBackground,
    borderColor: palette.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: '#EAF9EE',
    borderRadius: radius.md,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  onlineDot: {
    borderColor: palette.white,
    borderRadius: 6,
    borderWidth: 2,
    bottom: -2,
    height: 12,
    position: 'absolute',
    right: -2,
    width: 12,
  },
  body: { flex: 1, minWidth: 0 },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  name: { color: palette.textPrimary, flex: 1, fontSize: typography.body, fontWeight: '800' },
  imei: { color: palette.textSecondary, fontSize: typography.caption, marginTop: 2 },
  address: { color: palette.textSecondary, fontSize: typography.caption, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  meta: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  metaText: { color: palette.textSecondary, fontSize: typography.caption },
});
