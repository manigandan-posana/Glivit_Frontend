import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { defaultColors, radius, spacing } from '@/src/theme/tokens';

export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: defaultColors.cardBackground,
    borderColor: defaultColors.divider,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
});
