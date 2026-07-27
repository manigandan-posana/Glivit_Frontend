import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation, useRouter } from 'expo-router';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Fleet3DOverlay, type Fleet3DOverlayMarker } from '@/src/components/Fleet3DOverlay';
import { FleetWebMap, type FleetWebMapHandle, type WebMapMarker } from '@/src/components/FleetWebMap';
import MapView from '@/src/components/maps/NativeMap';
import { NotificationCenter } from '@/src/components/NotificationCenter';
import {
  getVehicleModel,
  modelForVehicle,
  Vehicle3DMarker,
} from '@/src/components/Vehicle3DMarker';
import { StatusPill } from '@/src/components/ui/StatusPill';
import { EmptyView } from '@/src/components/ui/StateViews';
import { useGetAllDevicesQuery, useGetDeviceQuery } from '@/src/services/devicesApi';
import { useFleetLivePositions } from '@/src/services/fleetLivePositions';
import { getMapStyleInfo } from '@/src/services/mapStyle';
import { normalizeHeading } from '@/src/services/vehicleMarkerAssets';
import type { DeviceSummary } from '@/src/types/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

/** Shortest-path angular interpolation for smooth live heading changes. */
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}
type AnimatedPos = { lat: number; lng: number; heading: number };

export default function AllVehiclesMapScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: c, stateColors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const mapRef = useRef<MapView>(null);
  const webMapRef = useRef<FleetWebMapHandle>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isFetching, refetch } = useGetAllDevicesQuery();

  const located = useMemo(() => (data ?? []).filter(hasCoordinate), [data]);
  const selected = useMemo(
    () => located.find((device) => device.id === selectedId) ?? null,
    [located, selectedId]
  );

  // Live fleet tracking (merged from the former Live Fleet Map): a single SSE
  // stream animates every located vehicle. Positions are interpolated in a ref
  // and published on a throttle so markers glide without re-rendering per frame.
  const { targetsRef, connected } = useFleetLivePositions(located);
  const renderRef = useRef<Map<number, AnimatedPos>>(new Map());
  const lastPublishRef = useRef(0);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;
  const [animated, setAnimated] = useState<Record<number, AnimatedPos>>({});

  useEffect(() => {
    let last = Date.now();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = Date.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const targets = targetsRef.current;
      const render = renderRef.current;
      const damp = 1 - Math.exp(-6 * dt);
      targets.forEach((t, id) => {
        let r = render.get(id);
        if (!r) {
          r = { lat: t.latitude, lng: t.longitude, heading: t.heading };
          render.set(id, r);
        }
        if (t.moving) {
          r.lat += (t.latitude - r.lat) * damp;
          r.lng += (t.longitude - r.lng) * damp;
          r.heading = lerpAngle(r.heading, t.heading, damp);
        } else {
          r.lat = t.latitude;
          r.lng = t.longitude;
          r.heading = t.heading;
        }
      });
      // Publish on a throttle, and pause publishing while a vehicle is focused
      // (its detail sheet is open and the camera is centred on it) so the sheet
      // does not re-render on every tick. Interpolation keeps running, so markers
      // catch up smoothly once the selection is cleared.
      if (selectedIdRef.current == null && now - lastPublishRef.current >= 120) {
        lastPublishRef.current = now;
        const next: Record<number, AnimatedPos> = {};
        render.forEach((r, id) => {
          next[id] = { lat: r.lat, lng: r.lng, heading: r.heading };
        });
        setAnimated(next);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [targetsRef]);

  // Located devices with their marker positions replaced by the live-animated
  // ones. The detail sheet keeps using the stable `selected` record.
  const liveDevices = useMemo<LocatedDevice[]>(
    () =>
      located.map((d) => {
        const a = animated[d.id];
        return a ? { ...d, latitude: a.lat, longitude: a.lng, course: a.heading } : d;
      }),
    [animated, located]
  );

  const statusCounts = useMemo(() => {
    const acc = { RUNNING: 0, IDLE: 0, STOPPED: 0, NO_DATA: 0 };
    for (const d of located) {
      if (d.state === 'RUNNING') acc.RUNNING += 1;
      else if (d.state === 'IDLE') acc.IDLE += 1;
      else if (d.state === 'STOPPED') acc.STOPPED += 1;
      else acc.NO_DATA += 1;
    }
    return acc;
  }, [located]);

  useEffect(() => {
    if (selectedId != null && !located.some((device) => device.id === selectedId)) {
      setSelectedId(null);
    }
  }, [located, selectedId]);

  const webMarkers = useMemo<WebMapMarker[]>(
    () =>
      liveDevices.map((d) => ({
        id: d.id,
        lat: d.latitude,
        lng: d.longitude,
        color: stateColors[d.state] ?? stateColors.NO_DATA,
        heading: d.course,
        category: d.category,
        label: d.name,
      })),
    [liveDevices, stateColors]
  );

  const mapStyleInfo = getMapStyleInfo(isDark ? 'dark' : 'street');
  const useNativeMap = Platform.OS !== 'web';

  const focusNative = useCallback((device: DeviceSummary) => {
    if (device?.latitude == null || device?.longitude == null) return;
    mapRef.current?.animateCamera({
      center: { latitude: device.latitude, longitude: device.longitude },
      zoom: 15.2,
      heading: -8,
      pitch: 48,
    }, { duration: 650 });
  }, []);

  const fitAll = useCallback(() => {
    if (useNativeMap) {
      if (located.length === 0) return;
      const coords = located.map((d) => ({
        latitude: d.latitude,
        longitude: d.longitude
      }));
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    } else {
      webMapRef.current?.fitAll();
    }
  }, [useNativeMap, located]);

  const selectById = useCallback(
    (id: string | number) => {
      const device = located.find((candidate) => String(candidate.id) === String(id));
      if (!device) return;
      setSelectedId(device.id);
      if (useNativeMap) focusNative(device);
    },
    [focusNative, located, useNativeMap]
  );

  const clearSelection = useCallback(() => setSelectedId(null), []);
  const handleVisibleIdsChange = useCallback((visibleIds: string[]) => {
    const visible = new Set(visibleIds);
    setSelectedId((current) =>
      current != null && !visible.has(String(current)) ? null : current
    );
  }, []);

  const openLiveTrack = (item: DeviceSummary) =>
    router.push({ pathname: '/live-track', params: { deviceId: String(item.id), name: item.name, subtitle: item.address ?? '' } });

  const openPlayback = (item: DeviceSummary) =>
    router.push({ pathname: '/trip-playback' as never, params: { deviceId: String(item.id), name: item.name } });

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      {useNativeMap ? (
        <NativeFleetMap
          mapRef={mapRef}
          devices={liveDevices}
          mapStyle={mapStyleInfo.style}
          onClearSelection={clearSelection}
          onFitAll={fitAll}
          onSelectDevice={selectById}
          onVisibleIdsChange={handleVisibleIdsChange}
          selectedId={selectedId}
        />
      ) : (
        <FleetWebMap
          ref={webMapRef}
          mapStyle={mapStyleInfo.webStyle}
          markers={webMarkers}
          onClearSelection={clearSelection}
          onSelect={selectById}
          onVisibleIdsChange={handleVisibleIdsChange}
          selectedId={selectedId}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      <View pointerEvents="none" style={styles.mapVignette} />

      <View style={[styles.commandBar, { top: insets.top + spacing.sm }]}>
        <FloatingButton icon="menu" onPress={() => navigation.dispatch(DrawerActions.openDrawer())} />
        <View style={styles.commandTitle}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.signalDot, { backgroundColor: connected ? c.primary : c.textMuted }]} />
            <Text style={styles.eyebrow}>{connected ? 'LIVE FLEET' : 'CONNECTING'}</Text>
          </View>
          <Text style={styles.commandHeading}>All vehicles · {located.length}</Text>
        </View>
        <NotificationCenter tint="#EAF3FB" />
      </View>
      <View style={[styles.railRight, { top: insets.top + 92 }]}>
        <FloatingButton icon="refresh" loading={isFetching} onPress={refetch} />
        <FloatingButton icon="fit-to-page-outline" onPress={fitAll} />
      </View>

      {located.length === 0 ? (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <EmptyView icon="map-marker-off" title="No located vehicles" message="No live positions to show yet." />
        </View>
      ) : selected ? (
        <VehicleDetailsBottomSheet
          bottomInset={insets.bottom}
          device={selected}
          onOpenLiveTrack={() => openLiveTrack(selected)}
          onOpenPlayback={() => openPlayback(selected)}
        />
      ) : (
        <View style={[styles.legend, { paddingBottom: insets.bottom + spacing.sm }]} pointerEvents="none">
          <LegendChip color={stateColors.RUNNING} label="Running" value={statusCounts.RUNNING} />
          <LegendChip color={stateColors.IDLE} label="Idle" value={statusCounts.IDLE} />
          <LegendChip color={stateColors.STOPPED} label="Stopped" value={statusCounts.STOPPED} />
          <LegendChip color={stateColors.NO_DATA} label="Offline" value={statusCounts.NO_DATA} />
        </View>
      )}
    </SafeAreaView>
  );
}

