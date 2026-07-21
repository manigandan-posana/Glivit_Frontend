import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import Renderer from 'expo-three/build/Renderer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { CameraRef, LngLat, MapRef } from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as THREE from 'three';

import { FleetWebMap, type WebMapMarker } from '@/src/components/FleetWebMap';
import { env } from '@/src/config/env';
import { useGetDevicePlaybackQuery } from '@/src/services/devicesApi';
import { getMapStyle, getMapStyleInfo, toNativeStyle } from '@/src/services/mapStyle';
import { isMapAvailable, MapLibre } from '@/src/services/maplibre';
import vehiclePreview from '@/models/model.preview.json';

const VEHICLE_VIEW_SIZE = 164;
const ROUTE_TICK_MS = 80;
const ROUTE_LOOP_MS = 70000;
const CONTACT_PHONE = '+919876543210';
const MAP_LOAD_TIMEOUT_MS = 15000;

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

type VehiclePreviewMesh = {
  positions: number[];
  normals: number[];
  source: string;
  vertexCount: number;
};

type Coordinate = {
  latitude: number;
  longitude: number;
};

type ScreenPoint = {
  x: number;
  y: number;
};

const VEHICLE_PREVIEW = vehiclePreview as VehiclePreviewMesh;

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

// Offline / demo fallback only. Production flows use real backend playback
// (see the useGetDevicePlaybackQuery wiring below); this array is used solely
// when no device is selected or the app runs in demo mode.
const DEMO_ROUTE: Coordinate[] = [
  { latitude: 12.971873, longitude: 77.594634 },
  { latitude: 12.972069, longitude: 77.594147 },
  { latitude: 12.973084, longitude: 77.59475 },
  { latitude: 12.974067, longitude: 77.595777 },
  { latitude: 12.97502, longitude: 77.596943 },
  { latitude: 12.976297, longitude: 77.598726 },
  { latitude: 12.976672, longitude: 77.599195 },
  { latitude: 12.976661, longitude: 77.600859 },
  { latitude: 12.976843, longitude: 77.601809 },
  { latitude: 12.979084, longitude: 77.602355 },
  { latitude: 12.978999, longitude: 77.603454 },
  { latitude: 12.978329, longitude: 77.605485 },
  { latitude: 12.977919, longitude: 77.606737 },
  { latitude: 12.977529, longitude: 77.607925 },
  { latitude: 12.977055, longitude: 77.608755 },
  { latitude: 12.975154, longitude: 77.608078 },
  { latitude: 12.974442, longitude: 77.611112 },
  { latitude: 12.974046, longitude: 77.611179 },
  { latitude: 12.973438, longitude: 77.610926 },
  { latitude: 12.971895, longitude: 77.610576 },
  { latitude: 12.971539, longitude: 77.610499 },
  { latitude: 12.970416, longitude: 77.610288 },
  { latitude: 12.970172, longitude: 77.610756 },
  { latitude: 12.969826, longitude: 77.611784 },
  { latitude: 12.969783, longitude: 77.612137 },
  { latitude: 12.971078, longitude: 77.612358 },
  { latitude: 12.972735, longitude: 77.612712 },
  { latitude: 12.973847, longitude: 77.612908 },
  { latitude: 12.974084, longitude: 77.612127 },
  { latitude: 12.974557, longitude: 77.610153 },
  { latitude: 12.974849, longitude: 77.608919 },
  { latitude: 12.975057, longitude: 77.608042 },
  { latitude: 12.976775, longitude: 77.608556 },
  { latitude: 12.977275, longitude: 77.608716 },
  { latitude: 12.97991, longitude: 77.609666 },
  { latitude: 12.980994, longitude: 77.610235 },
  { latitude: 12.980775, longitude: 77.610971 },
  { latitude: 12.981373, longitude: 77.611542 },
  { latitude: 12.982204, longitude: 77.612275 },
  { latitude: 12.982906, longitude: 77.61291 },
  { latitude: 12.982561, longitude: 77.61431 },
  { latitude: 12.982699, longitude: 77.615667 },
  { latitude: 12.982656, longitude: 77.615788 },
  { latitude: 12.981922, longitude: 77.615632 },
  { latitude: 12.981276, longitude: 77.615667 },
  { latitude: 12.980701, longitude: 77.616329 },
  { latitude: 12.979462, longitude: 77.618159 },
  { latitude: 12.979933, longitude: 77.617847 },
  { latitude: 12.980764, longitude: 77.615836 },
  { latitude: 12.981065, longitude: 77.615544 },
  { latitude: 12.981559, longitude: 77.615623 },
  { latitude: 12.982581, longitude: 77.615623 },
  { latitude: 12.982699, longitude: 77.615667 },
  { latitude: 12.983219, longitude: 77.616567 },
  { latitude: 12.984059, longitude: 77.617614 },
  { latitude: 12.98519, longitude: 77.618647 },
  { latitude: 12.98678, longitude: 77.619491 },
  { latitude: 12.987217, longitude: 77.619268 },
  { latitude: 12.988027, longitude: 77.619368 },
  { latitude: 12.990033, longitude: 77.619476 },
  { latitude: 12.990805, longitude: 77.619415 },
  { latitude: 12.99284, longitude: 77.618724 },
  { latitude: 12.992865, longitude: 77.61879 },
  { latitude: 12.992941, longitude: 77.618951 },
  { latitude: 12.992902, longitude: 77.619829 },
  { latitude: 12.992873, longitude: 77.620851 },
  { latitude: 12.993186, longitude: 77.621935 },
  { latitude: 12.993237, longitude: 77.622299 },
  { latitude: 12.993166, longitude: 77.623239 },
  { latitude: 12.993143, longitude: 77.623685 },
  { latitude: 12.993647, longitude: 77.625347 },
  { latitude: 12.99318, longitude: 77.625735 },
];

