import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FleetWebMap, type FleetWebMapHandle, type WebMapMarker } from '@/src/components/FleetWebMap';
import { StatusPill } from '@/src/components/ui/StatusPill';
import { EmptyView } from '@/src/components/ui/StateViews';
import { isMapAvailable, MapLibre } from '@/src/services/maplibre';
import { getMapStyle, toNativeStyle } from '@/src/services/mapStyle';
import { useGetDevicesQuery } from '@/src/services/devicesApi';
import type { DeviceSummary } from '@/src/types/api';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

export default function AllVehiclesMapScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors: c, stateColors } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { width } = useWindowDimensions();
  const cameraRef = useRef<CameraRef>(null);
  const webMapRef = useRef<FleetWebMapHandle>(null);
  const listRef = useRef<FlatList<DeviceSummary>>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data, isFetching, refetch } = useGetDevicesQuery({ page: 0, size: 100 });

  const located = useMemo(
    () => (data?.content ?? []).filter((d) => d.latitude != null && d.longitude != null),
    [data]
  );
  const selectedId = located[selectedIndex]?.id ?? null;

  const webMarkers = useMemo<WebMapMarker[]>(
    () =>
      located.map((d) => ({
        id: d.id,
        lat: d.latitude as number,
        lng: d.longitude as number,
        color: stateColors[d.state] ?? stateColors.NO_DATA,
        heading: d.course,
      })),
    [located, stateColors]
  );

  const cardWidth = width - spacing.md * 2;
  const snapInterval = cardWidth + spacing.sm;
  const mapStyleSpec = getMapStyle('street');
  const useNative = isMapAvailable && MapLibre != null;

  const focusNative = useCallback((device: DeviceSummary) => {
    if (device?.latitude == null || device?.longitude == null) return;
    cameraRef.current?.easeTo({
      center: [device.longitude, device.latitude],
      zoom: 14,
      duration: 500,
      easing: 'ease',
    });
  }, []);

  const fitAll = useCallback(() => {
    if (useNative) {
      if (located.length === 0) return;
      const lngs = located.map((d) => d.longitude as number);
      const lats = located.map((d) => d.latitude as number);
      cameraRef.current?.fitBounds(
        [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)] as [
          number,
          number,
          number,
          number,
        ],
        { duration: 600, easing: 'ease', padding: { top: 120, right: 60, bottom: 220, left: 60 } }
      );
    } else {
      webMapRef.current?.fitAll();
    }
  }, [useNative, located]);

  const selectByIndex = useCallback(
    (index: number, scroll = false) => {
      const device = located[index];
      if (!device) return;
      setSelectedIndex(index);
      if (useNative) focusNative(device);
      if (scroll) listRef.current?.scrollToIndex({ index, animated: true });
    },
    [located, useNative, focusNative]
  );

  const selectById = useCallback(
    (id: string | number) => {
      const index = located.findIndex((d) => d.id === id);
      if (index >= 0) selectByIndex(index, true);
    },
    [located, selectByIndex]
  );

  const openLiveTrack = (item: DeviceSummary) =>
    router.push({ pathname: '/live-track', params: { deviceId: String(item.id), name: item.name, subtitle: item.address ?? '' } });

  const openPlayback = (item: DeviceSummary) =>
    router.push({ pathname: '/trip-playback' as never, params: { deviceId: String(item.id), name: item.name } });

  return (
    <View style={styles.screen}>
      {useNative && MapLibre ? (
        <NativeFleetMap
          cameraRef={cameraRef}
          located={located}
          mapStyle={toNativeStyle(mapStyleSpec)}
          onFitAll={fitAll}
          onSelectIndex={(i) => selectByIndex(i, true)}
          selectedIndex={selectedIndex}
        />
      ) : (
        <FleetWebMap
          ref={webMapRef}
          mapStyle={mapStyleSpec}
          markers={webMarkers}
          onSelect={selectById}
          selectedId={selectedId}
          style={StyleSheet.absoluteFillObject}
        />
      )}

      {/* Floating controls */}
      <View style={[styles.railLeft, { top: insets.top + spacing.md }]}>
        <FloatingButton icon="menu" onPress={() => navigation.dispatch(DrawerActions.openDrawer())} />
      </View>
      <View style={[styles.railRight, { top: insets.top + spacing.md }]}>
        <FloatingButton icon="refresh" loading={isFetching} onPress={refetch} />
        <FloatingButton icon="fit-to-page-outline" onPress={fitAll} />
      </View>

      {located.length === 0 ? (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <EmptyView icon="map-marker-off" title="No located vehicles" message="No live positions to show yet." />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={located}
          horizontal
          keyExtractor={(item) => String(item.id)}
          showsHorizontalScrollIndicator={false}
          snapToInterval={snapInterval}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => selectByIndex(Math.round(e.nativeEvent.contentOffset.x / snapInterval))}
          contentContainerStyle={[styles.cards, { paddingBottom: insets.bottom + spacing.md }]}
          style={styles.cardList}
          getItemLayout={(_, index) => ({ length: snapInterval, offset: snapInterval * index, index })}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => openLiveTrack(item)}
              style={[styles.card, { width: cardWidth }]}>
              <View style={styles.cardTop}>
                <Text numberOfLines={1} style={styles.cardName}>
                  {item.name}
                </Text>
                <StatusPill state={item.state} />
              </View>
              <Text numberOfLines={1} style={styles.cardAddress}>
                {item.address ?? 'Address unavailable'}
              </Text>
              <View style={styles.cardMetaRow}>
                <Text style={styles.cardMeta}>{Math.round(item.speed)} km/h</Text>
                <View style={styles.cardActions}>
                  <Pressable
                    accessibilityLabel="Cinematic 3D playback"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => openPlayback(item)}
                    style={styles.cardPlay}>
                    <MaterialCommunityIcons color={c.primary} name="movie-open" size={15} />
                    <Text style={styles.cardPlayText}>Playback</Text>
                  </Pressable>
                  <Text style={styles.cardTrack}>Track ›</Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

