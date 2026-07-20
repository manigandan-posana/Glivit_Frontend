# Vehiclemoment Tracker — Implementation Status

## Stack decision

This mobile app stays on **Expo (SDK 54, expo-router)**. The product brief names
"React Native CLI", but the project already exists as Expo and migrating would
recreate it; Expo Prebuild + config plugins cover the required native modules
(MapLibre, secure storage, and later FCM/Razorpay) on both Android and iOS.

## Implemented — app shell (wired to the `glivt` backend)

Startup → tenant resolution → auth → authenticated area:

- **Startup gate** ([app/index.tsx](../app/index.tsx)) + root provider/bootstrap
  ([app/_layout.tsx](../app/_layout.tsx)): loads persisted tenant + tokens from
  secure storage behind the native splash (no placeholder flash), then routes by
  state (no company code → Company Code, code but no session → Login, valid
  session → Dashboard).
- **Company Code** ([app/company-code.tsx](../app/company-code.tsx)): validates the
  code against `POST /api/tenant/resolve`, caches branding, advances to Login.
- **Login** ([app/login.tsx](../app/login.tsx)): taupe layout, tenant logo/app name,
  username + password (visibility toggle), green full-width button with its own
  loading state, Contact Service Provider, Forgot Password, Clear Company Code.
  React Hook Form + Zod validation; maps backend error codes to messages.
- **Drawer** ([app/(app)/_layout.tsx](<../app/(app)/_layout.tsx>) +
  [src/components/AppDrawerContent.tsx](../src/components/AppDrawerContent.tsx)):
  permission-filtered items (unauthorised items are hidden, never shown-then-denied),
  tenant header, header refresh action, Logout (revokes server refresh tokens +
  clears keystore).
- **Dashboard** ([app/(app)/dashboard.tsx](<../app/(app)/dashboard.tsx>)): SVG
  doughnut with total in the centre, tappable status cards (Running/Stopped/Idle/
  Inactive/No Data/Expired/Total) that open the vehicle list filtered by state,
  pull-to-refresh, loading/empty/error-retry states.
- **Vehicle list** ([app/(app)/vehicles.tsx](<../app/(app)/vehicles.tsx>)):
  debounced server search, state filter, incremental pagination with de-duplication,
  pull-to-refresh, empty state.
- **All-vehicles map** ([app/(app)/map.tsx](<../app/(app)/map.tsx>)): full-screen
  MapLibre/Geoapify, status-coloured markers, floating controls (drawer, refresh,
  fit-all), bottom snapping vehicle cards synced to the selected marker, tap → live
  tracking.
- **Live tracking** ([app/live-track.tsx](../app/live-track.tsx)): the existing
  3D single-vehicle tracker, now reachable from the list/map with a working Back
  action and per-vehicle title/subtitle params.

State/data layer:

- Redux Toolkit store + **RTK Query** ([src/services](../src/services)) with an
  auth-header base query and **single-flight token refresh** on 401.
- Tokens/user/branding in **expo-secure-store** (Keychain / Android Keystore).
- Theme tokens from brief section 3 ([src/theme/tokens.ts](../src/theme/tokens.ts))
  with tenant colour overrides; reusable UI in [src/components/ui](../src/components/ui).

## Configuration

`.env` (from [.env.example](../.env.example)):

```bash
EXPO_PUBLIC_GEOAPIFY_API_KEY=your_geoapify_key
EXPO_PUBLIC_BACKEND_BASE_URL=https://your-api.example.com
EXPO_PUBLIC_DEMO_MODE=true
```

`EXPO_PUBLIC_BACKEND_BASE_URL` must point at the running `glivt` backend; the app
calls `<base>/api/...`. Without a Geoapify key the map falls back to OpenFreeMap
vector styles with streets, buildings, labels, and POIs.

## Maps in Expo Go vs dev build

Native MapLibre can't run in Expo Go. The map and live-track screens detect this
(`src/services/maplibre.ts` probes the native module) and fall back to
**MapLibre GL JS inside a WebView** ([src/components/FleetWebMap.tsx](../src/components/FleetWebMap.tsx))
— still MapLibre + Geoapify, no Google Maps — so maps render in Expo Go. In a
development build the native MapLibre path is used automatically. For Geoapify
tiles set `EXPO_PUBLIC_GEOAPIFY_API_KEY`; without it the app uses detailed
OpenFreeMap vector styles.

## Run

```bash
npm install
npx expo start -c        # Expo Go: full app incl. WebView maps (demo mode on)

# For native MapLibre + push/native modules, build a dev client:
npx expo prebuild
npx expo run:android     # or run:ios
```

## Verification (this slice)

```bash
npx tsc --noEmit                       # passed
npx expo lint                          # passed (0 problems)
npx expo export --platform android     # JS graph bundles successfully
```

Device/emulator smoke testing was not run in this environment.

## Not yet implemented (later slices)

Device/user/driver/group/project CRUD, geofences, reports + downloads, notifications
+ push (FCM), device commands, billing/Razorpay, settings/profile, live WebSocket
updates, and the remaining drawer destinations. The drawer is structured so these
drop in behind their permission flags.

## Clean-room confirmation

No APK credentials, server URLs, package identifiers, source code, map keys, or
proprietary artwork were reused. UI is original React Native built from the written
brief; maps use MapLibre + Geoapify (no Google Maps).
