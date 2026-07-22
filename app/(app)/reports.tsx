import { MaterialCommunityIcons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import React from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Chip } from '@/src/components/ui/ModulePrimitives';
import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import {
  useCreateReportMutation,
  useGetReportsQuery,
  useLazyGetReportContentQuery,
} from '@/src/services/operationsApi';
import type { ReportDto } from '@/src/types/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

const REPORT_TYPES = ['SUMMARY', 'ROUTE', 'STOPS', 'TRIPS', 'EVENTS', 'FUEL'];

export default function ReportsScreen() {
  const { colors: c } = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const [reportType, setReportType] = React.useState('SUMMARY');
  const { data, isLoading, isFetching, isError, error, refetch } = useGetReportsQuery({ size: 50 });
  const [createReport, { isLoading: isCreating }] = useCreateReportMutation();
  const [getContent, { isFetching: isDownloading }] = useLazyGetReportContentQuery();

  const create = async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    try {
      await createReport({
        reportType,
        fromTime: from.toISOString(),
        toTime: to.toISOString(),
        includeAddresses: true,
        includeMapMarkers: false,
        outputFormat: 'CSV',
      }).unwrap();
    } catch (err) {
      Alert.alert('Report not created', apiErrorMessage(err));
    }
  };

  const download = async (report: ReportDto) => {
    try {
      const payload = await getContent(report.id).unwrap();
      const fileName = payload.fileName || `report-${report.id}.csv`;
      const file = new File(Paths.document, fileName);
      file.write(payload.content);
      Alert.alert('Report downloaded', fileName);
    } catch (err) {
      Alert.alert('Download failed', apiErrorMessage(err));
    }
  };

  if (isLoading) return <LoadingView label="Loading reports..." />;
  if (isError || !data) return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={data.content}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={c.primary} />}
        ListHeaderComponent={
          <Card style={styles.generator}>
            <Text style={styles.title}>Generate Report</Text>
            <Text style={styles.subtitle}>Creates a backend job for the last 24 hours using tenant history limits.</Text>
            <View style={styles.chips}>
              {REPORT_TYPES.map((type) => (
                <Chip key={type} active={type === reportType} label={format(type)} onPress={() => setReportType(type)} />
              ))}
            </View>
            <Button label="Generate CSV" loading={isCreating} onPress={create} />
          </Card>
        }
        ListEmptyComponent={<EmptyView icon="file-chart-outline" title="No reports" message="Generated reports will appear here." />}
        renderItem={({ item }) => (
          <View style={styles.reportCard}>
            <View style={styles.fileIcon}>
              <MaterialCommunityIcons color={c.info} name="file-delimited-outline" size={24} />
            </View>
            <View style={styles.reportBody}>
              <Text numberOfLines={1} style={styles.reportTitle}>{format(item.reportType)}</Text>
              <Text style={styles.meta}>
                {item.status} | {item.outputFormat} | {formatBytes(item.fileSize)}
              </Text>
              <Text style={styles.meta}>{formatTime(item.createdAt)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={item.status !== 'COMPLETED' || isDownloading}
              onPress={() => download(item)}
              style={styles.iconButton}>
              <MaterialCommunityIcons
                color={item.status === 'COMPLETED' ? c.primary : c.textMuted}
                name={isDownloading ? 'timer-sand' : 'download-outline'}
                size={22}
              />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

function format(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'No time'
    : date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(value?: number | null) {
  if (!value) return '0 KB';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    list: { gap: spacing.sm, padding: spacing.md },
    generator: { gap: spacing.md },
    title: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    subtitle: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 17 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    reportCard: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
    },
    fileIcon: { alignItems: 'center', backgroundColor: 'rgba(37,99,235,0.12)', borderRadius: radius.sm, height: 42, justifyContent: 'center', width: 42 },
    reportBody: { flex: 1, minWidth: 0 },
    reportTitle: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800' },
    meta: { color: c.textSecondary, fontSize: typography.caption, marginTop: 2 },
    iconButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  });
