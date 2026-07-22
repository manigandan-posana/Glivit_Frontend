import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import React, { useEffect, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, View } from 'react-native';
import * as THREE from 'three';

/**
 * Lightweight 3D vehicle marker.
 *
 * Renders a stylised low-poly car built procedurally with `three` on an
 * `expo-gl` context (no `expo-three`, no oversized FBX asset — the 111MB source
 * model is kept out of the runtime bundle). Geometry is shared across every
 * instance; only the tint material is per-marker. Heading is interpolated with
 * shortest-angle rotation so it never spins the long way round at the 359°→0°
 * seam, and all WebGL resources are disposed on unmount. Falls back to a crisp
 * 2D navigation glyph when WebGL is unavailable or the context fails.
 */

// Shared, reused across all markers — created once, never disposed per-instance.
const BODY_GEO = new THREE.BoxGeometry(2, 0.55, 4);
const CABIN_GEO = new THREE.BoxGeometry(1.6, 0.55, 1.9);
const WHEEL_GEO = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 14);

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
      renderer.setPixelRatio(PixelRatio.get());

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

      const render = () => {
        frame = requestAnimationFrame(render);
        const p = propsRef.current;
        if (car) {
          const target = THREE.MathUtils.degToRad(-p.heading);
          // Snap when nearly aligned; otherwise ease with shortest-angle lerp.
          car.rotation.y = lerpAngle(car.rotation.y, target, 0.18);
          car.position.y = p.isActive && p.speed <= 0.5 ? Math.sin(Date.now() * 0.004) * 0.12 : 0;
        }
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
