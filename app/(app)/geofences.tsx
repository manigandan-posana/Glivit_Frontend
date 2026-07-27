import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
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
import { useCreateGeofenceMutation, useGetGeofencesQuery } from '@/src/services/operationsApi';
import { useGetGeofenceSuggestionsQuery, useApproveGeofenceSuggestionMutation } from '@/src/services/aiApi';
import { useTheme } from '@/src/theme/ThemeProvider';
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
  const [approvingId, setApprovingId] = React.useState<number | null>(null);
  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      latitude: '12.9718',
      longitude: '77.5946',
      radiusMeters: '250',
    },
  });

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
    try {
      await createGeofence({
        name: values.name,
        color: '#0F9D58',
        type: 'CIRCLE',
        coordinates: [[Number(values.longitude), Number(values.latitude)]],
        radiusMeters: Number(values.radiusMeters),
        enterAlert: true,
        exitAlert: true,
        active: true,
      }).unwrap();
      reset({ name: '', latitude: values.latitude, longitude: values.longitude, radiusMeters: values.radiusMeters });
    } catch (err) {
      Alert.alert('Geofence not saved', apiErrorMessage(err));
    }
  });

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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}>
      <FlatList
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
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
                  const radius = finiteNumber(suggestion.suggestedRadiusMeters);
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
                          Radius: {radius == null ? 'Unavailable' : `${Math.round(radius)} m`} |{' '}
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

            <Card style={styles.formCard}>
              <Text style={styles.title}>Create Circle Geofence</Text>
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
              <Button label="Save geofence" loading={isCreating} onPress={onSubmit} />
            </Card>
          </View>
        }
        ListEmptyComponent={<EmptyView icon="vector-circle" title="No geofences" message="Create your first alert zone." />}
        renderItem={({ item }) => (
          <View style={styles.geofenceCard}>
            <View style={[styles.marker, { backgroundColor: item.color || c.primary }]}>
              <MaterialCommunityIcons color="#FFFFFF" name="map-marker-radius-outline" size={22} />
            </View>
            <View style={styles.body}>
              <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.type} | {item.active ? 'Active' : 'Inactive'} | {item.radiusMeters ? `${Math.round(item.radiusMeters)} m` : 'shape'}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                Devices {Array.isArray(item.assignedDeviceIds) ? item.assignedDeviceIds.length : 0} | Groups{' '}
                {Array.isArray(item.assignedGroupIds) ? item.assignedGroupIds.length : 0}
              </Text>
            </View>
          </View>
        )}
      />
    </KeyboardAvoidingView>
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
    formCard: { gap: spacing.md },
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
    name: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800' },
    meta: { color: c.textSecondary, fontSize: typography.caption, marginTop: 2 },
    suggestionCard: {
      backgroundColor: c.accentSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      gap: spacing.md,
      borderColor: c.accent,
      borderWidth: StyleSheet.hairlineWidth * 2,
    },
    approveButton: { alignSelf: 'flex-start', height: 40, width: 156 },
  });
