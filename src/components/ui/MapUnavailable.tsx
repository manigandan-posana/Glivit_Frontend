import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { defaultColors, palette, spacing, typography } from '@/src/theme/tokens';

/**
 * Shown when the MapLibre native module is not present in the running binary
 * (e.g. Expo Go). Full maps require a development build.
 */
export function MapUnavailable({ onAction, actionLabel }: { onAction?: () => void; actionLabel?: string }) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons color={defaultColors.primary} name="map-marker-radius-outline" size={64} />
      <Text style={styles.title}>Map needs a development build</Text>
      <Text style={styles.message}>
        Maps use native MapLibre code that is not available in Expo Go. Run a development build to view
        maps:{'\n'}
        <Text style={styles.code}>npx expo prebuild</Text> then <Text style={styles.code}>npx expo run:android</Text>
      </Text>
      {onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel ?? 'Go back'} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: palette.pageBackground,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    color: palette.textPrimary,
    fontSize: typography.title,
    fontWeight: '800',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  message: {
    color: palette.textSecondary,
    fontSize: typography.body,
    lineHeight: 22,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  code: { color: palette.textPrimary, fontWeight: '700' },
  action: { marginTop: spacing.lg, width: 200 },
});
