import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  type CarVariant,
  getVehicleModel,
  VEHICLE_MODELS,
  type VehicleModelCategory,
} from './Vehicle3DMarker';

type Props = {
  value: CarVariant;
  onChange: (value: CarVariant) => void;
  compact?: boolean;
  errorMessage?: string | null;
  loading?: boolean;
};

const CATEGORY_ICONS: Record<
  VehicleModelCategory,
  React.ComponentProps<typeof MaterialCommunityIcons>['name']
> = {
  car: 'car-sports',
  bike: 'motorbike',
  truck: 'truck',
};

export function VehicleModelPicker({
  value,
  onChange,
  compact = false,
  errorMessage,
  loading = false,
}: Props) {
  const selected = getVehicleModel(value);
  return (
    <View style={styles.root}>
      <View style={styles.labelRow}>
        <Text style={styles.eyebrow}>VEHICLE MODEL</Text>
        <View
          accessibilityLiveRegion="polite"
          style={styles.modelStatus}>
          {loading ? <ActivityIndicator color="#5DE2F4" size="small" /> : null}
          {errorMessage ? (
            <MaterialCommunityIcons color="#FF8B78" name="alert-circle-outline" size={13} />
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.selectedLabel, errorMessage && styles.selectedLabelError]}>
            {errorMessage ? '2D fallback' : loading ? `Loading ${selected.label}` : selected.label}
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {VEHICLE_MODELS.map((model) => {
          const active = model.id === value;
          return (
            <Pressable
              accessibilityLabel={`Use ${model.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={model.id}
              onPress={() => onChange(model.id)}
              style={[styles.choice, compact && styles.choiceCompact, active && styles.choiceActive]}>
              <View style={[styles.swatch, { backgroundColor: model.paintColor }]}>
                <MaterialCommunityIcons
                  color={isLightColor(model.paintColor) ? '#18212B' : '#FFFFFF'}
                  name={CATEGORY_ICONS[model.category]}
                  size={compact ? 14 : 16}
                />
              </View>
              <Text numberOfLines={1} style={[styles.choiceText, active && styles.choiceTextActive]}>
                {model.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function isLightColor(color: string) {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return false;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 175;
}

const styles = StyleSheet.create({
  root: { gap: 7, minWidth: 0 },
  labelRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  eyebrow: { color: '#5DE2F4', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  modelStatus: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  selectedLabel: { color: '#B9C9D7', flexShrink: 1, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  selectedLabelError: { color: '#FFAA9D' },
  content: { gap: 7, paddingRight: 8 },
  choice: {
    alignItems: 'center',
    backgroundColor: 'rgba(11, 18, 28, 0.88)',
    borderColor: 'rgba(255,255,255,0.13)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    maxWidth: 154,
    minHeight: 40,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  choiceCompact: { minHeight: 34, paddingHorizontal: 7, paddingVertical: 5 },
  choiceActive: {
    backgroundColor: 'rgba(25, 208, 134, 0.14)',
    borderColor: '#28D995',
  },
  swatch: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 8,
    borderWidth: 1,
    height: 25,
    justifyContent: 'center',
    width: 29,
  },
  choiceText: { color: '#AAB9C7', flexShrink: 1, fontSize: 11, fontWeight: '800' },
  choiceTextActive: { color: '#F3FBF8' },
});
