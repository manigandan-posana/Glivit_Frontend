import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  type LayoutChangeEvent,
  Linking,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Fleet3DOverlay,
  type Fleet3DOverlayMarker,
} from '@/src/components/Fleet3DOverlay';
import {
  FleetWebMap,
  type WebMapMarker,
  type WebMapProjection,
} from '@/src/components/FleetWebMap';
import MapView, { Marker } from '@/src/components/maps/NativeMap';
import {
  sanitizeRouteCoordinates,
  StableRouteLine,
} from '@/src/components/StableRouteLayers';
import {
  getVehicleModel,
  modelForVehicle,
  type CarVariant,
} from '@/src/components/Vehicle3DMarker';
import { VehicleModelPicker } from '@/src/components/VehicleModelPicker';
import { env } from '@/src/config/env';
import { useGetDeviceQuery } from '@/src/services/devicesApi';
import { getMapStyleInfo, getNativeMapProviderLabel } from '@/src/services/mapStyle';
import {
  buildPlaybackTrack,
  haversineKm,
  lerpAngle,
  normalizeHeading,
  sampleAt,
  type PlaybackTrack,
} from '@/src/services/playbackEngine';
import { useLivePositions } from '@/src/services/livePositions';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { setVehicleModelPreference } from '@/src/store/vehiclePreferencesSlice';
import {
  vehicleMarkerKey,
  vehicleMarkerRotation,
  vehicleMarkerSource,
} from '@/src/services/vehicleMarkerAssets';
import type { PlaybackTrackPoint } from '@/src/types/api';

const LIVE_MARKER_SIZE = 64;
const CAMERA_MIN_GAP_MS = 560;
const LIVE_STALE_AFTER_SEC = 15;
// Bounds for the smooth live catch-up between the previous displayed position and
// the newest streamed fix.
const LIVE_TRANSITION_MIN_MS = 420;
const LIVE_TRANSITION_MAX_MS = 3600;

type CameraMode = 'follow' | 'chase' | 'cinematic' | 'top' | 'drone' | 'overview';
const CAMERA_MODES: Record<
  CameraMode,
  {
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    pitch: number;
    zoom: number;
    forwardMeters: number;
    bearingFollowsHeading: boolean;
  }
> = {
  follow: { label: 'Follow', icon: 'navigation-variant', pitch: 28, zoom: 15.2, forwardMeters: 0, bearingFollowsHeading: false },
  chase: { label: 'Chase', icon: 'car-sports', pitch: 52, zoom: 15.8, forwardMeters: 28, bearingFollowsHeading: true },
  cinematic: { label: 'Cinema', icon: 'movie-open', pitch: 62, zoom: 15.5, forwardMeters: 44, bearingFollowsHeading: true },
  top: { label: 'Top', icon: 'crosshairs-gps', pitch: 0, zoom: 16, forwardMeters: 0, bearingFollowsHeading: false },
  drone: { label: 'Drone', icon: 'orbit', pitch: 42, zoom: 14.2, forwardMeters: 34, bearingFollowsHeading: true },
  overview: { label: 'Overview', icon: 'fit-to-page-outline', pitch: 0, zoom: 12, forwardMeters: 0, bearingFollowsHeading: false },
};
const CAMERA_MODE_ORDER: CameraMode[] = ['follow', 'chase', 'cinematic', 'top', 'drone', 'overview'];
const CINEMATIC_CAMERAS: {
  id: CameraMode;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}[] = [
  { id: 'cinematic', icon: 'movie-open', label: 'Cinematic' },
  { id: 'follow', icon: 'navigation-variant', label: 'Follow' },
  { id: 'chase', icon: 'car-sports', label: 'Chase' },
  { id: 'drone', icon: 'orbit', label: 'Drone' },
  { id: 'top', icon: 'crosshairs-gps', label: 'Top' },
  { id: 'overview', icon: 'fit-to-page-outline', label: 'Overview' },
];

const CONTACT_PHONE = '+919876543210';

type MapLoadState = 'loading' | 'ready' | 'error';
type RouteMapOptionId =
  | 'parking'
  | 'refresh'
  | 'follow'
  | 'alert'
  | 'call'
  | 'location'
  | 'traffic'
  | 'mapType'
  | 'direction'
  | 'night'
  | 'history';

type RouteOptionData = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  summary: string;
  tone: 'green' | 'orange' | 'red';
  metrics: { label: string; value: string }[];
};



type Coordinate = {
  latitude: number;
  longitude: number;
};

const ROUTE_TOOLS: {
  id: RouteMapOptionId;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}[] = [
  { id: 'follow', icon: 'navigation-variant', label: 'Follow' },
  { id: 'location', icon: 'crosshairs-gps', label: 'Center' },
  { id: 'refresh', icon: 'refresh', label: 'Restart' },
  { id: 'parking', icon: 'parking', label: 'Park' },
  { id: 'traffic', icon: 'road-variant', label: 'Route' },
  { id: 'mapType', icon: 'layers-outline', label: 'Map style' },
  { id: 'night', icon: 'weather-night', label: 'Night' },
  { id: 'direction', icon: 'map-marker-path', label: 'Next' },
  { id: 'history', icon: 'history', label: 'History' },
  { id: 'alert', icon: 'alert-outline', label: 'Alert' },
  { id: 'call', icon: 'phone-outline', label: 'Support' },
];

// The one and only tracking-route colour. Kept as a single constant so the live
// route can never drift into gradients, traffic/speed tints, or a second hue.
const ROUTE_GREEN = '#16A34A';

const BRAND = {
  green: '#118a36',
  greenDark: '#05652a',
  greenGlow: '#2be69e',
  orange: '#ff7900',
  red: '#fb2f32',
  ink: '#16202c',
  muted: '#667385',
  mapMint: '#e8eef2',
  road: '#fdfcf7',
};

function offsetCoordinate(
  latitude: number,
  longitude: number,
  bearing: number,
  distanceMeters: number
): Coordinate {
  if (distanceMeters <= 0) return { latitude, longitude };
  const radians = (bearing * Math.PI) / 180;
  const latitudeDelta = (distanceMeters * Math.cos(radians)) / 111_320;
  const longitudeScale = Math.max(0.15, Math.cos((latitude * Math.PI) / 180));
  const longitudeDelta = (distanceMeters * Math.sin(radians)) / (111_320 * longitudeScale);
  return {
    latitude: latitude + latitudeDelta,
    longitude: longitude + longitudeDelta,
  };
}

function simplifyRouteForRender(coordinates: Coordinate[], maxPoints = 2_000): Coordinate[] {
  const validCoordinates = sanitizeRouteCoordinates(coordinates);
  if (validCoordinates.length <= 2) return validCoordinates;
  const meaningful = [validCoordinates[0]];
  for (let index = 1; index < validCoordinates.length; index += 1) {
    const point = validCoordinates[index];
    const previous = meaningful[meaningful.length - 1];
    const isLast = index === validCoordinates.length - 1;
    if (
      isLast ||
      haversineKm(previous.latitude, previous.longitude, point.latitude, point.longitude) >= 0.002
    ) {
      meaningful.push(point);
    }
  }
  if (meaningful.length <= maxPoints) return meaningful;
  const stride = Math.ceil(meaningful.length / maxPoints);
  const reduced = meaningful.filter((_, index) => index % stride === 0);
  const last = meaningful[meaningful.length - 1];
  if (reduced[reduced.length - 1] !== last) reduced.push(last);
  return reduced;
}

type LiveVehicleMapMarkerProps = {
  cameraHeading: number;
  category: string;
  coordinate: Coordinate;
  heading: number;
  showStatusCircle: boolean;
  state: string;
  statusColor: string;
};

/**
 * A real geographic map marker. The frame is centered on the GPS coordinate, so
 * it cannot drift when the map pans, pitches, rotates, or zooms.
 */
const LiveVehicleMapMarker = memo(function LiveVehicleMapMarker({
  cameraHeading,
  category,
  coordinate,
  heading,
  showStatusCircle,
  state,
  statusColor,
}: LiveVehicleMapMarkerProps) {
  const source = useMemo(() => vehicleMarkerSource(category, state), [category, state]);
  const sourceKey = useMemo(() => vehicleMarkerKey(category, state), [category, state]);
  const assetRotation = vehicleMarkerRotation(heading, category, state);
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 240);
    return () => clearTimeout(timer);
  }, [showStatusCircle, sourceKey, statusColor]);

  // Android/Google Maps supports native flat-marker rotation. Apple MapKit does
  // not, so its billboard image is rotated relative to the current map heading.
  const imageRotation =
    Platform.OS === 'ios'
      ? ((assetRotation - cameraHeading) % 360 + 360) % 360
      : 0;

  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      centerOffset={{ x: 0, y: 0 }}
      coordinate={coordinate}
      flat={Platform.OS === 'android'}
      identifier="live-vehicle"
      rotation={Platform.OS === 'android' ? assetRotation : 0}
      tappable={false}
      tracksViewChanges={tracksViewChanges}
      zIndex={40}>
      <View collapsable={false} style={styles.liveVehicleMarker}>
        {showStatusCircle ? (
          <View style={[styles.markerStatusCircle, { borderColor: statusColor }]} />
        ) : null}
        <View style={styles.markerShadow} />
        <Image
          fadeDuration={0}
          resizeMode="contain"
          source={source}
          style={[
            styles.markerVehicleImage,
            Platform.OS === 'ios' && { transform: [{ rotate: `${imageRotation}deg` }] },
          ]}
        />
      </View>
    </Marker>
  );
});

