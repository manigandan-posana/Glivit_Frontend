import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { authStorage } from '@/src/services/authStorage';
import { hydrate } from '@/src/store/authSlice';
import { useAppDispatch } from '@/src/store/hooks';
import { store } from '@/src/store/store';
import { ThemeProvider, useTheme } from '@/src/theme/ThemeProvider';

/** Status bar content colour follows the active theme. */
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} translucent />;
}

// Keep the native splash up until persisted auth/branding is loaded, so no
// default React Native / placeholder screen flashes.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Bootstrapper({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const persisted = await authStorage.load();
        if (active) {
          dispatch(hydrate(persisted));
        }
      } finally {
        await SplashScreen.hideAsync().catch(() => undefined);
      }
    })();
    return () => {
      active = false;
    };
  }, [dispatch]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <Bootstrapper>
              <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="company-code" />
                <Stack.Screen name="login" />
                <Stack.Screen name="device-profile" />
                <Stack.Screen name="live-track" />
                <Stack.Screen name="trip-playback" />
                <Stack.Screen name="(app)" />
              </Stack>
            </Bootstrapper>
            <ThemedStatusBar />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Provider>
  );
}
