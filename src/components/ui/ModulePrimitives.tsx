import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { defaultColors, palette, radius, spacing, typography } from '@/src/theme/tokens';

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null, style]}>
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function RowCard({
  icon,
  title,
  meta,
  right,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  meta?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={styles.rowCard}>
      <View style={styles.rowIcon}>
        <MaterialCommunityIcons color={defaultColors.primary} name={icon} size={22} />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        {meta ? (
          <Text numberOfLines={2} style={styles.rowMeta}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right}
    </Wrapper>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function EmptyLine({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.pageBackground, flex: 1 },
  sectionTitle: { gap: 2, paddingBottom: spacing.sm },
  title: { color: palette.textPrimary, fontSize: typography.title, fontWeight: '800' },
  subtitle: { color: palette.textSecondary, fontSize: typography.caption, lineHeight: 17 },
  chip: {
    alignItems: 'center',
    backgroundColor: palette.cardBackground,
    borderColor: palette.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  chipActive: { backgroundColor: defaultColors.primary, borderColor: defaultColors.primary },
  chipText: { color: palette.textPrimary, fontSize: typography.caption, fontWeight: '700' },
  chipTextActive: { color: palette.white },
  rowCard: {
    alignItems: 'center',
    backgroundColor: palette.cardBackground,
    borderColor: palette.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 70,
    padding: spacing.md,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF9EE',
    borderRadius: radius.sm,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: palette.textPrimary, fontSize: typography.body, fontWeight: '800' },
  rowMeta: { color: palette.textSecondary, fontSize: typography.caption, lineHeight: 17, marginTop: 2 },
  fieldLabel: { color: palette.textSecondary, fontSize: typography.caption, fontWeight: '700' },
  empty: { color: palette.textSecondary, fontSize: typography.body, padding: spacing.md, textAlign: 'center' },
});
