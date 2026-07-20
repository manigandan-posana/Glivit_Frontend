import { TurboModuleRegistry } from 'react-native';

/**
 * Guarded MapLibre loader.
 *
 * MapLibre is native code. Its entry (`@maplibre/maplibre-react-native`) calls
 * TurboModuleRegistry.getEnforcing('MLRNCameraModule') at MODULE scope, which
 * THROWS when the native module isn't in the running binary (Expo Go, or a dev
 * client built before MapLibre was added). expo-router eagerly requires every
 * route file, so an unguarded import crashes the whole app at startup.
 *
 * We first probe with the non-throwing `TurboModuleRegistry.get(...)`. Only when
 * the native module is actually present do we `require` MapLibre - so on Expo Go
 * the module is never executed and no error is raised at all; map screens simply
 * render a graceful fallback. Full maps require a development build.
 */
type MapLibreModule = typeof import('@maplibre/maplibre-react-native');

function nativeMapPresent(): boolean {
  try {
    return (
      TurboModuleRegistry.get('MLRNModule') != null ||
      TurboModuleRegistry.get('MLRNCameraModule') != null
    );
  } catch {
    return false;
  }
}

let mod: MapLibreModule | null = null;
if (nativeMapPresent()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@maplibre/maplibre-react-native') as MapLibreModule;
  } catch {
    mod = null;
  }
}

export const MapLibre = mod;
export const isMapAvailable = mod !== null;
