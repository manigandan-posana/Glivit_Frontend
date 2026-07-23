import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, View } from 'react-native';
import * as THREE from 'three';

/**
 * 3D vehicle marker.
 *
 * Renders the real vehicle model on an `expo-gl` context. The geometry is the
 * actual car mesh baked from `model.fbx` to a compact positions+normals JSON
 * (`models/model.preview.json`, ~2.5MB / 54k verts) at build time, so the real
 * shape ships without the 111MB FBX or 29MB GLB ever entering the bundle. The
 * mesh is loaded once, centred, ground-seated and shared across every instance;
 * only the tint material is per-marker. Heading is interpolated with
 * shortest-angle rotation so it never spins the long way round at the 359°→0°
 * seam, and all WebGL resources are disposed on unmount. Falls back to a crisp
 * 2D navigation glyph when WebGL is unavailable, the context fails, or the model
 * cannot be parsed.
 *
 * Note: the baked asset is a single fused mesh (no named nodes), so per-part
 * animation (spinning wheels, brake-light materials) is intentionally not done
 * here — that would need the rigged GLB, which we deliberately keep out of the
 * runtime bundle. Heading easing + a parked idle bob are applied to the whole
 * model instead.
 */

// Target length (scene units) the model is scaled to, tuned to the camera below.
const MODEL_TARGET_LENGTH = 3.6;
// The baked model's longest axis is X; rotate it a quarter-turn so its length
// runs along Z (screen "forward") to match the heading convention. Flip by PI
// here if the model ever renders nose-backwards after a visual check.
const MODEL_YAW_OFFSET = Math.PI / 2;

// Shared low-poly fallback parts (used only if the baked model fails to load).
const BODY_GEO = new THREE.BoxGeometry(2, 0.55, 4);
const CABIN_GEO = new THREE.BoxGeometry(1.6, 0.55, 1.9);
const WHEEL_GEO = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14);

// Shared, lazily-built real-model geometry. `null` before first load; once
// `modelLoadFailed` is set, callers use the procedural fallback instead.
let MODEL_GEO: THREE.BufferGeometry | null = null;
let modelLoadFailed = false;

function getModelGeometry(): THREE.BufferGeometry | null {
  if (MODEL_GEO || modelLoadFailed) return MODEL_GEO;
  try {
    // Metro bundles the JSON as a module (positions + normals float arrays).
    const data = require('../../models/model.preview.json') as {
      positions: number[];
      normals: number[];
    };
    if (!data?.positions?.length) throw new Error('empty model positions');

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    if (data.normals?.length === data.positions.length) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    } else {
      geo.computeVertexNormals();
    }

    // Centre on the origin.
    geo.computeBoundingBox();
    const center = new THREE.Vector3();
    geo.boundingBox!.getCenter(center);
    geo.translate(-center.x, -center.y, -center.z);

    // Orient length along Z, then scale to a consistent on-screen size.
    geo.rotateY(MODEL_YAW_OFFSET);
    geo.computeBoundingBox();
    const dims = new THREE.Vector3();
    geo.boundingBox!.getSize(dims);
    const longest = Math.max(dims.x, dims.y, dims.z) || 1;
    const scale = MODEL_TARGET_LENGTH / longest;
    geo.scale(scale, scale, scale);

    // Seat the wheels on the ground plane (y = 0).
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox!.min.y, 0);
    geo.computeBoundingSphere();

    MODEL_GEO = geo;
    return geo;
  } catch (err) {
    console.warn('[Vehicle3DMarker] baked model load failed, using procedural car', err);
    modelLoadFailed = true;
    return null;
  }
}

interface Vehicle3DMarkerProps {
  heading: number;
  speed: number;
  isActive: boolean;
  color?: string;
  size?: number;
}

function lerpAngle(current: number, target: number, t: number): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * t;
}

