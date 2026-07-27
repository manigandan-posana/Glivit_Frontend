import {
  createApi,
  fetchBaseQuery,
  type BaseQueryApi,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

import { env } from '@/src/config/env';
import { authStorage } from '@/src/services/authStorage';
import { demoBaseQuery } from '@/src/services/demoData';
import {
  hasValidTenantSession,
  normalizeCompanyCode,
} from '@/src/services/tenantIdentity';
import { clearSession, setCredentials, type AuthState } from '@/src/store/authSlice';
import type { ApiResponse, TokenResponse } from '@/src/types/api';

type StateShape = { auth: AuthState };

const rawBaseQuery = fetchBaseQuery({
  baseUrl: env.apiBaseUrl,
  prepareHeaders: (headers, { getState }) => {
    const auth = (getState() as StateShape).auth;
    if (hasValidTenantSession(auth)) {
      headers.set('Authorization', `Bearer ${auth.accessToken}`);
    }
    return headers;
  },
});

function isAuthEndpoint(args: string | FetchArgs): boolean {
  const url = typeof args === 'string' ? args : args.url;
  return url.startsWith('/auth/') || url.startsWith('/tenant/');
}

type SessionSnapshot = {
  companyCode: string;
  refreshToken: string;
  tenantId: number;
};

// One refresh per tenant session; an old tenant can never refresh into a new one.
const refreshInFlight = new Map<string, Promise<boolean>>();

function sessionMatches(auth: AuthState, snapshot: SessionSnapshot): boolean {
  return (
    normalizeCompanyCode(auth.companyCode) === snapshot.companyCode &&
    normalizeCompanyCode(auth.sessionCompanyCode) === snapshot.companyCode &&
    auth.refreshToken === snapshot.refreshToken &&
    auth.user?.tenantId === snapshot.tenantId
  );
}

async function clearCurrentSession(api: BaseQueryApi, snapshot?: SessionSnapshot) {
  const auth = (api.getState() as StateShape).auth;
  if (snapshot && !sessionMatches(auth, snapshot)) return;
  api.dispatch(clearSession());
  api.dispatch(baseApi.util.resetApiState());
  await authStorage.clearSession().catch(() => undefined);
}

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && !isAuthEndpoint(args)) {
    const auth = (api.getState() as StateShape).auth;
    if (!hasValidTenantSession(auth)) {
      await clearCurrentSession(api);
      return result;
    }
    const snapshot: SessionSnapshot = {
      companyCode: normalizeCompanyCode(auth.companyCode)!,
      refreshToken: auth.refreshToken!,
      tenantId: auth.user!.tenantId,
    };
    const refreshKey = `${snapshot.companyCode}:${snapshot.tenantId}:${snapshot.refreshToken}`;
    let refresh = refreshInFlight.get(refreshKey);

    if (!refresh) {
      refresh = (async () => {
        const refreshResult = await rawBaseQuery(
          { url: '/auth/refresh', method: 'POST', body: { refreshToken: snapshot.refreshToken } },
          api,
          extraOptions
        );
        const envelope = refreshResult.data as ApiResponse<TokenResponse> | undefined;
        const tokens = envelope?.data;
        if (
          tokens?.accessToken &&
          tokens.refreshToken &&
          tokens.user?.tenantId === snapshot.tenantId &&
          sessionMatches((api.getState() as StateShape).auth, snapshot)
        ) {
          try {
            await authStorage.saveSession({
              accessToken: tokens.accessToken,
              companyCode: snapshot.companyCode,
              refreshToken: tokens.refreshToken,
              user: tokens.user,
            });
          } catch {
            await clearCurrentSession(api, snapshot);
            return false;
          }
          if (!sessionMatches((api.getState() as StateShape).auth, snapshot)) {
            return false;
          }
          api.dispatch(
            setCredentials({
              accessToken: tokens.accessToken,
              companyCode: snapshot.companyCode,
              refreshToken: tokens.refreshToken,
              user: tokens.user,
            })
          );
          return true;
        }
        await clearCurrentSession(api, snapshot);
        return false;
      })().finally(() => {
        refreshInFlight.delete(refreshKey);
      });
      refreshInFlight.set(refreshKey, refresh);
    }

    const refreshed = await refresh;
    if (refreshed) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  return result;
};

/** Unwraps the backend ApiResponse envelope to the payload. */
export function unwrap<T>(response: ApiResponse<T>): T {
  return response.data as T;
}

const hybridBaseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  if (env.demoMode) {
    return demoBaseQuery(args, api, extraOptions);
  }
  return baseQueryWithReauth(args, api, extraOptions);
};

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: hybridBaseQuery,
  tagTypes: [
    'Audit',
    'Command',
    'Dashboard',
    'Device',
    'Driver',
    'Event',
    'Geofence',
    'Group',
    'Project',
    'Report',
    'Settings',
    'Tenant',
    'User',
  ],
  endpoints: () => ({}),
});
