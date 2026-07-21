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
import { defaultColors, palette, spacing, typography } from '@/src/theme/tokens';

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  latitude: z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'Invalid latitude'),
  longitude: z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'Invalid longitude'),
  radiusMeters: z.string().trim().regex(/^\d+(\.\d+)?$/, 'Invalid radius'),
});

type FormValues = z.infer<typeof schema>;

export default function GeofencesScreen() {
  const { data, isLoading, isFetching, isError, error, refetch } = useGetGeofencesQuery({ size: 50 });
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

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createGeofence({
        name: values.name,
        color: palette.primaryGreen,
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
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={defaultColors.primary} />}
        ListHeaderComponent={
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
        }
        ListEmptyComponent={<EmptyView icon="vector-circle" title="No geofences" message="Create your first alert zone." />}
        renderItem={({ item }) => (
          <View style={styles.geofenceCard}>
            <View style={[styles.marker, { backgroundColor: item.color || palette.primaryGreen }]}>
              <MaterialCommunityIcons color={palette.white} name="map-marker-radius-outline" size={22} />
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

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.pageBackground, flex: 1 },
  list: { gap: spacing.sm, padding: spacing.md },
  formCard: { gap: spacing.md },
  title: { color: palette.textPrimary, fontSize: typography.title, fontWeight: '900' },
  subtitle: { color: palette.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1, minWidth: 0 },
  geofenceCard: {
    alignItems: 'center',
    backgroundColor: palette.cardBackground,
    borderColor: palette.divider,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  marker: { alignItems: 'center', borderRadius: 8, height: 44, justifyContent: 'center', width: 44 },
  body: { flex: 1, minWidth: 0 },
  name: { color: palette.textPrimary, fontSize: typography.body, fontWeight: '800' },
  meta: { color: palette.textSecondary, fontSize: typography.caption, marginTop: 2 },
});
