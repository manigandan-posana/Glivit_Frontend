import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PressableScale, enterUp } from '@/src/components/ui/Motion';
import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import { useAcknowledgeEventMutation, useGetEventsQuery } from '@/src/services/operationsApi';
import { useGetAiEventsQuery, useAcknowledgeAiEventMutation, useSubmitAiFeedbackMutation } from '@/src/services/aiApi';
import type { EventDto } from '@/src/types/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

export default function EventsScreen() {
  const { colors: c } = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const severityColors: Record<string, string> = {
    CRITICAL: c.danger,
    WARNING: c.warningOrange,
    INFO: c.info,
  };
  const [activeTab, setActiveTab] = React.useState<'STANDARD' | 'AI'>('AI');
  const { data, isLoading, isFetching, isError, error, refetch } = useGetEventsQuery({ size: 50 }, { skip: activeTab === 'AI' });
  const { data: aiData, isLoading: isAiLoading, isFetching: isAiFetching, isError: isAiError, error: aiError, refetch: refetchAi } = useGetAiEventsQuery(undefined, { skip: activeTab === 'STANDARD' });
  
  const [acknowledge, { isLoading: isAcking }] = useAcknowledgeEventMutation();
  const [acknowledgeAi, { isLoading: isAckingAi }] = useAcknowledgeAiEventMutation();
  const [submitFeedback] = useSubmitAiFeedbackMutation();
  const [pendingId, setPendingId] = React.useState<number | null>(null);

  const onAcknowledge = async (id: number, isAi: boolean) => {
    setPendingId(id);
    try {
      if (isAi) {
        await acknowledgeAi(id).unwrap();
      } else {
        await acknowledge(id).unwrap();
      }
    } finally {
      setPendingId(null);
    }
  };

  const onFeedback = async (id: number, isHelpful: boolean) => {
    try {
      await submitFeedback({
        aiEventId: id,
        featureType: 'AI_EVENT',
        isCorrect: isHelpful,
        feedbackType: isHelpful ? 'AGREE' : 'DISAGREE',
        comments: '',
      }).unwrap();
    } catch (e) {
      console.warn('Feedback failed', e);
    }
  };

  const loading = activeTab === 'AI' ? isAiLoading : isLoading;
  const fetching = activeTab === 'AI' ? isAiFetching : isFetching;
  const errorState = activeTab === 'AI' ? isAiError : isError;
  const errorObj = activeTab === 'AI' ? aiError : error;
  const currentData = activeTab === 'AI' ? aiData?.content : data?.content;

  if (loading) return <LoadingView label="Loading events..." />;
  if (errorState || !currentData) return <ErrorRetryView message={apiErrorMessage(errorObj)} onRetry={activeTab === 'AI' ? refetchAi : refetch} />;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={currentData}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={fetching} onRefresh={activeTab === 'AI' ? refetchAi : refetch} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Events & Alerts</Text>
            <View style={styles.tabs}>
              <Pressable onPress={() => setActiveTab('STANDARD')} style={[styles.tab, activeTab === 'STANDARD' && styles.activeTab]}>
                <Text style={[styles.tabText, activeTab === 'STANDARD' && styles.activeTabText]}>Standard</Text>
              </Pressable>
              <Pressable onPress={() => setActiveTab('AI')} style={[styles.tab, activeTab === 'AI' && styles.activeTab]}>
                <Text style={[styles.tabText, activeTab === 'AI' && styles.activeTabText]}>AI Insights</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>Acknowledgements are audited and tenant-scoped.</Text>
          </View>
        }
        ListEmptyComponent={<EmptyView icon="bell-off-outline" title="No events" message="Alerts will appear here." />}
        renderItem={({ item, index }: { item: any; index: number }) => {
          const color = severityColors[item.severity] ?? c.textSecondary;
          const isAckLoading = (isAcking || isAckingAi) && pendingId === item.id;
          const isAi = activeTab === 'AI';
          return (
            <Animated.View entering={enterUp(index)} style={styles.card}>
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
                  Device #{item.deviceId} | {formatTime(isAi ? item.createdAt : item.serverTime)}
                </Text>
                <Text numberOfLines={isAi ? 4 : 2} style={styles.address}>
                  {isAi ? (item.explanation ?? formatType(item.eventType)) : (item.address ?? item.detail ?? 'Location unavailable')}
                </Text>
                {isAi && item.evidenceJson && (
                  <Text numberOfLines={1} style={styles.evidence}>
                    Evidence: {item.evidenceJson}
                  </Text>
                )}
                {isAi && (
                  <View style={styles.feedbackRow}>
                    <Text style={styles.feedbackLabel}>Helpful?</Text>
                    <PressableScale haptic onPress={() => onFeedback(item.id, true)} style={styles.feedbackBtn}>
                      <MaterialCommunityIcons name="thumb-up-outline" size={16} color={c.textSecondary} />
                    </PressableScale>
                    <PressableScale haptic onPress={() => onFeedback(item.id, false)} style={styles.feedbackBtn}>
                      <MaterialCommunityIcons name="thumb-down-outline" size={16} color={c.textSecondary} />
                    </PressableScale>
                  </View>
                )}
              </View>
              {item.acknowledged ? (
                <MaterialCommunityIcons color={c.primaryGreen} name="check-circle" size={22} />
              ) : (
                <PressableScale
                  haptic
                  accessibilityRole="button"
                  disabled={isAckLoading}
                  onPress={() => onAcknowledge(item.id, isAi)}
                  style={styles.ackButton}>
                  <Text style={styles.ackText}>{isAckLoading ? '...' : 'Ack'}</Text>
                </PressableScale>
              )}
            </Animated.View>
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    list: { gap: spacing.sm, padding: spacing.md },
    header: { paddingBottom: spacing.sm },
    title: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    subtitle: { color: c.textSecondary, fontSize: typography.caption, marginTop: 2 },
    card: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
    },
    icon: { alignItems: 'center', borderRadius: radius.sm, height: 42, justifyContent: 'center', width: 42 },
    body: { flex: 1, minWidth: 0 },
    topRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    eventType: { color: c.textPrimary, flex: 1, fontSize: typography.body, fontWeight: '800' },
    severity: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
    severityText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
    meta: { color: c.textSecondary, fontSize: typography.caption, marginTop: 3 },
    address: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 17, marginTop: 2 },
    ackButton: {
      alignItems: 'center',
      borderColor: c.primary,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth * 2,
      height: 36,
      justifyContent: 'center',
      width: 48,
    },
    ackText: { color: c.primary, fontSize: typography.caption, fontWeight: '800' },
    tabs: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.sm },
    tab: { paddingVertical: spacing.xs, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: c.primary },
    tabText: { color: c.textSecondary, fontWeight: '600' },
    activeTabText: { color: c.primary },
    evidence: { color: c.textMuted, fontSize: 10, marginTop: 4, fontStyle: 'italic' },
    feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
    feedbackLabel: { color: c.textSecondary, fontSize: 12 },
    feedbackBtn: { padding: 4 },
  });