type LocatedDevice = DeviceSummary & { latitude: number; longitude: number };

function hasCoordinate(device: DeviceSummary): device is LocatedDevice {
  return Number.isFinite(device.latitude) && Number.isFinite(device.longitude);
}

function VehicleDetailsBottomSheet({
  bottomInset,
  device,
  onOpenLiveTrack,
  onOpenPlayback,
}: {
  bottomInset: number;
  device: LocatedDevice;
  onOpenLiveTrack: () => void;
  onOpenPlayback: () => void;
}) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { height: screenHeight } = useWindowDimensions();
  const [expanded, setExpanded] = useState(true);
  const expandedRef = useRef(true);
  const sheetHeightRef = useRef(0);
  const dragStartRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const translateY = useRef(new Animated.Value(0)).current;
  const { data: detail, isFetching } = useGetDeviceQuery(device.id, { skip: !expanded });

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      translateY.stopAnimation();
    },
    [translateY]
  );

  const collapsedOffset = useCallback(
    () => Math.max(160, sheetHeightRef.current - 132),
    []
  );

  const snapSheet = useCallback(
    (nextExpanded: boolean) => {
      const offset = collapsedOffset();
      const wasExpanded = expandedRef.current;
      expandedRef.current = nextExpanded;
      translateY.stopAnimation();
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (nextExpanded) {
        setExpanded(true);
        animationFrameRef.current = requestAnimationFrame(() => {
          animationFrameRef.current = null;
          if (!mountedRef.current) return;
          if (!wasExpanded) translateY.setValue(offset);
          Animated.spring(translateY, {
            damping: 24,
            mass: 0.84,
            stiffness: 250,
            toValue: 0,
            useNativeDriver: true,
          }).start();
        });
        return;
      }

      Animated.spring(translateY, {
        damping: 25,
        mass: 0.86,
        stiffness: 260,
        toValue: offset,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !mountedRef.current) return;
        setExpanded(false);
        translateY.setValue(0);
      });
    },
    [collapsedOffset, translateY]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            dragStartRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const offset = collapsedOffset();
          translateY.setValue(
            Math.max(0, Math.min(offset, dragStartRef.current + gesture.dy))
          );
        },
        onPanResponderRelease: (_, gesture) => {
          const offset = collapsedOffset();
          const projected = dragStartRef.current + gesture.dy + gesture.vy * 100;
          snapSheet(projected < offset * 0.46);
        },
        onPanResponderTerminate: () => snapSheet(expandedRef.current),
      }),
    [collapsedOffset, snapSheet, translateY]
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    if (!expandedRef.current) return;
    const height = event.nativeEvent.layout.height;
    if (height > 0) sheetHeightRef.current = height;
  }, []);

  const variant = modelForVehicle(device.category, device.id);
  const model = getVehicleModel(variant);
  const speed = Number.isFinite(device.speed) ? Math.round(device.speed) : 0;
  const heading = Number.isFinite(device.course) ? Math.round(normalizeHeading(device.course)) : 0;

  return (
    <Animated.View
      onLayout={handleLayout}
      {...panResponder.panHandlers}
      style={[
        styles.vehicleSheet,
        {
          bottom: Math.max(bottomInset, spacing.sm),
          transform: [{ translateY }],
        },
      ]}>
      <Pressable
        accessibilityLabel={expanded ? 'Minimize vehicle details' : 'Expand vehicle details'}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        hitSlop={10}
        onPress={() => snapSheet(!expandedRef.current)}
        style={styles.sheetHandleHit}>
        <View style={styles.sheetHandle} />
      </Pressable>

      <View style={styles.cardTop}>
        <View style={styles.cardIdentity}>
          <View style={styles.cardBeacon}>
            <Vehicle3DMarker
              heading={normalizeHeading(device.course)}
              isActive={device.state === 'RUNNING'}
              renderMode="image"
              showImageFallback
              size={68}
              speed={device.speed}
              variant={variant}
            />
          </View>
          <View style={styles.cardTitleBlock}>
            <Text numberOfLines={1} style={styles.cardName}>
              {device.name}
            </Text>
            <Text style={styles.cardId}>
              UNIT {String(device.id).padStart(4, '0')} / {model.label}
            </Text>
          </View>
        </View>
        <StatusPill state={device.state} />
      </View>

      <View style={styles.addressRow}>
        <MaterialCommunityIcons color="#7890A6" name="map-marker-outline" size={15} />
        <Text numberOfLines={expanded ? 2 : 1} style={styles.cardAddress}>
          {device.address ?? 'Address unavailable'}
        </Text>
      </View>

      {expanded ? (
        <ScrollView
          contentContainerStyle={styles.expandedSheetContent}
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: Math.max(250, screenHeight * 0.52) }}>
          <View style={styles.sheetDivider} />
          <View style={styles.sheetSpeedRow}>
            <View style={styles.speedReadout}>
              <Text style={styles.speedNumber}>{speed}</Text>
              <Text style={styles.speedUnit}>KM/H</Text>
            </View>
            {isFetching ? <ActivityIndicator color={c.primary} size="small" /> : null}
            <Text style={styles.lastUpdate}>{formatLastUpdate(device.lastUpdate)}</Text>
          </View>

          <View style={styles.detailGrid}>
            <DetailMetric icon="identifier" label="IMEI" value={device.imei || 'Unavailable'} />
            <DetailMetric icon="shape-outline" label="Category" value={device.category || 'Unknown'} />
            <DetailMetric
              icon="engine-outline"
              label="Ignition"
              value={device.ignition == null ? 'Unknown' : device.ignition ? 'On' : 'Off'}
            />
            <DetailMetric
              icon="crosshairs-gps"
              label="GPS"
              value={device.gpsValid ? 'Connected' : 'Invalid'}
            />
            <DetailMetric icon="compass-outline" label="Heading" value={`${heading} deg`} />
            <DetailMetric icon="shield-car" label="Device" value={device.status || 'Unknown'} />
            <DetailMetric
              icon="account-outline"
              label="Driver"
              value={detail?.driverName || 'Unassigned'}
            />
            <DetailMetric
              icon="calendar-clock"
              label="Expiry"
              value={detail?.expiryDate || device.expiryDate || 'Not set'}
            />
          </View>

          <View style={styles.coordinateRow}>
            <Text style={styles.coordinateLabel}>LIVE COORDINATES</Text>
            <Text style={styles.coordinateValue}>
              {device.latitude.toFixed(5)}, {device.longitude.toFixed(5)}
            </Text>
          </View>

          <View style={styles.cardActions}>
            <Pressable
              accessibilityLabel="Open cinematic playback"
              accessibilityRole="button"
              onPress={onOpenPlayback}
              style={styles.cardPlay}>
              <MaterialCommunityIcons color="#E9F2FA" name="movie-open" size={17} />
              <Text style={styles.cardPlayText}>Cinematic</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`Open live tracking for ${device.name}`}
              accessibilityRole="button"
              onPress={onOpenLiveTrack}
              style={styles.trackButton}>
              <Text style={styles.cardTrack}>Live track</Text>
              <MaterialCommunityIcons color={c.onPrimary} name="arrow-top-right" size={16} />
            </Pressable>
          </View>
        </ScrollView>
      ) : null}

      {!expanded ? (
        <Pressable
          accessibilityLabel="Expand vehicle details"
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          onPress={() => snapSheet(true)}
          style={styles.collapsedSheetOverlay}
        />
      ) : null}
    </Animated.View>
  );
}

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={sheetStyles.detailMetric}>
      <MaterialCommunityIcons color="#2BE69E" name={icon} size={16} />
      <View style={sheetStyles.detailMetricText}>
        <Text style={sheetStyles.detailMetricLabel}>{label}</Text>
        <Text numberOfLines={1} style={sheetStyles.detailMetricValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function formatLastUpdate(value?: string | null) {
  if (!value) return 'Update unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Update unavailable';
  return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const sheetStyles = StyleSheet.create({
  detailMetric: {
    alignItems: 'center',
    flexBasis: '47%',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  detailMetricText: { flex: 1, minWidth: 0 },
  detailMetricLabel: {
    color: '#6F879D',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailMetricValue: { color: '#EAF2F8', fontSize: 11, fontWeight: '800', marginTop: 1 },
});

function NativeFleetMap({
  mapRef,
  devices,
  mapStyle,
  onClearSelection,
  onFitAll,
  onSelectDevice,
  onVisibleIdsChange,
  selectedId,
}: {
  mapRef: React.RefObject<MapView | null>;
  devices: LocatedDevice[];
  mapStyle: any;
  onClearSelection: () => void;
  onFitAll: () => void;
  onSelectDevice: (id: string | number) => void;
  onVisibleIdsChange: (ids: string[]) => void;
  selectedId: number | null;
}) {
  const { stateColors } = useTheme();
  const { width, height } = useWindowDimensions();
  const mountedRef = useRef(true);
  const projectionRequestRef = useRef(0);
  const lastProjectionAtRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [threeReady, setThreeReady] = useState(false);
  const [projection, setProjection] = useState<{
    heading: number;
    points: Record<string, { x: number; y: number }>;
  }>({ heading: 0, points: {} });
  // Popups appear only when zoomed in. Driven off the region's latitudeDelta
  // (reliable on both Google and Apple maps, unlike camera.zoom) with a
  // hysteresis band so popups don't flicker on/off right at the threshold.
  const zoomedInRef = useRef(false);
  const [zoomedIn, setZoomedIn] = useState(false);
  const updateZoomFromRegion = useCallback((latitudeDelta?: number) => {
    if (!Number.isFinite(latitudeDelta)) return;
    const delta = latitudeDelta as number;
    const next = zoomedInRef.current ? delta <= POPUP_EXIT_DELTA : delta <= POPUP_ENTER_DELTA;
    if (next !== zoomedInRef.current) {
      zoomedInRef.current = next;
      setZoomedIn(next);
    }
  }, []);

  useEffect(
    () => () => {
      mountedRef.current = false;
      projectionRequestRef.current += 1;
    },
    []
  );

  const projectVehicles = useCallback(async (notifyVisibility = false) => {
    const instance = mapRef.current;
    if (!instance || !mapReady) return;
    const request = ++projectionRequestRef.current;
    try {
      const [camera, screenPoints] = await Promise.all([
        instance.getCamera(),
        Promise.all(
          devices.map(async (device) => ({
            id: String(device.id),
            point: await instance.pointForCoordinate({
              latitude: device.latitude,
              longitude: device.longitude,
            }),
          }))
        ),
      ]);
      if (!mountedRef.current || request !== projectionRequestRef.current) return;

      // Keep a margin around the viewport so markers near the edges are not
      // culled (and re-added) mid-animation while the camera pans/zooms or
      // focuses a tapped vehicle — that on/off toggling is what reads as a flash.
      const visiblePoints: Record<string, { x: number; y: number }> = {};
      for (const result of screenPoints) {
        if (
          Number.isFinite(result.point.x) &&
          Number.isFinite(result.point.y) &&
          result.point.x >= -100 &&
          result.point.x <= width + 100 &&
          result.point.y >= -100 &&
          result.point.y <= height + 100
        ) {
          visiblePoints[result.id] = result.point;
        }
      }
      setProjection({
        heading: normalizeHeading(camera.heading),
        points: visiblePoints,
      });
      if (notifyVisibility) onVisibleIdsChange(Object.keys(visiblePoints));
    } catch {
      // The SDK can reject coordinate projection during its first layout pass.
    }
  }, [devices, height, mapReady, mapRef, onVisibleIdsChange, width]);

  useEffect(() => {
    if (!mapReady) return;
    void projectVehicles();
  }, [mapReady, projectVehicles]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    onFitAll();
  }, [onFitAll]);

  const handleRegionChange = useCallback(
    (region?: { latitudeDelta?: number }) => {
      updateZoomFromRegion(region?.latitudeDelta);
      const now = Date.now();
      if (now - lastProjectionAtRef.current < 60) return;
      lastProjectionAtRef.current = now;
      void projectVehicles();
    },
    [projectVehicles, updateZoomFromRegion]
  );

  const threeMarkers = useMemo<Fleet3DOverlayMarker[]>(
    () =>
      devices.flatMap((device) => {
        const point = projection.points[String(device.id)];
        if (!point) return [];
        return [{
          heading: normalizeHeading(device.course - projection.heading),
          id: String(device.id),
          isActive: device.state === 'RUNNING',
          selected: selectedId === device.id,
          speed: Number.isFinite(device.speed) ? device.speed : 0,
          variant: modelForVehicle(device.category, device.id),
          x: point.x,
          y: point.y,
        }];
      }),
    [devices, projection, selectedId]
  );

  // Which vehicles get a compact popup. Far zoom -> none (except the selected
  // one, which always shows). Overlapping non-selected popups are suppressed,
  // and the selected popup is placed first so it always wins.
  const popups = useMemo(() => {
    const visible: { device: LocatedDevice; point: { x: number; y: number }; selected: boolean }[] = [];
    for (const device of devices) {
      const point = projection.points[String(device.id)];
      if (!point) continue;
      const selected = selectedId === device.id;
      if (!selected && !zoomedIn) continue;
      visible.push({ device, point, selected });
    }
    visible.sort((a, b) =>
      a.selected === b.selected ? a.point.y - b.point.y : a.selected ? -1 : 1
    );
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    const shown: typeof visible = [];
    for (const item of visible) {
      const left = item.point.x - POPUP_W / 2;
      const top = item.point.y - MARKER_HALF - POPUP_H - POPUP_ARROW;
      const rect = { left, top, right: left + POPUP_W, bottom: top + POPUP_H };
      const overlaps = placed.some(
        (r) => rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top
      );
      if (item.selected || !overlaps) {
        placed.push(rect);
        shown.push(item);
      }
    }
    return shown;
  }, [devices, projection, selectedId, zoomedIn]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        customMapStyle={mapStyle}
        loadingBackgroundColor="#E8EDF2"
        loadingEnabled
        onMapReady={handleMapReady}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={(region) => {
          updateZoomFromRegion(region?.latitudeDelta);
          void projectVehicles(true);
        }}
        showsCompass={false}
        showsBuildings
        showsUserLocation={false}
        pitchEnabled
        rotateEnabled
        toolbarEnabled={false}
        onPress={onClearSelection}
        initialCamera={{
          altitude: 1400,
          center: { latitude: 12.97, longitude: 77.59 },
          heading: -8,
          pitch: 42,
          zoom: 11,
        }}
      />

      <Fleet3DOverlay
        key={`fleet-3d-${Math.round(width)}x${Math.round(height)}`}
        height={height}
        markers={threeMarkers}
        onReady={() => setThreeReady(true)}
        onUnavailable={() => setThreeReady(false)}
        width={width}
      />

      {/* Transparent tap targets over each 3D vehicle. No status ring/halo/circle
          is drawn — the 3D model (scaled up slightly when selected by
          Fleet3DOverlay) is the only marker; status is shown in the popup. */}
      {devices.map((d) => {
        const isSelected = selectedId === d.id;
        const point = projection.points[String(d.id)];
        if (!point) return null;
        const markerSize = isSelected ? 78 : 64;
        return (
          <Pressable
            key={d.id}
            accessibilityLabel={`${d.name}, ${d.state}`}
            accessibilityRole="button"
            onPress={() => {
              onSelectDevice(d.id);
            }}
            style={[
              fleetMapStyles.vehicle3DOverlay,
              {
                height: markerSize,
                left: point.x - markerSize / 2,
                top: point.y - markerSize / 2,
                width: markerSize,
              },
            ]}>
            {!threeReady ? (
              <Vehicle3DMarker
                heading={normalizeHeading(d.course - projection.heading)}
                isActive={d.state === 'RUNNING'}
                renderMode="image"
                showImageFallback
                size={markerSize}
                speed={d.speed}
                variant={modelForVehicle(d.category, d.id)}
              />
            ) : null}
          </Pressable>
        );
      })}

      {popups.map(({ device, point, selected }) => (
        <VehiclePopup
          key={`popup-${device.id}`}
          x={point.x}
          y={point.y}
          name={device.name}
          state={device.state}
          speed={device.speed}
          lastUpdate={device.lastUpdate}
          statusColor={stateColors[device.state] ?? stateColors.NO_DATA}
          selected={selected}
        />
      ))}
    </View>
  );
}

const fleetMapStyles = StyleSheet.create({
  vehicle3DOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    zIndex: 10,
  },
});

// Compact zoom-based vehicle popup (no circles/rings around the model).
const POPUP_W = 132;
const POPUP_H = 54;
const POPUP_ARROW = 7;
const MARKER_HALF = 32;
const POPUP_BG = 'rgba(9, 17, 29, 0.92)';
// latitudeDelta thresholds (smaller delta = more zoomed in). Hysteresis band.
const POPUP_ENTER_DELTA = 0.055;
const POPUP_EXIT_DELTA = 0.09;

function formatVehicleState(state: string): string {
  switch ((state ?? '').toUpperCase()) {
    case 'RUNNING':
      return 'Running';
    case 'IDLE':
      return 'Idle';
    case 'STOPPED':
      return 'Stopped';
    case 'EXPIRED':
      return 'Expired';
    case 'INACTIVE':
      return 'Inactive';
    case 'NO_DATA':
      return 'Offline';
    default:
      return state ? state.charAt(0) + state.slice(1).toLowerCase() : 'Offline';
  }
}

function formatRelativeUpdate(iso?: string | null): string {
  if (!iso) return 'No update';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'No update';
  const diff = Date.now() - ms;
  if (diff < 60_000) return `Updated ${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `Updated ${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `Updated ${Math.floor(diff / 3_600_000)}h ago`;
  return `Updated ${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Small dark popup anchored above a 3D vehicle. Memoised so only the vehicles
 * whose position/status actually changed re-render on a GPS tick. Non-interactive
 * (pointerEvents none) so it never blocks taps on the map or the marker below.
 */
const VehiclePopup = memo(function VehiclePopup({
  x,
  y,
  name,
  state,
  speed,
  lastUpdate,
  statusColor,
  selected,
}: {
  x: number;
  y: number;
  name: string;
  state: string;
  speed: number;
  lastUpdate?: string | null;
  statusColor: string;
  selected: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        popupStyles.popup,
        { left: x - POPUP_W / 2, top: y - MARKER_HALF - POPUP_H - POPUP_ARROW },
        selected && popupStyles.popupSelected,
      ]}>
      <Text numberOfLines={1} style={popupStyles.title}>
        {name}
      </Text>
      <View style={popupStyles.row}>
        <View style={[popupStyles.dot, { backgroundColor: statusColor }]} />
        <Text numberOfLines={1} style={popupStyles.meta}>
          {formatVehicleState(state)} · {Math.max(0, Math.round(speed))} km/h
        </Text>
      </View>
      <Text numberOfLines={1} style={popupStyles.time}>
        {formatRelativeUpdate(lastUpdate)}
      </Text>
      <View style={popupStyles.arrow} />
    </View>
  );
});

const popupStyles = StyleSheet.create({
  popup: {
    backgroundColor: POPUP_BG,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    width: POPUP_W,
    zIndex: 20,
  },
  popupSelected: { borderColor: 'rgba(43, 230, 158, 0.9)', borderWidth: 1.5 },
  title: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 2 },
  dot: { borderRadius: 4, height: 7, width: 7 },
  meta: { color: '#DCE7F0', flex: 1, fontSize: 10, fontWeight: '700' },
  time: { color: '#8BA0B4', fontSize: 9, fontWeight: '600', marginTop: 1 },
  arrow: {
    borderLeftColor: 'transparent',
    borderLeftWidth: POPUP_ARROW,
    borderRightColor: 'transparent',
    borderRightWidth: POPUP_ARROW,
    borderTopColor: POPUP_BG,
    borderTopWidth: POPUP_ARROW,
    bottom: -POPUP_ARROW,
    height: 0,
    left: POPUP_W / 2 - POPUP_ARROW,
    position: 'absolute',
    width: 0,
  },
});

function FloatingButton({
  icon,
  onPress,
  loading,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  loading?: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <Pressable accessibilityRole="button" disabled={loading} onPress={onPress} style={styles.fab}>
      <MaterialCommunityIcons color="#EAF3FB" name={loading ? 'timer-sand' : icon} size={22} />
    </Pressable>
  );
}

function LegendChip({ color, label, value }: { color: string; label: string; value: number }) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.legendChip}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendValue}>{value}</Text>
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    railRight: { gap: spacing.sm, position: 'absolute', right: spacing.md },
    legend: {
      alignItems: 'center',
      backgroundColor: 'rgba(8, 16, 28, 0.95)',
      borderColor: 'rgba(255,255,255,0.12)',
      borderRadius: radius.xl,
      borderWidth: 1,
      bottom: spacing.sm,
      flexDirection: 'row',
      justifyContent: 'space-around',
      left: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      position: 'absolute',
      right: spacing.sm,
    },
    legendChip: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    legendDot: { borderRadius: 5, height: 10, width: 10 },
    legendValue: { color: '#F2F8FD', fontSize: typography.body, fontWeight: '900' },
    legendLabel: { color: '#8FA5BA', fontSize: typography.caption, fontWeight: '600' },
    mapVignette: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(6, 13, 24, 0.035)',
      borderColor: 'rgba(4, 10, 20, 0.12)',
      borderWidth: 1,
    },
    commandBar: {
      alignItems: 'center',
      backgroundColor: 'rgba(8, 16, 28, 0.92)',
      borderColor: 'rgba(255,255,255,0.13)',
      borderRadius: radius.lg,
      borderWidth: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      left: spacing.md,
      padding: spacing.sm,
      position: 'absolute',
      right: spacing.md,
      shadowColor: '#020712',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.28,
      shadowRadius: 22,
    },
    commandTitle: { flex: 1, minWidth: 0 },
    eyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
    signalDot: { borderRadius: 4, height: 7, width: 7 },
    eyebrow: { color: '#8FA5BA', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
    commandHeading: { color: '#F5FAFF', fontSize: 17, fontWeight: '900', marginTop: 1 },
    fleetCount: {
      alignItems: 'flex-end',
      borderLeftColor: 'rgba(255,255,255,0.12)',
      borderLeftWidth: 1,
      minWidth: 58,
      paddingHorizontal: 8,
    },
    fleetCountValue: { color: '#F5FAFF', fontSize: 20, fontWeight: '900' },
    fleetCountLabel: { color: '#7F95AA', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
    fab: {
      alignItems: 'center',
      backgroundColor: 'rgba(9, 18, 31, 0.94)',
      borderColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      borderRadius: radius.md,
      elevation: 3,
      height: 44,
      justifyContent: 'center',
      shadowColor: c.shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      width: 44,
    },
    emptyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    vehicleSheet: {
      backgroundColor: 'rgba(8, 16, 28, 0.97)',
      borderColor: 'rgba(255,255,255,0.13)',
      borderRadius: radius.xl,
      borderWidth: 1,
      elevation: 12,
      left: spacing.md,
      maxHeight: '80%',
      paddingBottom: 16,
      paddingHorizontal: 18,
      paddingTop: 8,
      position: 'absolute',
      right: spacing.md,
      shadowColor: '#020712',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.38,
      shadowRadius: 26,
      zIndex: 30,
    },
    sheetHandleHit: {
      alignItems: 'center',
      marginHorizontal: -8,
      paddingBottom: 8,
      paddingTop: 2,
    },
    sheetHandle: {
      backgroundColor: 'rgba(190, 210, 228, 0.42)',
      borderRadius: 3,
      height: 5,
      width: 48,
    },
    collapsedSheetOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: radius.xl,
      zIndex: 50,
    },
    sheetDivider: {
      backgroundColor: 'rgba(255,255,255,0.1)',
      height: 1,
      marginTop: 13,
    },
    sheetSpeedRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      marginTop: 11,
    },
    lastUpdate: {
      color: '#7890A6',
      flex: 1,
      fontSize: 10,
      fontWeight: '700',
      textAlign: 'right',
    },
    detailGrid: {
      backgroundColor: 'rgba(255,255,255,0.035)',
      borderColor: 'rgba(255,255,255,0.08)',
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 13,
      justifyContent: 'space-between',
      marginTop: 12,
      padding: 12,
    },
    expandedSheetContent: { paddingBottom: 2 },
    coordinateRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 11,
    },
    coordinateLabel: {
      color: '#6F879D',
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 0.9,
    },
    coordinateValue: { color: '#C9D8E4', fontSize: 10, fontWeight: '800' },
    cardList: { bottom: 0, left: 0, position: 'absolute', right: 0 },
    cards: { gap: spacing.sm, paddingHorizontal: spacing.md },
    card: {
      backgroundColor: 'rgba(8, 16, 28, 0.95)',
      borderColor: 'rgba(255,255,255,0.13)',
      borderRadius: radius.xl,
      borderWidth: 1,
      padding: 18,
      shadowColor: '#020712',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.32,
      shadowRadius: 24,
    },
    cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
    cardIdentity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
    cardBeacon: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.045)',
      borderColor: 'rgba(83,216,255,0.14)',
      borderRadius: 15,
      borderWidth: 1,
      height: 70,
      justifyContent: 'center',
      overflow: 'hidden',
      width: 80,
    },
    cardTitleBlock: { flex: 1, minWidth: 0 },
    cardName: { color: '#F3F8FD', fontSize: typography.body, fontWeight: '900' },
    cardId: { color: '#7890A6', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
    addressRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 12 },
    cardAddress: { color: '#9BB0C3', flex: 1, fontSize: typography.caption },
    cardMetaRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
    speedReadout: { alignItems: 'baseline', flexDirection: 'row', gap: 5 },
    speedNumber: { color: '#F4FAFF', fontSize: 28, fontWeight: '900' },
    speedUnit: { color: '#7590A7', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    cardActions: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      justifyContent: 'flex-end',
      marginTop: 14,
    },
    cardPlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderRadius: radius.pill,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    cardPlayText: { color: '#E9F2FA', fontSize: typography.caption, fontWeight: '800' },
    trackButton: {
      alignItems: 'center',
      backgroundColor: c.primary,
      borderRadius: radius.pill,
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    cardTrack: { color: c.onPrimary, fontSize: typography.caption, fontWeight: '900' },
  });
