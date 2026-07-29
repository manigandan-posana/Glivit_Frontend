/**
 * useGeofenceMonitor
 *
 * Monitors a set of geofences and tracked GPS positions, detects enter/exit
 * boundary crossings, and dispatches GeofenceAlert objects.
 *
 * Alerts are stored in the Notifications panel (Alerts tab) rather than shown
 * as banner popups. This hook exposes alerts as state so callers can display
 * them however they wish, but the primary integration is through the
 * NotificationCenter component.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadGeofenceNotifiedKeys,
  loadGeofenceStatesFromStorage,
  saveGeofenceNotifiedKeys,
  saveGeofenceStatesToStorage,
} from './geofenceStorage';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GeofenceEventType = 'ENTRY' | 'EXIT';

export type GeofenceAlert = {
  /** Unique identifier for this alert instance. */
  id: string;
  /** ENTRY (vehicle entered zone) or EXIT (vehicle left zone). */
  type: GeofenceEventType;
  /** Human-readable heading shown on the alert card. */
  title: string;
  /** Descriptive body text shown on the alert card. */
  message: string;
  /** ISO-8601 timestamp string when the event was detected. */
  timestamp: string;
  /** Name of the geofence zone. */
  geofenceName: string;
  /** Name / plate of the vehicle. */
  vehicleName: string;
  /** Last known lat,lng formatted string. */
  location: string;
};

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Check whether a point is inside a polygon (ray-casting). */
function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<{ lat: number; lng: number }>
): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;
    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Haversine distance in kilometres. */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Shape of the geofence / device data we need from the caller
// ---------------------------------------------------------------------------

export type MonitoredGeofence = {
  id: number | string;
  name: string;
  /** Circle: centre + radius (km). */
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  /** Polygon: ordered list of vertices. */
  polygon?: Array<{ lat: number; lng: number }>;
  /** Device IDs assigned to this geofence. */
  assignedDeviceIds?: number[];
};

export type MonitoredVehicle = {
  id: number;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * @param geofences  List of geofence zones to monitor.
 * @param vehicles   List of live vehicle positions.
 * @param enabled    Pass `false` to pause monitoring (e.g. when screen is hidden).
 */
export function useGeofenceMonitor(
  geofences: MonitoredGeofence[],
  vehicles: MonitoredVehicle[],
  enabled = true
): {
  alerts: GeofenceAlert[];
  dismissAlert: (id: string) => void;
} {
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);

  // Persisted "last known state" per (geofenceId, deviceId) key
  const statesRef = useRef<Record<string, 'INSIDE' | 'OUTSIDE'>>({});
  // Persisted dedup set — keys for events already notified this session
  const notifiedRef = useRef<Record<string, boolean>>({});

  // Load persisted state on mount
  useEffect(() => {
    void (async () => {
      statesRef.current = await loadGeofenceStatesFromStorage();
      notifiedRef.current = await loadGeofenceNotifiedKeys();
    })();
  }, []);

  // Check each vehicle against each geofence whenever positions update
  useEffect(() => {
    if (!enabled) return;

    const newAlerts: GeofenceAlert[] = [];

    for (const gf of geofences) {
      const assignedIds = gf.assignedDeviceIds ?? [];

      for (const vehicle of vehicles) {
        // Only monitor assigned vehicles (if list is non-empty)
        if (assignedIds.length > 0 && !assignedIds.includes(vehicle.id)) continue;

        const lat = vehicle.latitude;
        const lng = vehicle.longitude;
        if (lat == null || lng == null) continue;

        // Determine if vehicle is inside this geofence
        let inside = false;
        if (gf.polygon && gf.polygon.length >= 3) {
          inside = pointInPolygon(lat, lng, gf.polygon);
        } else if (
          gf.latitude != null &&
          gf.longitude != null &&
          gf.radiusKm != null
        ) {
          inside = haversineKm(lat, lng, gf.latitude, gf.longitude) <= gf.radiusKm;
        }

        const stateKey = `${gf.id}:${vehicle.id}`;
        const previous = statesRef.current[stateKey];
        const current: 'INSIDE' | 'OUTSIDE' = inside ? 'INSIDE' : 'OUTSIDE';

        // Detect state transition
        if (previous !== undefined && previous !== current) {
          const eventType: GeofenceEventType = current === 'INSIDE' ? 'ENTRY' : 'EXIT';
          const eventTs = new Date().toISOString();
          const notifyKey = `${stateKey}:${eventType}:${eventTs.slice(0, 13)}`; // per-hour dedup

          if (!notifiedRef.current[notifyKey]) {
            notifiedRef.current[notifyKey] = true;

            const alert: GeofenceAlert = {
              id: `${stateKey}-${Date.now()}`,
              type: eventType,
              title:
                eventType === 'ENTRY'
                  ? `Entered ${gf.name}`
                  : `Exited ${gf.name}`,
              message:
                eventType === 'ENTRY'
                  ? `${vehicle.name} entered the geofence zone "${gf.name}".`
                  : `${vehicle.name} left the geofence zone "${gf.name}".`,
              timestamp: new Intl.DateTimeFormat([], {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: 'short',
              }).format(new Date(eventTs)),
              geofenceName: gf.name,
              vehicleName: vehicle.name,
              location: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            };

            newAlerts.push(alert);
          }
        }

        statesRef.current[stateKey] = current;
      }
    }

    // Persist updated state
    void saveGeofenceStatesToStorage(statesRef.current);
    void saveGeofenceNotifiedKeys(notifiedRef.current);

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev]);
    }
  }, [geofences, vehicles, enabled]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { alerts, dismissAlert };
}
