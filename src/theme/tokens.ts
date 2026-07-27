/**
 * Design tokens for the Glivt fleet platform.
 *
 * A single semantic colour contract is defined twice — once for `light`, once
 * for `dark` — with IDENTICAL keys, so any component can switch themes just by
 * reading colours from the active scheme. Legacy exports (`palette`,
 * `defaultColors`, `stateColors`) resolve to the light scheme for backwards
 * compatibility; new/redesigned components pull colours from `useTheme()`.
 *
 * Design language: "command-centre" — deep slate surfaces, one energetic brand
 * green accent, semantic status colours, generous spacing, tabular figures.
 * Tenant branding overrides `primary`/`secondary` at runtime.
 */

export type Scheme = 'light' | 'dark';

/** The full semantic colour contract shared by both themes. */
export type ThemeColors = {
  // Brand
  primary: string;
  secondary: string;
  onPrimary: string;
  primaryGreen: string;
  darkGreen: string;
  accent: string;
  accentSoft: string;
  // Surfaces
  pageBackground: string;
  cardBackground: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  loginBackground: string;
  // Lines
  divider: string;
  border: string;
  borderStrong: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Status / semantic
  blue: string;
  info: string;
  success: string;
  warning: string;
  warningOrange: string;
  danger: string;
  errorRed: string;
  // Utility
  white: string;
  black: string;
  overlay: string;
  shadowColor: string;
};

export const lightColors: ThemeColors = {
  primary: '#0F9D58',
  secondary: '#2563EB',
  onPrimary: '#FFFFFF',
  primaryGreen: '#0F9D58',
  darkGreen: '#0B7C46',
  accent: '#22C55E',
  accentSoft: '#E7F7EE',

  pageBackground: '#F3F5F7',
  cardBackground: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F9FB',
  surfaceElevated: '#FFFFFF',
  loginBackground: '#0C1420',

  divider: '#E6EAEE',
  border: '#E6EAEE',
  borderStrong: '#D3DAE1',

  textPrimary: '#0E1621',
  textSecondary: '#59646F',
  textMuted: '#8B97A3',

  blue: '#2563EB',
  info: '#2563EB',
  success: '#16A34A',
  warning: '#B45309',
  warningOrange: '#F59E0B',
  danger: '#DC2626',
  errorRed: '#DC2626',

  white: '#FFFFFF',
  black: '#0B0F14',
  overlay: 'rgba(10,14,19,0.55)',
  shadowColor: '#0E1621',
};

export const darkColors: ThemeColors = {
  primary: '#22C55E',
  secondary: '#3B82F6',
  onPrimary: '#052E16',
  primaryGreen: '#22C55E',
  darkGreen: '#16A34A',
  accent: '#34D399',
  accentSoft: 'rgba(34,197,94,0.14)',

  pageBackground: '#0A0E13',
  cardBackground: '#121924',
  surface: '#121924',
  surfaceAlt: '#0E141D',
  surfaceElevated: '#18212E',
  loginBackground: '#0A0E13',

  divider: '#233040',
  border: '#233040',
  borderStrong: '#2E3D4F',

  textPrimary: '#E9EEF4',
  textSecondary: '#9FB0C0',
  textMuted: '#6C7C8C',

  blue: '#3B82F6',
  info: '#3B82F6',
  success: '#22C55E',
  warning: '#FBBF24',
  warningOrange: '#F59E0B',
  danger: '#F87171',
  errorRed: '#F87171',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.62)',
  shadowColor: '#000000',
};

export const schemes: Record<Scheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

/** Vehicle/device state colours, resolved per scheme. White text sits on top. */
export function stateColorsFor(colors: ThemeColors): Record<string, string> {
  return {
    RUNNING: colors.primaryGreen,
    MOVING: colors.primaryGreen,
    STOPPED: '#EF4444',
    IDLE: '#F59E0B',
    INACTIVE: colors.textMuted,
    OFFLINE: colors.textMuted,
    NO_DATA: colors === darkColors ? '#4B5A6A' : '#B8C0C8',
    EXPIRED: colors === darkColors ? '#3A4757' : '#6E7A86',
    SUSPENDED: colors === darkColors ? '#3A4757' : '#6E7A86',
    IMMOBILISED: '#F43F5E',
    GPS_INVALID: '#F59E0B',
    POWER_DISCONNECTED: '#F59E0B',
    HEALTHY: colors.primaryGreen,
    WARNING: '#F59E0B',
    CRITICAL: '#EF4444',
    MAINTENANCE: colors.secondary,
    TOTAL: colors.secondary,
  };
}

/** Elevation presets. Dark mode leans on borders + lighter surfaces, not shadow. */
export function elevation(colors: ThemeColors, level: 1 | 2 | 3 = 1) {
  const dark = colors === darkColors;
  const map = {
    1: { radius: 6, opacity: dark ? 0.28 : 0.08, y: 2, e: 2 },
    2: { radius: 14, opacity: dark ? 0.36 : 0.12, y: 6, e: 5 },
    3: { radius: 24, opacity: dark ? 0.44 : 0.18, y: 12, e: 10 },
  } as const;
  const m = map[level];
  return {
    shadowColor: colors.shadowColor,
    shadowOpacity: m.opacity,
    shadowRadius: m.radius,
    shadowOffset: { width: 0, height: m.y },
    elevation: m.e,
  };
}

/** 8-point spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  h1: 26,
  h2: 20,
  title: 18,
  body: 15,
  label: 14,
  caption: 12,
} as const;

export const layout = {
  appBarHeight: 56,
  fabSize: 48,
  inputHeight: 52,
  buttonHeight: 52,
} as const;

// ---------------------------------------------------------------------------
// Backwards-compatible exports (resolve to the LIGHT scheme). Screens that have
// not yet migrated to useTheme() keep compiling and render the improved light
// theme; migrated screens pull colours from the active scheme instead.
// ---------------------------------------------------------------------------

export const palette = lightColors;

export const stateColors: Record<string, string> = stateColorsFor(lightColors);

/** Builds the active colour set, applying tenant overrides when present. */
export function buildColors(
  scheme: Scheme = 'light',
  overrides?: { primary?: string; secondary?: string }
): ThemeColors {
  const base = schemes[scheme];
  if (!overrides?.primary && !overrides?.secondary) return base;
  return {
    ...base,
    primary: overrides?.primary || base.primary,
    primaryGreen: overrides?.primary || base.primaryGreen,
    secondary: overrides?.secondary || base.secondary,
  };
}

export const defaultColors = lightColors;
