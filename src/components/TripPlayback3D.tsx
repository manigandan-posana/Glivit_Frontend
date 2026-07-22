import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import React, { useMemo, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import * as THREE from 'three';

import type { PlaybackEventMarker, PlaybackStopMarker, PlaybackTrackPoint } from '@/src/types/api';

export type CameraMode = 'cinematic' | 'chase' | 'orbit' | 'top';

type Props = {
  points: PlaybackTrackPoint[];
  events: PlaybackEventMarker[];
  stops: PlaybackStopMarker[];
  /** Mutated at 60fps by the screen's clock — read in the render loop, no re-render. */
  progressRef: React.MutableRefObject<number>;
  cameraMode: CameraMode;
  accent?: string;
};

// Cinematic palette (independent of app theme — the stage is always a night scene).
const C = {
  bg: 0x05070c,
  grid: 0x11202e,
  route: 0x1ea7ff,
  routeGlow: 0x2be6ff,
  car: 0x22c55e,
  cabin: 0xe8eef5,
  tyre: 0x0a0d12,
  event: 0xff3b47,
  stop: 0x3b82f6,
};

const M_PER_DEG = 111_320;

function project(points: PlaybackTrackPoint[]) {
  const valid = points.filter((p) => p.gpsValid !== false);
  const src = valid.length >= 2 ? valid : points;
  const lat0 = src.reduce((s, p) => s + p.lat, 0) / src.length;
  const lng0 = src.reduce((s, p) => s + p.lng, 0) / src.length;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const raw = src.map((p) => ({
    x: (p.lng - lng0) * cos * M_PER_DEG,
    z: -(p.lat - lat0) * M_PER_DEG,
    speed: p.speed,
  }));
  let maxExtent = 1;
  for (const r of raw) maxExtent = Math.max(maxExtent, Math.abs(r.x), Math.abs(r.z));
  const scale = Math.min(4, 240 / maxExtent);
  const toWorld = (lat: number, lng: number) =>
    new THREE.Vector3((lng - lng0) * cos * M_PER_DEG * scale, 0.1, -(lat - lat0) * M_PER_DEG * scale);
  const pts = raw.map((r) => new THREE.Vector3(r.x * scale, 0.1, r.z * scale));
  return { pts, speeds: raw.map((r) => r.speed), toWorld, span: maxExtent * scale };
}

function damp(current: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  const t = 1 - Math.exp(-lambda * dt);
  current.lerp(target, t);
}

export const TripPlayback3D: React.FC<Props> = ({ points, events, stops, progressRef, cameraMode, accent }) => {
  const [failed, setFailed] = useState(Platform.OS === 'web');
  const modeRef = useRef(cameraMode);
  modeRef.current = cameraMode;

  const geo = useMemo(() => (points.length >= 2 ? project(points) : null), [points]);
  const curve = useMemo(
    () => (geo ? new THREE.CatmullRomCurve3(geo.pts, false, 'catmullrom', 0.4) : null),
    [geo]
  );

  const disposerRef = useRef<(() => void) | null>(null);
  React.useEffect(() => () => disposerRef.current?.(), []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    if (!curve || !geo) {
      setFailed(true);
      return;
    }
    let renderer: THREE.WebGLRenderer | null = null;
    let frame: number | null = null;
    const disposables: { dispose: () => void }[] = [];

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(C.bg);
      scene.fog = new THREE.Fog(C.bg, geo.span * 0.9, geo.span * 3.2);

      const camera = new THREE.PerspectiveCamera(
        50,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        4000
      );
      renderer = new THREE.WebGLRenderer({ context: gl, antialias: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setPixelRatio(PixelRatio.get());

      // Lighting — cool key + warm rim for depth.
      scene.add(new THREE.AmbientLight(0x24405e, 1.1));
      const key = new THREE.DirectionalLight(0xbfe6ff, 1.4);
      key.position.set(80, 160, 40);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x2be6ff, 0.7);
      rim.position.set(-60, 40, -80);
      scene.add(rim);

      // Ground grid, faded by fog.
      const grid = new THREE.GridHelper(geo.span * 4, 60, C.grid, C.grid);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      scene.add(grid);
      disposables.push(grid.geometry, grid.material as THREE.Material);

      // Route as a glowing neon tube.
      const tubeGeo = new THREE.TubeGeometry(curve, Math.min(600, geo.pts.length * 6), 0.7, 10, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: C.route,
        emissive: new THREE.Color(C.routeGlow),
        emissiveIntensity: 0.7,
        metalness: 0.2,
        roughness: 0.4,
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tube);
      disposables.push(tubeGeo, tubeMat);

      // Start / finish pylons.
      const makePylon = (pos: THREE.Vector3, color: number) => {
        const g = new THREE.CylinderGeometry(0.3, 0.3, 10, 8);
        const m = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.8 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(pos.x, 5, pos.z);
        scene.add(mesh);
        disposables.push(g, m);
      };
      makePylon(geo.pts[0], C.car);
      makePylon(geo.pts[geo.pts.length - 1], C.event);

      // Stop rings.
      for (const s of stops) {
        const p = geo.toWorld(s.lat, s.lng);
        const g = new THREE.TorusGeometry(3.4, 0.25, 8, 32);
        const m = new THREE.MeshStandardMaterial({ color: C.stop, emissive: new THREE.Color(C.stop), emissiveIntensity: 0.7 });
        const ring = new THREE.Mesh(g, m);
        ring.position.set(p.x, 0.2, p.z);
        ring.rotation.x = Math.PI / 2;
        scene.add(ring);
        disposables.push(g, m);
      }

      // Event beacons (pulsing).
      const beacons: THREE.Mesh[] = [];
      for (const e of events) {
        const p = geo.toWorld(e.lat, e.lng);
        const g = new THREE.ConeGeometry(1.4, 6, 6);
        const m = new THREE.MeshStandardMaterial({ color: C.event, emissive: new THREE.Color(C.event), emissiveIntensity: 1 });
        const cone = new THREE.Mesh(g, m);
        cone.position.set(p.x, 3, p.z);
        scene.add(cone);
        beacons.push(cone);
        disposables.push(g, m);
      }

      // Vehicle: procedural low-poly car + glowing halo.
      const car = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(2.2, 0.6, 4.4);
      const cabinGeo = new THREE.BoxGeometry(1.7, 0.6, 2.1);
      const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.45, 14);
      const bodyMat = new THREE.MeshStandardMaterial({ color: accent ? new THREE.Color(accent) : C.car, metalness: 0.4, roughness: 0.35, emissive: new THREE.Color(C.car), emissiveIntensity: 0.25 });
      const cabinMat = new THREE.MeshStandardMaterial({ color: C.cabin, metalness: 0.1, roughness: 0.3 });
      const wheelMat = new THREE.MeshStandardMaterial({ color: C.tyre, roughness: 0.9 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.6;
      car.add(body);
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 1.05, -0.2);
      car.add(cabin);
      for (const [x, z] of [[-1.1, 1.4], [1.1, 1.4], [-1.1, -1.4], [1.1, -1.4]] as [number, number][]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.4, z);
        car.add(w);
      }
      const haloGeo = new THREE.RingGeometry(2.4, 3.2, 32);
      const haloMat = new THREE.MeshBasicMaterial({ color: C.car, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.05;
      car.add(halo);
      scene.add(car);
      disposables.push(bodyGeo, cabinGeo, wheelGeo, bodyMat, cabinMat, wheelMat, haloGeo, haloMat);

      const camPos = new THREE.Vector3(geo.pts[0].x, 120, geo.pts[0].z - 120);
      const camLook = geo.pts[0].clone();
      camera.position.copy(camPos);

      const up = new THREE.Vector3(0, 1, 0);
      const tmpTan = new THREE.Vector3();
      const desiredPos = new THREE.Vector3();
      const desiredLook = new THREE.Vector3();
      const side = new THREE.Vector3();
      let camClock = 0;
      let last = Date.now();

      const shot = (t: number, carPos: THREE.Vector3, tan: THREE.Vector3, mode: CameraMode) => {
        side.copy(tan).cross(up).normalize();
        if (mode === 'top') {
          desiredPos.set(carPos.x, 90, carPos.z - 0.01);
          desiredLook.copy(carPos);
          return;
        }
        if (mode === 'chase') {
          desiredPos.copy(carPos).addScaledVector(tan, -14).addScaledVector(up, 7);
          desiredLook.copy(carPos).addScaledVector(tan, 6);
          return;
        }
        if (mode === 'orbit') {
          const a = t * 0.6;
          desiredPos.set(carPos.x + Math.cos(a) * 22, carPos.y + 12 + Math.sin(t * 0.3) * 4, carPos.z + Math.sin(a) * 22);
          desiredLook.copy(carPos);
          return;
        }
        // cinematic: cycle establishing -> chase -> orbit -> crane
        const cycle = t % 20;
        if (t < 4) {
          const k = t / 4; // descend from a high wide establishing shot
          desiredPos.copy(carPos).addScaledVector(tan, -40 + k * 24).addScaledVector(up, 90 - k * 78);
          desiredLook.copy(carPos);
        } else if (cycle < 6) {
          desiredPos.copy(carPos).addScaledVector(tan, -15).addScaledVector(up, 6.5);
          desiredLook.copy(carPos).addScaledVector(tan, 8);
        } else if (cycle < 13) {
          const a = t * 0.7;
          desiredPos.set(carPos.x + Math.cos(a) * 20, carPos.y + 11 + Math.sin(t * 0.4) * 5, carPos.z + Math.sin(a) * 20);
          desiredLook.copy(carPos);
        } else {
          const craneT = (cycle - 13) / 7;
          desiredPos.copy(carPos).addScaledVector(side, 18).addScaledVector(up, 5 + craneT * 22).addScaledVector(tan, -2);
          desiredLook.copy(carPos);
        }
      };

      const render = () => {
        frame = requestAnimationFrame(render);
        const now = Date.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        camClock += dt;

        const mode = modeRef.current;
        const u = Math.max(0, Math.min(0.9999, progressRef.current));
        const carPos = curve.getPointAt(u);
        curve.getTangentAt(u, tmpTan).normalize();

        car.position.copy(carPos);
        car.rotation.y = Math.atan2(tmpTan.x, tmpTan.z);
        const pulse = 0.4 + Math.sin(now * 0.006) * 0.18;
        haloMat.opacity = pulse;
        halo.scale.setScalar(1 + Math.sin(now * 0.006) * 0.08);
        for (const b of beacons) b.scale.y = 1 + Math.sin(now * 0.005 + b.position.x) * 0.15;

        shot(camClock, carPos, tmpTan, mode);
        damp(camPos, desiredPos, 3.2, dt);
        damp(camLook, desiredLook, 4.5, dt);
        camera.position.copy(camPos);
        camera.lookAt(camLook);

        renderer!.render(scene, camera);
        gl.endFrameEXP();
      };
      render();

      disposerRef.current = () => {
        if (frame != null) cancelAnimationFrame(frame);
        disposables.forEach((d) => d.dispose());
        renderer?.dispose();
        renderer = null;
      };
    } catch (err) {
      console.warn('[TripPlayback3D] init failed', err);
      setFailed(true);
    }
  };

  if (failed || !geo) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>3D playback unavailable — showing 2D route on the map.</Text>
      </View>
    );
  }

  return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />;
};

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', backgroundColor: '#05070c', flex: 1, justifyContent: 'center', padding: 24 },
  fallbackText: { color: '#9fb0c0', textAlign: 'center' },
});
