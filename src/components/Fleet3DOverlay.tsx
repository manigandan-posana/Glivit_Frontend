import type { ExpoWebGLRenderingContext } from 'expo-gl';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as THREE from 'three';

import { createExpoThreeRenderer } from '@/src/services/expoThreeRenderer';

import { SafeGLView } from './SafeGLView';
import { buildCar, type CarVariant } from './Vehicle3DMarker';

export type Fleet3DOverlayMarker = {
  id: string;
  x: number;
  y: number;
  heading: number;
  speed: number;
  isActive: boolean;
  selected?: boolean;
  variant: CarVariant;
};

type Props = {
  height: number;
  markers: Fleet3DOverlayMarker[];
  onReady?: () => void;
  onModelError?: (id: string, variant: CarVariant, message: string) => void;
  onModelLoaded?: (id: string, variant: CarVariant) => void;
  onModelLoadStart?: (id: string, variant: CarVariant) => void;
  onUnavailable?: (message: string) => void;
  width: number;
};

type RenderedVehicle = {
  car: THREE.Group;
  disposeModel: () => void;
  lengthMeters: number;
  loadReported: boolean;
  materials: THREE.Material[];
  root: THREE.Group;
  variant: CarVariant;
};

const CONTEXT_TIMEOUT_MS = 3500;

function lerpAngle(current: number, target: number, amount: number) {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * amount;
}

/**
 * Renders every visible fleet vehicle in one transparent GL scene.
 *
 * Geometry is cached by Vehicle3DMarker/buildCar, so vehicles using the same
 * model share buffers. Only transforms and lightweight materials are unique.
 */
