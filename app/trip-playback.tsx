import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  LayoutChangeEvent,
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
  StableBaseRoute,
  StableRouteLine,
} from '@/src/components/StableRouteLayers';
import {
  getVehicleModel,
  Vehicle3DMarker,
  type CarVariant,
} from '@/src/components/Vehicle3DMarker';
import { VehicleModelPicker } from '@/src/components/VehicleModelPicker';
import { apiErrorMessage } from '@/src/services/apiError';
import { useGetDevicePlaybackQuery } from '@/src/services/devicesApi';
import { getMapStyleInfo } from '@/src/services/mapStyle';
import {
  buildPlaybackTrack,
  haversineKm,
  sampleAt,
  type PlaybackTrack,
} from '@/src/services/playbackEngine';
import { normalizeHeading } from '@/src/services/vehicleMarkerAssets';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { setVehicleModelPreference } from '@/src/store/vehiclePreferencesSlice';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { PlaybackEventMarker, PlaybackStopMarker } from '@/src/types/api';

const SPEEDS = [0.5, 1, 2, 4, 8] as const;
type CameraMode = 'follow' | 'chase' | 'cinematic' | 'drone' | 'top' | 'overview';
const CAMERAS: { id: CameraMode; icon: string; label: string }[] = [
  { id: 'follow', icon: 'navigation-variant', label: 'Follow' },
  { id: 'chase', icon: 'car-sports', label: 'Chase' },
  { id: 'cinematic', icon: 'movie-open', label: 'Cinematic' },
  { id: 'drone', icon: 'orbit', label: 'Drone' },
  { id: 'top', icon: 'crosshairs-gps', label: 'Top' },
  { id: 'overview', icon: 'fit-to-page-outline', label: 'Overview' },
];

// Cinematic overlay palette (fixed night-scene glass, independent of app theme).
const G = {
  glass: 'rgba(10,14,22,0.66)',
  glassStrong: 'rgba(8,11,18,0.82)',
  hair: 'rgba(255,255,255,0.12)',
  text: '#EAF1F8',
  sub: '#9FB2C4',
  track: 'rgba(255,255,255,0.14)',
};