/** Native MapLibre surface, only mounted when the native module is present. */
function NativeFleetMap({
  cameraRef,
  located,
  mapStyle,
  onFitAll,
  onSelectIndex,
  selectedIndex,
}: {
  cameraRef: React.RefObject<CameraRef | null>;
  located: DeviceSummary[];
  mapStyle: string;
  onFitAll: () => void;
  onSelectIndex: (index: number) => void;
  selectedIndex: number;
}) {
  const { colors: c, stateColors } = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { Map, Camera, Marker } = MapLibre!;
  return (
    <Map
      androidView="texture"
      attribution={false}
      compass={false}
      logo={false}
      mapStyle={mapStyle}
      onDidFinishLoadingMap={onFitAll}
      scaleBar={false}
      style={StyleSheet.absoluteFill}>
      <Camera ref={cameraRef} initialViewState={{ center: [77.59, 12.97], zoom: 10 }} />
      {located.map((device, index) => (
        <Marker
          key={device.id}
          anchor="center"
          id={`device-${device.id}`}
          lngLat={[device.longitude as number, device.latitude as number]}>
          <Pressable accessibilityRole="button" onPress={() => onSelectIndex(index)}>
            <View
              style={[
                styles.marker,
                { backgroundColor: stateColors[device.state] ?? stateColors.NO_DATA },
                index === selectedIndex && styles.markerSelected,
              ]}>
              <MaterialCommunityIcons color="#FFFFFF" name="navigation" size={16} />
            </View>
          </Pressable>
        </Marker>
      ))}
    </Map>
  );
}

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
      <MaterialCommunityIcons color={c.textPrimary} name={loading ? 'timer-sand' : icon} size={22} />
    </Pressable>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    marker: {
      alignItems: 'center',
      borderColor: '#FFFFFF',
      borderRadius: 16,
      borderWidth: 2,
      height: 32,
      justifyContent: 'center',
      width: 32,
    },
    markerSelected: { borderColor: c.info, height: 40, width: 40 },
    railLeft: { left: spacing.md, position: 'absolute' },
    railRight: { gap: spacing.sm, position: 'absolute', right: spacing.md },
    fab: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth * 2,
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
    cardList: { bottom: 0, left: 0, position: 'absolute', right: 0 },
    cards: { gap: spacing.sm, paddingHorizontal: spacing.md },
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth * 2,
      padding: spacing.md,
    },
    cardTop: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
    cardName: { color: c.textPrimary, flex: 1, fontSize: typography.body, fontWeight: '800' },
    cardAddress: { color: c.textSecondary, fontSize: typography.caption, marginTop: 4 },
    cardMetaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
    cardMeta: { color: c.textPrimary, fontSize: typography.label, fontWeight: '700' },
    cardActions: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
    cardPlay: {
      alignItems: 'center',
      backgroundColor: c.accentSoft,
      borderRadius: radius.pill,
      flexDirection: 'row',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    cardPlayText: { color: c.primary, fontSize: typography.caption, fontWeight: '800' },
    cardTrack: { color: c.info, fontSize: typography.caption, fontWeight: '700' },
  });
