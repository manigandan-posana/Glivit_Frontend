import { Platform } from 'react-native';

/**
 * Environment configuration. Only EXPO_PUBLIC_* values are readable on the
 * client. Secrets (Firebase admin, Razorpay secret, DB) live on the backend.
 */
const rawBackendBaseUrl = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '').replace(/\/+$/, '');

// Demo mode is controlled by EXPO_PUBLIC_DEMO_MODE and hard-gated behind React
// Native's dev flag, so release builds turn it off even if the variable is set.
const defaultDemoFlag = __DEV__ ? 'true' : 'false';
const demoFlag = (process.env.EXPO_PUBLIC_DEMO_MODE || defaultDemoFlag).toLowerCase() === 'true';
const demoMode = demoFlag && __DEV__;

function normalizeBackendBaseUrl(value: string): string {
  if (!value) return '';
  if (Platform.OS === 'web') return value;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      if (Platform.OS === 'android') {
        url.hostname = '10.0.2.2';
        return url.toString().replace(/\/+$/, '');
      }
      console.warn(
        '[api-config] EXPO_PUBLIC_BACKEND_BASE_URL uses localhost on a mobile target. Use the computer LAN IP, for example http://192.168.x.x:8085.'
      );
    }
  } catch {
    console.warn('[api-config] Invalid EXPO_PUBLIC_BACKEND_BASE_URL. Expected http(s)://host:port.');
  }
  return value;
}

const backendBaseUrl = normalizeBackendBaseUrl(rawBackendBaseUrl);

if (__DEV__ && Platform.OS !== 'web' && !backendBaseUrl) {
  console.warn(
    '[api-config] Missing EXPO_PUBLIC_BACKEND_BASE_URL. Android emulator should use http://10.0.2.2:8085; physical devices should use the computer LAN IP.'
  );
}

export const env = {
  /** Base URL of the Glivt backend, e.g. https://api.example.com */
  backendBaseUrl,
  /** REST root: <backend>/api */
  apiBaseUrl: backendBaseUrl ? `${backendBaseUrl}/api` : '/api',
  geoapifyApiKey: process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY || '',
  /** Serve offline demo data. Controlled by EXPO_PUBLIC_DEMO_MODE (default off). */
  demoMode,
};
