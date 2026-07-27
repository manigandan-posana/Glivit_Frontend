import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { EmptyView, ErrorRetryView, LoadingView } from '@/src/components/ui/StateViews';
import { TextField } from '@/src/components/ui/TextField';
import { apiErrorMessage } from '@/src/services/apiError';
import {
  useCreateGeofenceMutation,
  useDeleteGeofenceMutation,
  useGetGeofencesQuery,
  useUpdateGeofenceMutation,
} from '@/src/services/operationsApi';
import { useGetGeofenceSuggestionsQuery, useApproveGeofenceSuggestionMutation } from '@/src/services/aiApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { GeofenceDto } from '@/src/types/api';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  latitude: z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'Invalid latitude')
    .refine((value) => Math.abs(Number(value)) <= 90, 'Latitude must be between -90 and 90'),
  longitude: z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'Invalid longitude')
    .refine((value) => Math.abs(Number(value)) <= 180, 'Longitude must be between -180 and 180'),
  radiusMeters: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Invalid radius')
    .refine((value) => Number(value) > 0 && Number(value) <= 100_000, 'Radius must be 1–100,000 m'),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_FORM: FormValues = {
  name: '',
  latitude: '12.9718',
  longitude: '77.5946',
  radiusMeters: '250',
};

/**
 * Geofences.
 *
 * A list screen first: every existing zone is shown with its location, radius,
 * assignment counts, status and row actions. The create/edit form is a sheet
 * that only opens from the "+ Add Geofence" action, so the list is not buried
 * under a form the way it used to be. AI suggestions, colours, validation rules,
 * permissions and the underlying API calls are unchanged.
 */
