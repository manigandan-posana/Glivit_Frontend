import type { ApiResponse } from '@/src/types/api';

/** Extracts a user-facing message from an RTK Query error, hiding internals. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as { data?: ApiResponse<unknown>; status?: number | string };
  // Connectivity issues must never be reported as a domain error (e.g. bad code).
  if (e.status === 'FETCH_ERROR' || e.status === 'TIMEOUT_ERROR') {
    return 'Cannot reach the server. Check the backend URL and your connection.';
  }
  if (typeof e.status === 'number' && e.status >= 500) {
    return 'Server error. Please try again later.';
  }
  if (e.data?.error?.message) return e.data.error.message;
  return fallback;
}

export function apiErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { data?: ApiResponse<unknown> };
  return e.data?.error?.code ?? null;
}