function buildCar(color: string): { group: THREE.Group; materials: THREE.Material[] } {
  const group = new THREE.Group();

  // Preferred path: the real baked vehicle mesh (shared geometry, tinted).
  const modelGeo = getModelGeometry();
  if (modelGeo) {
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.45 });
    const model = new THREE.Mesh(modelGeo, bodyMat);
    group.add(model);
    return { group, materials: [bodyMat] };
  }

  // Fallback: procedural low-poly car if the model asset can't be parsed.
  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: '#e8eef5', metalness: 0.1, roughness: 0.4 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1b1f24', metalness: 0.2, roughness: 0.8 });

  const body = new THREE.Mesh(BODY_GEO, bodyMat);
  body.position.y = 0.5;
  group.add(body);

  const cabin = new THREE.Mesh(CABIN_GEO, cabinMat);
  cabin.position.set(0, 0.95, -0.2);
  group.add(cabin);

  const wheelPositions: [number, number][] = [
    [-1, 1.3],
    [1, 1.3],
    [-1, -1.3],
    [1, -1.3],
  ];
  for (const [x, z] of wheelPositions) {
    const wheel = new THREE.Mesh(WHEEL_GEO, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.35, z);
    group.add(wheel);
  }
  return { group, materials: [bodyMat, cabinMat, wheelMat] };
}

export const Vehicle3DMarker: React.FC<Vehicle3DMarkerProps> = ({
  heading,
  speed,
  isActive,
  color = '#3b82f6',
  size = 56,
}) => {
  const [webglFailed, setWebglFailed] = useState(Platform.OS === 'web');

  // Latest props read by the render loop without re-running the GL effect.
  const propsRef = useRef({ heading, speed, isActive });
  propsRef.current = { heading, speed, isActive };

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    let renderer: THREE.WebGLRenderer | null = null;
    let frame: number | null = null;
    let tintMaterials: THREE.Material[] = [];
    let car: THREE.Group | null = null;

    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        42,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.1,
        100
      );
      camera.position.set(0, 8.5, -9);
      camera.lookAt(0, 0.4, 0);

      renderer = new THREE.WebGLRenderer({ context: gl, antialias: true, alpha: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      // Cap DPR: this marker is ~56px, so 3x pixels is wasted GPU/battery.
      renderer.setPixelRatio(Math.min(2, PixelRatio.get()));

      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(6, 12, 4);
      scene.add(key);

      const built = buildCar(color);
      car = built.group;
      tintMaterials = built.materials;
      // Convert compass heading (deg, clockwise from N) to scene Y rotation.
      car.rotation.y = THREE.MathUtils.degToRad(-heading);
      scene.add(car);

      let firstFrame = true;
      const render = () => {
        frame = requestAnimationFrame(render);
        const p = propsRef.current;
        // Idle-skip: only touch the GPU when something is actually moving —
        // the heading is still easing toward its target, or the parked "bob"
        // is running. A stationary vehicle costs one cheap JS frame, no draw.
        let dirty = false;
        if (car) {
          const target = THREE.MathUtils.degToRad(-p.heading);
          const before = car.rotation.y;
          // Snap when nearly aligned; otherwise ease with shortest-angle lerp.
          car.rotation.y = lerpAngle(before, target, 0.18);
          if (Math.abs(car.rotation.y - before) > 0.0004) dirty = true;

          const bob = p.isActive && p.speed <= 0.5 ? Math.sin(Date.now() * 0.004) * 0.12 : 0;
          if (Math.abs(bob - car.position.y) > 0.0004) dirty = true;
          car.position.y = bob;
        }
        if (!dirty && !firstFrame) return;
        firstFrame = false;
        renderer!.render(scene, camera);
        gl.endFrameEXP();
      };
      render();
    } catch (err) {
      console.warn('[Vehicle3DMarker] WebGL init failed, using 2D fallback', err);
      setWebglFailed(true);
      return;
    }

    // Store disposer on the GL object so unmount can reach it.
    (gl as unknown as { __dispose?: () => void }).__dispose = () => {
      if (frame != null) cancelAnimationFrame(frame);
      if (car) {
        car.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh && Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        });
      }
      tintMaterials.forEach((m) => m.dispose()); // per-instance materials only
      renderer?.dispose();
      renderer = null;
    };
    glDisposerRef.current = (gl as unknown as { __dispose?: () => void }).__dispose ?? null;
  };

  const glDisposerRef = useRef<(() => void) | null>(null);
  useEffect(() => () => glDisposerRef.current?.(), []);

  if (webglFailed) {
    return (
      <View style={[styles.container, { width: size, height: size }, styles.center]}>
        <View style={{ transform: [{ rotate: `${heading}deg` }] }}>
          <MaterialCommunityIcons name="navigation" size={size * 0.72} color={color} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: 'transparent', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
