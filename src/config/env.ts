/**
 * Environment configuration. Only EXPO_PUBLIC_* values are readable on the
 * client. Secrets (Firebase admin, Razorpay secret, DB) live on the backend.
 */
const backendBaseUrl = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '').replace(/\/+$/, '');

// Demo mode is controlled by the EXPO_PUBLIC_DEMO_MODE flag, which is inlined at
// bundle time. To keep demo data out of production, production/release builds
// must be built with EXPO_PUBLIC_DEMO_MODE unset or `false` (it defaults to
// false). This works in ANY build (dev, preview, or standalone) so the demo is
// testable everywhere — set the flag true and restart the bundler with a cleared
// cache (`expo start -c`) since env values are baked in at bundle time.
const demoFlag = (process.env.EXPO_PUBLIC_DEMO_MODE || 'false').toLowerCase() === 'true';

export const env = {
  /** Base URL of the Glivt backend, e.g. https://api.example.com */
  backendBaseUrl,
  /** REST root: <backend>/api */
  apiBaseUrl: backendBaseUrl ? `${backendBaseUrl}/api` : '/api',
  geoapifyApiKey: process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY || '',
  /** Serve offline demo data. Controlled by EXPO_PUBLIC_DEMO_MODE (default off). */
  demoMode: demoFlag,
};
