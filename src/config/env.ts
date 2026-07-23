/**
 * Environment configuration. Only EXPO_PUBLIC_* values are readable on the
 * client. Secrets (Firebase admin, Razorpay secret, DB) live on the backend.
 */
const backendBaseUrl = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '').replace(/\/+$/, '');

// True only under the Metro dev server / a development build. Release/production
// builds (EAS production or preview, standalone APK/IPA) compile with
// `__DEV__ === false`.
const isDevBuild = typeof __DEV__ !== 'undefined' && __DEV__ === true;

// Demo mode requires BOTH the opt-in flag AND a development build. This is a
// hard guarantee: a production/release build can never serve demo data even if
// EXPO_PUBLIC_DEMO_MODE is accidentally left `true`, because `__DEV__` is false
// there. Flip demo data on for local manual testing by setting
// EXPO_PUBLIC_DEMO_MODE=true in .env and running the dev server.
const demoFlag = (process.env.EXPO_PUBLIC_DEMO_MODE || 'false').toLowerCase() === 'true';

export const env = {
  /** Base URL of the Glivt backend, e.g. https://api.example.com */
  backendBaseUrl,
  /** REST root: <backend>/api */
  apiBaseUrl: backendBaseUrl ? `${backendBaseUrl}/api` : '/api',
  geoapifyApiKey: process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY || '',
  /** Serve offline demo data. Dev-only: forced off in production/release builds. */
  demoMode: isDevBuild && demoFlag,
};
