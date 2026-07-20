import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { defaultColors, spacing, typography } from '@/src/theme/tokens';

export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={defaultColors.primary} size="large" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyView({
  icon = 'inbox-outline',
  title,
  message,
}: {
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  message?: string;
}) {
  return (
    <View style={styles.center}>
      <MaterialCommunityIcons color={defaultColors.textSecondary} name={icon} size={54} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
    </View>
  );
}

export function ErrorRetryView({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <MaterialCommunityIcons color={defaultColors.errorRed} name="alert-circle-outline" size={54} />
      <Text style={styles.title}>Something went wrong</Text>
      {message ? <Text style={styles.muted}>{message}</Text> : null}
      <View style={styles.retryButton}>
        <Button label="Retry" onPress={onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    color: defaultColors.textPrimary,
    fontSize: typography.title,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  muted: {
    color: defaultColors.textSecondary,
    fontSize: typography.body,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.lg,
    width: 160,
  },
});