/** Returns today as a YYYY-MM-DD string in local time. */
function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD string by `delta` days. */
function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format YYYY-MM-DD to human label ("Today", "Yesterday", or "23 Jul"). */
function labelDate(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return 'Today';
  if (dateStr === shiftDate(today, -1)) return 'Yesterday';
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function TripPlaybackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ deviceId?: string; name?: string }>();
  const deviceId = Number(params.deviceId);
  const devicePreferenceKey = String(deviceId);
  const dispatch = useAppDispatch();
  const preferredModel = useAppSelector(
    (state) => state.vehiclePreferences.modelByDevice[devicePreferenceKey]
  );

  // Date filter — defaults to today. Shifting builds `from` / `to` ISO strings
  // so the backend (and demo) anchor their data to the selected calendar day.
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const today = todayStr();
  const isPast = selectedDate < today;

  const fromIso = useMemo(() => `${selectedDate}T00:00:00.000Z`, [selectedDate]);
  const toIso = useMemo(() => `${selectedDate}T23:59:59.999Z`, [selectedDate]);

  const { data, isFetching, isError, error, refetch } = useGetDevicePlaybackQuery(
    { deviceId, from: fromIso, to: toIso },
    { skip: !Number.isFinite(deviceId) }
  );

  const [playing, setPlaying] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [camera, setCamera] = useState<CameraMode>('cinematic');
  const [cameraCommandId, setCameraCommandId] = useState(0);
  const [carVariant, setCarVariant] = useState<CarVariant>(preferredModel ?? 'black');
  const [modelLoadState, setModelLoadState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [ui, setUi] = useState(0); // throttled progress for UI (0..1)
  const [mapReady, setMapReady] = useState(false);

  const progressRef = useRef(0);
  const playingRef = useRef(playing);
  const speedRef = useRef<number>(speed);
  const trackWidth = useRef(0);
  playingRef.current = playing;
  speedRef.current = speed;

  const haptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (preferredModel && preferredModel !== carVariant) {
      setCarVariant(preferredModel);
      setModelLoadState('loading');
      setModelLoadError(null);
    }
  }, [carVariant, preferredModel]);

  const selectVehicleModel = useCallback(
    (variant: CarVariant) => {
      haptic();
      setCarVariant(variant);
      setModelLoadState('loading');
      setModelLoadError(null);
      dispatch(setVehicleModelPreference({ deviceKey: devicePreferenceKey, variant }));
      if (__DEV__) console.debug(`[VehicleModel] selected ${variant}`);
    },
    [devicePreferenceKey, dispatch, haptic]
  );

  const handleModelLoadState = useCallback(
    (state: 'loading' | 'ready' | 'error', message?: string) => {
      setModelLoadState(state);
      setModelLoadError(state === 'error' ? message ?? '3D model unavailable.' : null);
    },
    []
  );

  const track = useMemo(() => buildPlaybackTrack(data?.points ?? []), [data?.points]);
  const points = track.points;
  /** A day only has playable history when there are at least two real fixes. */
  const hasTrack = points.length >= 2;
  const showLoading = isFetching && !data;

  /**
   * Rewind whenever the loaded day changes.
   *
   * The clock, covered distance, progress bar and the vehicle's position are all
   * derived from `progressRef`, so resetting it here is what moves the vehicle
   * back to the start of the newly selected day's route instead of leaving it
   * parked at the previous day's finishing position.
   */
  useEffect(() => {
    progressRef.current = 0;
    setUi(0);
    setPlaying(hasTrack);
  }, [data, hasTrack, selectedDate]);

  // Real trip duration (for the clock readout) and event tick fractions.
  const timing = useMemo(() => {
    if (points.length < 2) return { start: 0, end: 1, durationMin: 0 };
    const start = new Date(points[0].t).getTime();
    const end = start + track.totalDurationMs;
    return { start, end, durationMin: Math.max(0, (end - start) / 60000) };
  }, [points, track.totalDurationMs]);

  const eventTicks = useMemo(() => {
    if (!data || timing.end <= timing.start) return [];
    return data.events.map((e) => ({
      frac: Math.max(0, Math.min(1, (new Date(e.t).getTime() - timing.start) / (timing.end - timing.start))),
      type: e.eventType,
    }));
  }, [data, timing]);

  // 60fps clock — advances the ref (drives 3D) and throttles UI state at ~12fps.
  useEffect(() => {
    let raf: number;
    let lastUi = 0;
    let last = Date.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (appActive && playingRef.current && points.length >= 2 && mapReady) {
        progressRef.current +=
          ((dt * 1000) / Math.max(1, track.totalDurationMs)) * speedRef.current;
        if (progressRef.current >= 1) {
          progressRef.current = 1;
          setPlaying(false);
        }
      }
      if (now - lastUi > 40) {
        lastUi = now;
        setUi(progressRef.current);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [appActive, mapReady, points.length, track.totalDurationMs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const seek = (frac: number) => {
    const clamped = Math.max(0, Math.min(1, frac));
    progressRef.current = clamped;
    setUi(clamped);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          if (trackWidth.current > 0) seek(e.nativeEvent.locationX / trackWidth.current);
        },
        onPanResponderMove: (e) => {
          if (trackWidth.current > 0) seek(e.nativeEvent.locationX / trackWidth.current);
        },
      }),
    []
  );

  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const restart = useCallback(() => {
    haptic();
    seek(0);
    setPlaying(true);
  }, [haptic]);
  const togglePlay = useCallback(() => {
    haptic();
    if (progressRef.current >= 1) restart();
    else setPlaying((p) => !p);
  }, [haptic, restart]);
  const handleMapReady = useCallback(() => setMapReady(true), []);

  // Reset + refetch when the user changes the date.
  const changeDate = useCallback((delta: number) => {
    const next = shiftDate(selectedDate, delta);
    if (next > today) return; // can't go future
    setSelectedDate(next);
    seek(0);
    setPlaying(false);
  }, [selectedDate, today]);

  if (!Number.isFinite(deviceId)) {
    return <Center text="No vehicle selected." />;
  }

  const currentSample = hasTrack ? sampleAt(track, ui * track.totalDurationMs) : null;
  const curSpeed = Math.round(currentSample?.speed ?? 0);
  const elapsedMin = hasTrack ? timing.durationMin * ui : 0;
  const coveredDistanceKm = currentSample?.distanceKm ?? 0;

  return (
    <SafeAreaView edges={['bottom']} style={styles.root}>
      {/* The map is only mounted once there is a real route for the selected
          day. Every other state (loading, error, no history) is shown as an
          overlay so the date selector below stays on screen and usable —
          previously an empty day replaced the whole screen and stranded the
          user with no way back to a day that does have history. */}
      {hasTrack && data ? (
        <CinematicTripMap
          accent={colors.primary}
          cameraCommandId={cameraCommandId}
          cameraMode={camera}
          carVariant={carVariant}
          events={data.events}
          onReady={handleMapReady}
          onModelLoadState={handleModelLoadState}
          playing={appActive && playing}
          speed={speed}
          stops={data.stops}
          track={track}
          ui={ui}
        />
      ) : (
        <View style={styles.mapPlaceholder}>
          {showLoading ? (
            <>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.placeholderText}>Loading route history…</Text>
            </>
          ) : isError ? (
            <>
              <MaterialCommunityIcons color={G.sub} name="cloud-alert" size={44} />
              <Text style={styles.placeholderTitle}>Route history unavailable</Text>
              <Text style={styles.placeholderText}>{apiErrorMessage(error)}</Text>
              <Pressable accessibilityRole="button" onPress={refetch} style={styles.retry}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : (
            <>
              <MaterialCommunityIcons color={G.sub} name="map-marker-off-outline" size={44} />
              <Text style={styles.placeholderTitle}>No history available</Text>
              <Text style={styles.placeholderText}>
                {labelDate(selectedDate)} has no recorded trip for this vehicle. Use the arrows
                above to pick another day.
              </Text>
            </>
          )}
        </View>
      )}


      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons color={G.text} name="arrow-left" size={22} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>{params.name ?? `Vehicle #${deviceId}`}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {hasTrack && data
              ? `${data.distanceKm.toFixed(1)} km · ${Math.round(timing.durationMin)} min · ${data.returnedPoints} pts`
              : isFetching
                ? 'Loading route history…'
                : isError
                  ? 'History unavailable'
                  : 'No history available'}
          </Text>
        </View>
        {/* Route-history date selector. Always mounted — including while the
            selected day is loading, errored or empty — so the arrows can always
            move to another day. */}
        <View style={styles.datePicker}>
          <Pressable
            accessibilityLabel="Previous day"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => changeDate(-1)}
            style={styles.dateArrow}>
            <MaterialCommunityIcons color={G.text} name="chevron-left" size={18} />
          </Pressable>
          {isFetching ? (
            <View style={styles.dateLabelSlot}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          ) : (
            <Text numberOfLines={1} style={styles.dateLabel}>
              {labelDate(selectedDate)}
            </Text>
          )}
          <Pressable
            accessibilityLabel="Next day"
            accessibilityRole="button"
            accessibilityState={{ disabled: !isPast }}
            disabled={!isPast}
            hitSlop={8}
            onPress={() => changeDate(1)}
            style={[styles.dateArrow, !isPast && { opacity: 0.3 }]}>
            <MaterialCommunityIcons color={G.text} name="chevron-right" size={18} />
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel="Reload trip history"
          accessibilityRole="button"
          disabled={isFetching}
          hitSlop={12}
          onPress={() => refetch()}
          style={styles.iconBtn}>
          {isFetching ? (
            <ActivityIndicator color={G.text} size="small" />
          ) : (
            <MaterialCommunityIcons color={G.text} name="refresh" size={20} />
          )}
        </Pressable>
      </View>

      {/* Scene, model and camera controls only make sense over a real route. */}
      {hasTrack ? (
      <View
        pointerEvents="none"
        style={[styles.sceneBadge, { top: insets.top + 68 }]}>
          <View style={styles.sceneSignal} />
          <View>
            <Text style={styles.sceneEyebrow}>
              {ui >= 1 ? 'ROUTE COMPLETE' : 'NATIVE 3D MAP'}
            </Text>
            <Text style={styles.sceneMode}>
              {ui >= 1
                ? 'Completed · 100%'
                : `${CAMERAS.find((item) => item.id === camera)?.label} camera`}
            </Text>
          </View>
          <MaterialCommunityIcons
            color={G.text}
            name="map-outline"
            size={16}
          />
      </View>
      ) : null}

      {hasTrack ? (
      <View style={[styles.carPicker, { top: insets.top + 116 }]}>
        <VehicleModelPicker
          compact
          errorMessage={modelLoadError}
          loading={modelLoadState === 'loading'}
          value={carVariant}
          onChange={selectVehicleModel}
        />
      </View>
      ) : null}

      {/* Camera mode rail drives the existing map without remounting it. */}
      {hasTrack ? (
      <View style={[styles.camRail, { top: insets.top + 64 }]}>
        {CAMERAS.map((cam) => {
          const active = cam.id === camera;
          return (
            <Pressable
              key={cam.id}
              accessibilityLabel={cam.label}
              onPress={() => {
                haptic();
                setCamera(cam.id);
                setCameraCommandId((value) => value + 1);
                if (__DEV__) console.debug(`[Camera] mode ${cam.id}`);
              }}
              style={[styles.camBtn, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <MaterialCommunityIcons color={active ? colors.onPrimary : G.text} name={cam.icon as never} size={18} />
              <Text style={[styles.camLabel, { color: active ? colors.onPrimary : G.sub }]}>{cam.label}</Text>
            </Pressable>
          );
        })}
      </View>
      ) : null}

      {/* Bottom control deck */}
      <View style={[styles.deck, { paddingBottom: 14 }]}>
        <View style={styles.statRow}>
          <View style={styles.speedBlock}>
            <Text style={styles.speedValue}>{curSpeed}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
          <View style={styles.statPair}>
            <Stat label="Elapsed" value={`${Math.floor(elapsedMin)}:${String(Math.floor((elapsedMin % 1) * 60)).padStart(2, '0')}`} />
            <Stat label="Covered" value={`${Math.round(ui * 100)}%`} />
            <Stat label="Distance" value={`${coveredDistanceKm.toFixed(1)} km`} />
          </View>
        </View>

        {/* Timeline. Scrubbing is only wired up when the day has a route. */}
        <View style={[styles.timelineWrap, !hasTrack && styles.deckDisabled]}>
          <View
            style={styles.track}
            onLayout={onTrackLayout}
            {...(hasTrack ? pan.panHandlers : {})}>
            <View style={[styles.trackFill, { width: `${ui * 100}%`, backgroundColor: colors.primary }]} />
            {eventTicks.map((t, i) => (
              <View key={i} style={[styles.tick, { left: `${t.frac * 100}%`, backgroundColor: G.text }]} />
            ))}
            <View style={[styles.thumb, { left: `${ui * 100}%`, borderColor: colors.primary }]} />
          </View>
        </View>

        <View style={[styles.controls, !hasTrack && styles.deckDisabled]}>
          <Pressable
            accessibilityLabel="Restart"
            accessibilityRole="button"
            disabled={!hasTrack}
            onPress={restart}
            style={styles.ctrlSmall}>
            <MaterialCommunityIcons color={G.text} name="restart" size={22} />
          </Pressable>
          <Pressable
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            accessibilityRole="button"
            disabled={!hasTrack}
            onPress={togglePlay}
            style={[styles.playBtn, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons color={colors.onPrimary} name={playing ? 'pause' : 'play'} size={30} />
          </Pressable>
          <View style={styles.speeds}>
            {SPEEDS.map((sp) => {
              const active = sp === speed;
              return (
                <Pressable
                  key={sp}
                  onPress={() => {
                    haptic();
                    setSpeed(sp);
                  }}
                  style={[styles.speedChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={[styles.speedChipText, { color: active ? colors.onPrimary : G.sub }]}>{sp}x</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Center({ text, spinner, onRetry }: { text: string; spinner?: boolean; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      {spinner ? <ActivityIndicator color="#22c55e" size="large" /> : (
        <MaterialCommunityIcons color={G.sub} name="movie-open-outline" size={48} />
      )}
      <Text style={styles.centerText}>{text}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function lerpAngle(start: number, end: number, t: number): number {
  const da = (((end - start) % 360) + 540) % 360 - 180;
  return normalizeHeading(start + da * t);
}

type CinematicTripMapProps = {
  accent: string;
  cameraCommandId: number;
  cameraMode: CameraMode;
  carVariant: CarVariant;
  events: PlaybackEventMarker[];
  onModelLoadState: (state: 'loading' | 'ready' | 'error', message?: string) => void;
  onReady: () => void;
  playing: boolean;
  speed: number;
  stops: PlaybackStopMarker[];
  track: PlaybackTrack;
  ui: number;
};

type ScreenPoint = { x: number; y: number };

function coordinateAhead(
  latitude: number,
  longitude: number,
  heading: number,
  meters: number
) {
  if (meters <= 0) return { latitude, longitude };
  const distance = meters / 6_371_000;
  const bearing = (normalizeHeading(heading) * Math.PI) / 180;
  const lat1 = (latitude * Math.PI) / 180;
  const lng1 = (longitude * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distance) +
      Math.cos(lat1) * Math.sin(distance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(distance) * Math.cos(lat1),
      Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    latitude: (lat2 * 180) / Math.PI,
    longitude: (lng2 * 180) / Math.PI,
  };
}

function isDisplayCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * Cinematic playback keeps the configured native map permanently mounted.
 * Route/event layers are rendered by the map SDK and the transparent 3D vehicle
 * is projected over its real coordinate, so the GL surface can never obscure
 * tiles, roads, labels or buildings.
 */
function CinematicTripMap({
  accent,
  cameraCommandId,
  cameraMode,
  carVariant,
  events,
  onModelLoadState,
  onReady,
  playing,
  speed,
  stops,
  track,
  ui,
}: CinematicTripMapProps) {
  const mapRef = useRef<MapView>(null);
  const mountedRef = useRef(true);
  const projectionRequestRef = useRef(0);
  const lastCameraAtRef = useRef(0);
  const lastCameraCoordinateRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastCameraModeRef = useRef<CameraMode | null>(null);
  const stableHeadingRef = useRef<number | null>(null);
  const lastProjectionAtRef = useRef(0);
  const readyReportedRef = useRef(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mapLoaded, setMapLoaded] = useState(Platform.OS === 'web');
  const [autoFollow, setAutoFollow] = useState(true);
  const [resumeRequest, setResumeRequest] = useState(0);
  const [mapCameraHeading, setMapCameraHeading] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [overlayPoint, setOverlayPoint] = useState<ScreenPoint | null>(null);
  const mapPadding = useMemo(
    () => ({
      top: Math.max(174, insets.top + 150),
      right: Math.max(88, Math.min(112, width * 0.18)),
      bottom: Math.max(244, insets.bottom + 226),
      left: Math.max(24, Math.min(36, width * 0.06)),
    }),
    [insets.bottom, insets.top, width]
  );
  const points = track.points;
  const routeCoords = useMemo(
    () =>
      sanitizeRouteCoordinates(
        points
          .filter((point) => isDisplayCoordinate(point.lat, point.lng))
          .map((point) => ({ latitude: point.lat, longitude: point.lng }))
      ),
    [points]
  );

  const cur = useMemo(() => {
    const sample = sampleAt(track, ui * track.totalDurationMs);
    return {
      lat: sample?.latitude ?? points[0]?.lat ?? 0,
      lng: sample?.longitude ?? points[0]?.lng ?? 0,
      heading: sample?.heading ?? 0,
      speed: sample?.speed ?? 0,
      atEnd: sample?.atEnd ?? false,
      completedPointCount: sample?.completedPointCount ?? 0,
      segmentIndex: sample?.segmentIndex ?? 0,
    };
  }, [points, track, ui]);
  const completedRouteCoords = useMemo(
    () =>
      sanitizeRouteCoordinates(
        points
          .slice(0, cur.completedPointCount)
          .map((point) => ({ latitude: point.lat, longitude: point.lng }))
      ),
    [cur.completedPointCount, points]
  );
  const progressTail = useMemo(() => {
    if (cur.atEnd) return [];
    const start = completedRouteCoords[completedRouteCoords.length - 1];
    if (
      !start ||
      haversineKm(start.latitude, start.longitude, cur.lat, cur.lng) < 0.0005
    ) {
      return [];
    }
    return [start, { latitude: cur.lat, longitude: cur.lng }];
  }, [completedRouteCoords, cur]);

  const styleInfo = getMapStyleInfo('dark');
  const webMarkers = useMemo<WebMapMarker[]>(
    () => [
      {
        category: getVehicleModel(carVariant).category.toUpperCase(),
        color: getVehicleModel(carVariant).paintColor || accent,
        heading: cur.heading,
        hidden: modelReady && overlayPoint != null,
        id: 'vehicle',
        lat: cur.lat,
        lng: cur.lng,
      },
    ],
    [accent, carVariant, cur, modelReady, overlayPoint]
  );
  const webPolyline = useMemo<[number, number][]>(
    () => points.map((p) => [p.lng, p.lat] as [number, number]),
    [points]
  );

  const validEvents = useMemo(
    () => events.filter((event) => isDisplayCoordinate(event.lat, event.lng)),
    [events]
  );
  const validStops = useMemo(
    () => stops.filter((stop) => isDisplayCoordinate(stop.lat, stop.lng)),
    [stops]
  );

  const reportReady = useCallback(() => {
    if (readyReportedRef.current) return;
    readyReportedRef.current = true;
    onReady();
  }, [onReady]);

  useEffect(() => {
    mountedRef.current = true;
    if (Platform.OS === 'web') reportReady();
    return () => {
      mountedRef.current = false;
      projectionRequestRef.current += 1;
    };
  }, [reportReady]);

  useEffect(() => {
    setModelReady(false);
    onModelLoadState('loading');
  }, [carVariant, onModelLoadState]);

  useEffect(() => {
    setAutoFollow(true);
    lastCameraAtRef.current = 0;
  }, [cameraCommandId]);

  const projectVehicle = useCallback(async (force = false) => {
    const instance = mapRef.current;
    if (!instance || !mapLoaded || !isDisplayCoordinate(cur.lat, cur.lng)) return;
    const now = Date.now();
    if (!force && now - lastProjectionAtRef.current < 40) return;
    lastProjectionAtRef.current = now;
    const request = ++projectionRequestRef.current;
    try {
      const [projected, camera] = await Promise.all([
        instance.pointForCoordinate({
          latitude: cur.lat,
          longitude: cur.lng,
        }),
        instance.getCamera(),
      ]);
      if (
        !mountedRef.current ||
        request !== projectionRequestRef.current ||
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y)
      ) {
        return;
      }
      // A stale SDK projection can briefly return a point far outside the map
      // during a camera transition. Keep the last valid screen position instead.
      if (
        projected.x >= -120 &&
        projected.x <= width + 120 &&
        projected.y >= -120 &&
        projected.y <= height + 120
      ) {
        const heading = Number.isFinite(camera.heading) ? normalizeHeading(camera.heading) : 0;
        setMapCameraHeading(heading);
        setOverlayPoint(projected);
      }
    } catch {
      // Projection can reject while the native map is changing regions.
    }
  }, [cur.lat, cur.lng, height, mapLoaded, width]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void projectVehicle(false);
  }, [projectVehicle]);

  useEffect(() => {
    if (Platform.OS === 'web' || !mapLoaded || !autoFollow || !mapRef.current) return;

    const now = Date.now();
    const modeChanged = lastCameraModeRef.current !== cameraMode;
    if (cameraMode === 'overview') {
      if (modeChanged) {
        mapRef.current.setCamera({ heading: 0, pitch: 0 });
        setMapCameraHeading(0);
        if (routeCoords.length === 1) {
          mapRef.current.animateCamera(
            { center: routeCoords[0], heading: 0, pitch: 0, zoom: 16 },
            { duration: 520 }
          );
        } else if (routeCoords.length >= 2) {
          mapRef.current.fitToCoordinates(routeCoords, {
            edgePadding: mapPadding,
            animated: true,
          });
        }
      }
      lastCameraModeRef.current = cameraMode;
      return;
    }
    if (!playing && !modeChanged) return;

    // Scale animation interval and duration according to playback speed
    const baseInterval = speed > 2 ? 160 : speed > 1 ? 220 : 280;
    const interval = modeChanged ? 0 : baseInterval;
    if (!modeChanged && now - lastCameraAtRef.current < interval) return;

    const previousCoordinate = lastCameraCoordinateRef.current;
    const movementKm = previousCoordinate
      ? haversineKm(
          previousCoordinate.latitude,
          previousCoordinate.longitude,
          cur.lat,
          cur.lng
        )
      : Number.POSITIVE_INFINITY;
    if (!modeChanged && movementKm < 0.0003) return;

    const rawHeading = Number.isFinite(cur.heading) ? normalizeHeading(cur.heading) : 0;
    const prevHeading = stableHeadingRef.current ?? rawHeading;
    // Smooth angle lerp to eliminate camera twisting/jittering
    const travelHeading = modeChanged
      ? rawHeading
      : lerpAngle(prevHeading, rawHeading, 0.32);
    stableHeadingRef.current = travelHeading;

    // Smooth continuous speed-based scaling without discrete steps
    const speedRatio = Math.min(1, Math.max(0, cur.speed / 100));
    let pitch = 28;
    let zoom = 16.2 - speedRatio * 0.5;
    let heading = 0;
    let forwardMeters = 8 + speedRatio * 14;

    if (cameraMode === 'chase') {
      pitch = 48;
      zoom = 16.4 - speedRatio * 0.6;
      heading = travelHeading;
      forwardMeters = 14 + speedRatio * 20;
    } else if (cameraMode === 'cinematic') {
      pitch = 55;
      zoom = 16.0 - speedRatio * 0.5;
      heading = travelHeading;
      forwardMeters = 16 + speedRatio * 22;
    } else if (cameraMode === 'drone') {
      pitch = 36;
      zoom = 14.2 - speedRatio * 0.6;
      heading = travelHeading;
      forwardMeters = 10 + speedRatio * 14;
    } else if (cameraMode === 'top') {
      pitch = 0;
      zoom = 16.5 - speedRatio * 0.6;
      heading = 0;
      forwardMeters = 0;
    }

    const center = coordinateAhead(cur.lat, cur.lng, travelHeading, forwardMeters);
    const duration = modeChanged ? 550 : Math.min(360, Math.max(180, Math.round(baseInterval * 1.1)));

    mapRef.current.animateCamera(
      { center, heading, pitch, zoom },
      { duration }
    );
    setMapCameraHeading(heading);
    lastCameraAtRef.current = now;
    lastCameraCoordinateRef.current = { latitude: cur.lat, longitude: cur.lng };
    lastCameraModeRef.current = cameraMode;
  }, [
    autoFollow,
    cameraMode,
    cur.heading,
    cur.lat,
    cur.lng,
    cur.speed,
    mapLoaded,
    mapPadding,
    playing,
    resumeRequest,
    routeCoords,
    speed,
  ]);

  const handleNativeMapReady = useCallback(() => {
    setMapLoaded(true);
    reportReady();
  }, [reportReady]);

  const syncProjectionDuringCamera = useCallback(() => {
    void projectVehicle(false);
  }, [projectVehicle]);

  const syncProjectionAfterCamera = useCallback(() => {
    void projectVehicle(true);
  }, [projectVehicle]);

  const handleWebProjection = useCallback((projection: WebMapProjection) => {
    const heading = normalizeHeading(projection.heading);
    setMapCameraHeading(heading);
    const point = projection.points.vehicle;
    if (point) setOverlayPoint(point);
  }, []);
  const projectedVehicleMarkers = useMemo<Fleet3DOverlayMarker[]>(
    () =>
      overlayPoint
        ? [
            {
              heading: normalizeHeading(cur.heading - mapCameraHeading),
              id: 'vehicle',
              isActive: playing,
              selected: true,
              speed: cur.speed,
              variant: carVariant,
              x: overlayPoint.x,
              y: overlayPoint.y,
            },
          ]
        : [],
    [carVariant, cur.heading, cur.speed, mapCameraHeading, overlayPoint, playing]
  );

  const pauseFollowing = useCallback(() => {
    setAutoFollow(false);
  }, []);

  const resumeFollowing = useCallback(() => {
    setAutoFollow(true);
    lastCameraAtRef.current = 0;
    lastCameraModeRef.current = null;
    setResumeRequest((value) => value + 1);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      {Platform.OS === 'web' ? (
        <FleetWebMap
          cameraMode={cameraMode}
          followSelected={autoFollow}
          mapStyle={styleInfo.webStyle}
          markers={webMarkers}
          onInteraction={pauseFollowing}
          onProjectionChange={handleWebProjection}
          polyline={webPolyline}
          selectedId="vehicle"
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <MapView
          ref={mapRef}
          customMapStyle={styleInfo.style}
          initialCamera={{
            center: routeCoords[0] ?? { latitude: 12.97, longitude: 77.59 },
            heading: 0,
            pitch: 45,
            zoom: 15.8,
          }}
          mapPadding={mapPadding}
          loadingBackgroundColor="#16202B"
          loadingEnabled
          loadingIndicatorColor={accent}
          moveOnMarkerPress={false}
          onMapReady={handleNativeMapReady}
          onPanDrag={pauseFollowing}
          onRegionChange={syncProjectionDuringCamera}
          onRegionChangeComplete={syncProjectionAfterCamera}
          onTouchStart={pauseFollowing}
          pitchEnabled
          rotateEnabled
          showsBuildings
          showsCompass={false}
          showsUserLocation={false}
          style={StyleSheet.absoluteFillObject}
          toolbarEnabled={false}>
          <StableBaseRoute
            auraColor="rgba(43,230,255,0.22)"
            coordinates={routeCoords}
            lineColor="rgba(151,171,190,0.72)"
            lineWidth={6}
          />
          <StableRouteLine color={accent} coordinates={completedRouteCoords} />
          <StableRouteLine color={accent} coordinates={progressTail} width={6} zIndex={13} />
          {validEvents.map((event, index) => (
            <Marker
              key={`${event.t}-${event.eventType}-${index}`}
              anchor={{ x: 0.5, y: 0.5 }}
              coordinate={{ latitude: event.lat, longitude: event.lng }}
              tracksViewChanges={false}
              zIndex={20}>
              <View style={styles.eventMarker}>
                <MaterialCommunityIcons color="#071018" name="alert" size={12} />
              </View>
            </Marker>
          ))}
          {validStops.map((stop, index) => (
            <Marker
              key={`${stop.from}-${stop.to}-${index}`}
              anchor={{ x: 0.5, y: 0.5 }}
              coordinate={{ latitude: stop.lat, longitude: stop.lng }}
              tracksViewChanges={false}
              zIndex={21}>
              <View style={styles.stopMarker}>
                <MaterialCommunityIcons color="#071018" name="parking" size={12} />
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {overlayPoint && mapLoaded ? (
        <>
          <Fleet3DOverlay
            height={height}
            markers={projectedVehicleMarkers}
            onModelError={(id, variant, message) => {
              if (id !== 'vehicle' || variant !== carVariant) return;
              setModelReady(false);
              onModelLoadState('error', message);
            }}
            onModelLoaded={(id, variant) => {
              if (id !== 'vehicle' || variant !== carVariant) return;
              setModelReady(true);
              onModelLoadState('ready');
            }}
            onModelLoadStart={(id, variant) => {
              if (id !== 'vehicle' || variant !== carVariant) return;
              setModelReady(false);
              onModelLoadState('loading');
            }}
            onUnavailable={(message) => {
              setModelReady(false);
              onModelLoadState('error', message);
            }}
            width={width}
          />
          {!modelReady ? (
            <View
              pointerEvents="none"
              style={[
                styles.mapVehicle,
                {
                  left: overlayPoint.x - 52,
                  top: overlayPoint.y - 52,
                },
              ]}>
              <View style={[styles.vehiclePulse, { borderColor: accent }]} />
              <Vehicle3DMarker
                heading={normalizeHeading(cur.heading - mapCameraHeading)}
                isActive={playing}
                renderMode="image"
                showImageFallback
                size={104}
                speed={cur.speed}
                variant={carVariant}
              />
            </View>
          ) : null}
        </>
      ) : null}

      {!autoFollow ? (
        <Pressable
          accessibilityLabel="Resume cinematic tracking"
          accessibilityRole="button"
          onPress={resumeFollowing}
          style={styles.resumeTracking}>
          <MaterialCommunityIcons color="#071018" name="crosshairs-gps" size={17} />
          <Text style={styles.resumeTrackingText}>Resume Cinematic Tracking</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#05070c', flex: 1 },
  center: { alignItems: 'center', backgroundColor: '#05070c', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  centerText: { color: G.sub, fontSize: 15, textAlign: 'center' },
  retry: { borderColor: '#22c55e', borderRadius: 10, borderWidth: 1, marginTop: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#22c55e', fontWeight: '800' },

  topBar: { alignItems: 'center', flexDirection: 'row', gap: 8, left: 0, paddingHorizontal: 14, position: 'absolute', right: 0, top: 0 },
  iconBtn: {
    alignItems: 'center', backgroundColor: G.glass, borderColor: G.hair, borderRadius: 12, borderWidth: 1,
    height: 40, justifyContent: 'center', width: 40,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { color: G.text, fontSize: 17, fontWeight: '900' },
  subtitle: { color: G.sub, fontSize: 12, marginTop: 1 },
  datePicker: {
    alignItems: 'center', backgroundColor: G.glass, borderColor: G.hair, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', gap: 2, paddingHorizontal: 4, paddingVertical: 6,
  },
  dateArrow: { alignItems: 'center', height: 28, justifyContent: 'center', width: 22 },
  dateLabel: { color: G.text, fontSize: 12, fontWeight: '800', minWidth: 58, textAlign: 'center' },
  dateLabelSlot: { alignItems: 'center', justifyContent: 'center', minWidth: 58 },

  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: '#05070c',
    gap: 10,
    justifyContent: 'center',
    paddingBottom: 200,
    paddingHorizontal: 34,
    paddingTop: 120,
  },
  placeholderTitle: { color: G.text, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  placeholderText: { color: G.sub, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  deckDisabled: { opacity: 0.35 },

  sceneBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(7, 14, 24, 0.8)',
    borderColor: 'rgba(83, 216, 255, 0.2)',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    left: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    position: 'absolute',
  },
  sceneSignal: {
    backgroundColor: '#2BE6FF',
    borderRadius: 5,
    height: 9,
    shadowColor: '#2BE6FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 7,
    width: 9,
  },
  sceneEyebrow: { color: '#53D8FF', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  sceneMode: { color: G.text, fontSize: 11, fontWeight: '800', marginTop: 1 },
  camRail: { gap: 8, position: 'absolute', right: 14 },
  camBtn: {
    alignItems: 'center', backgroundColor: G.glass, borderColor: G.hair, borderRadius: 12, borderWidth: 1,
    flexDirection: 'row', gap: 6, height: 40, justifyContent: 'flex-start', paddingHorizontal: 10, width: 92,
  },
  camLabel: { fontSize: 10, fontWeight: '800' },
  carPicker: {
    backgroundColor: 'rgba(7, 14, 24, 0.82)',
    borderColor: 'rgba(83, 216, 255, 0.18)',
    borderRadius: 14,
    borderWidth: 1,
    left: 14,
    padding: 8,
    position: 'absolute',
    right: 118,
  },
  eventMarker: {
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  stopMarker: {
    alignItems: 'center',
    backgroundColor: '#EAF1F8',
    borderColor: '#F59E0B',
    borderRadius: 999,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  mapVehicle: {
    alignItems: 'center',
    height: 104,
    justifyContent: 'center',
    position: 'absolute',
    width: 104,
    zIndex: 30,
  },
  vehiclePulse: {
    backgroundColor: 'rgba(34,197,94,0.16)',
    borderRadius: 999,
    borderWidth: 2,
    height: 64,
    opacity: 0.72,
    position: 'absolute',
    width: 64,
  },
  resumeTracking: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#EAF1F8',
    borderRadius: 999,
    bottom: 220,
    elevation: 8,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    zIndex: 40,
  },
  resumeTrackingText: { color: '#071018', fontSize: 12, fontWeight: '900' },

  deck: {
    backgroundColor: G.glassStrong, borderTopColor: G.hair, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, bottom: 0, gap: 14, left: 0, paddingHorizontal: 18, paddingTop: 16, position: 'absolute', right: 0,
  },
  statRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  speedBlock: { alignItems: 'flex-end', flexDirection: 'row', gap: 4 },
  speedValue: { color: G.text, fontSize: 40, fontVariant: ['tabular-nums'], fontWeight: '900', lineHeight: 42 },
  speedUnit: { color: G.sub, fontSize: 13, marginBottom: 6 },
  statPair: { flexDirection: 'row', gap: 18 },
  stat: { alignItems: 'flex-end' },
  statValue: { color: G.text, fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '800' },
  statLabel: { color: G.sub, fontSize: 11 },

  timelineWrap: { justifyContent: 'center' },
  track: { backgroundColor: G.track, borderRadius: 999, height: 6, justifyContent: 'center' },
  trackFill: { borderRadius: 999, height: 6 },
  tick: { borderRadius: 1, height: 12, marginLeft: -1, opacity: 0.7, position: 'absolute', top: -3, width: 2 },
  thumb: {
    backgroundColor: '#0b0f16', borderRadius: 999, borderWidth: 3, height: 18, marginLeft: -9, position: 'absolute',
    top: -6, width: 18,
  },

  controls: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  ctrlSmall: {
    alignItems: 'center', backgroundColor: G.glass, borderColor: G.hair, borderRadius: 999, borderWidth: 1,
    height: 46, justifyContent: 'center', width: 46,
  },
  playBtn: { alignItems: 'center', borderRadius: 999, height: 60, justifyContent: 'center', width: 60 },
  speeds: { flexDirection: 'row', gap: 6 },
  speedChip: { borderColor: G.hair, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  speedChipText: { fontSize: 13, fontWeight: '800' },
});
