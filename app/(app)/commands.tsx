import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/src/components/ui/Card';
import { Chip } from '@/src/components/ui/ModulePrimitives';
import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { apiErrorMessage } from '@/src/services/apiError';
import { useGetDevicesQuery } from '@/src/services/devicesApi';
import { useGetCommandsQuery, useSubmitCommandMutation } from '@/src/services/operationsApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

const COMMANDS = [
  { type: 'REQUEST_LOCATION', label: 'Locate', icon: 'crosshairs-gps', destructive: false },
  { type: 'RESTART_TRACKER', label: 'Restart', icon: 'restart', destructive: false },
  { type: 'LOCK', label: 'Lock', icon: 'lock-outline', destructive: true },
  { type: 'UNLOCK', label: 'Unlock', icon: 'lock-open-outline', destructive: true },
  { type: 'ENGINE_CUT', label: 'Cut Engine', icon: 'engine-off-outline', destructive: true },
] as const;

export default function CommandsScreen() {
  const { colors: c } = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const { data: devices, isLoading: loadingDevices } = useGetDevicesQuery({ page: 0, size: 50 });
  const { data, isLoading, isFetching, isError, error, refetch } = useGetCommandsQuery({ size: 50 });
  const [selectedDeviceId, setSelectedDeviceId] = React.useState<number | null>(null);
  const [pendingCommand, setPendingCommand] = React.useState<string | null>(null);
  const [submitCommand] = useSubmitCommandMutation();

  const deviceList = devices?.content ?? [];
  const selected = deviceList.find((d) => d.id === selectedDeviceId) ?? deviceList[0];
  React.useEffect(() => {
    if (selected?.id && selectedDeviceId == null) setSelectedDeviceId(selected.id);
  }, [selected?.id, selectedDeviceId]);

  const submit = async (command: (typeof COMMANDS)[number]) => {
    if (!selected) return;
    const run = async () => {
      setPendingCommand(command.type);
      try {
        await submitCommand({
          deviceId: selected.id,
          commandType: command.type,
          confirmed: command.destructive,
          idempotencyKey: `${selected.id}-${command.type}-${Date.now()}`,
        }).unwrap();
      } catch (err) {
        Alert.alert('Command not submitted', apiErrorMessage(err));
      } finally {
        setPendingCommand(null);
      }
    };
    if (command.destructive) {
      Alert.alert(command.label, `${command.label} will be sent to ${selected.name}. Continue?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', style: 'destructive', onPress: run },
      ]);
    } else {
      await run();
    }
  };

  if (isLoading || loadingDevices) return <LoadingView label="Loading command centre..." />;
  if (isError || !data) return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={data.content}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={c.primary} />}
        ListHeaderComponent={
          <Card style={styles.panel}>
            <Text style={styles.title}>Command Centre</Text>
            <Text style={styles.subtitle}>Commands are idempotent, audited, and submitted only to tenant-owned devices.</Text>
            <View style={styles.deviceChips}>
              {deviceList.map((device) => (
                <Chip
                  key={device.id}
                  active={selected?.id === device.id}
                  label={device.name}
                  onPress={() => setSelectedDeviceId(device.id)}
                />
              ))}
            </View>
            <View style={styles.commands}>
              {COMMANDS.map((command) => {
                const loading = pendingCommand === command.type;
                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={!selected || loading}
                    key={command.type}
                    onPress={() => submit(command)}
                    style={[styles.commandButton, command.destructive ? styles.commandDestructive : null]}>
                    <MaterialCommunityIcons
                      color={command.destructive ? c.danger : c.primary}
                      name={loading ? 'timer-sand' : command.icon}
                      size={22}
                    />
                    <Text
                      numberOfLines={1}
                      style={[styles.commandLabel, command.destructive ? styles.commandLabelDanger : null]}>
                      {command.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        }
        ListEmptyComponent={<EmptyView icon="console-line" title="No commands yet" message="Submitted command history will appear here." />}
        renderItem={({ item }) => (
          <View style={styles.historyCard}>
            <View style={styles.historyIcon}>
              <MaterialCommunityIcons color={c.info} name="console" size={22} />
            </View>
            <View style={styles.historyBody}>
              <Text style={styles.historyTitle}>{item.commandType}</Text>
              <Text style={styles.meta}>Device #{item.deviceId} | {item.status}</Text>
              <Text style={styles.meta}>{formatTime(item.requestedAt)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'No time'
    : date.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    list: { gap: spacing.sm, padding: spacing.md },
    panel: { gap: spacing.md },
    title: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    subtitle: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 17 },
    deviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    commands: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    commandButton: {
      alignItems: 'center',
      backgroundColor: c.accentSoft,
      borderColor: c.accent,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth * 2,
      gap: 4,
      height: 72,
      justifyContent: 'center',
      minWidth: '30%',
      paddingHorizontal: spacing.sm,
    },
    commandDestructive: { backgroundColor: 'rgba(220,38,38,0.10)', borderColor: 'rgba(220,38,38,0.35)' },
    commandLabel: { color: c.primary, fontSize: typography.caption, fontWeight: '800' },
    commandLabelDanger: { color: c.danger },
    historyCard: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
    },
    historyIcon: { alignItems: 'center', backgroundColor: 'rgba(37,99,235,0.12)', borderRadius: radius.sm, height: 42, justifyContent: 'center', width: 42 },
    historyBody: { flex: 1, minWidth: 0 },
    historyTitle: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800' },
    meta: { color: c.textSecondary, fontSize: typography.caption, marginTop: 2 },
  });
