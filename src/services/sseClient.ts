/**
 * Minimal Server-Sent Events client for React Native / Expo.
 *
 * The browser `EventSource` is unavailable in RN and cannot send an
 * `Authorization` header anyway, so this reads the stream over `XMLHttpRequest`
 * (which RN supports incrementally at readyState 3) and parses SSE frames from
 * the growing `responseText`. It reconnects automatically with a backoff that
 * is longer on auth failures so a bad token never hammers the server.
 *
 * No external dependency — keeps the native footprint unchanged.
 */

export type SseHandlers = {
  onEvent: (eventName: string, data: string) => void;
  onOpen?: () => void;
  onError?: (error: unknown) => void;
};

export type SseConnection = {
  close: () => void;
};

const RETRY_MS = 3000;
const AUTH_RETRY_MS = 15000;

export function openSse(url: string, token: string | null, handlers: SseHandlers): SseConnection {
  let xhr: XMLHttpRequest | null = null;
  let closed = false;
  let opened = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let parseOffset = 0;

  const parse = (text: string) => {
    let boundary = text.indexOf('\n\n', parseOffset);
    while (boundary !== -1) {
      const frame = text.slice(parseOffset, boundary);
      parseOffset = boundary + 2;

      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) continue; // comment / keep-alive
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
      if (dataLines.length > 0) {
        handlers.onEvent(eventName, dataLines.join('\n'));
      }
      boundary = text.indexOf('\n\n', parseOffset);
    }
  };

  const scheduleReconnect = (status: number) => {
    if (closed) return;
    opened = false;
    handlers.onError?.(new Error(`SSE closed (status ${status})`));
    const delay = status === 401 || status === 403 ? AUTH_RETRY_MS : RETRY_MS;
    retryTimer = setTimeout(connect, delay);
  };

  function connect() {
    if (closed) return;
    parseOffset = 0;
    xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.onreadystatechange = () => {
      if (!xhr || closed) return;
      if (xhr.readyState === 3) {
        if (xhr.status === 200) {
          if (!opened) {
            opened = true;
            handlers.onOpen?.();
          }
          parse(xhr.responseText);
        }
      } else if (xhr.readyState === 4) {
        scheduleReconnect(xhr.status);
      }
    };
    xhr.onerror = () => {
      if (!closed) scheduleReconnect(xhr?.status ?? 0);
    };

    try {
      xhr.send();
    } catch (err) {
      handlers.onError?.(err);
      scheduleReconnect(0);
    }
  }

  connect();

  return {
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      try {
        xhr?.abort();
      } catch {
        // ignore abort errors
      }
      xhr = null;
    },
  };
}
