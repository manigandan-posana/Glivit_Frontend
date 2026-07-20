import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { defaultColors, layout, radius, spacing, typography } from '@/src/theme/tokens';

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string;
  secure?: boolean;
};

/** Labelled input with a validation error slot and optional password toggle. */
export function TextField({ label, error, secure = false, style, ...rest }: TextFieldProps) {
  const [hidden, setHidden] = useState(secure);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        <TextInput
          placeholderTextColor={defaultColors.textSecondary}
          secureTextEntry={hidden}
          style={[styles.input, style]}
          {...rest}
        />
        {secure ? (
          <MaterialCommunityIcons
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            color={defaultColors.textSecondary}
            name={hidden ? 'eye-off-outline' : 'eye-outline'}
            onPress={() => setHidden((v) => !v)}
            size={22}
            style={styles.toggle}
          />
        ) : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    color: defaultColors.textPrimary,
    fontSize: typography.label,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  inputRow: {
    alignItems: 'center',
    backgroundColor: defaultColors.cardBackground,
    borderColor: defaultColors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    height: layout.inputHeight,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: defaultColors.errorRed,
  },
  input: {
    color: defaultColors.textPrimary,
    flex: 1,
    fontSize: typography.body,
    height: '100%',
  },
  toggle: {
    paddingLeft: spacing.sm,
  },
  errorText: {
    color: defaultColors.errorRed,
    fontSize: typography.caption,
    marginTop: spacing.xs,
  },
});
