import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TripPlayback3D, type CameraMode } from '@/src/components/TripPlayback3D';
import { apiErrorMessage } from '@/src/services/apiError';
import { useGetDevicePlaybackQuery } from '@/src/services/devicesApi';
import { useTheme } from '@/src/theme/ThemeProvider';

const BASE_SECONDS = 45; // whole trip plays in ~45s at 1x, then speed multiplies
const SPEEDS = [0.5, 1, 2, 4] as const;
const CAMERAS: { id: CameraMode; icon: string; label: string }[] = [
  { id: 'cinematic', icon: 'movie-open', label: 'Cinematic' },
  { id: 'chase', icon: 'car-sports', label: 'Chase' },
  { id: 'orbit', icon: 'orbit', label: 'Drone' },
  { id: 'top', icon: 'crosshairs-gps', label: 'Top' },
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

export default function TripPlaybackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ deviceId?: string; name?: string }>();
  const deviceId = Number(params.deviceId);

  const { data, isLoading, isError, error, refetch } = useGetDevicePlaybackQuery(
    { deviceId },
    { skip: !Number.isFinite(deviceId) }
  );

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [camera, setCamera] = useState<CameraMode>('cinematic');
  const [ui, setUi] = useState(0); // throttled progress for UI (0..1)

  const progressRef = useRef(0);
  const playingRef = useRef(playing);
  const speedRef = useRef<number>(speed);
  const trackWidth = useRef(0);
  playingRef.current = playing;
  speedRef.current = speed;

  const points = data?.points ?? [];

  // Real trip duration (for the clock readout) and event tick fractions.
  const timing = useMemo(() => {
    if (points.length < 2) return { start: 0, end: 1, durationMin: 0 };
    const start = new Date(points[0].t).getTime();
    const end = new Date(points[points.length - 1].t).getTime();
    return { start, end, durationMin: Math.max(0, (end - start) / 60000) };
  }, [points]);

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
      if (playingRef.current && points.length >= 2) {
        progressRef.current += (dt / BASE_SECONDS) * speedRef.current;
        if (progressRef.current >= 1) {
          progressRef.current = 1;
          setPlaying(false);
        }
      }
      if (now - lastUi > 80) {
        lastUi = now;
        setUi(progressRef.current);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [points.length]);

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

  const restart = () => {
    seek(0);
    setPlaying(true);
  };
  const togglePlay = () => {
    if (progressRef.current >= 1) restart();
    else setPlaying((p) => !p);
  };

  if (!Number.isFinite(deviceId)) {
    return <Center text="No vehicle selected." />;
  }
  if (isLoading) {
    return <Center spinner text="Preparing cinematic playback…" />;
  }
  if (isError || !data) {
    return <Center text={apiErrorMessage(error)} onRetry={refetch} />;
  }
  if (points.length < 2) {
    return <Center text="Not enough trip history to play back yet." onRetry={refetch} />;
  }

  const idx = Math.min(points.length - 1, Math.floor(ui * (points.length - 1)));
  const curSpeed = Math.round(points[idx]?.speed ?? 0);
  const elapsedMin = timing.durationMin * ui;

  return (
    <View style={styles.root}>
      <TripPlayback3D
        points={points}
        events={data.events}
        stops={data.stops}
        progressRef={progressRef}
        cameraMode={camera}
        accent={colors.primary}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityLabel="Back" hitSlop={12} onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialCommunityIcons color={G.text} name="arrow-left" size={22} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={styles.title}>{params.name ?? `Vehicle #${deviceId}`}</Text>
          <Text style={styles.subtitle}>
            {data.distanceKm.toFixed(1)} km · {Math.round(timing.durationMin)} min · {data.returnedPoints} pts
          </Text>
        </View>
      </View>

      {/* Camera mode rail */}
      <View style={[styles.camRail, { top: insets.top + 64 }]}>
        {CAMERAS.map((cam) => {
          const active = cam.id === camera;
          return (
            <Pressable
              key={cam.id}
              accessibilityLabel={cam.label}
              onPress={() => setCamera(cam.id)}
              style={[styles.camBtn, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <MaterialCommunityIcons color={active ? colors.onPrimary : G.text} name={cam.icon as never} size={18} />
            </Pressable>
          );
        })}
      </View>

      {/* Bottom control deck */}
      <View style={[styles.deck, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.statRow}>
          <View style={styles.speedBlock}>
            <Text style={styles.speedValue}>{curSpeed}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
          <View style={styles.statPair}>
            <Stat label="Elapsed" value={`${Math.floor(elapsedMin)}:${String(Math.floor((elapsedMin % 1) * 60)).padStart(2, '0')}`} />
            <Stat label="Covered" value={`${Math.round(ui * 100)}%`} />
            <Stat label="Distance" value={`${(data.distanceKm * ui).toFixed(1)} km`} />
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.timelineWrap}>
          <View style={styles.track} onLayout={onTrackLayout} {...pan.panHandlers}>
            <View style={[styles.trackFill, { width: `${ui * 100}%`, backgroundColor: colors.primary }]} />
            {eventTicks.map((t, i) => (
              <View key={i} style={[styles.tick, { left: `${t.frac * 100}%`, backgroundColor: G.text }]} />
            ))}
            <View style={[styles.thumb, { left: `${ui * 100}%`, borderColor: colors.primary }]} />
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable accessibilityLabel="Restart" onPress={restart} style={styles.ctrlSmall}>
            <MaterialCommunityIcons color={G.text} name="restart" size={22} />
          </Pressable>
          <Pressable accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={togglePlay} style={[styles.playBtn, { backgroundColor: colors.primary }]}>
            <MaterialCommunityIcons color={colors.onPrimary} name={playing ? 'pause' : 'play'} size={30} />
          </Pressable>
          <View style={styles.speeds}>
            {SPEEDS.map((sp) => {
              const active = sp === speed;
              return (
                <Pressable
                  key={sp}
                  onPress={() => setSpeed(sp)}
                  style={[styles.speedChip, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  <Text style={[styles.speedChipText, { color: active ? colors.onPrimary : G.sub }]}>{sp}x</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
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

const styles = StyleSheet.create({
  root: { backgroundColor: '#05070c', flex: 1 },
  center: { alignItems: 'center', backgroundColor: '#05070c', flex: 1, gap: 12, justifyContent: 'center', padding: 24 },
  centerText: { color: G.sub, fontSize: 15, textAlign: 'center' },
  retry: { borderColor: '#22c55e', borderRadius: 10, borderWidth: 1, marginTop: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#22c55e', fontWeight: '800' },

  topBar: { alignItems: 'center', flexDirection: 'row', gap: 12, left: 0, paddingHorizontal: 14, position: 'absolute', right: 0, top: 0 },
  iconBtn: {
    alignItems: 'center', backgroundColor: G.glass, borderColor: G.hair, borderRadius: 12, borderWidth: 1,
    height: 40, justifyContent: 'center', width: 40,
  },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { color: G.text, fontSize: 17, fontWeight: '900' },
  subtitle: { color: G.sub, fontSize: 12, marginTop: 1 },

  camRail: { gap: 8, position: 'absolute', right: 14 },
  camBtn: {
    alignItems: 'center', backgroundColor: G.glass, borderColor: G.hair, borderRadius: 12, borderWidth: 1,
    height: 40, justifyContent: 'center', width: 40,
  },

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
