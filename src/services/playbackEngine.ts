import type { PlaybackTrackPoint } from '@/src/types/api';

/**
 * Truthful playback motion engine.
 *
 * The live-track screen animates recorded GPS history. Instead of looping a
 * normalized 0..1 progress value at a fabricated speed, this engine drives the
 * marker off the points' real recorded timestamps (`t`), speed and course:
 *
 *   - position is interpolated between the two points that bracket the current
 *     playback time, proportional to the real time gap between them;
 *   - displayed speed comes from the recorded `speed` field, never synthesized;
 *   - heading comes from the recorded `course` (shortest-angle interpolated).
 *
 * `elapsedMs` is a position on the recorded timeline (ms since the first fix),
 * exactly like a video scrubber — advancing it faster only fast-forwards through
 * real data, it does not invent motion.
 */

export type PlaybackTrack = {
  points: PlaybackTrackPoint[];
  /** ms offset of each point from the first fix (monotonic, non-decreasing). */
  timeOffsetsMs: number[];
  /** cumulative distance (km) travelled up to each point. */
  cumulativeKm: number[];
  totalDurationMs: number;
  totalDistanceKm: number;
};

export type PlaybackCoordinate = {
  latitude: number;
  longitude: number;
};

export type PlaybackSample = {
  latitude: number;
  longitude: number;
  /** km/h, recorded (interpolated between bracketing fixes). */
  speed: number;
  /** degrees, recorded course (shortest-angle interpolated). */
  heading: number;
  /** km travelled from the start of the track to this sample. */
  distanceKm: number;
  ignition: boolean;
  gpsValid: boolean;
  /** completed portion of the route up to and including the current sample. */
  completed: PlaybackCoordinate[];
  atEnd: boolean;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);
  const dLng = toRadians(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Shortest-path angular interpolation so headings never spin the long way. */
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

function parseTimeMs(t: string, fallback: number): number {
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? fallback : ms;
}

/**
 * Precomputes per-point time offsets and cumulative distance from raw recorded
 * points. Out-of-order or duplicate timestamps are clamped to a strictly
 * increasing clock (+1ms) so the playback loop can never stall or run backwards.
 */
export function buildPlaybackTrack(points: PlaybackTrackPoint[]): PlaybackTrack {
  const n = points.length;
  const timeOffsetsMs = new Array<number>(n).fill(0);
  const cumulativeKm = new Array<number>(n).fill(0);

  if (n === 0) {
    return { points, timeOffsetsMs, cumulativeKm, totalDurationMs: 0, totalDistanceKm: 0 };
  }

  const startMs = parseTimeMs(points[0].t, 0);
  for (let i = 1; i < n; i += 1) {
    const rawOffset = parseTimeMs(points[i].t, startMs + i) - startMs;
    timeOffsetsMs[i] = Math.max(rawOffset, timeOffsetsMs[i - 1] + 1);
    cumulativeKm[i] =
      cumulativeKm[i - 1] +
      haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }

  return {
    points,
    timeOffsetsMs,
    cumulativeKm,
    totalDurationMs: timeOffsetsMs[n - 1],
    totalDistanceKm: cumulativeKm[n - 1],
  };
}

/** Largest index whose time offset is <= elapsed (binary search). */
function findSegmentIndex(timeOffsetsMs: number[], elapsedMs: number): number {
  let lo = 0;
  let hi = timeOffsetsMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timeOffsetsMs[mid] <= elapsedMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Samples the vehicle state at a position on the recorded timeline. */
export function sampleAt(track: PlaybackTrack, elapsedMs: number): PlaybackSample | null {
  const { points, timeOffsetsMs, cumulativeKm, totalDurationMs } = track;
  const n = points.length;
  if (n === 0) {
    return null;
  }

  if (n === 1) {
    const p = points[0];
    return {
      latitude: p.lat,
      longitude: p.lng,
      speed: Math.max(p.speed, 0),
      heading: p.course,
      distanceKm: 0,
      ignition: Boolean(p.ignition),
      gpsValid: p.gpsValid,
      completed: [{ latitude: p.lat, longitude: p.lng }],
      atEnd: true,
    };
  }

  const clamped = Math.min(Math.max(elapsedMs, 0), totalDurationMs);
  const i = Math.min(findSegmentIndex(timeOffsetsMs, clamped), n - 2);
  const t0 = timeOffsetsMs[i];
  const t1 = timeOffsetsMs[i + 1];
  const frac = t1 > t0 ? (clamped - t0) / (t1 - t0) : 0;
  const a = points[i];
  const b = points[i + 1];

  const latitude = a.lat + (b.lat - a.lat) * frac;
  const longitude = a.lng + (b.lng - a.lng) * frac;
  const speed = Math.max(a.speed + (b.speed - a.speed) * frac, 0);
  const heading = lerpAngle(a.course, b.course, frac);
  const distanceKm = cumulativeKm[i] + (cumulativeKm[i + 1] - cumulativeKm[i]) * frac;

  const completed: PlaybackCoordinate[] = [];
  for (let idx = 0; idx <= i; idx += 1) {
    completed.push({ latitude: points[idx].lat, longitude: points[idx].lng });
  }
  completed.push({ latitude, longitude });

  const nearest = frac < 0.5 ? a : b;
  return {
    latitude,
    longitude,
    speed,
    heading,
    distanceKm,
    ignition: Boolean(nearest.ignition),
    gpsValid: nearest.gpsValid,
    completed,
    atEnd: clamped >= totalDurationMs,
  };
}

const DEMO_AVG_KMH = 44;

/**
 * DEMO / OFFLINE ONLY. Builds a plausible track from a bare coordinate list for
 * the no-device demo screen. Real, tenant-scoped devices never reach this path
 * (the live-track screen gates them out before render), so no fabricated timing
 * is ever shown for real vehicles.
 */
export function synthesizeDemoTrack(coords: PlaybackCoordinate[]): PlaybackTrack {
  const points: PlaybackTrackPoint[] = [];
  let tMs = Date.now() - coords.length * 1500;

  for (let i = 0; i < coords.length; i += 1) {
    const prev = coords[i - 1];
    const cur = coords[i];
    const next = coords[i + 1] ?? cur;
    const segKm = prev ? haversineKm(prev.latitude, prev.longitude, cur.latitude, cur.longitude) : 0;
    const dtMs = prev ? (segKm / DEMO_AVG_KMH) * 3_600_000 : 0;
    tMs += dtMs;
    const speed = dtMs > 0 ? segKm / (dtMs / 3_600_000) : DEMO_AVG_KMH;
    const course = bearingDeg(cur.latitude, cur.longitude, next.latitude, next.longitude);

    points.push({
      t: new Date(tMs).toISOString(),
      lat: cur.latitude,
      lng: cur.longitude,
      speed: Math.round(speed),
      course,
      gpsValid: true,
      ignition: true,
    });
  }

  return buildPlaybackTrack(points);
}
