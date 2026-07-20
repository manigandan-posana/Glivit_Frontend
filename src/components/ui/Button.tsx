import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { defaultColors, layout, radius, spacing, typography } from '@/src/theme/tokens';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  color?: string;
  style?: ViewStyle;
};

/**
 * Full-width button with its own loading state (never a global spinner) so a
 * single action shows progress without disabling unrelated buttons.
 */
export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  color,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const background =
    variant === 'primary' ? color || defaultColors.primary : variant === 'secondary' ? '#EFEFEF' : 'transparent';
  const textColor = variant === 'primary' ? '#FFFFFF' : defaultColors.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, opacity: isDisabled ? 0.6 : pressed ? 0.9 : 1 },
        variant === 'ghost' && styles.ghost,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.sm,
    height: layout.buttonHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    width: '100%',
  },
  ghost: {
    height: undefined,
    paddingVertical: spacing.sm,
    width: undefined,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  label: {
    fontSize: typography.body,
    fontWeight: '700',
  },
});
