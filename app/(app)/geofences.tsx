import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
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
  latitude: z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'Invalid latitude'),
  longitude: z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'Invalid longitude'),
  radiusMeters: z.string().trim().regex(/^\d+(\.\d+)?$/, 'Invalid radius'),
});

type FormValues = z.infer<typeof schema>;

export default function GeofencesScreen() {
  const { colors: c } = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const { data, isLoading, isFetching, isError, error, refetch } = useGetGeofencesQuery({ size: 50 });
  const { data: aiSuggestions, isLoading: aiLoading } = useGetGeofenceSuggestionsQuery();
  const [approveSuggestion, { isLoading: isApproving }] = useApproveGeofenceSuggestionMutation();
  const [createGeofence, { isLoading: isCreating }] = useCreateGeofenceMutation();
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
    try {
      await approveSuggestion(id).unwrap();
      Alert.alert('Success', 'Geofence suggestion approved and created.');
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err));
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

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={data.content}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={c.primary} />}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            {aiSuggestions && aiSuggestions.length > 0 && (
              <Card style={styles.formCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <MaterialCommunityIcons name="brain" size={24} color={c.accent} />
                  <Text style={styles.title}>AI Suggestions</Text>
                </View>
                <Text style={styles.subtitle}>Based on historical stop and idling patterns.</Text>
                
                {aiSuggestions.map((sug) => (
                  <View key={sug.id} style={styles.suggestionCard}>
                    <View style={styles.body}>
                      <Text style={styles.name}>{sug.suggestedName}</Text>
                      <Text style={styles.meta}>Center: {sug.centerLatitude.toFixed(4)}, {sug.centerLongitude.toFixed(4)}</Text>
                      <Text style={styles.meta}>Radius: {Math.round(sug.suggestedRadiusMeters)}m | {sug.clusterPointCount} stops | {Math.round(sug.confidence * 100)}% confidence</Text>
                      {sug.reasoning ? <Text numberOfLines={2} style={styles.meta}>{sug.reasoning}</Text> : null}
                    </View>
                    <Button 
                      label={isApproving ? "..." : "Approve"} 
                      onPress={() => onApproveSuggestion(sug.id)} 
                      loading={isApproving}
                      style={{ paddingHorizontal: spacing.sm, height: 36 }}
                    />
                  </View>
                ))}
              </Card>
            )}

            <Card style={styles.formCard}>
              <Text style={styles.title}>Create Circle Geofence</Text>
            <Text style={styles.subtitle}>Use map-selected coordinates later; this form creates a precise depot-style fence now.</Text>
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
                Devices {item.assignedDeviceIds.length} | Groups {item.assignedGroupIds.length}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    list: { gap: spacing.sm, padding: spacing.md },
    formCard: { gap: spacing.md },
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
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.accentSoft,
      padding: spacing.md,
      borderRadius: radius.md,
      gap: spacing.sm,
      borderColor: c.accent,
      borderWidth: StyleSheet.hairlineWidth * 2,
    },
  });
