import React, {useCallback, useEffect, useRef} from 'react';
import {Image, StyleSheet} from 'react-native';
import {GLView} from 'expo-gl';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';

const GRID_SIZE = 12;
const POINTS = GRID_SIZE * GRID_SIZE;
const HEIGHT_SCALE = 0.6;
const SPACING = 0.18;
const MODEL_ASSET = require('../image/Adaptive_Seat_20251223.glb');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function valueToColor(value) {
  const t = clamp(value / 255, 0, 1);
  const r = 0.2 + 0.8 * t;
  const g = 0.2 + 0.6 * t;
  const b = 0.45 + 0.4 * (1 - t);
  return [r, g, b];
}

async function loadSeatModel(scene) {
  const source = Image.resolveAssetSource(MODEL_ASSET);
  if (!source?.uri) return null;

  const response = await fetch(source.uri);
  if (!response.ok) {
    throw new Error(`model fetch failed: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();

  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      gltf => {
        const model = gltf.scene || gltf.scenes?.[0];
        if (!model) {
          reject(new Error('model missing'));
          return;
        }

        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 2.8 / maxDim : 1;

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y -= 0.6;

        scene.add(model);
        resolve(model);
      },
      err => reject(err)
    );
  });
}

export default function CarAirRN({data = [], style}) {
  const stateRef = useRef({});
  const frameRef = useRef(null);

  const updatePoints = useCallback(values => {
    const state = stateRef.current;
    if (!state.geometry) return;

    const input = Array.isArray(values) && values.length === POINTS ? values : new Array(POINTS).fill(0);
    const positions = state.positions;
    const colors = state.colors;

    for (let i = 0; i < POINTS; i += 1) {
      const value = input[i] ?? 0;
      const t = clamp(value / 255, 0, 1);
      const idx = i * 3;

      positions[idx] = state.basePositions[idx];
      positions[idx + 1] = state.basePositions[idx + 1];
      positions[idx + 2] = state.basePositions[idx + 2] + t * HEIGHT_SCALE;

      const [r, g, b] = valueToColor(value);
      colors[idx] = r;
      colors[idx + 1] = g;
      colors[idx + 2] = b;
    }

    state.geometry.attributes.position.needsUpdate = true;
    state.geometry.attributes.color.needsUpdate = true;
  }, []);

  const onContextCreate = useCallback(
    gl => {
      const {drawingBufferWidth: width, drawingBufferHeight: height} = gl;
      const canvas = {
        width,
        height,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0f16);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50);
      camera.position.set(0, 0, 4.2);

      const renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        antialias: true,
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(gl.pixelRatio || 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const light = new THREE.DirectionalLight(0xffffff, 1.2);
      light.position.set(3, 4, 5);
      scene.add(light);
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));

      const basePositions = new Float32Array(POINTS * 3);
      const positions = new Float32Array(POINTS * 3);
      const colors = new Float32Array(POINTS * 3);

      for (let i = 0; i < POINTS; i += 1) {
        const x = (i % GRID_SIZE) - (GRID_SIZE - 1) / 2;
        const y = Math.floor(i / GRID_SIZE) - (GRID_SIZE - 1) / 2;
        const idx = i * 3;

        basePositions[idx] = x * SPACING;
        basePositions[idx + 1] = -y * SPACING;
        basePositions[idx + 2] = 0;

        positions[idx] = basePositions[idx];
        positions[idx + 1] = basePositions[idx + 1];
        positions[idx + 2] = basePositions[idx + 2];

        colors[idx] = 0.2;
        colors[idx + 1] = 0.2;
        colors[idx + 2] = 0.4;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const material = new THREE.PointsMaterial({
        size: 0.08,
        vertexColors: true,
      });
      const points = new THREE.Points(geometry, material);
      points.rotation.x = -Math.PI / 3;
      scene.add(points);

      loadSeatModel(scene).catch(() => {});

      stateRef.current = {
        scene,
        camera,
        renderer,
        geometry,
        points,
        positions,
        colors,
        basePositions,
        gl,
      };

      updatePoints(data);

      const animate = () => {
        points.rotation.z += 0.002;
        renderer.render(scene, camera);
        gl.endFrameEXP();
        frameRef.current = requestAnimationFrame(animate);
      };
      animate();
    },
    [data, updatePoints]
  );

  useEffect(() => {
    updatePoints(data);
  }, [data, updatePoints]);

  useEffect(
    () => () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    []
  );

  return <GLView style={[styles.view, style]} onContextCreate={onContextCreate} />;
}

const styles = StyleSheet.create({
  view: {
    flex: 1,
    backgroundColor: '#0b0f16',
  },
});
