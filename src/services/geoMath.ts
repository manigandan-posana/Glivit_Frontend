const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);
  const dLng = toRadians(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function normalizeHeading(value: number | null | undefined, fallback = 0): number {
  const heading = Number.isFinite(value) ? Number(value) : fallback;
  return ((heading % 360) + 360) % 360;
}

export function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}
