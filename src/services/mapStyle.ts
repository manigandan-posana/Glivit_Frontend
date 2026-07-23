import { env } from '@/src/config/env';

export type MapStyleSpec = string | Record<string, unknown>;
// NOTE: There is no satellite imagery here. The previous 'satellite' variant
// resolved to a plain street style, which was misleading. It is renamed to
// 'bright' (a lighter road style). Add a real, licensed satellite raster source
// before reintroducing a 'satellite' option.
export type MapStyleVariant = 'street' | 'bright' | 'dark';
export type MapProvider = 'geoapify' | 'openfreemap';

export type MapStyleIssue = {
  code: 'missing_geoapify_key' | 'placeholder_geoapify_key' | 'insecure_style_url';
  message: string;
  blocking: boolean;
};

export type MapStyleInfo = {
  provider: MapProvider;
  style: MapStyleSpec;
  styleUrl: string;
  issues: MapStyleIssue[];
};

/**
 * Free OpenFreeMap vector styles - streets, buildings, labels, and POIs with
 * no API key. These are much richer than a single raster tile layer and work in
 * both MapLibre Native and the WebView fallback.
 */
const OPENFREEMAP_STYLES: Record<MapStyleVariant, string> = {
  street: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

// Geoapify's free tier has no distinct "bright" road style, so bright falls back
// to the same osm-bright base as street. Neither is satellite imagery.
const GEOAPIFY_STYLES: Record<MapStyleVariant, string> = {
  street: 'osm-bright',
  bright: 'osm-bright',
  dark: 'dark-matter',
};

function isPlaceholderKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    normalized === 'your_geoapify_key' ||
    normalized === 'your_api_key' ||
    normalized === 'your_api_key_here' ||
    normalized === 'geoapify_api_key'
  );
}

function getConfiguredGeoapifyKey(): string {
  const key = env.geoapifyApiKey.trim();
  return key && !isPlaceholderKey(key) ? key : '';
}

/**
 * Resolves a MapLibre style. Uses Geoapify when a key is configured, otherwise
 * OpenFreeMap vector styles (no Google Maps in either case).
 */
export function getMapStyleInfo(variant: MapStyleVariant = 'street'): MapStyleInfo {
  const issues: MapStyleIssue[] = [];
  const key = getConfiguredGeoapifyKey();

  if (key) {
    const styleUrl = `https://maps.geoapify.com/v1/styles/${GEOAPIFY_STYLES[variant]}/style.json?apiKey=${encodeURIComponent(key)}`;
    return {
      provider: 'geoapify',
      style: styleUrl,
      styleUrl,
      issues: validateStyleUrl(styleUrl, issues),
    };
  }

  issues.push({
    blocking: false,
    code: isPlaceholderKey(env.geoapifyApiKey) ? 'placeholder_geoapify_key' : 'missing_geoapify_key',
    message: 'Geoapify API key is not configured; using HTTPS OpenFreeMap vector tiles.',
  });

  const styleUrl = OPENFREEMAP_STYLES[variant];
  return {
    provider: 'openfreemap',
    style: styleUrl,
    styleUrl,
    issues: validateStyleUrl(styleUrl, issues),
  };
}

export function getMapStyle(variant: MapStyleVariant = 'street'): MapStyleSpec {
  return getMapStyleInfo(variant).style;
}

function validateStyleUrl(styleUrl: string, issues: MapStyleIssue[]): MapStyleIssue[] {
  if (!styleUrl.startsWith('https://')) {
    issues.push({
      blocking: true,
      code: 'insecure_style_url',
      message: 'Map style URL must use HTTPS so native map tiles can load on Android and iOS.',
    });
  }
  return issues;
}

/** Native MapLibre RN accepts a URL or a JSON style string. */
export function toNativeStyle(spec: MapStyleSpec): string {
  return typeof spec === 'string' ? spec : JSON.stringify(spec);
}
