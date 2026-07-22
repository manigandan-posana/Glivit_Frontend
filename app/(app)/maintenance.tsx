import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import { useGetFleetMaintenanceQuery, type MaintenancePredictionDto } from '@/src/services/aiApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

function riskColor(level: string, c: ThemeColors) {
  switch (level) {
    case 'CRITICAL':
      return c.danger;
    case 'HIGH':
      return '#EF4444';
    case 'MEDIUM':
      return c.warningOrange;
    default:
      return c.primaryGreen;
  }
}

export default function MaintenanceScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { data, isLoading, isFetching, isError, error, refetch } = useGetFleetMaintenanceQuery();

  if (isLoading) return <LoadingView label="Loading maintenance risk…" />;
  if (isError || !data) return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={c.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Predictive Maintenance</Text>
          <Text style={styles.subtitle}>Ranked by risk. Evidence-based; alerts never auto-flag a vehicle unsafe.</Text>
        </View>
      }
      ListEmptyComponent={
        <EmptyView icon="wrench-outline" title="No maintenance risk" message="Predictions appear as vehicles accrue usage." />
      }
      renderItem={({ item }) => <MaintenanceCard styles={styles} colors={c} item={item} />}
    />
  );
}

function MaintenanceCard({
  styles,
  colors: c,
  item,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  item: MaintenancePredictionDto;
}) {
  const color = riskColor(item.riskLevel, c);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons color={color} name="wrench-clock" size={22} />
        </View>
        <View style={styles.cardTitleWrap}>
          <Text numberOfLines={1} style={styles.vehicleName}>{item.vehicleName}</Text>
          <Text style={styles.cardMeta}>
            {item.predictedDaysRemaining != null ? `~${item.predictedDaysRemaining} days to service` : 'Interval-based'}
          </Text>
        </View>
        <View style={[styles.riskBadge, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
          <Text style={[styles.riskText, { color }]}>{item.riskLevel}</Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.min(100, Math.round(item.riskScore * 100))}%`, backgroundColor: color }]} />
      </View>

      <View style={styles.statRow}>
        <Stat styles={styles} label="Odometer" value={`${Math.round(item.odometerAtPrediction).toLocaleString()} km`} />
        <Stat styles={styles} label="Engine hrs" value={`${Math.round(item.engineHoursAtPrediction)}`} />
        <Stat styles={styles} label="Battery" value={`${Math.round(item.batteryHealth)}%`} />
      </View>

      {item.recommendedActions.length > 0 && (
        <View style={styles.actions}>
          {item.recommendedActions.map((a, i) => (
            <View key={i} style={styles.actionRow}>
              <MaterialCommunityIcons color={c.textSecondary} name="chevron-right" size={16} />
              <Text style={styles.actionText}>{a}</Text>
            </View>
          ))}
        </View>
      )}
      {item.reasoning ? <Text style={styles.reasoning}>{item.reasoning}</Text> : null}
    </View>
  );
}

function Stat({ styles, label, value }: { styles: ReturnType<typeof makeStyles>; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    content: { gap: spacing.sm, padding: spacing.md },
    header: { paddingBottom: spacing.sm },
    title: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    subtitle: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 17, marginTop: 2 },
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      gap: spacing.sm,
      padding: spacing.md,
    },
    cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    iconWrap: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.sm,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    cardTitleWrap: { flex: 1, minWidth: 0 },
    vehicleName: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800' },
    cardMeta: { color: c.textSecondary, fontSize: typography.caption, marginTop: 2 },
    riskBadge: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: spacing.sm, paddingVertical: 3 },
    riskText: { fontSize: 10, fontWeight: '900' },
    barTrack: { backgroundColor: c.surfaceAlt, borderRadius: radius.pill, height: 8, overflow: 'hidden' },
    barFill: { borderRadius: radius.pill, height: 8 },
    statRow: { flexDirection: 'row', gap: spacing.sm },
    stat: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.sm,
      flex: 1,
      paddingVertical: spacing.sm,
    },
    statValue: { color: c.textPrimary, fontSize: typography.label, fontWeight: '800', fontVariant: ['tabular-nums'] },
    statLabel: { color: c.textSecondary, fontSize: 11, marginTop: 2 },
    actions: { gap: 2, marginTop: 2 },
    actionRow: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    actionText: { color: c.textPrimary, fontSize: typography.caption, flex: 1 },
    reasoning: { color: c.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  });
