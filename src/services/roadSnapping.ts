/**
 * Road snapping / map-matching helper.
 *
 * snapCoordinateToRoadSync(lat, lng, rawHeading)
 *   → Synchronously returns the best available snapped point.
 *
 * Behaviour
 * ---------
 * 1. Check the LRU cache (key = rounded lat/lng). Return cache hit immediately.
 * 2. Fire an async OSRM /nearest request in the background; when it resolves,
 *    populate the cache so the *next* call for the same location is instant.
 * 3. Meanwhile return a best-effort result from local geometry or raw GPS.
 *
 * The function is deliberately synchronous at the call-site so it can be used
 * inside React render passes and Animated callbacks without async plumbing.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnappedPoint = {
  latitude: number;
  longitude: number;
  /** Compass bearing in degrees [0, 360). */
  bearing: number;
  /** True when the coordinate was snapped to a road network node. */
  snapped: boolean;
};

// ---------------------------------------------------------------------------
// OSRM public endpoint (no key required)
// ---------------------------------------------------------------------------

const OSRM_BASE = 'https://router.project-osrm.org/nearest/v1/driving';

// ---------------------------------------------------------------------------
// LRU cache (max 512 entries, keyed by "lat4:lng4")
// ---------------------------------------------------------------------------

const CACHE_MAX = 512;
const cache = new Map<string, SnappedPoint>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

function cacheGet(lat: number, lng: number): SnappedPoint | undefined {
  const k = cacheKey(lat, lng);
  const hit = cache.get(k);
  if (hit) {
    // Move to end (LRU ordering)
    cache.delete(k);
    cache.set(k, hit);
  }
  return hit;
}

function cacheSet(lat: number, lng: number, point: SnappedPoint): void {
  const k = cacheKey(lat, lng);
  if (cache.size >= CACHE_MAX) {
    // Evict oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(k, point);
}

// ---------------------------------------------------------------------------
// Haversine bearing utility
// ---------------------------------------------------------------------------

function bearingDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(lng2 - lng1);
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const y = Math.sin(dLng) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ---------------------------------------------------------------------------
// Background OSRM fetch (populates cache; never throws)
// ---------------------------------------------------------------------------

const inFlight = new Set<string>();

function fetchAndCache(lat: number, lng: number, rawHeading: number): void {
  const k = cacheKey(lat, lng);
  if (inFlight.has(k)) return;
  inFlight.add(k);

  const url = `${OSRM_BASE}/${lng},${lat}?number=1`;

  fetch(url, { signal: AbortSignal.timeout?.(4000) })
    .then((r) => r.json())
    .then((json: { code: string; waypoints?: { location: [number, number]; name?: string }[] }) => {
      if (json.code === 'Ok' && json.waypoints && json.waypoints.length > 0) {
        const [snapLng, snapLat] = json.waypoints[0].location;
        const dist = haversineM(lat, lng, snapLat, snapLng);
        // Reject snaps > 50 m from original — likely wrong road
        if (dist <= 50) {
          const snapped: SnappedPoint = {
            latitude: snapLat,
            longitude: snapLng,
            bearing: Number.isFinite(rawHeading) ? rawHeading : 0,
            snapped: true,
          };
          cacheSet(lat, lng, snapped);
        }
      }
    })
    .catch(() => {
      // Silently ignore network errors — fall back to raw GPS
    })
    .finally(() => {
      inFlight.delete(k);
    });
}

// ---------------------------------------------------------------------------
// Haversine distance (metres)
// ---------------------------------------------------------------------------

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Synchronously snap a GPS coordinate to the nearest drivable road.
 *
 * @param lat        Raw GPS latitude
 * @param lng        Raw GPS longitude
 * @param rawHeading Vehicle heading from GPS (degrees, may be 0 when stopped)
 * @returns          Best available SnappedPoint — either from cache or raw GPS
 */
export function snapCoordinateToRoadSync(
  lat: number,
  lng: number,
  rawHeading = 0
): SnappedPoint {
  // 1. Validate inputs
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { latitude: lat, longitude: lng, bearing: rawHeading, snapped: false };
  }

  // 2. Cache hit → return immediately
  const cached = cacheGet(lat, lng);
  if (cached) return cached;

  // 3. Trigger background fetch for next time
  fetchAndCache(lat, lng, rawHeading);

  // 4. Fallback: return raw GPS (snapped = false)
  return {
    latitude: lat,
    longitude: lng,
    bearing: rawHeading,
    snapped: false,
  };
}
