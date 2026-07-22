import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/src/components/ui/Card';
import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import { useGetDriverScoreQuery } from '@/src/services/aiApi';
import { useGetDriversQuery } from '@/src/services/operationsApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

function gradeColor(score: number, c: ThemeColors) {
  if (score >= 90) return c.primaryGreen;
  if (score >= 75) return c.info;
  if (score >= 60) return c.warningOrange;
  return c.danger;
}

export default function DriversScreen() {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const drivers = useGetDriversQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedId == null && drivers.data && drivers.data.length > 0) {
      setSelectedId(drivers.data[0].id);
    }
  }, [drivers.data, selectedId]);

  const score = useGetDriverScoreQuery(selectedId as number, { skip: selectedId == null });

  if (drivers.isLoading) return <LoadingView label="Loading drivers…" />;
  if (drivers.isError || !drivers.data) {
    return <ErrorRetryView message={apiErrorMessage(drivers.error)} onRetry={drivers.refetch} />;
  }
  if (drivers.data.length === 0) {
    return <EmptyView icon="account-off-outline" title="No drivers" message="Add drivers in Management first." />;
  }

  const s = score.data;
  const overall = s?.overallScore ?? 0;
  const color = gradeColor(overall, c);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={drivers.data}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={
        <View style={{ gap: spacing.md }}>
          {selectedId != null && (
            <Card style={styles.scoreCard}>
              {score.isFetching && !s ? (
                <Text style={styles.loading}>Loading score…</Text>
              ) : s ? (
                <>
                  <View style={styles.scoreTop}>
                    <View style={[styles.gauge, { borderColor: color }]}>
                      <Text style={[styles.gaugeScore, { color }]}>{overall.toFixed(0)}</Text>
                      <Text style={styles.gaugeGrade}>{s.grade}</Text>
                    </View>
                    <View style={styles.scoreMeta}>
                      <Text style={styles.driverName}>{s.driverName}</Text>
                      <Text style={styles.period}>
                        {s.scorePeriod} · {s.scoreDate}
                      </Text>
                      <View style={styles.subScores}>
                        <SubScore styles={styles} colors={c} label="Safety" value={s.safetyScore} />
                        <SubScore styles={styles} colors={c} label="Efficiency" value={s.efficiencyScore} />
                        <SubScore styles={styles} colors={c} label="Compliance" value={s.complianceScore} />
                      </View>
                    </View>
                  </View>

                  <View style={styles.eventGrid}>
                    <EventStat styles={styles} iconColor={c.textSecondary} icon="car-brake-alert" label="Harsh brake" value={s.harshBrakeCount} />
                    <EventStat styles={styles} iconColor={c.textSecondary} icon="rocket-launch-outline" label="Harsh accel" value={s.harshAccelCount} />
                    <EventStat styles={styles} iconColor={c.textSecondary} icon="sign-direction" label="Sharp turns" value={s.sharpTurnCount} />
                    <EventStat styles={styles} iconColor={c.textSecondary} icon="speedometer" label="Speeding s" value={s.speedingSeconds} />
                  </View>

                  <View style={styles.coaching}>
                    <MaterialCommunityIcons color={c.primary} name="lightbulb-on-outline" size={16} />
                    <Text style={styles.coachingText}>{s.aiCoachingAdvice}</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.loading}>No score data.</Text>
              )}
            </Card>
          )}
          <Text style={styles.listTitle}>Drivers</Text>
        </View>
      }
      renderItem={({ item }) => {
        const active = item.id === selectedId;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => setSelectedId(item.id)}
            style={[styles.driverRow, active && styles.driverRowActive]}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons color={c.primary} name="account" size={20} />
            </View>
            <View style={styles.driverInfo}>
              <Text numberOfLines={1} style={styles.driverRowName}>{item.name}</Text>
              <Text numberOfLines={1} style={styles.driverRowMeta}>{item.phone ?? 'No phone'}</Text>
            </View>
            {active ? <MaterialCommunityIcons color={c.primary} name="chevron-right" size={20} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

function SubScore({
  styles,
  colors: c,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.subScore}>
      <Text style={[styles.subScoreValue, { color: gradeColor(value, c) }]}>{value.toFixed(0)}</Text>
      <Text style={styles.subScoreLabel}>{label}</Text>
    </View>
  );
}

function EventStat({
  styles,
  iconColor,
  icon,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  iconColor: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: number;
}) {
  return (
    <View style={styles.eventStat}>
      <MaterialCommunityIcons color={iconColor} name={icon} size={18} />
      <Text style={styles.eventStatValue}>{value}</Text>
      <Text style={styles.eventStatLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    content: { gap: spacing.sm, padding: spacing.md },
    loading: { color: c.textSecondary, padding: spacing.md, textAlign: 'center' },
    scoreCard: { gap: spacing.md },
    scoreTop: { flexDirection: 'row', gap: spacing.md },
    gauge: {
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 5,
      height: 92,
      justifyContent: 'center',
      width: 92,
    },
    gaugeScore: { fontSize: 30, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 34 },
    gaugeGrade: { color: c.textSecondary, fontSize: typography.caption, fontWeight: '700' },
    scoreMeta: { flex: 1, gap: 2, justifyContent: 'center' },
    driverName: { color: c.textPrimary, fontSize: typography.h2, fontWeight: '900' },
    period: { color: c.textSecondary, fontSize: typography.caption },
    subScores: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
    subScore: {},
    subScoreValue: { fontSize: typography.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
    subScoreLabel: { color: c.textSecondary, fontSize: 11 },
    eventGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    eventStat: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.sm,
      flexBasis: '22%',
      flexGrow: 1,
      gap: 2,
      paddingVertical: spacing.sm,
    },
    eventStatValue: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
    eventStatLabel: { color: c.textSecondary, fontSize: 10, textAlign: 'center' },
    coaching: {
      alignItems: 'center',
      backgroundColor: c.accentSoft,
      borderRadius: radius.sm,
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.sm,
    },
    coachingText: { color: c.textPrimary, fontSize: typography.caption, flex: 1, lineHeight: 17 },
    listTitle: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    driverRow: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.md,
    },
    driverRowActive: { borderColor: c.primary },
    avatar: {
      alignItems: 'center',
      backgroundColor: c.accentSoft,
      borderRadius: 999,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    driverInfo: { flex: 1, minWidth: 0 },
    driverRowName: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800' },
    driverRowMeta: { color: c.textSecondary, fontSize: typography.caption, marginTop: 2 },
  });