export default function GeofencesScreen() {
  const { colors: c } = useTheme();
  // Drawer navigator already applies the top safe-area inset to the header, so
  // only the bottom inset (Android nav/gesture bar, iPhone home indicator) needs
  // handling here — adding a top inset too would double-pad the screen.
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const { data, isLoading, isFetching, isError, error, refetch } = useGetGeofencesQuery({ size: 50 });
  const {
    data: aiSuggestions,
    isLoading: aiLoading,
    isFetching: aiFetching,
    isError: isAiError,
    error: aiError,
    refetch: refetchAi,
  } = useGetGeofenceSuggestionsQuery();
  const [approveSuggestion] = useApproveGeofenceSuggestionMutation();
  const [createGeofence, { isLoading: isCreating }] = useCreateGeofenceMutation();
  const [updateGeofence, { isLoading: isUpdating }] = useUpdateGeofenceMutation();
  const [deleteGeofence] = useDeleteGeofenceMutation();
  const [approvingId, setApprovingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  /** `null` = closed, `'new'` = create, otherwise the geofence being edited. */
  const [editorTarget, setEditorTarget] = React.useState<'new' | GeofenceDto | null>(null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_FORM,
  });

  const openCreate = React.useCallback(() => {
    reset(DEFAULT_FORM);
    setEditorTarget('new');
  }, [reset]);

  const openEdit = React.useCallback(
    (geofence: GeofenceDto) => {
      const [longitude, latitude] = geofence.coordinates?.[0] ?? [];
      reset({
        name: geofence.name,
        latitude: Number.isFinite(latitude) ? String(latitude) : DEFAULT_FORM.latitude,
        longitude: Number.isFinite(longitude) ? String(longitude) : DEFAULT_FORM.longitude,
        radiusMeters: Number.isFinite(geofence.radiusMeters)
          ? String(Math.round(geofence.radiusMeters as number))
          : DEFAULT_FORM.radiusMeters,
      });
      setEditorTarget(geofence);
    },
    [reset]
  );

  const closeEditor = React.useCallback(() => setEditorTarget(null), []);

  const onApproveSuggestion = async (id: number) => {
    if (approvingId != null || !Number.isSafeInteger(id) || id <= 0) return;
    setApprovingId(id);
    try {
      const created = await approveSuggestion(id).unwrap();
      Alert.alert('Geofence created', `${created?.name || 'Suggested geofence'} is now active.`);
    } catch (err) {
      Alert.alert('Geofence not created', apiErrorMessage(err));
    } finally {
      setApprovingId(null);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    const target = editorTarget;
    if (!target) return;
    // Same payload shape as before; editing reuses the record's existing
    // assignments and alert flags so nothing is silently dropped on save.
    const existing = target === 'new' ? null : target;
    const body = {
      name: values.name,
      color: existing?.color || '#0F9D58',
      type: 'CIRCLE' as const,
      coordinates: [[Number(values.longitude), Number(values.latitude)]],
      radiusMeters: Number(values.radiusMeters),
      ...(existing
        ? {
            description: existing.description ?? undefined,
            assignedDeviceIds: existing.assignedDeviceIds,
            assignedGroupIds: existing.assignedGroupIds,
            enterAlert: existing.enterAlert,
            exitAlert: existing.exitAlert,
            active: existing.active,
          }
        : { enterAlert: true, exitAlert: true, active: true }),
    };

    try {
      if (existing) {
        await updateGeofence({ id: existing.id, body }).unwrap();
      } else {
        await createGeofence(body).unwrap();
      }
      setEditorTarget(null);
      reset(DEFAULT_FORM);
    } catch (err) {
      Alert.alert('Geofence not saved', apiErrorMessage(err));
    }
  });

  const confirmDelete = React.useCallback(
    (geofence: GeofenceDto) => {
      Alert.alert(
        'Delete geofence',
        `"${geofence.name}" will stop generating enter and exit alerts.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setDeletingId(geofence.id);
              try {
                await deleteGeofence(geofence.id).unwrap();
              } catch (err) {
                Alert.alert('Geofence not deleted', apiErrorMessage(err));
              } finally {
                setDeletingId(null);
              }
            },
          },
        ]
      );
    },
    [deleteGeofence]
  );

  if (isLoading) return <LoadingView label="Loading geofences..." />;
  if (isError || !data) return <ErrorRetryView message={apiErrorMessage(error)} onRetry={refetch} />;

  const suggestions = Array.isArray(aiSuggestions)
    ? aiSuggestions.filter((suggestion) => suggestion?.status === 'PENDING')
    : [];
  const geofences = Array.isArray(data.content) ? data.content : [];
  const onRefresh = () => {
    void Promise.allSettled([refetch(), refetchAi()]);
  };

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        data={geofences}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching || aiFetching}
            onRefresh={onRefresh}
            tintColor={c.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Card style={styles.suggestionsPanel}>
              <View style={styles.suggestionsHeader}>
                <MaterialCommunityIcons name="brain" size={24} color={c.accent} />
                <Text style={styles.title}>AI Suggestions</Text>
              </View>
              <Text style={styles.subtitle}>Based on historical stop and idling patterns.</Text>
              {aiLoading ? (
                <View style={styles.aiState}>
                  <ActivityIndicator color={c.primary} size="small" />
                  <Text style={styles.subtitle}>Loading suggestions…</Text>
                </View>
              ) : isAiError ? (
                <View style={styles.aiState}>
                  <Text style={styles.aiError}>{apiErrorMessage(aiError)}</Text>
                  <Button label="Retry suggestions" onPress={refetchAi} variant="secondary" />
                </View>
              ) : suggestions.length === 0 ? (
                <View style={styles.aiState}>
                  <MaterialCommunityIcons name="check-circle-outline" size={22} color={c.primary} />
                  <Text style={styles.subtitle}>No pending suggestions.</Text>
                </View>
              ) : (
                suggestions.map((suggestion) => {
                  const latitude = finiteNumber(suggestion.centerLatitude);
                  const longitude = finiteNumber(suggestion.centerLongitude);
                  const suggestedRadius = finiteNumber(suggestion.suggestedRadiusMeters);
                  const confidence = finiteNumber(suggestion.confidence);
                  const loading = approvingId === suggestion.id;
                  return (
                    <View key={suggestion.id} style={styles.suggestionCard}>
                      <View style={styles.body}>
                        <Text style={styles.name}>
                          {safeText(suggestion.suggestedName, `Suggestion #${suggestion.id}`)}
                        </Text>
                        <Text style={styles.meta}>
                          Center: {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
                        </Text>
                        <Text style={styles.meta}>
                          Radius: {suggestedRadius == null ? 'Unavailable' : `${Math.round(suggestedRadius)} m`} |{' '}
                          {Math.max(0, Math.round(finiteNumber(suggestion.clusterPointCount) ?? 0))} stops |{' '}
                          {confidence == null
                            ? 'Confidence unavailable'
                            : `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}% confidence`}
                        </Text>
                        {suggestion.reasoning ? (
                          <Text numberOfLines={3} style={styles.meta}>
                            {suggestion.reasoning}
                          </Text>
                        ) : null}
                      </View>
                      <Button
                        disabled={approvingId != null}
                        label="Approve & create"
                        loading={loading}
                        onPress={() => void onApproveSuggestion(suggestion.id)}
                        style={styles.approveButton}
                      />
                    </View>
                  );
                })
              )}
            </Card>

            <View style={styles.listHeaderRow}>
              <Text style={styles.title}>Geofences</Text>
              <Text style={styles.countBadge}>
                {geofences.length} {geofences.length === 1 ? 'zone' : 'zones'}
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyView
            icon="vector-circle"
            title="No geofences"
            message="Tap Add Geofence to create your first alert zone."
          />
        }
        renderItem={({ item }) => (
          <GeofenceRow
            busy={deletingId === item.id}
            colors={c}
            geofence={item}
            onDelete={() => confirmDelete(item)}
            onEdit={() => openEdit(item)}
            styles={styles}
          />
        )}
      />

      <Pressable
        accessibilityLabel="Add geofence"
        accessibilityRole="button"
        onPress={openCreate}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + spacing.md },
          pressed && styles.fabPressed,
        ]}>
        <MaterialCommunityIcons color={c.onPrimary} name="plus" size={22} />
        <Text style={styles.fabLabel}>Add Geofence</Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={closeEditor}
        transparent
        visible={editorTarget != null}>
        <Pressable
          accessibilityLabel="Close geofence form"
          accessibilityRole="button"
          onPress={closeEditor}
          style={styles.editorBackdrop}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.editorWrap}>
          <View style={[styles.editorSheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.editorHandle} />
            <ScrollView
              contentContainerStyle={styles.editorContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>
                {editorTarget && editorTarget !== 'new' ? 'Edit Geofence' : 'Create Circle Geofence'}
              </Text>
              <Text style={styles.subtitle}>
                Enter the centre point and radius to create an active circular alert zone.
              </Text>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, value } }) => (
                  <TextField error={errors.name?.message} label="Name" onChangeText={onChange} value={value} />
                )}
              />
              <View style={styles.row}>
                <View style={styles.half}>
                  <Controller
                    control={control}
                    name="latitude"
                    render={({ field: { onChange, value } }) => (
                      <TextField
                        error={errors.latitude?.message}
                        keyboardType="decimal-pad"
                        label="Latitude"
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </View>
                <View style={styles.half}>
                  <Controller
                    control={control}
                    name="longitude"
                    render={({ field: { onChange, value } }) => (
                      <TextField
                        error={errors.longitude?.message}
                        keyboardType="decimal-pad"
                        label="Longitude"
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                </View>
              </View>
              <Controller
                control={control}
                name="radiusMeters"
                render={({ field: { onChange, value } }) => (
                  <TextField
                    error={errors.radiusMeters?.message}
                    keyboardType="numeric"
                    label="Radius (meters)"
                    onChangeText={onChange}
                    value={value}
                  />
                )}
              />
              <Button
                label={editorTarget && editorTarget !== 'new' ? 'Save changes' : 'Save geofence'}
                loading={isCreating || isUpdating}
                onPress={onSubmit}
              />
              <Button label="Cancel" onPress={closeEditor} variant="ghost" />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function GeofenceRow({
  busy,
  colors: c,
  geofence,
  onDelete,
  onEdit,
  styles,
}: {
  busy: boolean;
  colors: ThemeColors;
  geofence: GeofenceDto;
  onDelete: () => void;
  onEdit: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [longitude, latitude] = geofence.coordinates?.[0] ?? [];
  const deviceCount = Array.isArray(geofence.assignedDeviceIds)
    ? geofence.assignedDeviceIds.length
    : 0;
  const groupCount = Array.isArray(geofence.assignedGroupIds)
    ? geofence.assignedGroupIds.length
    : 0;

  return (
    <View style={styles.geofenceCard}>
      <View style={[styles.marker, { backgroundColor: geofence.color || c.primary }]}>
        <MaterialCommunityIcons color="#FFFFFF" name="map-marker-radius-outline" size={22} />
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.name}>
            {geofence.name}
          </Text>
          <View
            style={[
              styles.statusChip,
              geofence.active ? styles.statusChipActive : styles.statusChipInactive,
            ]}>
            <Text
              style={[
                styles.statusChipText,
                geofence.active ? styles.statusChipTextActive : styles.statusChipTextInactive,
              ]}>
              {geofence.active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.meta}>
          <MaterialCommunityIcons name="crosshairs-gps" size={11} />{' '}
          {formatCoordinate(finiteNumber(latitude))}, {formatCoordinate(finiteNumber(longitude))}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {geofence.type} ·{' '}
          {geofence.radiusMeters ? `${Math.round(geofence.radiusMeters)} m radius` : 'custom shape'}
        </Text>
        <Text numberOfLines={1} style={styles.meta}>
          {deviceCount === 0 ? 'No vehicles assigned' : `${deviceCount} vehicle${deviceCount === 1 ? '' : 's'}`}
          {groupCount > 0 ? ` · ${groupCount} group${groupCount === 1 ? '' : 's'}` : ''}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable
          accessibilityLabel={`Edit ${geofence.name}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onEdit}
          style={styles.rowActionButton}>
          <MaterialCommunityIcons color={c.textSecondary} name="pencil-outline" size={18} />
        </Pressable>
        <Pressable
          accessibilityLabel={`Delete ${geofence.name}`}
          accessibilityRole="button"
          disabled={busy}
          hitSlop={8}
          onPress={onDelete}
          style={styles.rowActionButton}>
          {busy ? (
            <ActivityIndicator color={c.danger} size="small" />
          ) : (
            <MaterialCommunityIcons color={c.danger} name="trash-can-outline" size={18} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatCoordinate(value: number | null) {
  return value == null ? 'Unavailable' : value.toFixed(4);
}

function safeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    list: { gap: spacing.sm, padding: spacing.md },
    suggestionsPanel: { gap: spacing.md },
    suggestionsHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    aiState: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      gap: spacing.sm,
      justifyContent: 'center',
      minHeight: 84,
      padding: spacing.md,
    },
    aiError: { color: c.danger, fontSize: typography.caption, textAlign: 'center' },
    title: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    subtitle: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 17 },
    listHeaderRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: spacing.xs,
    },
    countBadge: {
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.pill,
      color: c.textSecondary,
      fontSize: typography.caption,
      fontWeight: '800',
      overflow: 'hidden',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    row: { flexDirection: 'row', gap: spacing.sm },
    half: { flex: 1, minWidth: 0 },
    geofenceCard: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
    },
    marker: { alignItems: 'center', borderRadius: radius.sm, height: 44, justifyContent: 'center', width: 44 },
    body: { flex: 1, minWidth: 0 },
    nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
    name: { color: c.textPrimary, flexShrink: 1, fontSize: typography.body, fontWeight: '800' },
    meta: { color: c.textSecondary, fontSize: typography.caption, marginTop: 2 },
    statusChip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    statusChipActive: { backgroundColor: c.accentSoft },
    statusChipInactive: { backgroundColor: c.surfaceAlt },
    statusChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
    statusChipTextActive: { color: c.primary },
    statusChipTextInactive: { color: c.textMuted },
    rowActions: { flexDirection: 'row', gap: spacing.xs },
    rowActionButton: {
      alignItems: 'center',
      borderRadius: radius.sm,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    suggestionCard: {
      backgroundColor: c.accentSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      gap: spacing.md,
      borderColor: c.accent,
      borderWidth: StyleSheet.hairlineWidth * 2,
    },
    approveButton: { alignSelf: 'flex-start', height: 40, width: 156 },
    fab: {
      alignItems: 'center',
      backgroundColor: c.primary,
      borderRadius: radius.pill,
      elevation: 6,
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      position: 'absolute',
      right: spacing.md,
      shadowColor: c.shadowColor,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 14,
    },
    fabPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
    fabLabel: { color: c.onPrimary, fontSize: typography.label, fontWeight: '900' },
    editorBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay },
    editorWrap: { flex: 1, justifyContent: 'flex-end' },
    editorSheet: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth * 2,
      maxHeight: '88%',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    editorHandle: {
      alignSelf: 'center',
      backgroundColor: c.borderStrong,
      borderRadius: 2,
      height: 4,
      marginBottom: spacing.md,
      width: 44,
    },
    editorContent: { gap: spacing.md, paddingBottom: spacing.md },
  });
