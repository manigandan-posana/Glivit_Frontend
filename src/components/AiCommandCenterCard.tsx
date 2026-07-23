import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Animated from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGetDashboardSummaryQuery } from '@/src/services/aiApi';
import { Card } from '@/src/components/ui/Card';
import { AnimatedCount, PulseDot, enterUp } from '@/src/components/ui/Motion';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

export function AiCommandCenterCard() {
  const { colors: c, stateColors } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { data: summary, isLoading, isError } = useGetDashboardSummaryQuery();

  if (isLoading) {
    return (
      <Card style={styles.card}>
        <ActivityIndicator color={c.primary} />
        <Text style={styles.loadingText}>Loading AI Command Center…</Text>
      </Card>
    );
  }

  if (isError || !summary) {
    return (
      <Card style={[styles.card, styles.errorCard]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={22} color={c.danger} />
        <Text style={styles.errorText}>AI services offline — core tracking unaffected</Text>
      </Card>
    );
  }

  const healthColor =
    summary.fleetHealthScore >= 90
      ? stateColors.RUNNING
      : summary.fleetHealthScore >= 70
        ? stateColors.IDLE
        : stateColors.STOPPED;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="brain" size={22} color={c.primary} />
        <Text style={styles.title}>AI Command Center</Text>
        <View style={styles.liveBadge}>
          <PulseDot color={c.primary} size={7} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={styles.summaryContainer}>
        <Text style={styles.summaryText}>{summary.executiveAiSummary}</Text>
      </View>

      <View style={styles.grid}>
        <Metric styles={styles} index={0} label="Fleet Health" value={summary.fleetHealthScore} suffix="%" color={healthColor} />
        <Metric styles={styles} index={1} label="Active Alerts" value={summary.unacknowledgedAiAlerts} color={summary.unacknowledgedAiAlerts > 0 ? c.danger : c.textPrimary} />
        <Metric styles={styles} index={2} label="Risky Drivers" value={summary.riskyDriversCount} color={summary.riskyDriversCount > 0 ? c.warningOrange : c.textPrimary} />
        <Metric styles={styles} index={3} label="Maint. Risk" value={summary.highRiskMaintenanceCount} color={summary.highRiskMaintenanceCount > 0 ? c.danger : c.textPrimary} />
      </View>

      {summary.recentCriticalEvents.length > 0 && (
        <View style={styles.eventsSection}>
          <Text style={styles.eventsTitle}>Recent Critical Events</Text>
          {summary.recentCriticalEvents.slice(0, 4).map((event, i) => (
            <Animated.View key={event.id} entering={enterUp(i)} style={styles.eventRow}>
              <MaterialCommunityIcons
                name={event.eventType === 'SPEEDING' ? 'speedometer' : 'alert'}
                size={16}
                color={c.danger}
              />
              <Text style={styles.eventText} numberOfLines={1}>
                {event.explanation ?? event.eventType}
              </Text>
            </Animated.View>
          ))}
        </View>
      )}
    </Card>
  );
}

function Metric({
  styles,
  index,
  label,
  value,
  suffix,
  color,
}: {
  styles: ReturnType<typeof makeStyles>;
  index: number;
  label: string;
  value: number;
  suffix?: string;
  color: string;
}) {
  return (
    <Animated.View entering={enterUp(index)} style={styles.gridItem}>
      <Text style={styles.gridLabel}>{label}</Text>
      <AnimatedCount value={value} suffix={suffix} style={[styles.gridValue, { color }]} />
    </Animated.View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    errorCard: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    title: {
      fontSize: typography.title,
      fontWeight: '800',
      color: c.textPrimary,
      flex: 1,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.accentSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    liveText: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.5,
      color: c.primary,
    },
    summaryContainer: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      padding: spacing.sm,
      borderRadius: radius.sm,
      marginBottom: spacing.md,
    },
    summaryText: {
      fontSize: typography.body,
      color: c.textSecondary,
      lineHeight: 20,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    gridItem: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
      padding: spacing.md,
      borderRadius: radius.md,
      alignItems: 'center',
    },
    gridLabel: {
      fontSize: typography.caption,
      color: c.textSecondary,
      marginBottom: 4,
    },
    gridValue: {
      fontSize: typography.h2,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    eventsSection: {
      marginTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      borderTopColor: c.border,
      paddingTop: spacing.md,
    },
    eventsTitle: {
      fontSize: typography.caption,
      fontWeight: '800',
      color: c.textSecondary,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    eventText: {
      fontSize: typography.body,
      color: c.textPrimary,
      flex: 1,
    },
    loadingText: {
      marginTop: spacing.sm,
      color: c.textSecondary,
      textAlign: 'center',
    },
    errorText: {
      color: c.danger,
      fontWeight: '600',
      flex: 1,
    },
  });
