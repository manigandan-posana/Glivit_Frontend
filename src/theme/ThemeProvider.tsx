import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { useAppSelector } from '@/src/store/hooks';
import {
  buildColors,
  elevation as elevationFor,
  stateColorsFor,
  type Scheme,
  type ThemeColors,
} from '@/src/theme/tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: Scheme;
  isDark: boolean;
  colors: ThemeColors;
  stateColors: Record<string, string>;
  elevation: (level?: 1 | 2 | 3) => ReturnType<typeof elevationFor>;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  setPrimaryColor: (hex: string | null) => void;
};

const STORAGE_KEY = 'glivt.theme.mode';
const COLOR_STORAGE_KEY = 'glivt.theme.primaryColor';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [customPrimaryColor, setCustomPrimaryColorState] = useState<string | null>(null);
  const tenant = useAppSelector((s) => s.auth.tenantConfig);

  // Restore the persisted preferences once on mount (best-effort).
  useEffect(() => {
    let active = true;
    Promise.all([
      SecureStore.getItemAsync(STORAGE_KEY),
      SecureStore.getItemAsync(COLOR_STORAGE_KEY)
    ])
      .then(([savedMode, savedColor]) => {
        if (active) {
          if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
            setModeState(savedMode);
          }
          if (savedColor) {
            setCustomPrimaryColorState(savedColor);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const scheme: Scheme = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const setPrimaryColor = useCallback((hex: string | null) => {
    setCustomPrimaryColorState(hex);
    if (hex) {
      SecureStore.setItemAsync(COLOR_STORAGE_KEY, hex).catch(() => undefined);
    } else {
      SecureStore.deleteItemAsync(COLOR_STORAGE_KEY).catch(() => undefined);
    }
  }, []);

  const toggle = useCallback(() => {
    setMode(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme, setMode]);

  const value = useMemo<ThemeContextValue>(() => {
    const colors = buildColors(scheme, {
      primary: customPrimaryColor || tenant?.primaryColor || undefined,
      secondary: tenant?.secondaryColor || undefined,
    });
    return {
      mode,
      scheme,
      isDark: scheme === 'dark',
      colors,
      stateColors: stateColorsFor(colors),
      elevation: (level: 1 | 2 | 3 = 1) => elevationFor(colors, level),
      setMode,
      toggle,
      setPrimaryColor,
    };
  }, [scheme, mode, customPrimaryColor, tenant?.primaryColor, tenant?.secondaryColor, setMode, toggle, setPrimaryColor]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. Falls back to a light theme if used outside a provider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    const colors = buildColors('light');
    return {
      mode: 'system',
      scheme: 'light',
      isDark: false,
      colors,
      stateColors: stateColorsFor(colors),
      elevation: (level: 1 | 2 | 3 = 1) => elevationFor(colors, level),
      setMode: () => undefined,
      toggle: () => undefined,
      setPrimaryColor: () => undefined,
    };
  }
  return ctx;
}

/** Convenience: just the active colours. */
export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}
