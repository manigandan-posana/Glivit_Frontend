import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, stateColors, typography } from '@/src/theme/tokens';

/** Coloured status badge shared by list rows, cards and the live-track header. */
export function StatusPill({ state }: { state: string }) {
  const color = stateColors[state] ?? stateColors.NO_DATA;
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.text}>{formatState(state)}</Text>
    </View>
  );
}

function formatState(state: string) {
  return state.replace(/_/g, ' ');
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  text: {
    color: '#FFFFFF',
    fontSize: typography.caption,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
