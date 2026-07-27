import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  hasValidTenantSelection,
  hasValidTenantSession,
  normalizeCompanyCode,
} from '@/src/services/tenantIdentity';
import type { AuthUser, TenantConfig } from '@/src/types/api';

export type AuthState = {
  /** True once persisted state has been read from secure storage. */
  bootstrapped: boolean;
  companyCode: string | null;
  tenantConfig: TenantConfig | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Company code that issued the current authenticated session. */
  sessionCompanyCode: string | null;
  user: AuthUser | null;
};

const initialState: AuthState = {
  bootstrapped: false,
  companyCode: null,
  tenantConfig: null,
  accessToken: null,
  refreshToken: null,
  sessionCompanyCode: null,
  user: null,
};

function removeSession(state: AuthState) {
  state.accessToken = null;
  state.refreshToken = null;
  state.sessionCompanyCode = null;
  state.user = null;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    hydrate(state, action: PayloadAction<Partial<AuthState>>) {
      Object.assign(state, action.payload);
      state.bootstrapped = true;

      if (!hasValidTenantSelection(state)) {
        state.companyCode = null;
        state.tenantConfig = null;
        removeSession(state);
        return;
      }

      state.companyCode = normalizeCompanyCode(state.companyCode);
      if (!hasValidTenantSession(state)) {
        removeSession(state);
      }
    },
    setTenant(state, action: PayloadAction<{ companyCode: string; tenantConfig: TenantConfig }>) {
      const companyCode = normalizeCompanyCode(action.payload.companyCode);
      const configuredCode = normalizeCompanyCode(action.payload.tenantConfig.companyCode);
      if (
        !companyCode ||
        configuredCode !== companyCode ||
        !hasValidTenantSelection({
          companyCode,
          tenantConfig: action.payload.tenantConfig,
        })
      ) {
        state.companyCode = null;
        state.tenantConfig = null;
        removeSession(state);
        return;
      }
      if (normalizeCompanyCode(state.companyCode) !== companyCode) {
        removeSession(state);
      }
      state.companyCode = companyCode;
      state.tenantConfig = { ...action.payload.tenantConfig, companyCode };
    },
    clearTenant(state) {
      state.companyCode = null;
      state.tenantConfig = null;
      removeSession(state);
    },
    setCredentials(
      state,
      action: PayloadAction<{
        accessToken: string;
        companyCode: string;
        refreshToken: string;
        user: AuthUser;
      }>
    ) {
      const sessionCompanyCode = normalizeCompanyCode(action.payload.companyCode);
      if (
        !hasValidTenantSelection(state) ||
        sessionCompanyCode !== normalizeCompanyCode(state.companyCode) ||
        !Number.isSafeInteger(action.payload.user.tenantId) ||
        action.payload.user.tenantId <= 0
      ) {
        removeSession(state);
        return;
      }
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.sessionCompanyCode = sessionCompanyCode;
      state.user = action.payload.user;
    },
    clearSession(state) {
      removeSession(state);
    },
  },
});

export const { hydrate, setTenant, clearTenant, setCredentials, clearSession } = authSlice.actions;
export default authSlice.reducer;
