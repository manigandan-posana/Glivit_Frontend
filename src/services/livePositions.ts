import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { env } from '@/src/config/env';
import { useAppSelector } from '@/src/store/hooks';
import type { PlaybackTrackPoint } from '@/src/types/api';
import { openSse } from './sseClient';

/**
 * Live position streaming (Phase 2). Subscribes to the backend tenant SSE
 * position stream and accumulates the incoming fixes for a single device into a
 * buffer shaped like recorded playback points, so the same truthful playback
 * interpolator drives both history and live motion.
 *
 * Nothing here fabricates motion: each buffered point is a real fix with its own
 * server timestamp, recorded speed and course.
 */

export type LivePositionEvent = {
  deviceId: number;
  vehicleId: number | null;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  ignition: boolean | null;
  gpsValid: boolean;
  state: string | null;
  address: string | null;
  deviceTime: string | null;
  serverTime: string;
  updatedAt: string;
};

export type LivePositionsState = {
  /** SSE transport is currently open. */
  connected: boolean;
  /** Date.now() when the last POSITION for this device arrived, or null. */
  lastEventAt: number | null;
  /** Accumulated fixes for the subscribed device, ascending by time. */
  points: PlaybackTrackPoint[];
  /** Most recent raw event for this device. */
  latest: LivePositionEvent | null;
};

// Cap the in-memory live buffer so a long-lived screen can't grow unbounded.
const MAX_LIVE_POINTS = 600;

const EMPTY: LivePositionsState = {
  connected: false,
  lastEventAt: null,
  points: [],
  latest: null,
};

export function useLivePositions(deviceId?: number, enabled = true): LivePositionsState {
  const token = useAppSelector((s) => s.auth.accessToken);
  const [state, setState] = useState<LivePositionsState>(EMPTY);

  // Reset accumulation whenever the target device changes.
  useEffect(() => {
    setState(EMPTY);
  }, [deviceId]);

  useEffect(() => {
    if (!enabled || deviceId == null) {
      return;
    }

    // Dev-only offline demo: march the device along a demo path in real time so
    // the LIVE/follow features are testable without a backend. Forced off in
    // production because `env.demoMode` is gated behind `__DEV__`.
    if (env.demoMode) {
      return startDemoSimulator(deviceId, setState);
    }

    if (!env.backendBaseUrl) {
      return;
    }

    const url = `${env.apiBaseUrl}/positions/stream`;
    const connection = openSse(url, token ?? null, {
      onOpen: () => setState((prev) => ({ ...prev, connected: true })),
      onError: () => setState((prev) => ({ ...prev, connected: false })),
      onEvent: (name, data) => {
        if (name !== 'POSITION') return;
        let event: LivePositionEvent;
        try {
          event = JSON.parse(data) as LivePositionEvent;
        } catch {
          return;
        }
        if (event.deviceId !== deviceId) return;
        setState((prev) => ({
          connected: true,
          lastEventAt: Date.now(),
          latest: event,
          points: appendPoint(prev.points, event),
        }));
      },
    });

    return () => connection.close();
  }, [enabled, deviceId, token]);

  return state;
}

// Compact Bengaluru demo path (lng, lat) for the offline live simulator.
const DEMO_LIVE_PATH: [number, number][] = [
  [77.594634, 12.971873],
  [77.596943, 12.97502],
  [77.599195, 12.976672],
  [77.601809, 12.976843],
  [77.603454, 12.978999],
  [77.606737, 12.977919],
  [77.608755, 12.977055],
  [77.611112, 12.974442],
  [77.610576, 12.971895],
  [77.611784, 12.969826],
  [77.612712, 12.972735],
  [77.608919, 12.974849],
  [77.609666, 12.97991],
  [77.612275, 12.982204],
  [77.615667, 12.982699],
];

function demoBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/**
 * DEV/DEMO ONLY. Emits a fresh timestamped fix every 1.5s, looping along the
 * demo path, so the live UI (LIVE badge, follow mode, real-time marker) can be
 * exercised offline. Each fix carries a real server timestamp + recorded-style
 * speed/course, so the truthful interpolator has genuine fields to render.
 */
function startDemoSimulator(
  deviceId: number,
  setState: Dispatch<SetStateAction<LivePositionsState>>
): () => void {
  let i = 0;
  const emit = () => {
    const [lng, lat] = DEMO_LIVE_PATH[i % DEMO_LIVE_PATH.length];
    const [nlng, nlat] = DEMO_LIVE_PATH[(i + 1) % DEMO_LIVE_PATH.length];
    const now = new Date().toISOString();
    const event: LivePositionEvent = {
      deviceId,
      vehicleId: deviceId,
      latitude: lat,
      longitude: lng,
      speed: 28 + (i % 6) * 5,
      course: demoBearing(lat, lng, nlat, nlng),
      ignition: true,
      gpsValid: true,
      state: 'RUNNING',
      address: 'Demo live location, Bengaluru',
      deviceTime: now,
      serverTime: now,
      updatedAt: now,
    };
    setState((prev) => ({
      connected: true,
      lastEventAt: Date.now(),
      latest: event,
      points: appendPoint(prev.points, event),
    }));
    i += 1;
  };

  emit();
  const timer = setInterval(emit, 1500);
  return () => clearInterval(timer);
}

function appendPoint(prev: PlaybackTrackPoint[], event: LivePositionEvent): PlaybackTrackPoint[] {
  const last = prev[prev.length - 1];
  // Ignore duplicates and any fix that isn't strictly newer than the buffer tail.
  if (last && Date.parse(event.serverTime) <= Date.parse(last.t)) {
    return prev;
  }
  const point: PlaybackTrackPoint = {
    t: event.serverTime,
    lat: event.latitude,
    lng: event.longitude,
    speed: event.speed,
    course: event.course,
    ignition: event.ignition,
    gpsValid: event.gpsValid,
  };
  const next = [...prev, point];
  return next.length > MAX_LIVE_POINTS ? next.slice(next.length - MAX_LIVE_POINTS) : next;
}
