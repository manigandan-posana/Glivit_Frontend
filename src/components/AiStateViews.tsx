import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { env } from '@/src/config/env';
import type { AiMode, AiSource } from '@/src/services/aiApi';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

/**
 * Honest status badges for AI results.
 *
 * The distinction matters operationally: a rule-based answer computed from real
 * fleet data is useful and trustworthy, a model answer is richer, and a failed
 * call is neither. Collapsing all three into one "AI" label is what let a
 * fallback masquerade as a prediction, so each has its own visible state.
 */

type Tone = 'ok' | 'warn' | 'error' | 'muted';

const TONE_ICON: Record<Tone, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  ok: 'check-decagram',
  warn: 'information-outline',
  error: 'alert-circle-outline',
  muted: 'help-circle-outline',
};

function toneColor(tone: Tone, c: ThemeColors): string {
  switch (tone) {
    case 'ok':
      return c.primary;
    case 'warn':
      return c.warningOrange;
    case 'error':
      return c.danger;
    default:
      return c.textMuted;
  }
}

export function AiStatusBadge({
  source,
  mode,
  fallbackReason,
  compact,
}: {
  source?: AiSource | string | null;
  mode?: AiMode | string | null;
  fallbackReason?: string | null;
  compact?: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const descriptor = describe(source, mode, fallbackReason);
  if (!descriptor) return null;

  const color = toneColor(descriptor.tone, c);
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={descriptor.label}
      style={[styles.badge, { borderColor: `${color}66`, backgroundColor: `${color}18` }]}>
      <MaterialCommunityIcons name={TONE_ICON[descriptor.tone]} size={12} color={color} />
      <Text style={[styles.badgeText, { color }]} numberOfLines={compact ? 1 : 2}>
        {descriptor.label}
      </Text>
    </View>
  );
}

export function describe(
  source?: AiSource | string | null,
  mode?: AiMode | string | null,
  fallbackReason?: string | null
): { label: string; tone: Tone } | null {
  if (mode === 'PYTHON_SERVICE_UNAVAILABLE') {
    return { label: 'AI service unavailable', tone: 'error' };
  }
  switch (source) {
    case 'OLLAMA':
      return { label: 'AI model', tone: 'ok' };
    case 'MODEL':
    case 'PYTHON_AI':
      return { label: 'AI model', tone: 'ok' };
    case 'DETERMINISTIC':
    case 'RULE':
      return {
        label:
          fallbackReason === 'OLLAMA_UNAVAILABLE' || fallbackReason === 'MODEL_NOT_INSTALLED'
            ? 'Rule engine (AI model unavailable)'
            : 'Rule engine',
        tone: 'warn',
      };
    case 'NONE':
      return { label: 'No result', tone: 'error' };
    default:
      return mode ? { label: String(mode), tone: 'muted' } : null;
  }
}

/**
 * Demo data must never be mistaken for production data. This banner is rendered
 * wherever a screen is showing offline sample content.
 */
export function DemoDataBanner({ visible }: { visible?: boolean }) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  if (!(visible ?? env.demoMode)) return null;
  return (
    <View style={styles.demoBanner}>
      <MaterialCommunityIcons name="flask-outline" size={14} color={c.warningOrange} />
      <Text style={styles.demoText}>
        Demo data — sample content shown because you are not signed in to a live fleet.
      </Text>
    </View>
  );
}

/** Shown when a permission, not an error, is why there is nothing to display. */
export function PermissionDeniedView({ what }: { what: string }) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  return (
    <View style={styles.state}>
      <MaterialCommunityIcons name="lock-outline" size={28} color={c.textMuted} />
      <Text style={styles.stateTitle}>Not available to your role</Text>
      <Text style={styles.stateBody}>You do not have permission to view {what}.</Text>
    </View>
  );
}

/** Distinguishes "nothing has been generated yet" from "the request failed". */
export function NoDataYetView({ title, message }: { title: string; message: string }) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  return (
    <View style={styles.state}>
      <MaterialCommunityIcons name="timer-sand-empty" size={28} color={c.textMuted} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{message}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    badge: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    badgeText: { fontSize: 10, fontWeight: '800' },
    demoBanner: {
      alignItems: 'center',
      backgroundColor: `${c.warningOrange}18`,
      borderColor: `${c.warningOrange}55`,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth * 2,
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.sm,
    },
    demoText: { color: c.warningOrange, flex: 1, fontSize: 11, fontWeight: '700' },
    state: { alignItems: 'center', gap: spacing.xs, padding: spacing.xl },
    stateTitle: { color: c.textPrimary, fontSize: typography.body, fontWeight: '800' },
    stateBody: { color: c.textSecondary, fontSize: typography.caption, textAlign: 'center' },
  });
