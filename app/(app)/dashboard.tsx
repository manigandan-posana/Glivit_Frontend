import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/src/components/ui/Card';
import { Doughnut, type DoughnutSegment } from '@/src/components/ui/Doughnut';
import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import { useGetDashboardSummaryQuery } from '@/src/services/dashboardApi';
import { defaultColors, palette, spacing, stateColors, typography } from '@/src/theme/tokens';

const STATE_ORDER = ['RUNNING', 'STOPPED', 'IDLE', 'INACTIVE', 'NO_DATA', 'EXPIRED'] as const;

const STATE_LABELS: Record<string, string> = {
  RUNNING: 'Running',
  STOPPED: 'Stopped',
  IDLE: 'Idle',
  INACTIVE: 'Inactive',
  NO_DATA: 'No Data',
  EXPIRED: 'Expired',
  TOTAL: 'Total',
};

export default function DashboardScreen() {
  const router = useRouter();
  const { data, isLoading, isFetching, isError, error, refetch } = useGetDashboardSummaryQuery();

  const segments = useMemo<DoughnutSegment[]>(() => {
    if (!data) return [];
    return STATE_ORDER.map((state) => ({
      label: STATE_LABELS[state],
      value: data.counts[state] ?? 0,
      color: stateColors[state],
    }));
  }, [data]);

  if (isLoading) {
    return <LoadingView label="Loading fleet summary…" />;
  }
  if (isError || !data) {
    return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;
  }

  const cards = [...STATE_ORDER.map((s) => ({ key: s, count: data.counts[s] ?? 0 })), { key: 'TOTAL', count: data.total }];
  const isEmptyFleet = data.total === 0;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={defaultColors.primary} />}>
      <Card style={styles.chartCard}>
        <Text style={styles.sectionTitle}>Fleet Status</Text>
        {isEmptyFleet ? (
          <EmptyView icon="car-off" title="No vehicles yet" message="Devices will appear here once added." />
        ) : (
          <View style={styles.chartRow}>
            <Doughnut centerLabel="Total" centerValue={data.total} segments={segments} />
          </View>
        )}
        <Text style={styles.updated}>Last updated {formatTime(data.lastUpdated)}</Text>
      </Card>

      <View style={styles.grid}>
        {cards.map((card) => (
          <Pressable
            key={card.key}
            accessibilityRole="button"
            onPress={() =>
              router.push(
                card.key === 'TOTAL'
                  ? { pathname: '/vehicles' }
                  : { pathname: '/vehicles', params: { state: card.key } }
              )
            }
            style={styles.statusCard}>
            <View style={[styles.dot, { backgroundColor: stateColors[card.key] }]} />
            <Text style={styles.statusCount}>{card.count}</Text>
            <Text style={styles.statusLabel}>{STATE_LABELS[card.key]}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  content: { backgroundColor: palette.pageBackground, gap: spacing.md, padding: spacing.md },
  chartCard: { alignItems: 'center' },
  sectionTitle: {
    alignSelf: 'flex-start',
    color: palette.textPrimary,
    fontSize: typography.title,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  chartRow: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm },
  updated: { color: palette.textSecondary, fontSize: typography.caption, marginTop: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusCard: {
    backgroundColor: palette.cardBackground,
    borderColor: palette.divider,
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '31.5%',
    flexGrow: 1,
    padding: spacing.md,
  },
  dot: { borderRadius: 6, height: 12, marginBottom: spacing.sm, width: 12 },
  statusCount: { color: palette.textPrimary, fontSize: typography.h2, fontWeight: '800' },
  statusLabel: { color: palette.textSecondary, fontSize: typography.caption, marginTop: 2 },
});
