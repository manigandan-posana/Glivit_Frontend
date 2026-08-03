import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Card } from '@/src/components/ui/Card';
import { DateRangePicker, type DateRange } from '@/src/components/ui/DateRangePicker';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';
import { useAppSelector } from '@/src/store/hooks';

export default function TimelineAnalyticsScreen() {
  const { colors: c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const activeTenantName = useAppSelector((s) => s.tenant.activeTenantName);

  const today = new Date();
  const last7Start = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  last7Start.setHours(0, 0, 0, 0);

  const [dateRange, setDateRange] = useState<DateRange>({
    label: 'Last 7 Days',
    startDate: last7Start,
    endDate: today,
  });

  // Calculate day difference for mock data scaling
  const daysDiff = Math.max(1, Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Mock data generation based on date range
  const pieData = useMemo(() => {
    return [
      { value: 62, color: c.success, text: '62%' },
      { value: 18, color: c.warningOrange, text: '18%' },
      { value: 15, color: c.danger, text: '15%' },
      { value: 5, color: c.textMuted, text: '5%' },
    ];
  }, [c]);

  const barData = useMemo(() => {
    const data = [];
    let currentDate = new Date(dateRange.startDate);
    
    // Limit to max 14 bars for visibility, or sample if necessary
    const displayDays = Math.min(daysDiff, 14);
    const step = Math.ceil(daysDiff / displayDays);
    
    for (let i = 0; i < displayDays; i++) {
      const distance = Math.floor(Math.random() * 150) + 50; // Random 50-200 KM
      data.push({
        value: distance,
        label: currentDate.toLocaleDateString(undefined, { weekday: 'short' }),
        topLabelComponent: () => (
          <Text style={styles.barTopLabel}>{distance}</Text>
        ),
        frontColor: c.primary,
        dateStr: currentDate.toLocaleDateString(),
        trips: Math.floor(Math.random() * 5) + 1,
      });
      currentDate.setDate(currentDate.getDate() + step);
    }
    return data;
  }, [daysDiff, dateRange.startDate, c]);

  const renderTooltip = (item: any) => {
    return (
      <View style={styles.tooltip}>
        <Text style={styles.tooltipTitle}>{item.dateStr}</Text>
        <Text style={styles.tooltipText}>{item.value} KM</Text>
        <Text style={styles.tooltipSubText}>{item.trips} Trips</Text>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Timeline Analytics</Text>
        <Text style={styles.subtitle}>{activeTenantName || 'Glivt Fleet'}</Text>
      </View>

      <Card style={styles.card}>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Vehicle Time Distribution</Text>
        
        <View style={styles.chartContainer}>
          <PieChart
            data={pieData}
            donut
            innerRadius={60}
            radius={100}
            showText
            textColor={isDark ? c.textPrimary : '#FFFFFF'}
            textSize={12}
            textBackgroundRadius={12}
            centerLabelComponent={() => (
              <View style={styles.centerLabel}>
                <Text style={styles.centerLabelValue}>{daysDiff * 24}h</Text>
                <Text style={styles.centerLabelText}>Total</Text>
              </View>
            )}
          />
        </View>

        <View style={styles.legendContainer}>
          <LegendItem color={c.success} label="Driving" percentage="62%" duration={`${Math.floor(daysDiff * 24 * 0.62)}h`} />
          <LegendItem color={c.warningOrange} label="Idle" percentage="18%" duration={`${Math.floor(daysDiff * 24 * 0.18)}h`} />
          <LegendItem color={c.danger} label="Stopped" percentage="15%" duration={`${Math.floor(daysDiff * 24 * 0.15)}h`} />
          <LegendItem color={c.textMuted} label="Offline" percentage="5%" duration={`${Math.floor(daysDiff * 24 * 0.05)}h`} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Daily Distance Travelled</Text>
        <Text style={styles.cardSubtitle}>Kilometers (KM)</Text>
        
        <View style={styles.chartContainer}>
          <BarChart
            data={barData}
            barWidth={28}
            spacing={24}
            roundedTop
            roundedBottom
            xAxisThickness={1}
            yAxisThickness={0}
            yAxisTextStyle={styles.axisText}
            xAxisLabelTextStyle={styles.axisText}
            noOfSections={4}
            maxValue={250}
            isAnimated
            rulesColor={c.divider}
            xAxisColor={c.borderStrong}
            renderTooltip={renderTooltip}
            leftShiftForTooltip={15}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

function LegendItem({ color, label, percentage, duration }: { color: string; label: string; percentage: string; duration: string }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <View style={styles.legendTextContainer}>
        <Text style={styles.legendLabel}>{label}</Text>
        <Text style={styles.legendPercentage}>{percentage}</Text>
      </View>
      <Text style={styles.legendDuration}>{duration}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.pageBackground,
    },
    content: {
      padding: spacing.md,
      gap: spacing.md,
    },
    header: {
      marginBottom: spacing.xs,
    },
    title: {
      fontSize: typography.h2,
      fontWeight: '900',
      color: c.textPrimary,
    },
    subtitle: {
      fontSize: typography.body,
      color: c.textSecondary,
    },
    card: {
      gap: spacing.md,
    },
    cardTitle: {
      fontSize: typography.h3,
      fontWeight: '800',
      color: c.textPrimary,
    },
    cardSubtitle: {
      fontSize: typography.caption,
      color: c.textSecondary,
      marginTop: -spacing.sm,
    },
    chartContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: spacing.lg,
    },
    centerLabel: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerLabelValue: {
      fontSize: typography.h3,
      fontWeight: '900',
      color: c.textPrimary,
    },
    centerLabelText: {
      fontSize: typography.caption,
      color: c.textSecondary,
    },
    legendContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '46%',
      gap: spacing.sm,
    },
    legendDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    legendTextContainer: {
      flex: 1,
    },
    legendLabel: {
      fontSize: typography.caption,
      fontWeight: '600',
      color: c.textPrimary,
    },
    legendPercentage: {
      fontSize: 11,
      color: c.textSecondary,
    },
    legendDuration: {
      fontSize: typography.caption,
      fontWeight: '700',
      color: c.textPrimary,
    },
    axisText: {
      color: c.textSecondary,
      fontSize: 11,
    },
    barTopLabel: {
      color: c.textPrimary,
      fontSize: 10,
      fontWeight: '700',
      marginBottom: 4,
      textAlign: 'center',
    },
    tooltip: {
      backgroundColor: c.surfaceElevated,
      padding: spacing.sm,
      borderRadius: radius.md,
      shadowColor: c.shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
      minWidth: 80,
    },
    tooltipTitle: {
      fontSize: 10,
      color: c.textSecondary,
      marginBottom: 2,
    },
    tooltipText: {
      fontSize: typography.body,
      fontWeight: '800',
      color: c.textPrimary,
    },
    tooltipSubText: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 2,
    },
  });
