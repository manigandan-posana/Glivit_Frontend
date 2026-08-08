import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { env } from '@/src/config/env';
import { aiApi, type AiEventDto } from '@/src/services/aiApi';
import { openSse, type SseConnection } from '@/src/services/sseClient';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';

/**
 * Live AI alert stream.
 *
 * One connection per signed-in session: the hook is backed by a module-level
 * singleton, so mounting it in several components (notification bell, command
 * centre, map) shares a single SSE connection rather than opening one each.
 *
 * Lifecycle rules:
 *  - connects only when authenticated, with the JWT in the Authorization header;
 *  - reconnects with backoff (handled by the SSE client), longer on auth errors;
 *  - disconnects on logout and never reconnects afterwards;
 *  - fully resets when the tenant changes, so events from the previous tenant
 *    can never leak into the new one;
 *  - de-duplicates by event id so a reconnect replaying an event does not
 *    notify twice.
 */

export type AiStreamStatus = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

type Listener = (state: AiStreamState) => void;

export type AiStreamState = {
  status: AiStreamStatus;
  events: AiEventDto[];
  unreadCount: number;
  lastEventAt: string | null;
};

const MAX_BUFFERED_EVENTS = 50;

const initialState: AiStreamState = {
  status: 'IDLE',
  events: [],
  unreadCount: 0,
  lastEventAt: null,
};

/**
 * Module-level connection state. Kept outside React so that remounting a
 * component never tears down and re-establishes the stream.
 */
const store = {
  state: initialState,
  listeners: new Set<Listener>(),
  connection: null as SseConnection | null,
  /** Identifies the session the current connection belongs to. */
  key: null as string | null,
  /** Event ids already delivered — prevents duplicate notifications. */
  seen: new Set<number>(),
  /** Set once the user reads the list, so unread counts reset correctly. */
  readCount: 0,
};

function emit(next: Partial<AiStreamState>) {
  store.state = { ...store.state, ...next };
  store.listeners.forEach((listener) => listener(store.state));
}

function resetStore() {
  store.seen.clear();
  store.readCount = 0;
  emit({ status: 'IDLE', events: [], unreadCount: 0, lastEventAt: null });
}

function closeConnection() {
  store.connection?.close();
  store.connection = null;
  store.key = null;
}

export function useAiEventStream(options?: { enabled?: boolean }) {
  const dispatch = useAppDispatch();
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const tenantId = useAppSelector((s) => s.auth.user?.tenantId ?? s.tenant.activeTenantId ?? null);
  const permissions = useAppSelector((s) => s.auth.user?.permissions);

  const [state, setState] = useState<AiStreamState>(store.state);
  const mountedRef = useRef(true);

  const canStream =
    (options?.enabled ?? true) &&
    Boolean(accessToken) &&
    Boolean(tenantId) &&
    Boolean(permissions?.view_live_location);

  useEffect(() => {
    mountedRef.current = true;
    const listener: Listener = (next) => {
      if (mountedRef.current) setState(next);
    };
    store.listeners.add(listener);
    return () => {
      mountedRef.current = false;
      store.listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    // Logged out, or the tenant changed: tear the stream down completely.
    if (!canStream) {
      if (store.connection) {
        closeConnection();
        resetStore();
      }
      return;
    }

    const key = `${tenantId}:${accessToken?.slice(-12) ?? ''}`;
    if (store.connection && store.key === key) {
      return; // already streaming for this session
    }
    if (store.connection) {
      // Tenant or token changed — start clean so no event crosses tenants.
      closeConnection();
      resetStore();
    }

    store.key = key;
    emit({ status: 'CONNECTING' });

    store.connection = openSse(`${env.apiBaseUrl}/ai/stream`, accessToken ?? null, {
      onOpen: () => emit({ status: 'CONNECTED' }),
      onError: () => emit({ status: 'DISCONNECTED' }),
      onEvent: (eventName, data) => {
        if (eventName !== 'AI_EVENT') {
          return; // CONNECT / keep-alive frames
        }
        let parsed: AiEventDto;
        try {
          parsed = JSON.parse(data) as AiEventDto;
        } catch {
          return; // malformed frame — ignore rather than crash the stream
        }
        if (typeof parsed?.id !== 'number' || store.seen.has(parsed.id)) {
          return; // duplicate delivery after a reconnect
        }
        // Defence in depth: the backend scopes the stream by tenant, but drop
        // anything that does not match the tenant we connected as.
        if (parsed.tenantId != null && tenantId != null && parsed.tenantId !== tenantId) {
          return;
        }

        store.seen.add(parsed.id);
        const events = [parsed, ...store.state.events].slice(0, MAX_BUFFERED_EVENTS);
        emit({
          events,
          unreadCount: Math.max(0, events.length - store.readCount),
          lastEventAt: new Date().toISOString(),
        });

        // Keep cached lists and counters honest without a manual refresh.
        dispatch(aiApi.util.invalidateTags(['AiEvent', 'Dashboard']));
      },
    });
  }, [canStream, accessToken, tenantId, dispatch]);

  // Close the shared connection when the last consumer unmounts.
  useEffect(
    () => () => {
      if (store.listeners.size === 0) {
        closeConnection();
      }
    },
    []
  );

  const markAllRead = useCallback(() => {
    store.readCount = store.state.events.length;
    emit({ unreadCount: 0 });
  }, []);

  const clear = useCallback(() => {
    resetStore();
  }, []);

  return useMemo(
    () => ({
      status: state.status,
      events: state.events,
      unreadCount: state.unreadCount,
      lastEventAt: state.lastEventAt,
      connected: state.status === 'CONNECTED',
      markAllRead,
      clear,
    }),
    [state, markAllRead, clear]
  );
}

/** Test hook: resets the module singleton between cases. */
export function __resetAiEventStreamForTests() {
  closeConnection();
  resetStore();
  store.listeners.clear();
}
