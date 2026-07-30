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
import type { TenantState } from '@/src/store/tenantSlice';
import type { ApiResponse, TokenResponse } from '@/src/types/api';

type StateShape = { auth: AuthState; tenant: TenantState };

/** Header the backend compares against the tenant signed into the access token. */
const TENANT_HEADER = 'X-Tenant-Id';

/** Error surfaced when a response outlived the tenant it was requested for. */
const TENANT_CHANGED_ERROR = 'TENANT_CHANGED';

// ---------------------------------------------------------------------------
// In-flight request tracking
//
// Switching tenants must cancel every request already on the wire. A response for
// the previous tenant that lands after the switch would otherwise be written into
// the cache the new tenant's screens are reading. `fetchBaseQuery` does not expose
// its abort signal, so requests are routed through a custom `fetchFn` that keeps
// its own controller per request and chains the upstream signal onto it.
// ---------------------------------------------------------------------------
const inFlight = new Set<AbortController>();

/** Aborts every request currently on the wire. Called at the start of a switch. */
export function abortInFlightRequests(): void {
  const controllers = Array.from(inFlight);
  inFlight.clear();
  for (const controller of controllers) {
    try {
      controller.abort();
    } catch {
      // Already settled; nothing to cancel.
    }
  }
}

const cancellableFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  inFlight.add(controller);

  const upstream = init?.signal;
  if (upstream) {
    if (upstream.aborted) {
      controller.abort();
    } else {
      upstream.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return fetch(input as RequestInfo, { ...init, signal: controller.signal }).finally(() => {
    inFlight.delete(controller);
  });
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: env.apiBaseUrl,
  fetchFn: cancellableFetch,
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as StateShape;
    if (hasValidTenantSession(state.auth)) {
      headers.set('Authorization', `Bearer ${state.auth.accessToken}`);
    }
    // Declaring the tenant the client believes is active lets the backend reject a
    // request whose token belongs to a different tenant, instead of quietly serving
    // it. This is a consistency check, never a grant: the tenant that actually
    // scopes the query is the one signed into the token.
    //
    // It is read from `auth.user`, the same slice as the token, so the two are always
    // written by a single reducer and can never disagree. Reading it from the tenant
    // slice would leave a window during a switch where the new token travels with the
    // previous tenant's id and the backend rejects the caller's own request.
    const activeTenantId = state.auth.user?.tenantId;
    if (Number.isSafeInteger(activeTenantId) && (activeTenantId as number) > 0) {
      headers.set(TENANT_HEADER, String(activeTenantId));
    }
    return headers;
  },
});

function isAuthEndpoint(args: string | FetchArgs): boolean {
  const url = typeof args === 'string' ? args : args.url;
  return url.startsWith('/auth/') || url.startsWith('/tenant/');
}

/** Tenant switching itself must not be discarded by the stale-tenant guard. */
function isTenantSwitchEndpoint(args: string | FetchArgs): boolean {
  const url = typeof args === 'string' ? args : args.url;
  return url.startsWith('/tenants');
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
  // The tenant this request was issued for. Captured BEFORE the request so a switch
  // that happens while it is in flight is detectable when it comes back.
  const before = (api.getState() as StateShape).tenant;
  const issuedEpoch = before?.epoch ?? 0;
  const issuedTenantId = before?.activeTenantId ?? null;

  const result = env.demoMode
    ? await demoBaseQuery(args, api, extraOptions)
    : await baseQueryWithReauth(args, api, extraOptions);

  // Discard anything that outlived its tenant. Without this a slow response for the
  // previous tenant could repopulate a cache the new tenant's screens are rendering
  // from — exactly the flash of stale vehicles/counts a switch must never show.
  const after = (api.getState() as StateShape).tenant;
  const tenantChanged =
    (after?.epoch ?? 0) !== issuedEpoch || (after?.activeTenantId ?? null) !== issuedTenantId;
  if (tenantChanged && !isTenantSwitchEndpoint(args) && !isAuthEndpoint(args)) {
    return {
      error: {
        status: 'CUSTOM_ERROR',
        error: TENANT_CHANGED_ERROR,
        data: TENANT_CHANGED_ERROR,
      } as FetchBaseQueryError,
    };
  }

  return result;
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
