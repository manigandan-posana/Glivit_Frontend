import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventAiConversation } from '@/src/components/EventAiConversation';
import { Card } from '@/src/components/ui/Card';
import { Chip } from '@/src/components/ui/ModulePrimitives';
import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import {
  useGetAiEventsQuery,
  useGetAiDashboardSummaryQuery,
  type AiEventDto,
  type EventChatContextDto,
} from '@/src/services/aiApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

const SEVERITIES = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

/**
 * AI Command Centre, rendered inside the notification center (it no longer has
 * its own page). Shows fleet-health, AI metrics and the AI events feed, and
 * opens the per-event AI conversation inline instead of navigating to a route.
 */
export function AiCommandCentrePanel() {
  const { colors: c, stateColors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('ALL');
  const [activeContext, setActiveContext] = useState<EventChatContextDto | null>(null);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1900,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const summary = useGetAiDashboardSummaryQuery();
  const events = useGetAiEventsQuery(severity === 'ALL' ? { size: 50 } : { severity, size: 50 });

  if (activeContext) {
    return <EventAiConversation context={activeContext} onBack={() => setActiveContext(null)} />;
  }

  if (summary.isLoading) return <LoadingView label="Loading AI command centre…" />;
  if (summary.isError || !summary.data) {
    return <ErrorRetryView message={apiErrorMessage(summary.error)} onRetry={summary.refetch} />;
  }

  const s = summary.data;
  const rawHealth = Number(s.fleetHealthScore);
  const health = Number.isFinite(rawHealth) ? Math.max(0, Math.min(100, rawHealth)) : 0;
  const healthColor = health >= 90 ? stateColors.RUNNING : health >= 70 ? stateColors.IDLE : stateColors.STOPPED;

  const metrics = [
    { icon: 'car-multiple', label: 'Active', value: s.totalActiveVehicles, tint: c.primary },
    { icon: 'bell-alert', label: 'Open alerts', value: s.unacknowledgedAiAlerts, tint: c.danger },
    { icon: 'alert-decagram', label: 'Critical 24h', value: s.criticalRiskVehicles, tint: c.danger },
    { icon: 'wrench-clock', label: 'Maint. risk', value: s.highRiskMaintenanceCount, tint: c.warningOrange },
    { icon: 'steering', label: 'Risky drivers', value: s.riskyDriversCount, tint: c.warningOrange },
    { icon: 'map-marker-path', label: 'Deviations', value: s.activeRouteDeviationsCount, tint: c.info },
  ] as const;

  return (
    <FlatList
      style={styles.screen}
      data={events.data?.content ?? []}
      keyExtractor={(item) => String(item.id)}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={summary.isFetching || events.isFetching}
          onRefresh={() => {
            summary.refetch();
            events.refetch();
          }}
          tintColor={c.primary}
        />
      }
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}
      ListHeaderComponent={
        <View style={{ gap: spacing.md }}>
          <Card style={styles.heroCard}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>Fleet Health</Text>
              <View style={styles.gaugeWrap}>
                <Animated.View
                  style={[
                    styles.pulse,
                    {
                      borderColor: healthColor,
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.7] }) }],
                    },
                  ]}
                />
                <Text style={[styles.heroScore, { color: healthColor }]}>{health.toFixed(0)}</Text>
              </View>
              <Text style={styles.heroOutOf}>/ 100</Text>
            </View>
            <View style={styles.heroDivider} />
            <Text style={styles.heroSummary}>{s.executiveAiSummary}</Text>
          </Card>

          <View style={styles.grid}>
            {metrics.map((m) => (
              <View key={m.label} style={styles.metric}>
                <MaterialCommunityIcons name={m.icon as never} color={m.tint} size={20} />
                <Text style={[styles.metricValue, { color: Number(m.value) > 0 ? m.tint : c.textPrimary }]}>
                  {m.value}
                </Text>
                <Text style={styles.metricLabel}>{m.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>AI Events</Text>
          </View>
          <View style={styles.filters}>
            {SEVERITIES.map((sv) => (
              <Chip key={sv} active={sv === severity} label={sv} onPress={() => setSeverity(sv)} />
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        events.isLoading ? (
          <View style={styles.pad}>
            <LoadingView label="Loading events…" />
          </View>
        ) : (
          <EmptyView icon="shield-check-outline" title="No AI events" message="No anomalies for this filter." />
        )
      }
      renderItem={({ item }) => (
        <EventRow
          styles={styles}
          colors={c}
          severityColor={severityColor(item.severity, c)}
          event={item}
          onAsk={() => setActiveContext(aiEventContext(item))}
        />
      )}
    />
  );
}

function EventRow({
  styles,
  colors: c,
  severityColor,
  event,
  onAsk,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  severityColor: string;
  event: AiEventDto;
  onAsk: () => void;
}) {
  return (
    <View style={styles.eventCard}>
      <View style={[styles.eventBar, { backgroundColor: severityColor }]} />
      <View style={styles.eventBody}>
        <View style={styles.eventTop}>
          <Text numberOfLines={1} style={styles.eventType}>
            {formatType(event.eventType)}
          </Text>
          <View style={[styles.badge, { backgroundColor: `${severityColor}22`, borderColor: `${severityColor}55` }]}>
            <Text style={[styles.badgeText, { color: severityColor }]}>{event.severity}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.eventText}>
          {event.explanation ?? 'AI-detected anomaly'}
        </Text>
        <Text style={styles.eventMeta}>
          {event.vehicleName ?? `Vehicle #${event.vehicleId ?? '—'}`} · score {safeScore(event.score)} ·{' '}
          {formatTime(event.createdAt)}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`Ask AI about event ${event.id}`}
        accessibilityRole="button"
        onPress={onAsk}
        style={styles.askBtn}>
        <Text style={styles.askText}>Ask</Text>
      </Pressable>
    </View>
  );
}

function severityColor(severity: string, c: ThemeColors) {
  switch (severity) {
    case 'CRITICAL':
      return c.danger;
    case 'HIGH':
      return '#EF4444';
    case 'MEDIUM':
      return c.warningOrange;
    default:
      return c.info;
  }
}

function formatType(value: unknown) {
  const text = typeof value === 'string' && value.trim() ? value.trim() : 'Unknown event';
  return text.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatTime(iso: unknown) {
  if (typeof iso !== 'string' || !iso.trim()) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function safeScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(2) : '—';
}

function aiEventContext(event: AiEventDto): EventChatContextDto {
  const latitude = Number(event.latitude);
  const longitude = Number(event.longitude);
  const location =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
      : 'Location unavailable';

  return {
    source: 'AI',
    eventId: event.id,
    type: formatType(event.eventType || 'Unknown event'),
    vehicle:
      event.vehicleName?.trim() ||
      (event.vehicleId != null ? `Vehicle #${event.vehicleId}` : 'Unassigned'),
    deviceId: event.deviceId != null ? String(event.deviceId) : 'Unavailable',
    time: formatTime(event.createdAt),
    severity: event.severity?.trim().toUpperCase() || 'INFO',
    location,
    description:
      event.explanation?.trim() || event.evidenceJson?.trim() || formatType(event.eventType),
  };
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    content: { gap: spacing.sm, padding: spacing.md },
    pad: { paddingVertical: spacing.xl },
    heroCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
    heroLeft: { alignItems: 'center', minWidth: 96 },
    heroLabel: { color: c.textSecondary, fontSize: typography.caption, fontWeight: '700', textTransform: 'uppercase' },
    gaugeWrap: { alignItems: 'center', justifyContent: 'center' },
    pulse: {
      borderRadius: 999,
      borderWidth: 2,
      height: 64,
      position: 'absolute',
      width: 64,
    },
    heroScore: { fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 48 },
    heroOutOf: { color: c.textMuted, fontSize: typography.caption },
    heroDivider: { alignSelf: 'stretch', backgroundColor: c.border, width: StyleSheet.hairlineWidth * 2 },
    heroSummary: { color: c.textSecondary, flex: 1, fontSize: typography.body, lineHeight: 20 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    metric: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexBasis: '31%',
      flexGrow: 1,
      gap: 2,
      paddingVertical: spacing.md,
    },
    metricValue: { fontSize: typography.h2, fontWeight: '800', fontVariant: ['tabular-nums'] },
    metricLabel: { color: c.textSecondary, fontSize: 11, textAlign: 'center' },
    sectionHeader: { marginTop: spacing.sm },
    sectionTitle: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    eventCard: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.sm,
      overflow: 'hidden',
      paddingRight: spacing.md,
    },
    eventBar: { alignSelf: 'stretch', width: 4 },
    eventBody: { flex: 1, gap: 2, paddingVertical: spacing.md },
    eventTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    eventType: { color: c.textPrimary, flex: 1, fontSize: typography.body, fontWeight: '800' },
    badge: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth * 2, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontWeight: '900' },
    eventText: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 17 },
    eventMeta: { color: c.textMuted, fontSize: 11, marginTop: 2 },
    askBtn: {
      alignItems: 'center',
      borderColor: c.primary,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth * 2,
      height: 34,
      justifyContent: 'center',
      width: 46,
    },
    askText: { color: c.primary, fontSize: typography.caption, fontWeight: '800' },
  });
