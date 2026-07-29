import { useEffect, useRef, useState, type MutableRefObject } from 'react';

import { env } from '@/src/config/env';
import { useAppSelector } from '@/src/store/hooks';
import type { DeviceSummary } from '@/src/types/api';
import { openSse } from './sseClient';
import type { LivePositionEvent } from './livePositions';

/**
 * Live positions for the WHOLE fleet, for the All Vehicles Live Map.
 *
 * Maintains a target position per device in a ref (read by the map's animation
 * loop — no re-render per update, so the map never flickers or remounts):
 *   - Real mode: subscribes to the tenant SSE position stream and updates the
 *     matching device as fixes arrive.
 *   - Dev demo mode: advances RUNNING/IDLE vehicles along their heading on a
 *     timer; STOPPED/OFFLINE stay put. Forced off in production via env.demoMode.
 *
 * Seeded from the device list so every authorised vehicle shows immediately.
 */

import { snapCoordinateToRoadSync } from './roadSnapping';

export type FleetTarget = {
  deviceId: number;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  state: string;
  /** True for states that should animate smoothly between fixes. */
  moving: boolean;
  updatedAt: number;
};

export type FleetLive = {
  targetsRef: MutableRefObject<Map<number, FleetTarget>>;
  connected: boolean;
  /** Bumped whenever the set of known vehicles changes (for initial fit). */
  vehicleCount: number;
};

const MOVING_STATES = new Set(['RUNNING', 'IDLE']);
const DEMO_STEP_MS = 1200;

function makeTarget(v: DeviceSummary): FleetTarget | null {
  if (v.latitude == null || v.longitude == null) return null;
  const snap = snapCoordinateToRoadSync(v.latitude, v.longitude, v.course);
  return {
    deviceId: v.id,
    latitude: snap.snapped ? snap.latitude : v.latitude,
    longitude: snap.snapped ? snap.longitude : v.longitude,
    speed: v.speed,
    heading: snap.snapped ? snap.bearing : v.course,
    state: v.state,
    moving: MOVING_STATES.has(v.state),
    updatedAt: Date.now(),
  };
}

export function useFleetLivePositions(seed: DeviceSummary[], enabled = true): FleetLive {
  const token = useAppSelector((s) => s.auth.accessToken);
  const targetsRef = useRef<Map<number, FleetTarget>>(new Map());
  const [connected, setConnected] = useState(false);
  const [vehicleCount, setVehicleCount] = useState(0);

  // Seed / merge the known vehicles from the device list.
  useEffect(() => {
    const map = targetsRef.current;
    let changed = false;
    for (const v of seed) {
      const target = makeTarget(v);
      if (!target) continue;
      if (!map.has(v.id)) {
        map.set(v.id, target);
        changed = true;
      } else {
        // Keep the live-animated position, but refresh state/speed metadata.
        const cur = map.get(v.id)!;
        cur.state = v.state;
        cur.moving = MOVING_STATES.has(v.state);
      }
    }
    if (changed) setVehicleCount(map.size);
  }, [seed]);

  useEffect(() => {
    if (!enabled) return;

    // Dev demo: move running/idle vehicles along their heading with gentle turns.
    if (env.demoMode) {
      setConnected(true);
      const timer = setInterval(() => {
        const map = targetsRef.current;
        map.forEach((v, id) => {
          if (!v.moving) return;
          const speedKph = Math.max(v.speed, 14);
          const stepKm = (speedKph / 3600) * (DEMO_STEP_MS / 1000);
          const heading = (v.heading + (Math.random() * 2 - 1) * 10 + 360) % 360;
          const rad = (heading * Math.PI) / 180;
          const dLat = (stepKm / 111.32) * Math.cos(rad);
          const dLng =
            (stepKm / (111.32 * Math.cos((v.latitude * Math.PI) / 180))) * Math.sin(rad);
          map.set(id, {
            ...v,
            latitude: v.latitude + dLat,
            longitude: v.longitude + dLng,
            heading,
            updatedAt: Date.now(),
          });
        });
      }, DEMO_STEP_MS);
      return () => clearInterval(timer);
    }

    if (!env.backendBaseUrl) return;

    const connection = openSse(`${env.apiBaseUrl}/positions/stream`, token ?? null, {
      onOpen: () => setConnected(true),
      onError: () => setConnected(false),
      onEvent: (name, data) => {
        if (name !== 'POSITION') return;
        let event: LivePositionEvent;
        try {
          event = JSON.parse(data) as LivePositionEvent;
        } catch {
          return;
        }
        const map = targetsRef.current;
        const existed = map.has(event.deviceId);
        const state = event.state ?? map.get(event.deviceId)?.state ?? 'NO_DATA';
        const snap = snapCoordinateToRoadSync(event.latitude, event.longitude, event.course);
        map.set(event.deviceId, {
          deviceId: event.deviceId,
          latitude: snap.snapped ? snap.latitude : event.latitude,
          longitude: snap.snapped ? snap.longitude : event.longitude,
          speed: event.speed,
          heading: snap.snapped ? snap.bearing : event.course,
          state,
          moving: MOVING_STATES.has(state),
          updatedAt: Date.now(),
        });
        if (!existed) setVehicleCount(map.size);
      },
    });

    return () => connection.close();
  }, [enabled, token]);

  return { targetsRef, connected, vehicleCount };
}
