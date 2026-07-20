/**
 * Environment configuration. Only EXPO_PUBLIC_* values are readable on the
 * client. Secrets (Firebase admin, Razorpay secret, DB) live on the backend.
 */
const backendBaseUrl = (process.env.EXPO_PUBLIC_BACKEND_BASE_URL || '').replace(/\/+$/, '');

export const env = {
  /** Base URL of the Glivt backend, e.g. https://api.example.com */
  backendBaseUrl,
  /** REST root: <backend>/api */
  apiBaseUrl: backendBaseUrl ? `${backendBaseUrl}/api` : '/api',
  geoapifyApiKey: process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY || '',
  demoMode: (process.env.EXPO_PUBLIC_DEMO_MODE || 'false').toLowerCase() === 'true',
};
