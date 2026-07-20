import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AuthUser, TenantConfig } from '@/src/types/api';

export type AuthState = {
  /** True once persisted state has been read from secure storage. */
  bootstrapped: boolean;
  companyCode: string | null;
  tenantConfig: TenantConfig | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
};

const initialState: AuthState = {
  bootstrapped: false,
  companyCode: null,
  tenantConfig: null,
  accessToken: null,
  refreshToken: null,
  user: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    hydrate(state, action: PayloadAction<Partial<AuthState>>) {
      Object.assign(state, action.payload);
      state.bootstrapped = true;
    },
    setTenant(state, action: PayloadAction<{ companyCode: string; tenantConfig: TenantConfig }>) {
      state.companyCode = action.payload.companyCode;
      state.tenantConfig = action.payload.tenantConfig;
    },
    clearTenant(state) {
      state.companyCode = null;
      state.tenantConfig = null;
    },
    setCredentials(
      state,
      action: PayloadAction<{ accessToken: string; refreshToken: string; user?: AuthUser }>
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      if (action.payload.user) {
        state.user = action.payload.user;
      }
    },
    clearSession(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
    },
  },
});

export const { hydrate, setTenant, clearTenant, setCredentials, clearSession } = authSlice.actions;
export default authSlice.reducer;
