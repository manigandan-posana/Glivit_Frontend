import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';

import { env } from '@/src/config/env';
import { authStorage } from '@/src/services/authStorage';
import { demoBaseQuery } from '@/src/services/demoData';
import { clearSession, setCredentials, type AuthState } from '@/src/store/authSlice';
import type { ApiResponse, TokenResponse } from '@/src/types/api';

type StateShape = { auth: AuthState };

const rawBaseQuery = fetchBaseQuery({
  baseUrl: env.apiBaseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as StateShape).auth.accessToken;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

function isAuthEndpoint(args: string | FetchArgs): boolean {
  const url = typeof args === 'string' ? args : args.url;
  return url.startsWith('/auth/') || url.startsWith('/tenant/');
}

// Single-flight refresh so concurrent 401s don't spawn parallel refreshes.
let refreshInFlight: Promise<boolean> | null = null;

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && !isAuthEndpoint(args)) {
    const refreshToken = (api.getState() as StateShape).auth.refreshToken;
    if (!refreshToken) {
      api.dispatch(clearSession());
      return result;
    }

    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const refreshResult = await rawBaseQuery(
          { url: '/auth/refresh', method: 'POST', body: { refreshToken } },
          api,
          extraOptions
        );
        const envelope = refreshResult.data as ApiResponse<TokenResponse> | undefined;
        const tokens = envelope?.data;
        if (tokens?.accessToken) {
          api.dispatch(
            setCredentials({
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              user: tokens.user,
            })
          );
          await authStorage.saveTokens(tokens.accessToken, tokens.refreshToken);
          if (tokens.user) await authStorage.saveUser(tokens.user);
          return true;
        }
        api.dispatch(clearSession());
        await authStorage.clearSession();
        return false;
      })().finally(() => {
        refreshInFlight = null;
      });
    }

    const refreshed = await refreshInFlight;
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

export const baseApi = createApi({
  reducerPath: 'api',
  // Demo mode serves canned data offline; otherwise talk to the real backend.
  baseQuery: env.demoMode ? demoBaseQuery : baseQueryWithReauth,
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