export function Fleet3DOverlay({
  height,
  markers,
  onModelError,
  onModelLoaded,
  onModelLoadStart,
  onReady,
  onUnavailable,
  width,
}: Props) {
  const markersRef = useRef(markers);
  const onModelErrorRef = useRef(onModelError);
  const onModelLoadedRef = useRef(onModelLoaded);
  const onModelLoadStartRef = useRef(onModelLoadStart);
  const onReadyRef = useRef(onReady);
  const onUnavailableRef = useRef(onUnavailable);
  const disposerRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  markersRef.current = markers;
  onModelErrorRef.current = onModelError;
  onModelLoadedRef.current = onModelLoaded;
  onModelLoadStartRef.current = onModelLoadStart;
  onReadyRef.current = onReady;
  onUnavailableRef.current = onUnavailable;

  useEffect(() => {
    if (failed || ready) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      disposerRef.current?.();
      disposerRef.current = null;
      setFailed(true);
      onUnavailableRef.current?.('The 3D graphics context did not become ready in time.');
    }, CONTEXT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [failed, ready]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      disposerRef.current?.();
      disposerRef.current = null;
    },
    []
  );

  const onContextCreate = useCallback(
    (gl: ExpoWebGLRenderingContext) => {
      disposerRef.current?.();
      disposerRef.current = null;
      let renderer: THREE.WebGLRenderer | null = null;
      let frame: number | null = null;
      const rendered = new Map<string, RenderedVehicle>();
      const failedModels = new Map<string, CarVariant>();

      const removeVehicle = (id: string) => {
        const entry = rendered.get(id);
        if (!entry) return;
        entry.root.removeFromParent();
        entry.materials.forEach((material) => material.dispose());
        entry.disposeModel();
        rendered.delete(id);
      };

      try {
        if (
          !gl ||
          !Number.isFinite(gl.drawingBufferWidth) ||
          !Number.isFinite(gl.drawingBufferHeight) ||
          gl.drawingBufferWidth <= 0 ||
          gl.drawingBufferHeight <= 0
        ) {
          throw new Error('GL drawing surface has no visible size');
        }

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(
          -width / 2,
          width / 2,
          height / 2,
          -height / 2,
          0.1,
          1000
        );
        camera.position.set(0, 0, 500);
        camera.lookAt(0, 0, 0);

        renderer = createExpoThreeRenderer(gl, { alpha: true, antialias: false });
        renderer.setPixelRatio(1);
        renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
        renderer.setClearColor(0x000000, 0);

        scene.add(new THREE.HemisphereLight(0xf2f9ff, 0x122335, 1.65));
        const key = new THREE.DirectionalLight(0xffffff, 1.75);
        key.position.set(-80, 120, 280);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0x52e6ff, 1.1);
        rim.position.set(140, -100, 220);
        scene.add(rim);

        let lastRenderedAt = 0;
        let readyReported = false;
        const render = (time: number) => {
          frame = requestAnimationFrame(render);
          try {
            if (time - lastRenderedAt < 32) return;
            lastRenderedAt = time;

            const currentMarkers = markersRef.current;
            const activeIds = new Set(currentMarkers.map((marker) => marker.id));
            Array.from(rendered.keys()).forEach((id) => {
              if (!activeIds.has(id)) removeVehicle(id);
            });
            Array.from(failedModels.keys()).forEach((id) => {
              if (!activeIds.has(id)) failedModels.delete(id);
            });

            currentMarkers.forEach((marker) => {
              let entry = rendered.get(marker.id);
              if (entry && entry.variant !== marker.variant) {
                removeVehicle(marker.id);
                entry = undefined;
              }
              if (failedModels.get(marker.id) !== marker.variant) {
                failedModels.delete(marker.id);
              }
              if (!entry) {
                if (failedModels.get(marker.id) === marker.variant) return;
                onModelLoadStartRef.current?.(marker.id, marker.variant);
                const built = buildCar(marker.variant);
                if (!built.model) {
                  built.materials.forEach((material) => material.dispose());
                  built.disposeModel();
                  failedModels.set(marker.id, marker.variant);
                  const message = `The packaged ${marker.variant} model could not be loaded.`;
                  console.warn(`[Fleet3DOverlay] ${message}`);
                  onModelErrorRef.current?.(marker.id, marker.variant, message);
                  return;
                }
                const root = new THREE.Group();
                root.rotation.x = Math.PI / 2;
                // Spawn already facing the reported travel direction so the model
                // never spins up from 0deg (north) on first appearance.
                built.group.rotation.y = THREE.MathUtils.degToRad(180 - marker.heading);
                root.add(built.group);
                scene.add(root);
                entry = {
                  car: built.group,
                  disposeModel: built.disposeModel,
                  lengthMeters: built.model.targetLengthMeters,
                  loadReported: false,
                  materials: built.materials,
                  root,
                  variant: marker.variant,
                };
                rendered.set(marker.id, entry);
              }

              const targetPixels = marker.selected ? 56 : 43;
              const scale = targetPixels / entry.lengthMeters;
              entry.root.scale.setScalar(scale);
              entry.root.position.set(
                marker.x - width / 2,
                height / 2 - marker.y,
                marker.selected ? 8 : 0
              );
              // Generated models face local +Z. The +90deg root tilt projects that
              // forward axis onto the screen with a vertical flip, so the GPS
              // heading must be mirrored (180 - heading) for the nose to point the
              // real travel direction: GPS 0/90/180/270 -> screen up/right/down/left.
              // lerpAngle turns through the shortest arc so it never spins in
              // reverse or shakes between fixes.
              const targetHeading = THREE.MathUtils.degToRad(180 - marker.heading);
              entry.car.rotation.y = lerpAngle(entry.car.rotation.y, targetHeading, 0.22);
            });

            renderer?.render(scene, camera);
            gl.endFrameEXP();
            rendered.forEach((entry, id) => {
              if (entry.loadReported) return;
              entry.loadReported = true;
              onModelLoadedRef.current?.(id, entry.variant);
            });
            if (!readyReported && (currentMarkers.length === 0 || rendered.size > 0)) {
              readyReported = true;
              if (mountedRef.current) {
                setReady(true);
                onReadyRef.current?.();
              }
            }
          } catch (error) {
            if (frame != null) cancelAnimationFrame(frame);
            Array.from(rendered.keys()).forEach(removeVehicle);
            failedModels.clear();
            renderer?.renderLists.dispose();
            renderer?.dispose();
            renderer = null;
            if (mountedRef.current) {
              const message =
                error instanceof Error ? error.message : 'The 3D renderer stopped unexpectedly.';
              console.warn('[Fleet3DOverlay] Render failed; using marker images.', error);
              setFailed(true);
              onUnavailableRef.current?.(message);
            }
          }
        };
        frame = requestAnimationFrame(render);

        disposerRef.current = () => {
          if (frame != null) cancelAnimationFrame(frame);
          Array.from(rendered.keys()).forEach(removeVehicle);
          failedModels.clear();
          renderer?.renderLists.dispose();
          renderer?.dispose();
          renderer = null;
        };
      } catch (error) {
        console.warn('[Fleet3DOverlay] Shared 3D renderer unavailable; using marker images.', error);
        if (frame != null) cancelAnimationFrame(frame);
        Array.from(rendered.keys()).forEach(removeVehicle);
        failedModels.clear();
        renderer?.renderLists.dispose();
        renderer?.dispose();
        if (mountedRef.current) {
          setFailed(true);
          onUnavailableRef.current?.(
            error instanceof Error ? error.message : 'The 3D renderer could not start.'
          );
        }
      }
    },
    [height, width]
  );

  if (failed || width <= 0 || height <= 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <SafeGLView
        key={`${Math.round(width)}x${Math.round(height)}`}
        collapsable={false}
        msaaSamples={0}
        onContextCreate={onContextCreate}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
