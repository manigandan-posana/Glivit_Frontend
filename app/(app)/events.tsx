import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import { useAcknowledgeEventMutation, useGetEventsQuery } from '@/src/services/operationsApi';
import type { EventDto } from '@/src/types/api';
import { defaultColors, palette, spacing, typography } from '@/src/theme/tokens';

const severityColors: Record<string, string> = {
  CRITICAL: palette.errorRed,
  WARNING: palette.warningOrange,
  INFO: palette.blue,
};

export default function EventsScreen() {
  const { data, isLoading, isFetching, isError, error, refetch } = useGetEventsQuery({ size: 50 });
  const [acknowledge, { isLoading: isAcking }] = useAcknowledgeEventMutation();
  const [pendingId, setPendingId] = React.useState<number | null>(null);

  const onAcknowledge = async (event: EventDto) => {
    setPendingId(event.id);
    try {
      await acknowledge(event.id).unwrap();
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) return <LoadingView label="Loading events..." />;
  if (isError || !data) return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={data.content}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={defaultColors.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Events & Alerts</Text>
            <Text style={styles.subtitle}>Acknowledgements are audited and tenant-scoped.</Text>
          </View>
        }
        ListEmptyComponent={<EmptyView icon="bell-off-outline" title="No events" message="Alerts will appear here." />}
        renderItem={({ item }) => {
          const color = severityColors[item.severity] ?? palette.textSecondary;
          const loading = isAcking && pendingId === item.id;
          return (
            <View style={styles.card}>
              <View style={[styles.icon, { backgroundColor: `${color}18` }]}>
                <MaterialCommunityIcons color={color} name="bell-alert-outline" size={22} />
              </View>
              <View style={styles.body}>
                <View style={styles.topRow}>
                  <Text numberOfLines={1} style={styles.eventType}>
                    {formatType(item.eventType)}
                  </Text>
                  <View style={[styles.severity, { backgroundColor: color }]}>
                    <Text style={styles.severityText}>{item.severity}</Text>
                  </View>
                </View>
                <Text numberOfLines={2} style={styles.meta}>
                  Device #{item.deviceId} | {formatTime(item.serverTime)}
                </Text>
                <Text numberOfLines={2} style={styles.address}>
                  {item.address ?? item.detail ?? 'Location unavailable'}
                </Text>
              </View>
              {item.acknowledged ? (
                <MaterialCommunityIcons color={palette.primaryGreen} name="check-circle" size={22} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={loading}
                  onPress={() => onAcknowledge(item)}
                  style={styles.ackButton}>
                  <Text style={styles.ackText}>{loading ? '...' : 'Ack'}</Text>
                </Pressable>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function formatType(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No time';
  return date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.pageBackground, flex: 1 },
  list: { gap: spacing.sm, padding: spacing.md },
  header: { paddingBottom: spacing.sm },
  title: { color: palette.textPrimary, fontSize: typography.title, fontWeight: '900' },
  subtitle: { color: palette.textSecondary, fontSize: typography.caption, marginTop: 2 },
  card: {
    alignItems: 'center',
    backgroundColor: palette.cardBackground,
    borderColor: palette.divider,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  icon: { alignItems: 'center', borderRadius: 8, height: 42, justifyContent: 'center', width: 42 },
  body: { flex: 1, minWidth: 0 },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  eventType: { color: palette.textPrimary, flex: 1, fontSize: typography.body, fontWeight: '800' },
  severity: { borderRadius: 6, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  severityText: { color: palette.white, fontSize: 10, fontWeight: '900' },
  meta: { color: palette.textSecondary, fontSize: typography.caption, marginTop: 3 },
  address: { color: palette.textSecondary, fontSize: typography.caption, lineHeight: 17, marginTop: 2 },
  ackButton: {
    alignItems: 'center',
    borderColor: defaultColors.primary,
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 48,
  },
  ackText: { color: defaultColors.primary, fontSize: typography.caption, fontWeight: '800' },
});