export default function VehicleTrackerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    category?: string;
    deviceId?: string;
    name?: string;
    subtitle?: string;
  }>();
  // Real route playback for the selected device. Falls back to the demo route
  // only when no device is passed or the app is in offline demo mode.
  const deviceId = params.deviceId ? Number(params.deviceId) : undefined;
  const devicePreferenceKey = String(deviceId ?? 'demo');
  const dispatch = useAppDispatch();
  const preferredModel = useAppSelector(
    (state) => state.vehiclePreferences.modelByDevice[devicePreferenceKey]
  );
  // A real, tenant-scoped device is selected (not the offline/demo screen).
  const hasRealDevice = deviceId != null && !Number.isNaN(deviceId) && !env.demoMode;
  const validDeviceId = deviceId != null && !Number.isNaN(deviceId);
  const { data: deviceDetail } = useGetDeviceQuery(deviceId as number, {
    skip: !validDeviceId,
  });
  const vehicleName =
    params.name ?? deviceDetail?.name ?? 'TN20CM7677 (VinothKumar Srinivas)';
  const vehicleSubtitle =
    params.subtitle ??
    deviceDetail?.address ??
    'Kuppalamadugu, Uthukkottai, Thiruvallur, Tamil Nadu';
  const vehicleCategory = params.category ?? deviceDetail?.category ?? 'CAR';
  // Live position stream (SSE for real devices; a one-fix-at-a-time simulator in
  // demo mode). This is the ONLY source of movement on this LIVE screen — no
  // recorded history is fetched or merged and no demo route is pre-loaded, so
  // nothing is ever drawn ahead of the vehicle. Recorded playback lives entirely
  // on the separate Route Playback / History screen.
  const liveEnabled = validDeviceId;
  const live = useLivePositions(liveEnabled ? deviceId : undefined);
  // The device summary carries the latest known position. Use it to seed the
  // vehicle at its current location immediately (before the first streamed fix)
  // and to start the route from that single trip-start coordinate.
  const seedPoint = useMemo<PlaybackTrackPoint | null>(() => {
    const lat = deviceDetail?.latitude;
    const lng = deviceDetail?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      t: deviceDetail?.lastUpdate ?? new Date().toISOString(),
      lat: lat as number,
      lng: lng as number,
      speed: Number.isFinite(deviceDetail?.speed) ? Math.max(0, deviceDetail!.speed) : 0,
      course: Number.isFinite(deviceDetail?.course) ? (deviceDetail!.course as number) : 0,
      gpsValid: deviceDetail?.gpsValid ?? true,
      ignition: deviceDetail?.ignition ?? null,
    };
  }, [deviceDetail]);
  // The travelled route is EXACTLY the accepted live fixes of the current trip
  // (livePositions resets this buffer when a new trip starts). Before the first
  // fix we show only the seed position, so the green line always begins where the
  // live trip began and grows behind the vehicle as new coordinates arrive.
  const track = useMemo<PlaybackTrack>(() => {
    if (live.points.length > 0) return buildPlaybackTrack(live.points);
    return buildPlaybackTrack(seedPoint ? [seedPoint] : []);
  }, [live.points, seedPoint]);
  const route = useMemo<Coordinate[]>(
    () => track.points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    [track]
  );
  // Distance travelled so far on the current live trip (grows with the route).
  const totalDistanceKm = track.totalDistanceKm;
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const fitWholeRouteRef = useRef<() => boolean>(() => false);
  const mapReadyRef = useRef(false);
  const mapLayoutReadyRef = useRef(false);
  const cameraReadRequestRef = useRef(0);
  const cameraFrameRef = useRef<number | null>(null);
  const lastCameraAtRef = useRef(0);
  const lastCameraHeadingRef = useRef(0);
  const lastCameraCoordinateRef = useRef<Coordinate | null>(null);
  const lastCameraModeRef = useRef<CameraMode | null>(null);
  const lastCameraProfileRef = useRef('');
  const lastProjectionAtRef = useRef(0);
  const lastValidHeadingRef = useRef<number | null>(null);
  const manualInteractionRef = useRef(false);
  const liveTransitionFrameRef = useRef<number | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetHeightRef = useRef(0);
  const sheetDragStartRef = useRef(0);
  const sheetExpandedRef = useRef(true);
  const sheetAnimationFrameRef = useRef<number | null>(null);
  const screenMountedRef = useRef(true);
  const staleSeenRef = useRef(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRouteFitRef = useRef(false);
  const liveFollowingRef = useRef(false);
  const trackDurationRef = useRef(0);
  const trackStartRef = useRef<number | null>(null);
  // Position along the live buffer (ms since the trip's first fix). It is only
  // ever driven forward to the newest fix by the live catch-up animation below —
  // there is no user-controlled playback clock, rate, or scrubbing on this screen.
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedMsRef = useRef(0);
  // This is a live-only screen: the marker is always pinned to (and smoothly
  // animated toward) the newest streamed fix. There is no pause/resume state.
  const [isLiveFollowing, setIsLiveFollowing] = useState(true);
  const [liveAgeSec, setLiveAgeSec] = useState<number | null>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [autoFollowSuspended, setAutoFollowSuspended] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow');
  const [cinematicMode, setCinematicMode] = useState(false);
  const [carVariant, setCarVariant] = useState<CarVariant>(() =>
    preferredModel ?? modelForVehicle(vehicleCategory, deviceId ?? 0)
  );
  const [modelLoadState, setModelLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [markerCategoryOverride, setMarkerCategoryOverride] = useState<string | null>(null);
  // Bottom sheet detent: collapsed shows only the summary; expanded shows all.
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [collapsedSheetHeight, setCollapsedSheetHeight] = useState(0);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [isTrafficVisible, setIsTrafficVisible] = useState(true);
  const [isNightMode, setIsNightMode] = useState(false);
  const [isSatelliteMode, setIsSatelliteMode] = useState(false);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  // Default true because the native map fills the screen. handleMapLayout still
  // flips it to an error if a real zero-size layout is reported.
  const [mapContainerReady, setMapContainerReady] = useState(true);
  const [mapLoadState, setMapLoadState] = useState<MapLoadState>('loading');
  const [mapErrorMessage, setMapErrorMessage] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState<RouteMapOptionId | null>(null);
  const [toastText, setToastText] = useState('');
  const [mapCameraHeading, setMapCameraHeading] = useState(0);
  const [vehicleScreenPoint, setVehicleScreenPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [mapSize, setMapSize] = useState({ height, width });
  const [overlayHeights, setOverlayHeights] = useState({
    camera: 54,
    cinema: 150,
    header: 70,
    live: 34,
    resume: 34,
  });
  const markerCategory = markerCategoryOverride ?? vehicleCategory;

  useEffect(() => {
    const nextModel = preferredModel ?? modelForVehicle(vehicleCategory, deviceId ?? 0);
    if (carVariant !== nextModel) {
      setCarVariant(nextModel);
      setModelLoadState('loading');
      setModelLoadError(null);
    }
    setMarkerCategoryOverride(
      preferredModel ? getVehicleModel(nextModel).category.toUpperCase() : null
    );
  }, [carVariant, deviceId, preferredModel, vehicleCategory]);

  const sample = useMemo(() => sampleAt(track, elapsedMs), [track, elapsedMs]);
  elapsedMsRef.current = elapsedMs;
  liveFollowingRef.current = isLiveFollowing;
  trackDurationRef.current = track.totalDurationMs;
  const vehicleCoordinate = useMemo<Coordinate>(
    () =>
      sample
        ? { latitude: sample.latitude, longitude: sample.longitude }
        : route[0] ?? { latitude: 0, longitude: 0 },
    [sample, route]
  );
  const heading = sample?.heading ?? 0;
  // The rendered route only depends on accepted GPS history, never on the
  // per-frame playback position, so it is not rebuilt on every animation frame.
  const renderRoute = useMemo(() => simplifyRouteForRender(route), [route]);
  const trackStartMs = useMemo(() => {
    const start = track.points[0]?.t ? Date.parse(track.points[0].t) : Number.NaN;
    return Number.isFinite(start) ? start : null;
  }, [track.points]);

  useEffect(() => {
    const previousStart = trackStartRef.current;
    trackStartRef.current = trackStartMs;
    if (previousStart == null || trackStartMs == null || previousStart === trackStartMs) return;
    setElapsedMs((current) =>
      Math.min(Math.max(previousStart + current - trackStartMs, 0), track.totalDurationMs)
    );
  }, [track.totalDurationMs, trackStartMs]);

  const coveredKm = sample?.distanceKm ?? 0;
  // Speed is the live-reported value at the current fix — never synthesized.
  const currentSpeed = Math.max(0, Math.round(sample?.speed ?? 0));
  const isLiveStale =
    live.quality === 'stale' ||
    (liveAgeSec != null && liveAgeSec >= LIVE_STALE_AFTER_SEC);
  const isLowAccuracy = live.quality === 'low_accuracy';
  const hasInvalidLiveFix = live.quality === 'invalid' && !live.latest;
  const liveState = live.latest?.state?.trim().toUpperCase();
  const status = isAlertActive
    ? 'Alert'
    : liveEnabled && (!live.connected || isLiveStale)
      ? 'Offline'
      : hasInvalidLiveFix
        ? 'GPS error'
        : isLowAccuracy
          ? 'Low accuracy'
          : liveState === 'IDLE'
            ? 'Idle'
            : liveState === 'STOPPED'
              ? 'Stopped'
              : 'Running';
  const statusColor =
    status === 'Running'
      ? BRAND.greenGlow
      : status === 'Idle' || status === 'Low accuracy'
        ? '#F5A623'
        : status === 'Offline'
          ? BRAND.muted
          : BRAND.red;
  const currentAddress = live.latest?.address?.trim() || vehicleSubtitle;
  // Ping time reflects the last recorded fix, not wall-clock.
  const pingTime = useMemo(() => {
    const last = track.points[track.points.length - 1];
    const parsed = last?.t ? new Date(last.t) : new Date();
    return formatPingTime(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
  }, [track]);

  // Re-centre the camera on the live vehicle and snap the marker to the newest
  // fix. (No timeline seeking — this is a live screen.)
  const jumpToLive = useCallback(() => {
    manualInteractionRef.current = false;
    setAutoFollowSuspended(false);
    setIsFollowing(true);
    if (cameraMode === 'overview') setCameraMode('follow');
    setIsLiveFollowing(true);
    setElapsedMs(track.totalDurationMs);
  }, [cameraMode, track.totalDurationMs]);
  const mapStyleInfo = useMemo(
    () => getMapStyleInfo(isNightMode ? 'dark' : isSatelliteMode ? 'bright' : 'street'),
    [isNightMode, isSatelliteMode]
  );
  const useNativeMap = Platform.OS !== 'web';
  const blockingMapIssue = mapStyleInfo.issues.find((issue) => issue.blocking);
  const mapProviderLabel = useMemo(() => {
    if (useNativeMap) return getNativeMapProviderLabel(Platform.OS);
    return mapStyleInfo.webProvider === 'geoapify' ? 'Geoapify web fallback' : 'OpenFreeMap web fallback';
  }, [mapStyleInfo.webProvider, useNativeMap]);
  const headerTop = insets.top + 12;
  const cameraBarTop = headerTop + overlayHeights.header + 8;
  const livePillTop = cameraBarTop + overlayHeights.camera + 8;
  const resumeButtonTop =
    (liveEnabled ? livePillTop + overlayHeights.live : cameraBarTop + overlayHeights.camera) + 8;
  const cinemaDeckTop = headerTop + overlayHeights.header + 8;
  const topOverlayBottom = cinematicMode
    ? cinemaDeckTop + overlayHeights.cinema
    : autoFollowSuspended
      ? resumeButtonTop + overlayHeights.resume
      : liveEnabled
        ? livePillTop + overlayHeights.live
        : cameraBarTop + overlayHeights.camera;
  const visibleSheetHeight = sheetExpanded
    ? sheetHeight || Math.min(420, Math.max(280, mapSize.height * 0.48))
    : collapsedSheetHeight || 132;
  const mapPadding = useMemo(() => {
    const viewportHeight = Math.max(mapSize.height || height, 1);
    const horizontal = Math.max(20, Math.min(52, (mapSize.width || width) * 0.06));
    const top = Math.min(
      Math.max(insets.top + 20, Math.ceil(topOverlayBottom + 12)),
      Math.max(insets.top + 20, viewportHeight - 96)
    );
    const desiredBottom = Math.ceil(visibleSheetHeight + insets.bottom + 12);
    // Keep a minimum usable strip even on very small landscape screens.
    const bottom = Math.max(88, Math.min(desiredBottom, Math.max(88, viewportHeight - top - 96)));
    return { top, right: horizontal, bottom, left: horizontal };
  }, [
    height,
    insets.bottom,
    insets.top,
    mapSize.height,
    mapSize.width,
    topOverlayBottom,
    visibleSheetHeight,
    width,
  ]);
  const remainingDistanceKm = Math.max(totalDistanceKm - coveredKm, 0);
  const selectedOptionData = useMemo<RouteOptionData | null>(() => {
    if (!selectedOptionId) return null;

    const coordinateLabel = formatCoordinate(vehicleCoordinate);
    const options: Record<RouteMapOptionId, RouteOptionData> = {
      parking: {
        icon: 'parking',
        metrics: [
          { label: 'State', value: status },
          { label: 'Speed', value: `${currentSpeed} km/h` },
          { label: 'Location', value: coordinateLabel },
        ],
        summary: 'Camera centred on the vehicle at its current live position.',
        title: 'Parking',
        tone: 'green',
      },
      refresh: {
        icon: 'refresh',
        metrics: [
          { label: 'Speed', value: `${currentSpeed} km/h` },
          { label: 'Covered', value: `${coveredKm.toFixed(1)} km` },
          { label: 'Ping', value: pingTime },
        ],
        summary: 'Live tracking resumed and the camera is following the vehicle.',
        title: 'Refresh',
        tone: 'green',
      },
      follow: {
        icon: 'navigation-variant',
        metrics: [
          { label: 'Mode', value: isFollowing ? 'Following' : 'Manual' },
          { label: 'Heading', value: `${Math.round(heading)} deg` },
          { label: 'Speed', value: `${currentSpeed} km/h` },
        ],
        summary: isFollowing ? 'Camera is locked to the playback marker.' : 'Camera is free for manual map viewing.',
        title: 'Navigation',
        tone: isFollowing ? 'green' : 'orange',
      },
      alert: {
        icon: 'alert',
        metrics: [
          { label: 'State', value: isAlertActive ? 'Active' : 'Cleared' },
          { label: 'Vehicle', value: vehicleName },
          { label: 'Support', value: CONTACT_PHONE },
        ],
        summary: isAlertActive ? 'Emergency alert is active for this vehicle.' : 'Emergency alert is cleared.',
        title: 'Alert',
        tone: isAlertActive ? 'red' : 'green',
      },
      call: {
        icon: 'phone',
        metrics: [
          { label: 'Number', value: CONTACT_PHONE },
          { label: 'Vehicle', value: vehicleName },
          { label: 'Status', value: status },
        ],
        summary: 'Support call opened from the route playback screen.',
        title: 'Call',
        tone: 'orange',
      },
      location: {
        icon: 'map-marker',
        metrics: [
          { label: 'Point', value: coordinateLabel },
          { label: 'Address', value: vehicleSubtitle },
          { label: 'Covered', value: `${coveredKm.toFixed(1)} km` },
        ],
        summary: 'Camera centered on the current playback marker.',
        title: 'Location',
        tone: 'green',
      },
      traffic: {
        icon: 'road-variant',
        metrics: [
          { label: 'Route', value: isTrafficVisible ? 'Visible' : 'Hidden' },
          { label: 'Remaining', value: `${remainingDistanceKm.toFixed(1)} km` },
          { label: 'Trip', value: `${totalDistanceKm.toFixed(1)} km` },
        ],
        // The tracking route is a single green line with no congestion/speed
        // colours; this control only shows or hides that one line.
        summary: isTrafficVisible
          ? 'The green tracking route is visible.'
          : 'The green tracking route is hidden.',
        title: 'Route Line',
        tone: 'green',
      },
      mapType: {
        icon: 'rhombus-outline',
        metrics: [
          { label: 'Map', value: isSatelliteMode ? 'Bright' : 'Standard' },
          { label: 'Provider', value: mapProviderLabel },
          { label: 'Style', value: isNightMode ? 'Night' : 'Day' },
        ],
        summary: isSatelliteMode ? 'Bright road-map style is selected.' : 'Standard road-map style is selected.',
        title: 'Map Type',
        tone: 'orange',
      },
      direction: {
        icon: 'directions',
        metrics: [
          { label: 'Speed', value: `${currentSpeed} km/h` },
          { label: 'Heading', value: `${Math.round(heading)} deg` },
          { label: 'Covered', value: `${coveredKm.toFixed(1)} km` },
        ],
        summary: 'Camera is following the live vehicle.',
        title: 'Direction',
        tone: 'green',
      },
      night: {
        icon: 'weather-night',
        metrics: [
          { label: 'Theme', value: isNightMode ? 'Night' : 'Day' },
          { label: 'Map', value: isSatelliteMode ? 'Bright' : 'Standard' },
          { label: 'Provider', value: mapProviderLabel },
        ],
        summary: isNightMode ? 'Night road-map style is active.' : 'Day road-map style is active.',
        title: 'Night Mode',
        tone: 'orange',
      },
      history: {
        icon: 'history',
        metrics: [
          { label: 'Covered', value: `${coveredKm.toFixed(1)} km` },
          { label: 'Trip', value: `${totalDistanceKm.toFixed(1)} km` },
          { label: 'Ping', value: pingTime },
        ],
        summary: 'Opening recorded route history on the playback screen.',
        title: 'History',
        tone: 'green',
      },
    };

    return options[selectedOptionId];
  }, [
    currentSpeed,
    heading,
    isAlertActive,
    isFollowing,
    isNightMode,
    isSatelliteMode,
    isTrafficVisible,
    mapProviderLabel,
    pingTime,
    remainingDistanceKm,
    coveredKm,
    selectedOptionId,
    status,
    totalDistanceKm,
    vehicleCoordinate,
    vehicleName,
    vehicleSubtitle,
  ]);

  const moveCamera = useCallback(
    (
      mode: CameraMode,
      lng: number,
      lat: number,
      heading: number,
      duration = 400,
      force = false
    ) => {
      if (
        !useNativeMap ||
        !mapReadyRef.current ||
        mode === 'overview' ||
        (!force && (isLiveStale || manualInteractionRef.current))
      ) {
        return;
      }

      const now = Date.now();
      const target = CAMERA_MODES[mode];
      const modeChanged = lastCameraModeRef.current !== mode;
      const previousCoordinate = lastCameraCoordinateRef.current;
      const distanceMoved = previousCoordinate
        ? haversineKm(previousCoordinate.latitude, previousCoordinate.longitude, lat, lng)
        : Infinity;
      const isStopped = currentSpeed < 2;
      const speedBand =
        currentSpeed >= 75
          ? 'fast'
          : currentSpeed >= 38
            ? 'medium'
            : isStopped
              ? 'stopped'
              : 'moving';
      const cameraProfile = [
        mode,
        speedBand,
        Math.round(mapPadding.top),
        Math.round(mapPadding.right),
        Math.round(mapPadding.bottom),
        Math.round(mapPadding.left),
      ].join(':');
      const profileChanged = lastCameraProfileRef.current !== cameraProfile;
      const validHeading = normalizeHeading(heading, lastValidHeadingRef.current ?? 0);
      if (!isStopped || lastValidHeadingRef.current == null) {
        lastValidHeadingRef.current = validHeading;
      }
      const travelHeading = lastValidHeadingRef.current ?? validHeading;
      const shouldForce = force || modeChanged;
      if (
        !shouldForce &&
        !profileChanged &&
        now - lastCameraAtRef.current < CAMERA_MIN_GAP_MS
      ) {
        return;
      }
      const cameraHeading = target.bearingFollowsHeading
        ? isStopped
          ? travelHeading
          : shouldForce
            ? travelHeading
            : lerpAngle(lastCameraHeadingRef.current, travelHeading, 0.42)
        : 0;
      if (
        !shouldForce &&
        !profileChanged &&
        distanceMoved < 0.002 &&
        Math.abs(
          ((((cameraHeading - lastCameraHeadingRef.current) % 360) + 540) % 360) - 180
        ) < 2
      ) {
        return;
      }
      const speedZoomAdjustment =
        currentSpeed >= 75 ? -0.85 : currentSpeed >= 38 ? -0.42 : isStopped ? 0.32 : 0;
      const speedOffsetScale =
        isStopped ? 0 : currentSpeed >= 75 ? 1.45 : currentSpeed >= 38 ? 1.18 : 0.82;
      const center = offsetCoordinate(
        lat,
        lng,
        target.bearingFollowsHeading ? cameraHeading : travelHeading,
        target.forwardMeters * speedOffsetScale
      );
      lastCameraAtRef.current = now;
      lastCameraHeadingRef.current = cameraHeading;
      lastCameraCoordinateRef.current = { latitude: lat, longitude: lng };
      lastCameraModeRef.current = mode;
      lastCameraProfileRef.current = cameraProfile;
      setMapCameraHeading(cameraHeading);
      mapRef.current?.animateCamera(
        {
          center,
          pitch: isStopped && mode !== 'top' ? Math.max(18, target.pitch - 8) : target.pitch,
          zoom: target.zoom + speedZoomAdjustment,
          heading: cameraHeading,
        },
        { duration }
      );
    },
    [currentSpeed, isLiveStale, mapPadding, useNativeMap]
  );

  const showToast = useCallback((message: string) => {
    setToastText(message);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToastText('');
    }, 1800);
  }, []);

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, []);

  const selectVehicleModel = useCallback(
    (variant: CarVariant) => {
      haptic();
      setModelLoadState('loading');
      setModelLoadError(null);
      setCarVariant(variant);
      setMarkerCategoryOverride(getVehicleModel(variant).category.toUpperCase());
      dispatch(setVehicleModelPreference({ deviceKey: devicePreferenceKey, variant }));
      if (__DEV__) console.debug(`[VehicleModel] selected ${variant}`);
    },
    [devicePreferenceKey, dispatch, haptic]
  );

  const snapSheet = useCallback(
    (expanded: boolean) => {
      const collapsedOffset = Math.max(160, sheetHeightRef.current - 128);
      const wasExpanded = sheetExpandedRef.current;
      sheetExpandedRef.current = expanded;
      sheetTranslateY.stopAnimation();
      if (sheetAnimationFrameRef.current != null) {
        cancelAnimationFrame(sheetAnimationFrameRef.current);
        sheetAnimationFrameRef.current = null;
      }
      if (expanded) {
        setSheetExpanded(true);
        sheetAnimationFrameRef.current = requestAnimationFrame(() => {
          sheetAnimationFrameRef.current = null;
          if (!screenMountedRef.current) return;
          if (!wasExpanded) sheetTranslateY.setValue(collapsedOffset);
          Animated.spring(sheetTranslateY, {
            damping: 22,
            mass: 0.82,
            stiffness: 240,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        });
      } else {
        Animated.spring(sheetTranslateY, {
          damping: 24,
          mass: 0.86,
          stiffness: 250,
          toValue: collapsedOffset,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && screenMountedRef.current) {
            setSheetExpanded(false);
            sheetTranslateY.setValue(0);
          }
        });
      }
      haptic();
    },
    [haptic, sheetTranslateY]
  );

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            sheetDragStartRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const collapsedOffset = Math.max(160, sheetHeightRef.current - 128);
          sheetTranslateY.setValue(
            Math.max(0, Math.min(collapsedOffset, sheetDragStartRef.current + gesture.dy))
          );
        },
        onPanResponderRelease: (_, gesture) => {
          const collapsedOffset = Math.max(160, sheetHeightRef.current - 128);
          const projected = sheetDragStartRef.current + gesture.dy + gesture.vy * 90;
          snapSheet(projected < collapsedOffset * 0.5);
        },
        onPanResponderTerminate: () => snapSheet(sheetExpandedRef.current),
      }),
    [sheetTranslateY, snapSheet]
  );

  const handleSheetLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.ceil(event.nativeEvent.layout.height);
      if (nextHeight <= 0) return;
      if (sheetExpandedRef.current) {
        sheetHeightRef.current = nextHeight;
        setSheetHeight((current) => (current === nextHeight ? current : nextHeight));
      } else {
        setCollapsedSheetHeight((current) => (current === nextHeight ? current : nextHeight));
      }
    },
    []
  );

  const fitWholeRoute = useCallback(() => {
    if (
      !useNativeMap ||
      !mapRef.current ||
      !mapReadyRef.current ||
      !mapLayoutReadyRef.current ||
      manualInteractionRef.current
    ) {
      return false;
    }
    const coordinates = [...renderRoute, vehicleCoordinate].filter(
      (coordinate) =>
        Number.isFinite(coordinate.latitude) &&
        Number.isFinite(coordinate.longitude) &&
        Math.abs(coordinate.latitude) <= 90 &&
        Math.abs(coordinate.longitude) <= 180 &&
        !(coordinate.latitude === 0 && coordinate.longitude === 0)
    );
    const seen = new Set<string>();
    const distinct = coordinates.filter((coordinate) => {
      const key = `${coordinate.latitude.toFixed(7)}:${coordinate.longitude.toFixed(7)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (distinct.length < 2) {
      const only = distinct[0];
      if (only) {
        setMapCameraHeading(0);
        mapRef.current.animateCamera(
          {
            center: only,
            heading: 0,
            pitch: 0,
            zoom: CAMERA_MODES.top.zoom,
          },
          { duration: 420 }
        );
      }
      return false;
    }

    setMapCameraHeading(0);
    mapRef.current.setCamera({ heading: 0, pitch: 0 });
    mapRef.current.fitToCoordinates(distinct, {
      edgePadding: {
        top: mapPadding.top,
        right: mapPadding.right,
        bottom: mapPadding.bottom,
        left: mapPadding.left,
      },
      animated: true,
    });
    lastCameraModeRef.current = 'overview';
    return true;
  }, [mapPadding, renderRoute, useNativeMap, vehicleCoordinate]);
  fitWholeRouteRef.current = fitWholeRoute;

  const selectCameraMode = useCallback(
    (mode: CameraMode) => {
      manualInteractionRef.current = false;
      setCameraMode(mode);
      setAutoFollowSuspended(false);
      haptic();
      if (__DEV__) console.debug(`[Camera] mode ${mode}`);
      if (mode === 'overview') {
        setIsFollowing(false);
        fitWholeRouteRef.current();
      } else {
        setIsFollowing(true);
        moveCamera(
          mode,
          vehicleCoordinate.longitude,
          vehicleCoordinate.latitude,
          heading,
          620,
          true
        );
      }
      showToast(`${CAMERA_MODES[mode].label} camera`);
    },
    [heading, haptic, moveCamera, showToast, vehicleCoordinate]
  );

  const handleManualMapInteraction = useCallback(() => {
    manualInteractionRef.current = true;
    if (isFollowing || cameraMode === 'overview') {
      if (isFollowing) setIsFollowing(false);
      setAutoFollowSuspended(true);
    }
  }, [cameraMode, isFollowing]);

  const resumeCinematicTracking = useCallback(() => {
    manualInteractionRef.current = false;
    setAutoFollowSuspended(false);
    haptic();
    if (cameraMode === 'overview') {
      setIsFollowing(false);
      fitWholeRouteRef.current();
      showToast('Overview restored');
      return;
    }
    setIsFollowing(true);
    moveCamera(
      cameraMode,
      vehicleCoordinate.longitude,
      vehicleCoordinate.latitude,
      heading,
      680,
      true
    );
    showToast('Cinematic tracking resumed');
  }, [cameraMode, heading, haptic, moveCamera, showToast, vehicleCoordinate]);

  const measureOverlay = useCallback(
    (key: keyof typeof overlayHeights, event: LayoutChangeEvent) => {
      const next = Math.ceil(event.nativeEvent.layout.height);
      if (next <= 0) return;
      setOverlayHeights((current) =>
        current[key] === next ? current : { ...current, [key]: next }
      );
    },
    []
  );

  const scheduleCameraFrame = useCallback((task: () => void) => {
    if (cameraFrameRef.current != null) {
      cancelAnimationFrame(cameraFrameRef.current);
    }
    cameraFrameRef.current = requestAnimationFrame(() => {
      cameraFrameRef.current = null;
      if (screenMountedRef.current) task();
    });
  }, []);

  const handleMapLayout = useCallback((event: LayoutChangeEvent) => {
    const { height: mapHeight, width: mapWidth } = event.nativeEvent.layout;
    const hasVisibleSize = mapHeight > 0 && mapWidth > 0;
    mapLayoutReadyRef.current = hasVisibleSize;
    setMapContainerReady(hasVisibleSize);
    if (hasVisibleSize) {
      const nextHeight = Math.ceil(mapHeight);
      const nextWidth = Math.ceil(mapWidth);
      setMapSize((current) =>
        current.height === nextHeight && current.width === nextWidth
          ? current
          : { height: nextHeight, width: nextWidth }
      );
    }

    if (!hasVisibleSize) {
      setMapLoadState('error');
      setMapErrorMessage('Map container has no visible size.');
    } else if (mapReadyRef.current && !initialRouteFitRef.current) {
      scheduleCameraFrame(() => {
        if (!mapLayoutReadyRef.current || initialRouteFitRef.current) return;
        if (cameraMode === 'overview') {
          fitWholeRouteRef.current();
        } else {
          moveCamera(
            cameraMode,
            vehicleCoordinate.longitude,
            vehicleCoordinate.latitude,
            heading,
            620,
            true
          );
        }
        initialRouteFitRef.current = true;
      });
    }
  }, [cameraMode, heading, moveCamera, scheduleCameraFrame, vehicleCoordinate]);

  const syncNativeProjection = useCallback(
    async (force = false) => {
      if (!useNativeMap || !mapRef.current || !mapReadyRef.current) return;
      const now = Date.now();
      if (!force && now - lastProjectionAtRef.current < 40) return;
      lastProjectionAtRef.current = now;
      const requestId = ++cameraReadRequestRef.current;
      try {
        const [camera, point] = await Promise.all([
          mapRef.current.getCamera(),
          mapRef.current.pointForCoordinate(vehicleCoordinate),
        ]);
        if (requestId !== cameraReadRequestRef.current || !screenMountedRef.current) return;
        const nextHeading = Number.isFinite(camera.heading) ? normalizeHeading(camera.heading) : 0;
        const nextPitch = Number.isFinite(camera.pitch) ? camera.pitch : 0;
        if (
          cameraMode === 'overview' &&
          !manualInteractionRef.current &&
          (Math.abs(nextHeading) >= 0.5 || Math.abs(nextPitch) >= 0.5)
        ) {
          mapRef.current?.setCamera({ ...camera, heading: 0, pitch: 0 });
          setMapCameraHeading(0);
        } else {
          setMapCameraHeading((current) =>
            Math.abs(current - nextHeading) < 0.5 ? current : nextHeading
          );
        }
        if (
          Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          point.x >= -120 &&
          point.x <= mapSize.width + 120 &&
          point.y >= -120 &&
          point.y <= mapSize.height + 120
        ) {
          setVehicleScreenPoint(point);
        }
      } catch {
        // Projection can reject while the provider is laying out or animating.
      }
    },
    [cameraMode, mapSize.height, mapSize.width, useNativeMap, vehicleCoordinate]
  );

  const handleRegionChange = useCallback(() => {
    void syncNativeProjection(false);
  }, [syncNativeProjection]);

  const handleRegionChangeComplete = useCallback(() => {
    void syncNativeProjection(true);
  }, [syncNativeProjection]);

  const handleWebProjection = useCallback((projection: WebMapProjection) => {
    setMapCameraHeading(normalizeHeading(projection.heading));
    const point = projection.points.vehicle;
    if (point) setVehicleScreenPoint(point);
  }, []);

  const handleMapReady = useCallback(() => {
    if (blockingMapIssue) {
      setMapLoadState('error');
      setMapErrorMessage(blockingMapIssue.message);
      return;
    }

    mapReadyRef.current = true;
    setIsMapReady(true);
    setMapLoadState('ready');
    setMapErrorMessage('');

    scheduleCameraFrame(() => {
      if (mapLayoutReadyRef.current && !initialRouteFitRef.current) {
        if (cameraMode === 'overview') {
          fitWholeRouteRef.current();
        } else {
          moveCamera(
            cameraMode,
            vehicleCoordinate.longitude,
            vehicleCoordinate.latitude,
            heading,
            620,
            true
          );
        }
        initialRouteFitRef.current = true;
      }
      void syncNativeProjection(true);
    });
  }, [
    blockingMapIssue,
    cameraMode,
    heading,
    moveCamera,
    scheduleCameraFrame,
    syncNativeProjection,
    vehicleCoordinate,
  ]);

  const retryMapLoad = useCallback(() => {
    initialRouteFitRef.current = false;
    mapReadyRef.current = false;
    mapLayoutReadyRef.current = false;
    lastCameraAtRef.current = 0;
    lastCameraCoordinateRef.current = null;
    lastCameraModeRef.current = null;
    lastCameraProfileRef.current = '';
    setVehicleScreenPoint(null);
    setIsMapReady(false);
    setMapLoadState('loading');
    setMapErrorMessage('');
    setMapRetryKey((current) => current + 1);
  }, []);

  const handleRouteTool = useCallback(
    (id: RouteMapOptionId) => {
      setSelectedOptionId(id);
      setToolsExpanded(false);
      haptic();
      switch (id) {
        case 'parking':
          // Live screen: re-centre on the vehicle's current position.
          resumeCinematicTracking();
          showToast('Centered on vehicle');
          break;
        case 'refresh':
          // Live screen: resume live-follow and re-centre (no route restart).
          setIsAlertActive(false);
          resumeCinematicTracking();
          showToast('Live tracking resumed');
          break;
        case 'follow':
          if (isFollowing) {
            setIsFollowing(false);
            setAutoFollowSuspended(true);
            showToast('Manual map mode');
          } else {
            resumeCinematicTracking();
          }
          break;
        case 'alert':
          setIsAlertActive(!isAlertActive);
          showToast(!isAlertActive ? 'Emergency alert active' : 'Alert cleared');
          break;
        case 'call':
          Linking.openURL(`tel:${CONTACT_PHONE}`).catch(() => undefined);
          showToast('Calling support');
          break;
        case 'location':
          resumeCinematicTracking();
          showToast('Vehicle centered');
          break;
        case 'traffic':
          setIsTrafficVisible(!isTrafficVisible);
          showToast(isTrafficVisible ? 'Route hidden' : 'Route visible');
          break;
        case 'mapType':
          setIsSatelliteMode(!isSatelliteMode);
          showToast(isSatelliteMode ? 'Standard map' : 'Bright map');
          break;
        case 'direction':
          // Live screen: follow the vehicle (there is no future route to skip to).
          setIsFollowing(true);
          setAutoFollowSuspended(false);
          resumeCinematicTracking();
          showToast('Following vehicle');
          break;
        case 'night':
          setIsNightMode(!isNightMode);
          showToast(isNightMode ? 'Day map' : 'Night map');
          break;
        case 'history':
          // Recorded route history lives on the SEPARATE playback screen, so the
          // live screen never shows past/complete routes — it links out instead.
          if (validDeviceId) {
            router.push({
              pathname: '/trip-playback' as never,
              params: { deviceId: String(deviceId), name: vehicleName },
            });
          }
          showToast('Opening route history');
          break;
      }
    },
    [
      deviceId,
      haptic,
      isAlertActive,
      isFollowing,
      isNightMode,
      isSatelliteMode,
      isTrafficVisible,
      resumeCinematicTracking,
      router,
      showToast,
      validDeviceId,
      vehicleName,
    ]
  );

  // NOTE: There is intentionally no playback clock, rate multiplier, pause/resume,
  // or scrubbing on this LIVE screen. The vehicle only ever moves toward the newest
  // streamed fix via the single live catch-up animation below. Recorded-timeline
  // playback lives on the separate Route Playback / History screen.

  useEffect(() => {
    // Smoothly catch up to each new live fix. Cancelling the previous RAF before
    // starting the next prevents duplicate animations when updates arrive fast.
    if (!appActive || !isLiveFollowing) return;
    if (liveTransitionFrameRef.current != null) {
      cancelAnimationFrame(liveTransitionFrameRef.current);
    }
    const from = Math.min(elapsedMsRef.current, track.totalDurationMs);
    const to = track.totalDurationMs;
    if (to <= from) {
      setElapsedMs(to);
      return;
    }
    const recordedGapMs = to - from;
    const duration = Math.min(
      LIVE_TRANSITION_MAX_MS,
      Math.max(LIVE_TRANSITION_MIN_MS, recordedGapMs * 0.82)
    );
    const startedAt = Date.now();
    const animate = () => {
      const fraction = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - fraction) ** 3;
      setElapsedMs(from + (to - from) * eased);
      if (fraction < 1) {
        liveTransitionFrameRef.current = requestAnimationFrame(animate);
      } else {
        liveTransitionFrameRef.current = null;
      }
    };
    liveTransitionFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (liveTransitionFrameRef.current != null) {
        cancelAnimationFrame(liveTransitionFrameRef.current);
        liveTransitionFrameRef.current = null;
      }
    };
  }, [appActive, isLiveFollowing, track.totalDurationMs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const nextActive = state === 'active';
      if (nextActive && liveFollowingRef.current) {
        if (liveTransitionFrameRef.current != null) {
          cancelAnimationFrame(liveTransitionFrameRef.current);
          liveTransitionFrameRef.current = null;
        }
        // Resume at the authoritative latest fix instead of replaying animation
        // frames accumulated while the app was in the background.
        setElapsedMs(trackDurationRef.current);
      }
      setAppActive(nextActive);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Tick the "last update" age once a second while a live feed is active.
    if (!liveEnabled) {
      setLiveAgeSec(null);
      return;
    }
    const update = () =>
      setLiveAgeSec(
        live.lastReceivedAt
          ? Math.max(0, Math.round((Date.now() - live.lastReceivedAt) / 1000))
          : null
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [liveEnabled, live.lastReceivedAt]);

  useEffect(() => {
    if (isLiveStale && live.lastReceivedAt) {
      staleSeenRef.current = true;
      return;
    }
    if (staleSeenRef.current && live.connected && liveAgeSec != null && !isLiveStale) {
      staleSeenRef.current = false;
      showToast('Live GPS connection restored');
    }
  }, [isLiveStale, live.connected, live.lastReceivedAt, liveAgeSec, showToast]);

  useEffect(() => {
    if (live.rejectedReason) showToast(live.rejectedReason);
  }, [live.rejectedReason, showToast]);

  const fallbackMarkers = useMemo<WebMapMarker[]>(
    () => [
      {
        category: getVehicleModel(carVariant).category.toUpperCase(),
        id: 'vehicle',
        lat: vehicleCoordinate.latitude,
        lng: vehicleCoordinate.longitude,
        color: getVehicleModel(carVariant).paintColor,
        heading,
        hidden: modelLoadState === 'ready' && vehicleScreenPoint != null,
        label: vehicleName,
      },
    ],
    [carVariant, heading, modelLoadState, vehicleCoordinate, vehicleName, vehicleScreenPoint]
  );
  const fallbackPolyline = useMemo<[number, number][]>(
    () => renderRoute.map((c) => [c.longitude, c.latitude] as [number, number]),
    [renderRoute]
  );
  const projectedVehicleMarkers = useMemo<Fleet3DOverlayMarker[]>(
    () =>
      vehicleScreenPoint && sample
        ? [
            {
              heading: normalizeHeading(heading - mapCameraHeading),
              id: 'vehicle',
              isActive: true,
              selected: true,
              speed: currentSpeed,
              variant: carVariant,
              x: vehicleScreenPoint.x,
              y: vehicleScreenPoint.y,
            },
          ]
        : [],
    [
      carVariant,
      currentSpeed,
      heading,
      mapCameraHeading,
      sample,
      vehicleScreenPoint,
    ]
  );

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
      sheetTranslateY.stopAnimation();
      if (sheetAnimationFrameRef.current != null) {
        cancelAnimationFrame(sheetAnimationFrameRef.current);
      }
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
      if (liveTransitionFrameRef.current != null) {
        cancelAnimationFrame(liveTransitionFrameRef.current);
      }
      if (cameraFrameRef.current != null) {
        cancelAnimationFrame(cameraFrameRef.current);
      }
      cameraReadRequestRef.current += 1;
    };
  }, [sheetTranslateY]);

  useEffect(() => {
    initialRouteFitRef.current = false;
    mapReadyRef.current = false;
    setIsMapReady(false);

    if (!useNativeMap) {
      mapReadyRef.current = true;
      setIsMapReady(true);
      setMapLoadState('ready');
      setMapErrorMessage('');
      return;
    }

    if (blockingMapIssue) {
      setMapLoadState('error');
      setMapErrorMessage(blockingMapIssue.message);
      return;
    }

    setMapLoadState('loading');
    setMapErrorMessage('');
  }, [blockingMapIssue, mapRetryKey, useNativeMap]);

  // No external tile-load timeout is needed for the native Google/Apple map.

  useEffect(() => {
    if (!appActive || !isFollowing || !isMapReady || isLiveStale) {
      return;
    }

    moveCamera(cameraMode, vehicleCoordinate.longitude, vehicleCoordinate.latitude, heading, 520);
  }, [
    appActive,
    moveCamera,
    cameraMode,
    isFollowing,
    isLiveStale,
    isMapReady,
    vehicleCoordinate,
    heading,
    mapPadding.bottom,
    mapPadding.left,
    mapPadding.right,
    mapPadding.top,
  ]);

  useEffect(() => {
    if (!appActive || !isMapReady || !useNativeMap) return;
    void syncNativeProjection(false);
  }, [appActive, isMapReady, syncNativeProjection, useNativeMap, vehicleCoordinate]);

  useEffect(() => {
    if (
      !appActive ||
      !isMapReady ||
      cameraMode !== 'overview' ||
      manualInteractionRef.current
    ) {
      return;
    }
    scheduleCameraFrame(() => {
      fitWholeRouteRef.current();
    });
  }, [
    appActive,
    cameraMode,
    isMapReady,
    mapPadding.bottom,
    mapPadding.left,
    mapPadding.right,
    mapPadding.top,
    scheduleCameraFrame,
  ]);

  const isMapLoading = useNativeMap && (mapLoadState === 'loading' || !mapContainerReady);

  // Real device with no usable history AND no live fixes yet: show a loading
  // state while the playback query resolves, then a proper empty state. Never
  // fall back to the demo route for a real device (no fabricated GPS movement in
  // production). Live streaming alone is enough to render the map.
  if (hasRealDevice && track.points.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={[styles.headerCard, { top: headerTop }]}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/map'))}
            style={styles.headerIconButton}>
            <MaterialCommunityIcons color={BRAND.green} name="arrow-left" size={30} />
          </Pressable>
          <View style={styles.headerTextBlock}>
            <Text numberOfLines={1} style={styles.headerTitle}>{vehicleName}</Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>{vehicleSubtitle}</Text>
          </View>
        </View>
        <View style={styles.playbackStateBox}>
          {!live.connected && !live.rejectedReason ? (
            <>
              <ActivityIndicator color={BRAND.green} size="large" />
              <Text style={styles.playbackStateText}>Connecting to live GPS…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons color={BRAND.muted} name="map-marker-off-outline" size={40} />
              <Text style={styles.playbackStateText}>
                {live.rejectedReason ??
                  'Waiting for the first live GPS position of this vehicle.'}
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} onLayout={handleMapLayout} style={styles.screen}>
      {useNativeMap ? (
        <MapView
          key={`route-map-${mapRetryKey}`}
          ref={mapRef}
          customMapStyle={mapStyleInfo.style}
          initialCamera={{
            center: route[Math.min(20, route.length - 1)] ?? vehicleCoordinate,
            heading: 0,
            pitch: 38,
            zoom: 14.8,
          }}
          mapPadding={mapPadding}
          onLayout={handleMapLayout}
          onMapReady={handleMapReady}
          onPanDrag={handleManualMapInteraction}
          onRegionChange={handleRegionChange}
          onRegionChangeComplete={handleRegionChangeComplete}
          onTouchStart={handleManualMapInteraction}
          pitchEnabled
          rotateEnabled
          scrollEnabled
          showsBuildings
          showsCompass={false}
          showsUserLocation={false}
          style={styles.mapCanvas}
          toolbarEnabled={false}
          zoomEnabled>
          {/* One stable green tracking route: a SINGLE memoized polyline with a
              fixed React key. react-native-maps keeps the same native overlay and
              only updates its coordinates as accepted GPS history grows — the line
              is never remounted and there are no overlapping/duplicate route
              layers, so it cannot flicker on vehicle switch, zoom, pan, or live
              updates. No per-frame progress lines, gradients, or traffic colours. */}
          {isTrafficVisible ? (
            <StableRouteLine
              key="live-track-route"
              color={ROUTE_GREEN}
              coordinates={renderRoute}
              width={6}
            />
          ) : null}
          {sample && (modelLoadState !== 'ready' || !vehicleScreenPoint) ? (
            <LiveVehicleMapMarker
              cameraHeading={mapCameraHeading}
              category={markerCategory}
              coordinate={vehicleCoordinate}
              heading={heading}
              showStatusCircle={
                liveEnabled &&
                (!live.connected || isLiveStale || isLowAccuracy || hasInvalidLiveFix)
              }
              state={liveState ?? status}
              statusColor={statusColor}
            />
          ) : null}
        </MapView>
      ) : (
        <FleetWebMap
          cameraMode={cameraMode}
          followSelected={isFollowing}
          mapStyle={mapStyleInfo.webStyle}
          markers={fallbackMarkers}
          onInteraction={handleManualMapInteraction}
          onProjectionChange={handleWebProjection}
          polyline={fallbackPolyline}
          selectedId="vehicle"
          style={styles.mapCanvas}
        />
      )}

      <View pointerEvents="none" style={styles.mapShade} />

      {vehicleScreenPoint ? (
        <Fleet3DOverlay
          height={mapSize.height}
          markers={projectedVehicleMarkers}
          onModelError={(id, variant, message) => {
            if (id !== 'vehicle' || variant !== carVariant) return;
            setModelLoadState('error');
            setModelLoadError(message);
          }}
          onModelLoaded={(id, variant) => {
            if (id !== 'vehicle' || variant !== carVariant) return;
            setModelLoadState('ready');
            setModelLoadError(null);
          }}
          onModelLoadStart={(id, variant) => {
            if (id !== 'vehicle' || variant !== carVariant) return;
            setModelLoadState('loading');
            setModelLoadError(null);
          }}
          onUnavailable={(message) => {
            setModelLoadState('error');
            setModelLoadError(message);
          }}
          width={mapSize.width}
        />
      ) : null}

      {useNativeMap && mapLoadState === 'error' ? (
        <RouteMapStateOverlay
          message={mapErrorMessage}
          onRetry={retryMapLoad}
          state="error"
        />
      ) : isMapLoading ? (
        <RouteMapStateOverlay message="Loading native road map" state="loading" />
      ) : null}

      <View
        onLayout={(event) => measureOverlay('header', event)}
        style={[styles.headerCard, { top: headerTop }]}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/map'))}
          style={styles.headerIconButton}>
          <MaterialCommunityIcons color={BRAND.green} name="arrow-left" size={30} />
        </Pressable>
        <View style={styles.headerTextBlock}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {vehicleName}
          </Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>
            {currentAddress}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={cinematicMode ? 'Hide cinematic controls' : 'Show cinematic map controls'}
          accessibilityRole="button"
          onPress={() => {
            const next = !cinematicMode;
            setCinematicMode(next);
            if (next) {
              selectCameraMode('cinematic');
            } else {
              haptic();
            }
          }}
          style={[styles.headerIconButton, cinematicMode && styles.headerCinemaActive]}>
          <MaterialCommunityIcons
            color={cinematicMode ? '#07121B' : BRAND.greenGlow}
            name={cinematicMode ? 'map-outline' : 'movie-open-play'}
            size={25}
          />
        </Pressable>
        <View
          accessibilityLabel={`Vehicle status ${status}`}
          style={[styles.statusPill, { backgroundColor: statusColor }]}>
          <Text style={styles.statusPillText}>{status}</Text>
        </View>
      </View>

      {liveEnabled && !cinematicMode ? (
        <Pressable
          accessibilityLabel={isLiveFollowing ? 'Following live' : 'Jump to live'}
          accessibilityRole="button"
          onLayout={(event) => measureOverlay('live', event)}
          onPress={jumpToLive}
          style={[
            styles.livePill,
            { top: livePillTop },
            isLiveFollowing && live.connected && !isLiveStale
              ? styles.livePillActive
              : styles.livePillIdle,
          ]}>
          <View
            style={[
              styles.liveDot,
              {
                backgroundColor:
                  live.connected && !isLiveStale ? BRAND.greenGlow : BRAND.muted,
              },
            ]}
          />
          <Text style={styles.livePillText}>
            {isLiveFollowing ? 'LIVE' : 'GO LIVE'}
            {liveAgeSec != null
              ? ` | ${isLowAccuracy ? 'low accuracy | ' : isLiveStale ? 'delayed | ' : ''}${formatAge(liveAgeSec)}`
              : live.connected
                ? ' | waiting'
                : ' | offline'}
          </Text>
        </Pressable>
      ) : null}

      {autoFollowSuspended && !cinematicMode ? (
        <Pressable
          accessibilityLabel="Resume Cinematic Tracking"
          accessibilityRole="button"
          onLayout={(event) => measureOverlay('resume', event)}
          onPress={resumeCinematicTracking}
          style={[styles.resumeTrackingButton, { top: resumeButtonTop }]}>
          <MaterialCommunityIcons color="#07121B" name="navigation-variant" size={17} />
          <Text style={styles.resumeTrackingText}>Resume Cinematic Tracking</Text>
        </Pressable>
      ) : null}

      {cinematicMode ? (
        <View
          onLayout={(event) => measureOverlay('cinema', event)}
          style={[styles.cinemaControlDeck, { top: cinemaDeckTop }]}>
          <View style={styles.cinemaControlHeader}>
            <View style={styles.cinemaLiveTitle}>
              <View
                style={[
                  styles.cinemaLiveSignal,
                  !isMapReady && styles.cinemaLiveSignalLoading,
                ]}
              />
              <View>
                <Text style={styles.cinemaEyebrow}>
                  {isMapReady ? 'CINEMATIC LIVE' : 'MAP ENGINE'}
                </Text>
                <Text style={styles.cinemaTitle}>
                  {CINEMATIC_CAMERAS.find((item) => item.id === cameraMode)?.label} camera
                </Text>
              </View>
            </View>
          </View>
          <VehicleModelPicker
            compact
            errorMessage={modelLoadError}
            loading={modelLoadState === 'loading'}
            value={carVariant}
            onChange={selectVehicleModel}
          />
          <View style={styles.cinemaCameraRow}>
            {CINEMATIC_CAMERAS.map((item) => {
              const active = cameraMode === item.id;
              return (
                <Pressable
                  accessibilityLabel={`${item.label} cinematic camera`}
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => {
                    selectCameraMode(item.id);
                  }}
                  style={[styles.cinemaCameraChoice, active && styles.cinemaCameraChoiceActive]}>
                  <MaterialCommunityIcons
                    color={active ? '#07121B' : '#B9D1E3'}
                    name={item.icon}
                    size={17}
                  />
                  <Text
                    style={[
                      styles.cinemaCameraText,
                      active && styles.cinemaCameraTextActive,
                    ]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Native-map camera modes stay selected until the user changes mode. */}
      <View
        onLayout={(event) => measureOverlay('camera', event)}
        pointerEvents={cinematicMode ? 'none' : 'box-none'}
        style={[
          styles.cameraModeBar,
          { top: cameraBarTop },
          cinematicMode && styles.hiddenControls,
        ]}>
        {CAMERA_MODE_ORDER.map((mode) => {
          const active =
            cameraMode === mode &&
            !autoFollowSuspended &&
            (mode === 'overview' ? !isFollowing : isFollowing);
          return (
            <Pressable
              accessibilityLabel={`${CAMERA_MODES[mode].label} camera`}
              accessibilityRole="button"
              key={mode}
              onPress={() => selectCameraMode(mode)}
              style={[styles.cameraChip, active && styles.cameraChipActive]}>
              <MaterialCommunityIcons
                color={active ? '#fff' : BRAND.green}
                name={CAMERA_MODES[mode].icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                size={18}
              />
              <Text style={[styles.cameraChipText, active && styles.cameraChipTextActive]}>
                {CAMERA_MODES[mode].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Animated.View
        onLayout={handleSheetLayout}
        {...sheetPanResponder.panHandlers}
        style={[
          styles.bottomSheet,
          {
            paddingBottom: 14,
            transform: [{ translateY: sheetTranslateY }],
          },
        ]}>
        <Pressable
          accessibilityLabel={sheetExpanded ? 'Collapse details' : 'Expand details'}
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => snapSheet(!sheetExpandedRef.current)}
          style={styles.sheetHandleHit}>
          <View style={styles.sheetHandle} />
        </Pressable>
        <View style={styles.sheetHeader}>
          <View style={styles.deviceAvatar}>
            <MaterialCommunityIcons color={BRAND.greenGlow} name="car-sports" size={38} />
          </View>
          <View style={styles.deviceInfo}>
            <Text numberOfLines={1} style={styles.deviceName}>
              {vehicleName}
            </Text>
            <Text numberOfLines={2} style={styles.deviceAddress}>
              {currentAddress}
            </Text>
          </View>
          <View style={styles.speedBlock}>
            <SmoothSpeed value={currentSpeed} />
            <Text style={styles.speedLabel}>km/h</Text>
          </View>
        </View>

        {/* LIVE screen: no progress bar, playback rate chips, or scrubber. The
            marker always tracks the newest streamed fix. */}

        {sheetExpanded ? (
          <Pressable
            accessibilityLabel={toolsExpanded ? 'Close map tools' : 'Open map tools'}
            accessibilityRole="button"
            onPress={() => setToolsExpanded((current) => !current)}
            style={[styles.toolsToggle, toolsExpanded && styles.toolsToggleActive]}>
            <View style={styles.toolsToggleLabel}>
              <MaterialCommunityIcons
                color={toolsExpanded ? '#07121B' : BRAND.greenGlow}
                name="tune-variant"
                size={19}
              />
              <Text style={[styles.toolsToggleText, toolsExpanded && styles.toolsToggleTextActive]}>
                Map tools
              </Text>
            </View>
            <Text style={[styles.toolsToggleHint, toolsExpanded && styles.toolsToggleTextActive]}>
              {toolsExpanded ? 'Done' : '11 controls'}
            </Text>
          </Pressable>
        ) : null}

        {sheetExpanded && toolsExpanded ? (
          <MapToolsPanel
            activeId={selectedOptionId}
            alertActive={isAlertActive}
            following={isFollowing}
            historyVisible={false}
            nightMode={isNightMode}
            routeVisible={isTrafficVisible}
            satelliteMode={isSatelliteMode}
            onSelect={handleRouteTool}
          />
        ) : null}

        {sheetExpanded && !toolsExpanded && selectedOptionData ? (
          <RouteOptionDataPanel data={selectedOptionData} onClose={() => setSelectedOptionId(null)} />
        ) : null}

        {sheetExpanded && !toolsExpanded ? (
          <>
            <View style={styles.sheetModelPicker}>
              <VehicleModelPicker
                compact
                errorMessage={modelLoadError}
                loading={modelLoadState === 'loading'}
                onChange={selectVehicleModel}
                value={carVariant}
              />
            </View>
            <View style={styles.sheetStats}>
              <Metric icon="clock-outline" label="Ping Time" value={pingTime} />
              <Metric icon="map-marker-distance" label="Covered" value={`${coveredKm.toFixed(1)} km`} />
              <Metric icon="flag-checkered" label="Trip" value={`${totalDistanceKm.toFixed(1)} km`} />
            </View>
            <View style={[styles.sheetStats, styles.sheetStatsSecondary]}>
              <Metric
                icon="engine-outline"
                label="Ignition"
                value={live.latest?.ignition == null ? 'Unknown' : live.latest.ignition ? 'On' : 'Off'}
              />
              <Metric
                icon="access-point"
                label="GPS"
                value={live.connected && !isLiveStale ? 'Connected' : isLiveStale ? 'Delayed' : 'Offline'}
              />
              <Metric icon="car-info" label="Status" value={status} />
            </View>

            <View style={styles.sheetActions}>
              <Pressable
                accessibilityLabel="Follow live vehicle"
                accessibilityRole="button"
                onPress={jumpToLive}
                style={[styles.primaryAction, styles.primaryActionStopped]}>
                <MaterialCommunityIcons color="#fff" name="crosshairs-gps" size={25} />
                <Text style={styles.primaryActionText}>Follow live</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Center vehicle"
                accessibilityRole="button"
                onPress={() => handleRouteTool('location')}
                style={styles.secondaryAction}>
                <MaterialCommunityIcons color={BRAND.greenGlow} name="crosshairs-gps" size={24} />
              </Pressable>
              <Pressable
                accessibilityLabel="Open route history"
                accessibilityRole="button"
                onPress={() => handleRouteTool('history')}
                style={styles.secondaryAction}>
                <MaterialCommunityIcons color={BRAND.orange} name="history" size={24} />
              </Pressable>
            </View>
          </>
        ) : null}

        {!sheetExpanded ? (
          <Pressable
            accessibilityLabel="Expand vehicle details"
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            onPress={() => snapSheet(true)}
            style={styles.collapsedSheetTapTarget}
          />
        ) : null}
      </Animated.View>

      {toastText ? (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              top: Math.min(
                topOverlayBottom + 8,
                Math.max(headerTop, mapSize.height - 72)
              ),
            },
          ]}>
          <Text numberOfLines={1} style={styles.toastText}>
            {toastText}
          </Text>
        </View>
      ) : null}

    </SafeAreaView>
  );
}

function MapToolsPanel({
  activeId,
  alertActive,
  following,
  historyVisible,
  nightMode,
  onSelect,
  routeVisible,
  satelliteMode,
}: {
  activeId: RouteMapOptionId | null;
  alertActive: boolean;
  following: boolean;
  historyVisible: boolean;
  nightMode: boolean;
  onSelect: (id: RouteMapOptionId) => void;
  routeVisible: boolean;
  satelliteMode: boolean;
}) {
  const activeFor = (id: RouteMapOptionId) => {
    if (id === 'follow') return following;
    if (id === 'alert') return alertActive;
    if (id === 'history') return historyVisible;
    if (id === 'night') return nightMode;
    if (id === 'traffic') return routeVisible;
    if (id === 'mapType') return satelliteMode;
    return activeId === id;
  };
  return (
    <View style={styles.mapToolsGrid}>
      {ROUTE_TOOLS.map((tool) => {
        const active = activeFor(tool.id);
        const danger = tool.id === 'alert' && alertActive;
        return (
          <Pressable
            accessibilityLabel={tool.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={tool.id}
            onPress={() => onSelect(tool.id)}
            style={[
              styles.mapTool,
              active && styles.mapToolActive,
              danger && styles.mapToolDanger,
            ]}>
            <MaterialCommunityIcons
              color={danger ? '#FF7A7D' : active ? '#2BE69E' : '#AFC1D0'}
              name={tool.icon}
              size={20}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.mapToolText,
                active && styles.mapToolTextActive,
                danger && styles.mapToolTextDanger,
              ]}>
              {tool.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RouteOptionDataPanel({
  data,
  onClose,
}: {
  data: RouteOptionData;
  onClose: () => void;
}) {
  return (
    <View style={[styles.optionPanel, data.tone === 'red' && styles.optionPanelRed]}>
      <View style={styles.optionHeader}>
        <View style={[styles.optionIconWrap, data.tone === 'red' && styles.optionIconWrapRed]}>
          <MaterialCommunityIcons color="#fff" name={data.icon} size={20} />
        </View>
        <View style={styles.optionTextBlock}>
          <Text numberOfLines={1} style={styles.optionTitle}>
            {data.title}
          </Text>
          <Text numberOfLines={2} style={styles.optionSummary}>
            {data.summary}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.optionCloseButton}>
          <MaterialCommunityIcons color={BRAND.muted} name="close" size={18} />
        </Pressable>
      </View>
      <View style={styles.optionMetrics}>
        {data.metrics.map((metric) => (
          <View key={metric.label} style={styles.optionMetric}>
            <Text numberOfLines={1} style={styles.optionMetricValue}>
              {metric.value}
            </Text>
            <Text numberOfLines={1} style={styles.optionMetricLabel}>
              {metric.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RouteMapStateOverlay({
  message,
  onRetry,
  state,
}: {
  message: string;
  onRetry?: () => void;
  state: MapLoadState;
}) {
  const isLoading = state === 'loading';

  return (
    <View pointerEvents={isLoading ? 'none' : 'box-none'} style={styles.mapStateOverlay}>
      <View style={styles.mapStatePanel}>
        {isLoading ? (
          <ActivityIndicator color={BRAND.green} size="large" />
        ) : (
          <MaterialCommunityIcons color={BRAND.red} name="map-marker-alert-outline" size={36} />
        )}
        <Text style={styles.mapStateTitle}>{isLoading ? 'Map Loading' : 'Map Unavailable'}</Text>
        <Text style={styles.mapStateMessage}>{message}</Text>
        {!isLoading && onRetry ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.mapRetryButton}>
            <MaterialCommunityIcons color="#fff" name="refresh" size={18} />
            <Text style={styles.mapRetryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const SmoothSpeed = memo(function SmoothSpeed({ value }: { value: number }) {
  const currentRef = useRef(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const from = currentRef.current;
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      const fraction = Math.min(1, (Date.now() - startedAt) / 360);
      const eased = 1 - (1 - fraction) ** 3;
      const next = from + (value - from) * eased;
      currentRef.current = next;
      setDisplay(Math.round(next));
      if (fraction < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <Text style={styles.speedValue}>{display}</Text>;
});

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <MaterialCommunityIcons color={BRAND.green} name={icon} size={18} />
      <View>
        <Text numberOfLines={1} style={styles.metricValue}>
          {value}
        </Text>
        <Text numberOfLines={1} style={styles.metricLabel}>
          {label}
        </Text>
      </View>
    </View>
  );
}



function formatPingTime(date: Date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear().toString().slice(-2);
  const time = date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${day} ${month} ${year}, ${time}`;
}

function formatCoordinate(coordinate: Coordinate) {
  return `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: BRAND.mapMint,
    flex: 1,
  },
  playbackStateBox: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  playbackStateText: {
    color: BRAND.ink,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  mapCanvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BRAND.mapMint,
    minHeight: 1,
    minWidth: 1,
  },
  mapShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  mapStateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  mapStatePanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 15, 27, 0.96)',
    borderColor: 'rgba(255, 255, 255, 0.13)',
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 310,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#020712',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    width: '100%',
  },
  mapStateTitle: {
    color: '#F3F8FD',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 10,
    textAlign: 'center',
  },
  mapStateMessage: {
    color: '#91A6B9',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
    marginTop: 5,
    textAlign: 'center',
  },
  mapRetryButton: {
    alignItems: 'center',
    backgroundColor: BRAND.green,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 7,
    height: 40,
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 16,
  },
  mapRetryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 15, 27, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    left: 18,
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: 'absolute',
    right: 18,
    shadowColor: '#020712',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
  },
  headerIconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 38,
  },
  headerCinemaActive: {
    backgroundColor: BRAND.greenGlow,
    borderRadius: 13,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: '#F3F8FD',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerSubtitle: {
    color: '#8FA5B9',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    marginTop: 4,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 12,
    justifyContent: 'center',
    minWidth: 72,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  statusPillActive: {
    backgroundColor: BRAND.green,
  },
  statusPillStopped: {
    backgroundColor: BRAND.red,
  },
  statusPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  livePill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    left: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    shadowColor: '#1b1f24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  livePillActive: {
    backgroundColor: 'rgba(5, 101, 42, 0.94)',
    borderColor: 'rgba(43, 230, 158, 0.6)',
  },
  livePillIdle: {
    backgroundColor: 'rgba(22, 32, 44, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  liveDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  livePillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  resumeTrackingButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: BRAND.greenGlow,
    borderRadius: 18,
    elevation: 4,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    position: 'absolute',
    shadowColor: '#020712',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
  },
  resumeTrackingText: {
    color: '#07121B',
    fontSize: 11,
    fontWeight: '900',
  },
  hiddenControls: {
    opacity: 0,
  },
  cinemaControlDeck: {
    backgroundColor: 'rgba(6, 13, 23, 0.88)',
    borderColor: 'rgba(83, 216, 255, 0.22)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 9,
    left: 18,
    padding: 10,
    position: 'absolute',
    right: 18,
    shadowColor: '#020712',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  cinemaControlHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cinemaLiveTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cinemaLiveSignal: {
    backgroundColor: '#2BE6FF',
    borderRadius: 6,
    height: 10,
    shadowColor: '#2BE6FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    width: 10,
  },
  cinemaLiveSignalLoading: {
    backgroundColor: '#FF9D5C',
    shadowColor: '#FF9D5C',
  },
  cinemaEyebrow: {
    color: '#65D9FF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  cinemaTitle: {
    color: '#F3FAFF',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 1,
  },
  cinemaCameraRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  cinemaCameraChoice: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  cinemaCameraChoiceActive: {
    backgroundColor: '#2BE6FF',
    borderColor: '#2BE6FF',
  },
  cinemaCameraText: {
    color: '#B9D1E3',
    fontSize: 9,
    fontWeight: '800',
  },
  cinemaCameraTextActive: {
    color: '#07121B',
  },
  cameraModeBar: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 8,
    position: 'absolute',
    right: 0,
  },
  cameraChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 15, 27, 0.9)',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: '#020712',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  cameraChipActive: {
    backgroundColor: BRAND.green,
    borderColor: BRAND.green,
  },
  cameraChipText: {
    color: '#DCE8F2',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  cameraChipTextActive: {
    color: '#fff',
  },
  liveVehicleMarker: {
    alignItems: 'center',
    height: LIVE_MARKER_SIZE,
    justifyContent: 'center',
    width: LIVE_MARKER_SIZE,
  },
  markerStatusCircle: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 28,
    borderWidth: 2,
    height: 56,
    left: 4,
    position: 'absolute',
    top: 4,
    width: 56,
  },
  markerShadow: {
    backgroundColor: 'rgba(3, 10, 18, 0.32)',
    borderRadius: 18,
    height: 12,
    position: 'absolute',
    top: 29,
    transform: [{ scaleX: 1.25 }],
    width: 34,
  },
  markerVehicleImage: {
    height: 58,
    width: 58,
  },
  bottomSheet: {
    backgroundColor: 'rgba(7, 15, 27, 0.97)',
    borderColor: 'rgba(255,255,255,0.13)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: 'absolute',
    right: 0,
    shadowColor: '#020712',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.42,
    shadowRadius: 24,
  },
  sheetHandleHit: {
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 2,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(190, 210, 228, 0.34)',
    borderRadius: 2,
    height: 4,
    marginBottom: 4,
    width: 44,
  },
  collapsedSheetTapTarget: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 20,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  deviceAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(43, 230, 158, 0.1)',
    borderColor: 'rgba(43, 230, 158, 0.22)',
    borderRadius: 16,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 70,
  },
  deviceInfo: {
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    color: '#F3F8FD',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  deviceAddress: {
    color: '#8FA5B9',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 4,
  },
  speedBlock: {
    alignItems: 'center',
    minWidth: 60,
  },
  speedValue: {
    color: BRAND.greenGlow,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  speedLabel: {
    color: '#8FA5B9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  progressTrack: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 4,
    height: 8,
    marginTop: 13,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: BRAND.green,
    borderRadius: 4,
    height: '100%',
  },
  rateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  rateLabel: {
    color: '#8FA5B9',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  rateChips: {
    flexDirection: 'row',
    gap: 6,
  },
  rateChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 38,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  rateChipActive: {
    backgroundColor: BRAND.green,
  },
  rateChipText: {
    color: '#C8D6E3',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  rateChipTextActive: {
    color: '#fff',
  },
  toolsToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  toolsToggleActive: {
    backgroundColor: BRAND.greenGlow,
    borderColor: BRAND.greenGlow,
  },
  toolsToggleLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  toolsToggleText: {
    color: '#E5EEF5',
    fontSize: 12,
    fontWeight: '900',
  },
  toolsToggleTextActive: {
    color: '#07121B',
  },
  toolsToggleHint: {
    color: '#8198AA',
    fontSize: 10,
    fontWeight: '800',
  },
  mapToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  mapTool: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 11,
    borderWidth: 1,
    flexBasis: '22%',
    flexGrow: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 5,
    paddingVertical: 7,
  },
  mapToolActive: {
    backgroundColor: 'rgba(43,230,158,0.1)',
    borderColor: 'rgba(43,230,158,0.5)',
  },
  mapToolDanger: {
    backgroundColor: 'rgba(251,47,50,0.09)',
    borderColor: 'rgba(251,47,50,0.42)',
  },
  mapToolText: {
    color: '#93A7B8',
    fontSize: 9,
    fontWeight: '800',
  },
  mapToolTextActive: {
    color: '#DDF9EE',
  },
  mapToolTextDanger: {
    color: '#FF9A9D',
  },
  optionPanel: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(43, 230, 158, 0.18)',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    padding: 11,
  },
  optionPanelRed: {
    backgroundColor: 'rgba(251, 47, 50, 0.07)',
    borderColor: 'rgba(251, 47, 50, 0.24)',
  },
  optionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  optionIconWrap: {
    alignItems: 'center',
    backgroundColor: BRAND.green,
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  optionIconWrapRed: {
    backgroundColor: BRAND.red,
  },
  optionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    color: '#E9F4FC',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  optionSummary: {
    color: '#8FA5B9',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 15,
    marginTop: 2,
  },
  optionCloseButton: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 28,
  },
  optionMetrics: {
    borderColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 9,
  },
  optionMetric: {
    flex: 1,
    minWidth: 0,
  },
  optionMetricValue: {
    color: '#EDF5FB',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  optionMetricLabel: {
    color: '#7990A6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  sheetStats: {
    borderColor: 'rgba(255,255,255,0.09)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
    paddingTop: 12,
  },
  sheetModelPicker: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    padding: 8,
  },
  sheetStatsSecondary: {
    borderTopWidth: 0,
    marginTop: 2,
    paddingTop: 2,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 43,
  },
  metricValue: {
    color: '#EDF5FB',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricLabel: {
    color: '#7F96AA',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    marginTop: 2,
  },
  sheetActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: BRAND.orange,
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 48,
    justifyContent: 'center',
  },
  primaryActionStopped: {
    backgroundColor: BRAND.green,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 50,
  },
  toast: {
    alignSelf: 'center',
    backgroundColor: 'rgba(22, 32, 44, 0.9)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    position: 'absolute',
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  historyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(20, 32, 30, 0.62)',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  historyCard: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 26,
    paddingVertical: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    width: '100%',
  },
  historyTitle: {
    color: BRAND.green,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  historyRule: {
    backgroundColor: BRAND.green,
    borderRadius: 1,
    height: 2,
    marginTop: 14,
    width: '52%',
  },
  historySubtitle: {
    color: '#141b23',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
    marginBottom: 20,
    marginTop: 20,
  },
  historyOption: {
    alignItems: 'center',
    borderColor: '#249cff',
    borderRadius: 8,
    borderWidth: 2,
    height: 50,
    justifyContent: 'center',
    marginTop: 12,
    width: '100%',
  },
  historyOptionText: {
    color: '#249cff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
