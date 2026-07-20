import * as SecureStore from 'expo-secure-store';

import type { AuthUser, TenantConfig } from '@/src/types/api';

/**
 * Secure persistence for auth artefacts. Tokens live in the OS keystore
 * (Keychain on iOS, encrypted SharedPreferences/Keystore on Android) via
 * expo-secure-store. Never log token values.
 */
const KEYS = {
  accessToken: 'glivt.accessToken',
  refreshToken: 'glivt.refreshToken',
  user: 'glivt.user',
  companyCode: 'glivt.companyCode',
  tenantConfig: 'glivt.tenantConfig',
} as const;

export type PersistedAuth = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  companyCode: string | null;
  tenantConfig: TenantConfig | null;
};

async function setOrDelete(key: string, value: string | null) {
  if (value == null) {
    await SecureStore.deleteItemAsync(key);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export const authStorage = {
  async saveTokens(accessToken: string, refreshToken: string) {
    await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
    await SecureStore.setItemAsync(KEYS.refreshToken, refreshToken);
  },

  async saveUser(user: AuthUser) {
    await SecureStore.setItemAsync(KEYS.user, JSON.stringify(user));
  },

  async saveTenant(companyCode: string, tenantConfig: TenantConfig) {
    await SecureStore.setItemAsync(KEYS.companyCode, companyCode);
    await SecureStore.setItemAsync(KEYS.tenantConfig, JSON.stringify(tenantConfig));
  },

  /** Clears session tokens + user but keeps tenant branding for the next login. */
  async clearSession() {
    await setOrDelete(KEYS.accessToken, null);
    await setOrDelete(KEYS.refreshToken, null);
    await setOrDelete(KEYS.user, null);
  },

  /** Clears everything including the remembered company code. */
  async clearAll() {
    await this.clearSession();
    await setOrDelete(KEYS.companyCode, null);
    await setOrDelete(KEYS.tenantConfig, null);
  },

  async load(): Promise<PersistedAuth> {
    const [accessToken, refreshToken, userRaw, companyCode, tenantRaw] = await Promise.all([
      SecureStore.getItemAsync(KEYS.accessToken),
      SecureStore.getItemAsync(KEYS.refreshToken),
      SecureStore.getItemAsync(KEYS.user),
      SecureStore.getItemAsync(KEYS.companyCode),
      SecureStore.getItemAsync(KEYS.tenantConfig),
    ]);
    return {
      accessToken,
      refreshToken,
      user: safeParse<AuthUser>(userRaw),
      companyCode,
      tenantConfig: safeParse<TenantConfig>(tenantRaw),
    };
  },
};

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