export default function VehicleTrackerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ deviceId?: string; name?: string; subtitle?: string }>();
  const vehicleName = params.name ?? 'TN20CM7677 (VinothKumar Srinivas)';
  const vehicleSubtitle =
    params.subtitle ?? 'Kuppalamadugu, Uthukkottai, Thiruvallur, Tamil Nadu';

  // Real route playback for the selected device. Falls back to the demo route
  // only when no device is passed or the app is in offline demo mode.
  const deviceId = params.deviceId ? Number(params.deviceId) : undefined;
  // A real, tenant-scoped device is selected (not the offline/demo screen).
  const hasRealDevice = deviceId != null && !Number.isNaN(deviceId) && !env.demoMode;
  const { data: playback, isLoading: playbackLoading } = useGetDevicePlaybackQuery(
    { deviceId: deviceId as number },
    { skip: !hasRealDevice }
  );
  const realPointCount = playback?.points?.length ?? 0;
  const route = useMemo<Coordinate[]>(() => {
    const points = playback?.points;
    if (points && points.length > 1) {
      return points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    }
    // Demo route is a dev/offline fallback only; never rendered for a real
    // device (the empty-state gate below returns before the map in that case).
    return DEMO_ROUTE;
  }, [playback]);
  const totalDistanceKm = useMemo(
    () => (playback?.distanceKm && playback.distanceKm > 0 ? playback.distanceKm : getRouteDistance(route)),
    [playback, route]
  );
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const lastCameraFollowRef = useRef(0);
  const projectionRequestRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRouteFitRef = useRef(false);
  const [routeProgress, setRouteProgress] = useState(0.285);
  const [isTracking, setIsTracking] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTrafficVisible, setIsTrafficVisible] = useState(true);
  const [isNightMode, setIsNightMode] = useState(false);
  const [isSatelliteMode, setIsSatelliteMode] = useState(false);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapContainerReady, setMapContainerReady] = useState(false);
  const [mapLoadState, setMapLoadState] = useState<MapLoadState>('loading');
  const [mapErrorMessage, setMapErrorMessage] = useState('');
  const [mapRetryKey, setMapRetryKey] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<RouteMapOptionId | null>(null);
  const [toastText, setToastText] = useState('3D vehicle ready');
  const [vehicleScreenPoint, setVehicleScreenPoint] = useState<ScreenPoint | null>(null);

  const routeSnapshot = useMemo(() => getRouteSnapshot(route, routeProgress), [route, routeProgress]);
  const vehicleCoordinate = routeSnapshot.coordinate;
  const heading = routeSnapshot.heading;
  const completedRoute = routeSnapshot.completedRoute;
  const currentSpeed = Math.max(0, Math.round(isTracking ? 46 + Math.sin(routeProgress * 18) * 7 : 0));
  const status = isAlertActive ? 'Alert' : isTracking ? 'Running' : 'Stopped';
  const pingTime = useMemo(() => formatPingTime(new Date()), []);
  const mapStyleInfo = useMemo(
    () => getMapStyleInfo(isNightMode ? 'dark' : isSatelliteMode ? 'satellite' : 'street'),
    [isNightMode, isSatelliteMode]
  );
  const mapStyleUrl = useMemo(() => toNativeStyle(mapStyleInfo.style), [mapStyleInfo.style]);
  const blockingMapIssue = mapStyleInfo.issues.find((issue) => issue.blocking);
  const routeFeature = useMemo(() => createLineFeature(route), [route]);
  const completedRouteFeature = useMemo(() => createLineFeature(completedRoute), [completedRoute]);
  const overlayPoint = vehicleScreenPoint ?? {
    x: width / 2,
    y: height * 0.52,
  };
  const remainingDistanceKm = Math.max(totalDistanceKm - routeSnapshot.distanceKm, 0);
  const routePercent = Math.round(routeProgress * 100);
  const selectedOptionData = useMemo<RouteOptionData | null>(() => {
    if (!selectedOptionId) return null;

    const mapProvider = mapStyleInfo.provider === 'geoapify' ? 'Geoapify' : 'OpenFreeMap';
    const coordinateLabel = formatCoordinate(vehicleCoordinate);
    const options: Record<RouteMapOptionId, RouteOptionData> = {
      parking: {
        icon: 'parking',
        metrics: [
          { label: 'State', value: status },
          { label: 'Speed', value: `${currentSpeed} km/h` },
          { label: 'Location', value: coordinateLabel },
        ],
        summary: isTracking ? 'Parking mode is ready to stop playback at the current point.' : 'Playback is paused at the current point.',
        title: 'Parking',
        tone: isTracking ? 'orange' : 'green',
      },
      refresh: {
        icon: 'refresh',
        metrics: [
          { label: 'Progress', value: `${routePercent}%` },
          { label: 'Covered', value: `${routeSnapshot.distanceKm.toFixed(1)} km` },
          { label: 'Ping', value: pingTime },
        ],
        summary: 'Route playback restarted and the marker is following the route again.',
        title: 'Refresh',
        tone: 'orange',
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
          { label: 'Covered', value: `${routeSnapshot.distanceKm.toFixed(1)} km` },
        ],
        summary: 'Camera centered on the current playback marker.',
        title: 'Location',
        tone: 'green',
      },
      traffic: {
        icon: 'traffic-light',
        metrics: [
          { label: 'Traffic', value: isTrafficVisible ? 'Visible' : 'Hidden' },
          { label: 'Remaining', value: `${remainingDistanceKm.toFixed(1)} km` },
          { label: 'Trip', value: `${totalDistanceKm.toFixed(1)} km` },
        ],
        summary: isTrafficVisible ? 'Traffic-colored route overlay is visible.' : 'Traffic overlay is hidden; route remains visible.',
        title: 'Traffic',
        tone: isTrafficVisible ? 'green' : 'orange',
      },
      mapType: {
        icon: 'rhombus-outline',
        metrics: [
          { label: 'Map', value: isSatelliteMode ? 'Hybrid' : 'Standard' },
          { label: 'Provider', value: mapProvider },
          { label: 'Style', value: isNightMode ? 'Night' : 'Day' },
        ],
        summary: isSatelliteMode ? 'Hybrid road-map style is selected.' : 'Standard road-map style is selected.',
        title: 'Map Type',
        tone: 'orange',
      },
      direction: {
        icon: 'directions',
        metrics: [
          { label: 'Progress', value: `${routePercent}%` },
          { label: 'Heading', value: `${Math.round(heading)} deg` },
          { label: 'Next', value: `${remainingDistanceKm.toFixed(1)} km left` },
        ],
        summary: 'Playback advanced to the next route segment.',
        title: 'Direction',
        tone: 'orange',
      },
      night: {
        icon: 'weather-night',
        metrics: [
          { label: 'Theme', value: isNightMode ? 'Night' : 'Day' },
          { label: 'Map', value: isSatelliteMode ? 'Hybrid' : 'Standard' },
          { label: 'Provider', value: mapProvider },
        ],
        summary: isNightMode ? 'Night road-map style is active.' : 'Day road-map style is active.',
        title: 'Night Mode',
        tone: 'orange',
      },
      history: {
        icon: 'history',
        metrics: [
          { label: 'Covered', value: `${routeSnapshot.distanceKm.toFixed(1)} km` },
          { label: 'Trip', value: `${totalDistanceKm.toFixed(1)} km` },
          { label: 'Ping', value: pingTime },
        ],
        summary: 'Route history interval selector is open.',
        title: 'History',
        tone: 'orange',
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
    isTracking,
    isTrafficVisible,
    mapStyleInfo.provider,
    pingTime,
    remainingDistanceKm,
    routePercent,
    routeSnapshot.distanceKm,
    selectedOptionId,
    status,
    totalDistanceKm,
    vehicleCoordinate,
    vehicleName,
    vehicleSubtitle,
  ]);

  const followVehicle = useCallback(
    (duration = 650) => {
      cameraRef.current?.easeTo({
        center: toLngLat(vehicleCoordinate),
        duration,
        easing: 'ease',
        pitch: 0,
        zoom: 13.35,
      });
    },
    [vehicleCoordinate]
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

  const fitWholeRoute = useCallback(() => {
    cameraRef.current?.fitBounds(getRouteBounds(route), {
      duration: 700,
      easing: 'ease',
      padding: {
        top: insets.top + 110,
        right: 82,
        bottom: Math.max(insets.bottom + 228, 246),
        left: 82,
      },
    });
  }, [insets.bottom, insets.top, route]);

  const updateVehicleScreenPoint = useCallback(async () => {
    if (!mapRef.current) {
      return;
    }

    const requestId = ++projectionRequestRef.current;

    try {
      const point = await mapRef.current.project(toLngLat(vehicleCoordinate));
      if (requestId === projectionRequestRef.current) {
        setVehicleScreenPoint({ x: point[0], y: point[1] });
      }
    } catch {
      setVehicleScreenPoint(null);
    }
  }, [vehicleCoordinate]);

  const handleMapLayout = useCallback((event: LayoutChangeEvent) => {
    const { height: mapHeight, width: mapWidth } = event.nativeEvent.layout;
    const hasVisibleSize = mapHeight > 0 && mapWidth > 0;
    setMapContainerReady(hasVisibleSize);

    if (!hasVisibleSize) {
      setMapLoadState('error');
      setMapErrorMessage('Map container has no visible size.');
    }
  }, []);

  const handleMapWillLoad = useCallback(() => {
    setIsMapReady(false);
    setMapLoadState('loading');
    setMapErrorMessage('');
  }, []);

  const handleMapReady = useCallback(() => {
    if (blockingMapIssue) {
      setMapLoadState('error');
      setMapErrorMessage(blockingMapIssue.message);
      return;
    }

    setIsMapReady(true);
    setMapLoadState('ready');
    setMapErrorMessage('');

    requestAnimationFrame(() => {
      if (!initialRouteFitRef.current) {
        initialRouteFitRef.current = true;
        lastCameraFollowRef.current = Date.now();
        fitWholeRoute();
      }
      updateVehicleScreenPoint();
    });
  }, [blockingMapIssue, fitWholeRoute, updateVehicleScreenPoint]);

  const handleMapFail = useCallback(() => {
    setIsMapReady(false);
    setMapLoadState('error');
    setMapErrorMessage(
      'Map tiles could not be loaded. Check the Geoapify API key, HTTPS style URL, and device network access.'
    );
  }, []);

  const retryMapLoad = useCallback(() => {
    initialRouteFitRef.current = false;
    setIsMapReady(false);
    setVehicleScreenPoint(null);
    setMapLoadState('loading');
    setMapErrorMessage('');
    setMapRetryKey((current) => current + 1);
  }, []);

  useEffect(() => {
    // Animation only runs on the native map; the web fallback shows a static
    // route + marker so the WebView is never reloaded on every tick.
    if (!isTracking || !isMapAvailable) {
      return;
    }

    const timer = setInterval(() => {
      setRouteProgress((current) => (current + ROUTE_TICK_MS / ROUTE_LOOP_MS) % 1);
    }, ROUTE_TICK_MS);

    return () => clearInterval(timer);
  }, [isTracking]);

  const fallbackMarkers = useMemo<WebMapMarker[]>(
    () => [
      {
        id: 'vehicle',
        lat: vehicleCoordinate.latitude,
        lng: vehicleCoordinate.longitude,
        color: BRAND.green,
        heading,
      },
    ],
    [vehicleCoordinate, heading]
  );
  const fallbackPolyline = useMemo<[number, number][]>(
    () => route.map((c) => [c.longitude, c.latitude] as [number, number]),
    [route]
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    initialRouteFitRef.current = false;
    setIsMapReady(false);
    setVehicleScreenPoint(null);

    if (blockingMapIssue) {
      setMapLoadState('error');
      setMapErrorMessage(blockingMapIssue.message);
      return;
    }

    setMapLoadState('loading');
    setMapErrorMessage('');
  }, [blockingMapIssue, mapRetryKey, mapStyleUrl]);

  useEffect(() => {
    if (!isMapAvailable || !MapLibre || mapLoadState !== 'loading') {
      return;
    }

    const timeout = setTimeout(() => {
      setMapLoadState((current) => (current === 'loading' ? 'error' : current));
      setMapErrorMessage(
        'Map tiles are taking too long to load. Check the Geoapify API key, HTTPS access, and network connection.'
      );
    }, MAP_LOAD_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [mapLoadState, mapRetryKey, mapStyleUrl]);

  useEffect(() => {
    updateVehicleScreenPoint();

    if (!isFollowing || !isMapReady) {
      return;
    }

    const now = Date.now();
    if (now - lastCameraFollowRef.current > 620) {
      followVehicle(720);
      lastCameraFollowRef.current = now;
    }
  }, [followVehicle, isFollowing, isMapReady, updateVehicleScreenPoint, vehicleCoordinate]);

  const isMapLoading = mapLoadState === 'loading' || !mapContainerReady;

  // Real device with no usable history: show a loading state while the
  // playback query resolves, then a proper empty state. Never fall back to the
  // demo route for a real device (no fabricated GPS movement in production).
  if (hasRealDevice && (playbackLoading || realPointCount <= 1)) {
    return (
      <View style={styles.screen}>
        <View style={[styles.headerCard, { top: insets.top + 12 }]}>
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
          {playbackLoading ? (
            <>
              <ActivityIndicator color={BRAND.green} size="large" />
              <Text style={styles.playbackStateText}>Loading route history…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons color={BRAND.muted} name="map-marker-off-outline" size={40} />
              <Text style={styles.playbackStateText}>
                No GPS history is available for the selected period.
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  if (!isMapAvailable || !MapLibre) {
    return (
      <View style={styles.screen}>
        <FleetWebMap
          mapStyle={getMapStyle('street')}
          markers={fallbackMarkers}
          polyline={fallbackPolyline}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[styles.headerCard, { top: insets.top + 12 }]}>
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
              {vehicleSubtitle}
            </Text>
          </View>
        </View>
      </View>
    );
  }
  const { Camera, GeoJSONSource, Layer, Map, Marker } = MapLibre;

  return (
    <View style={styles.screen}>
      <Map
        androidView="texture"
        key={`route-map-${mapRetryKey}-${mapStyleInfo.provider}-${isNightMode ? 'night' : 'day'}-${isSatelliteMode ? 'alt' : 'street'}`}
        ref={mapRef}
        attribution={false}
        compass={false}
        logo={false}
        mapStyle={mapStyleUrl}
        onDidFailLoadingMap={handleMapFail}
        onDidFinishLoadingMap={handleMapReady}
        onDidFinishLoadingStyle={handleMapReady}
        onLayout={handleMapLayout}
        onPress={() => setIsFollowing(false)}
        onRegionDidChange={() => updateVehicleScreenPoint()}
        onWillStartLoadingMap={handleMapWillLoad}
        scaleBar={false}
        style={styles.mapCanvas}
        touchPitch={false}
        touchRotate={false}>
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: toLngLat(route[Math.min(20, route.length - 1)]),
            pitch: 0,
            zoom: 12.6,
          }}
          maxZoom={19}
          minZoom={5}
        />
        <GeoJSONSource data={routeFeature} id="route-source">
          <Layer
            id="route-shadow"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': 'rgba(15, 125, 56, 0.22)',
              'line-width': 12,
            }}
            type="line"
          />
          <Layer
            id="route-line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': isTrafficVisible ? 'rgba(255, 121, 0, 0.62)' : 'rgba(8, 138, 41, 0.45)',
              'line-width': 7,
            }}
            type="line"
          />
        </GeoJSONSource>
        <GeoJSONSource data={completedRouteFeature} id="completed-route-source">
          <Layer
            id="completed-route-line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': BRAND.green,
              'line-width': 6,
            }}
            type="line"
          />
        </GeoJSONSource>
        <Marker
          anchor="center"
          id="vehicle-pin"
          lngLat={toLngLat(vehicleCoordinate)}>
          <View style={[styles.vehiclePin, { transform: [{ rotate: `${heading}deg` }] }]}>
            <View style={styles.vehiclePinCore} />
          </View>
        </Marker>
      </Map>

      <View pointerEvents="none" style={styles.mapShade} />

      {mapLoadState === 'error' ? (
        <RouteMapStateOverlay
          message={mapErrorMessage}
          onRetry={retryMapLoad}
          state="error"
        />
      ) : isMapLoading ? (
        <RouteMapStateOverlay
          message={
            mapStyleInfo.provider === 'geoapify'
              ? 'Loading Geoapify road map'
              : 'Loading road map'
          }
          state="loading"
        />
      ) : null}

      {mapLoadState === 'ready' ? (
        <View
          pointerEvents="none"
          style={[
            styles.vehicleAnchor,
            {
              left: overlayPoint.x - VEHICLE_VIEW_SIZE / 2,
              top: overlayPoint.y - VEHICLE_VIEW_SIZE / 2,
            },
          ]}>
          <View style={styles.lockBeam} />
          <View style={styles.lockHaloOuter} />
          <View style={styles.lockHaloInner} />
          <VehicleModelView heading={heading} />
        </View>
      ) : null}

      <View style={[styles.headerCard, { top: insets.top + 12 }]}>
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
            {vehicleSubtitle}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setIsTracking((current) => !current);
            setIsAlertActive(false);
            showToast(isTracking ? 'Vehicle paused' : 'Vehicle running');
          }}
          style={[styles.statusPill, isTracking && !isAlertActive ? styles.statusPillActive : styles.statusPillStopped]}>
          <Text style={styles.statusPillText}>{status}</Text>
        </Pressable>
      </View>

      <View pointerEvents="box-none" style={[styles.sideRail, styles.leftRail, { top: insets.top + 158 }]}>
        <SideAction
          active={selectedOptionId === 'parking'}
          icon="parking"
          onPress={() => {
            setSelectedOptionId('parking');
            setIsTracking(false);
            setIsAlertActive(false);
            showToast('Parking mode');
          }}
          tone="light"
        />
        <SideAction
          active={selectedOptionId === 'refresh'}
          icon="refresh"
          onPress={() => {
            setSelectedOptionId('refresh');
            setRouteProgress(0.02);
            setIsTracking(true);
            setIsFollowing(true);
            setIsAlertActive(false);
            followVehicle(400);
            showToast('Route refreshed');
          }}
        />
        <SideAction
          active={selectedOptionId === 'follow'}
          icon="navigation-variant"
          onPress={() => {
            setSelectedOptionId('follow');
            setIsFollowing((current) => !current);
            showToast(isFollowing ? 'Manual map mode' : 'Following vehicle');
          }}
        />
        <SideAction
          active={selectedOptionId === 'alert' || isAlertActive}
          icon="alert"
          onPress={() => {
            setSelectedOptionId('alert');
            setIsAlertActive((current) => {
              const next = !current;
              showToast(next ? 'Emergency alert' : 'Alert cleared');
              return next;
            });
          }}
        />
        <SideAction
          active={selectedOptionId === 'call'}
          icon="phone"
          onPress={() => {
            setSelectedOptionId('call');
            Linking.openURL(`tel:${CONTACT_PHONE}`).catch(() => undefined);
            showToast('Calling support');
          }}
        />
      </View>

      <View pointerEvents="box-none" style={[styles.sideRail, styles.rightRail, { top: insets.top + 158 }]}>
        <SideAction
          active={selectedOptionId === 'location'}
          icon="map-marker"
          onPress={() => {
            setSelectedOptionId('location');
            setIsFollowing(true);
            followVehicle(400);
            updateVehicleScreenPoint();
            showToast('Vehicle centered');
          }}
          tone="light"
        />
        <SideAction
          active={selectedOptionId === 'traffic'}
          icon="traffic-light"
          onPress={() => {
            setSelectedOptionId('traffic');
            setIsTrafficVisible((current) => !current);
            showToast(isTrafficVisible ? 'Traffic hidden' : 'Traffic visible');
          }}
          tone="light"
        />
        <SideAction
          active={selectedOptionId === 'mapType' || isSatelliteMode}
          icon="rhombus-outline"
          onPress={() => {
            setSelectedOptionId('mapType');
            setIsSatelliteMode((current) => !current);
            showToast(isSatelliteMode ? 'Standard map' : 'Hybrid map');
          }}
        />
        <SideAction
          active={selectedOptionId === 'direction'}
          icon="directions"
          onPress={() => {
            setSelectedOptionId('direction');
            setRouteProgress((current) => (current + 0.06) % 1);
            setIsFollowing(true);
            showToast('Next route segment');
          }}
        />
        <SideAction
          active={selectedOptionId === 'night' || isNightMode}
          icon="weather-night"
          onPress={() => {
            setSelectedOptionId('night');
            setIsNightMode((current) => !current);
            showToast(isNightMode ? 'Day map' : 'Night map');
          }}
        />
        <SideAction
          active={selectedOptionId === 'history' || isHistoryVisible}
          icon="history"
          onPress={() => {
            setSelectedOptionId('history');
            setIsHistoryVisible(true);
            showToast('Route history');
          }}
        />
      </View>

      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View style={styles.deviceAvatar}>
            <MaterialCommunityIcons color={BRAND.red} name="car-sports" size={42} />
          </View>
          <View style={styles.deviceInfo}>
            <Text numberOfLines={1} style={styles.deviceName}>
              TN20CM7677 (VinothKumar)
            </Text>
            <Text numberOfLines={2} style={styles.deviceAddress}>
              Kuppalamadugu, Uthukkottai, Thiruvallur district, Tamil Nadu
            </Text>
          </View>
          <View style={styles.speedBlock}>
            <Text style={styles.speedValue}>{currentSpeed}</Text>
            <Text style={styles.speedLabel}>km/h</Text>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(routeProgress * 100)}%` }]} />
        </View>

        {selectedOptionData ? (
          <RouteOptionDataPanel data={selectedOptionData} onClose={() => setSelectedOptionId(null)} />
        ) : null}

        <View style={styles.sheetStats}>
          <Metric icon="clock-outline" label="Ping Time" value={pingTime} />
          <Metric icon="map-marker-distance" label="Covered" value={`${routeSnapshot.distanceKm.toFixed(1)} km`} />
          <Metric icon="flag-checkered" label="Trip" value={`${totalDistanceKm.toFixed(1)} km`} />
        </View>

        <View style={styles.sheetActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsTracking((current) => !current)}
            style={[styles.primaryAction, !isTracking && styles.primaryActionStopped]}>
            <MaterialCommunityIcons color="#fff" name={isTracking ? 'pause' : 'play'} size={25} />
            <Text style={styles.primaryActionText}>{isTracking ? 'Pause' : 'Resume'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSelectedOptionId('location');
              setIsFollowing(true);
              followVehicle(400);
              showToast('Following vehicle');
            }}
            style={styles.secondaryAction}>
            <MaterialCommunityIcons color={BRAND.green} name="target" size={24} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSelectedOptionId('direction');
              setRouteProgress((current) => Math.min(current + 0.08, 0.98));
              setIsFollowing(true);
              showToast('Route advanced');
            }}
            style={styles.secondaryAction}>
            <MaterialCommunityIcons color={BRAND.orange} name="map-marker-path" size={24} />
          </Pressable>
        </View>
      </View>

      {toastText ? (
        <View pointerEvents="none" style={[styles.toast, { top: insets.top + 92 }]}>
          <Text numberOfLines={1} style={styles.toastText}>
            {toastText}
          </Text>
        </View>
      ) : null}

      {isHistoryVisible ? (
        <RouteHistoryOverlay
          onClose={() => {
            setIsHistoryVisible(false);
            showToast('History closed');
          }}
          onSelect={(label, progress) => {
            setRouteProgress(progress);
            setIsTracking(false);
            setIsHistoryVisible(false);
            setIsFollowing(true);
            showToast(label);
          }}
        />
      ) : null}
    </View>
  );
}

function SideAction({
  active = false,
  icon,
  onPress,
  tone = 'orange',
}: {
  active?: boolean;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress?: () => void;
  tone?: 'orange' | 'light';
}) {
  const isLight = tone === 'light';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress ?? (() => undefined)}
      style={[
        styles.sideAction,
        isLight && styles.sideActionLight,
        active && styles.sideActionActive,
        active && isLight && styles.sideActionLightActive,
      ]}>
      <MaterialCommunityIcons color={isLight ? BRAND.green : '#fff'} name={icon} size={27} />
    </Pressable>
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
        <Text style={styles.mapStateTitle}>{isLoading ? 'Map Loading' : 'Map Tiles Unavailable'}</Text>
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

function RouteHistoryOverlay({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (label: string, progress: number) => void;
}) {
  const options = [
    ['Today', 0.32],
    ['Yesterday', 0.48],
    ['This Week', 0.66],
    ['Last 7 days', 0.72],
    ['Last Week', 0.18],
    ['Custom', 0.9],
  ] as const;

  return (
    <View style={styles.historyBackdrop}>
      <Pressable accessibilityLabel="Close route history" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View style={styles.historyCard}>
        <Text style={styles.historyTitle}>Route History</Text>
        <View style={styles.historyRule} />
        <Text style={styles.historySubtitle}>Select your time interval</Text>
        {options.map(([label, progress]) => (
          <Pressable
            accessibilityRole="button"
            key={label}
            onPress={() => onSelect(label, progress)}
            style={styles.historyOption}>
            <Text style={styles.historyOptionText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

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

function VehicleModelView({ heading }: { heading: number }) {
  const frameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const headingRef = useRef(heading);

  useEffect(() => {
    headingRef.current = heading;
  }, [heading]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const onContextCreate = useCallback(async (gl: ExpoWebGLRenderingContext) => {
    const renderer = new Renderer({
      alpha: true,
      antialias: true,
      gl: gl as unknown as WebGLRenderingContext,
    });

    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      34,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      100
    );

    camera.position.set(0, 4.8, 6.2);
    camera.lookAt(0, 0, 0);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.9);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);

    const warmLight = new THREE.DirectionalLight(0xfff1d8, 1.4);
    warmLight.position.set(-3, 3.5, 4);
    scene.add(warmLight);

    const rimLight = new THREE.DirectionalLight(0x45ffc2, 1.8);
    rimLight.position.set(-4, 4, -4);
    scene.add(rimLight);
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));

    const vehicleRoot = new THREE.Group();
    const model = createVehicleModelFromPreview();
    prepareModel(model);
    vehicleRoot.add(model);
    scene.add(vehicleRoot);

    const clock = new THREE.Clock();

    const render = () => {
      if (!mountedRef.current) {
        renderer.dispose();
        return;
      }

      const elapsed = clock.getElapsedTime();
      const targetRotation = THREE.MathUtils.degToRad(-headingRef.current);
      const rotationDelta = Math.atan2(
        Math.sin(targetRotation - vehicleRoot.rotation.y),
        Math.cos(targetRotation - vehicleRoot.rotation.y)
      );

      vehicleRoot.rotation.y += rotationDelta * 0.16;
      vehicleRoot.position.y = Math.sin(elapsed * 3.2) * 0.025;

      renderer.render(scene, camera);
      gl.endFrameEXP();
      frameRef.current = requestAnimationFrame(render);
    };

    render();
  }, []);

  return <GLView msaaSamples={4} onContextCreate={onContextCreate} style={StyleSheet.absoluteFill} />;
}

function createVehicleModelFromPreview() {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(VEHICLE_PREVIEW.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(VEHICLE_PREVIEW.normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const paint = new THREE.MeshStandardMaterial({
    color: 0xff3138,
    metalness: 0.4,
    roughness: 0.3,
  });

  const mesh = new THREE.Mesh(geometry, paint);
  mesh.name = VEHICLE_PREVIEW.source;
  group.add(mesh);

  return group;
}

function prepareModel(model: THREE.Object3D) {
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
    }
  });

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z, 1);

  model.position.sub(center);
  model.scale.setScalar(2.85 / largestSide);
  model.rotation.y = Math.PI / 2;

  const settledBounds = new THREE.Box3().setFromObject(model);
  model.position.y -= settledBounds.min.y + 0.18;
}

function toLngLat(coordinate: Coordinate): LngLat {
  return [coordinate.longitude, coordinate.latitude];
}

function createLineFeature(route: Coordinate[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: route.map(toLngLat),
    },
  };
}

function getRouteBounds(route: Coordinate[]) {
  const longitudes = route.map((point) => point.longitude);
  const latitudes = route.map((point) => point.latitude);

  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ] as [number, number, number, number];
}

function getRouteSnapshot(route: Coordinate[], progress: number) {
  const clampedProgress = ((progress % 1) + 1) % 1;
  const routeDistance = getRouteDistance(route);
  const targetDistance = routeDistance * clampedProgress;
  let travelled = 0;

  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const segmentDistance = getDistance(start, end);

    if (travelled + segmentDistance >= targetDistance) {
      const segmentProgress = segmentDistance === 0 ? 0 : (targetDistance - travelled) / segmentDistance;
      const coordinate = interpolateCoordinate(start, end, segmentProgress);

      return {
        completedRoute: [...route.slice(0, index), coordinate],
        coordinate,
        distanceKm: targetDistance,
        heading: getBearing(start, end),
      };
    }

    travelled += segmentDistance;
  }

  return {
    completedRoute: route,
    coordinate: route[route.length - 1],
    distanceKm: routeDistance,
    heading: getBearing(route[route.length - 2], route[route.length - 1]),
  };
}

function interpolateCoordinate(start: Coordinate, end: Coordinate, progress: number) {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
  };
}

function getRouteDistance(route: Coordinate[]) {
  return route.reduce((total, point, index) => {
    if (index === 0) {
      return total;
    }

    return total + getDistance(route[index - 1], point);
  }, 0);
}

function getDistance(start: Coordinate, end: Coordinate) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getBearing(start: Coordinate, end: Coordinate) {
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const x =
    Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
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

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
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
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(22, 32, 44, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 310,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#263238',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    width: '100%',
  },
  mapStateTitle: {
    color: BRAND.ink,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 10,
    textAlign: 'center',
  },
  mapStateMessage: {
    color: BRAND.muted,
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
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(255, 121, 0, 0.72)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    left: 18,
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: 'absolute',
    right: 18,
    shadowColor: '#263238',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  headerIconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 38,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: BRAND.green,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  headerSubtitle: {
    color: '#465261',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    marginTop: 4,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 6,
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
  sideRail: {
    gap: 12,
    position: 'absolute',
  },
  leftRail: {
    left: 16,
  },
  rightRail: {
    right: 16,
  },
  sideAction: {
    alignItems: 'center',
    backgroundColor: BRAND.orange,
    borderColor: 'rgba(255, 255, 255, 0.86)',
    borderRadius: 28,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    shadowColor: '#1b1f24',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.26,
    shadowRadius: 9,
    width: 56,
  },
  sideActionLight: {
    backgroundColor: '#fff',
    borderColor: 'rgba(17, 138, 54, 0.12)',
  },
  sideActionActive: {
    borderColor: '#fff',
    borderWidth: 2,
    shadowOpacity: 0.34,
  },
  sideActionLightActive: {
    borderColor: BRAND.orange,
  },
  vehicleAnchor: {
    height: VEHICLE_VIEW_SIZE,
    position: 'absolute',
    width: VEHICLE_VIEW_SIZE,
  },
  lockBeam: {
    alignSelf: 'center',
    backgroundColor: 'rgba(43, 230, 158, 0.54)',
    borderRadius: 5,
    bottom: -86,
    height: 176,
    position: 'absolute',
    shadowColor: BRAND.greenGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    width: 8,
  },
  lockHaloOuter: {
    alignSelf: 'center',
    backgroundColor: 'rgba(43, 230, 158, 0.16)',
    borderColor: 'rgba(17, 138, 54, 0.42)',
    borderRadius: 24,
    borderWidth: 2,
    bottom: 55,
    height: 48,
    position: 'absolute',
    width: 48,
  },
  lockHaloInner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(43, 230, 158, 0.86)',
    borderColor: '#fff',
    borderRadius: 10,
    borderWidth: 3,
    bottom: 69,
    height: 20,
    position: 'absolute',
    width: 20,
  },
  vehiclePin: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 138, 54, 0.18)',
    borderColor: 'rgba(17, 138, 54, 0.36)',
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  vehiclePinCore: {
    backgroundColor: BRAND.green,
    borderColor: '#fff',
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    width: 12,
  },
  bottomSheet: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: 'absolute',
    right: 0,
    shadowColor: '#1c2833',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(22, 32, 44, 0.2)',
    borderRadius: 2,
    height: 4,
    marginBottom: 12,
    width: 44,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  deviceAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(251, 47, 50, 0.1)',
    borderRadius: 8,
    height: 64,
    justifyContent: 'center',
    width: 70,
  },
  deviceInfo: {
    flex: 1,
    minWidth: 0,
  },
  deviceName: {
    color: BRAND.green,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
  },
  deviceAddress: {
    color: '#858f99',
    fontSize: 13,
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
    color: BRAND.green,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  speedLabel: {
    color: BRAND.ink,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  progressTrack: {
    backgroundColor: '#d9e1e5',
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
  optionPanel: {
    backgroundColor: '#f6fbf7',
    borderColor: 'rgba(17, 138, 54, 0.14)',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 11,
  },
  optionPanelRed: {
    backgroundColor: '#fff7f7',
    borderColor: 'rgba(251, 47, 50, 0.18)',
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
    color: BRAND.green,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  optionSummary: {
    color: BRAND.muted,
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
    borderColor: 'rgba(17, 138, 54, 0.12)',
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
    color: BRAND.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  optionMetricLabel: {
    color: BRAND.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  sheetStats: {
    borderColor: '#edf1f3',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
    paddingTop: 12,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 43,
  },
  metricValue: {
    color: BRAND.ink,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricLabel: {
    color: BRAND.muted,
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
    borderRadius: 8,
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
    backgroundColor: '#f4f8f6',
    borderColor: '#dce8e1',
    borderRadius: 8,
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
