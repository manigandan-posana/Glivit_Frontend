/**
 * Design tokens for the Glivt white-label GPS app.
 *
 * Default values follow the product brief's visual system (section 3). Tenant
 * branding (primary/secondary colour + logo) overrides `colors.primary` and
 * `colors.secondary` at runtime once the tenant config is downloaded.
 */

export const palette = {
  loginBackground: '#867B84',
  primaryGreen: '#27D34D',
  darkGreen: '#088A29',
  blue: '#2A91BD',
  warningOrange: '#FF9D2F',
  errorRed: '#FF432F',
  textPrimary: '#323232',
  textSecondary: '#939393',
  pageBackground: '#F5F5F5',
  cardBackground: '#FFFFFF',
  divider: '#E7E7E7',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** Vehicle/device state colours used across dashboard, lists and markers. */
export const stateColors: Record<string, string> = {
  RUNNING: palette.primaryGreen,
  STOPPED: palette.errorRed,
  IDLE: palette.warningOrange,
  INACTIVE: palette.textSecondary,
  NO_DATA: '#B8B8B8',
  EXPIRED: '#6E6E6E',
  TOTAL: palette.blue,
};

/** 8-point spacing scale (brief section 3). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  pill: 999,
} as const;

export const typography = {
  h1: 24,
  h2: 20,
  title: 18,
  body: 15,
  label: 14,
  caption: 12,
} as const;

export const layout = {
  appBarHeight: 56,
  fabSize: 48,
  inputHeight: 50,
  buttonHeight: 50,
} as const;

export type ThemeColors = {
  primary: string;
  secondary: string;
} & typeof palette;

/** Builds the active colour set, applying tenant overrides when present. */
export function buildColors(overrides?: { primary?: string; secondary?: string }): ThemeColors {
  return {
    ...palette,
    primary: overrides?.primary || palette.primaryGreen,
    secondary: overrides?.secondary || palette.blue,
  };
}

export const defaultColors = buildColors();
