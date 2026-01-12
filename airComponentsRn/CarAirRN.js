import React, {useCallback, useEffect, useRef} from 'react';
import {PanResponder, StyleSheet} from 'react-native';
import {Asset} from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import {GLView} from 'expo-gl';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

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

function getTouchDistance(a, b) {
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

async function loadSeatModel(group) {
  const asset = Asset.fromModule(MODEL_ASSET);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) {
    console.warn('glb: missing asset uri');
    return null;
  }
  console.log('glb: loading', uri);

  const file = new FileSystem.File(uri);
  const buffer = await file.arrayBuffer();
  console.log('glb: bytes', buffer.byteLength);

  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      gltf => {
        const model = gltf.scene || gltf.scenes?.[0];
        if (!model) {
          console.warn('glb: parse ok but no scene');
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
        console.log('glb: size', size.toArray(), 'center', center.toArray(), 'scale', scale);

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y -= 0.6;

        group.add(model);
        console.log('glb: added to scene');
        resolve(model);
      },
      err => {
        console.warn('glb: parse error', err);
        reject(err);
      }
    );
  });
}

export default function CarAirRN({data = [], style}) {
  const stateRef = useRef({});
  const frameRef = useRef(null);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls) return;
        const touches = evt.nativeEvent.touches || [];
        if (touches.length === 2) {
          controls.isPinching = true;
          controls.lastDistance = getTouchDistance(touches[0], touches[1]);
        } else if (touches.length === 1) {
          controls.isPinching = false;
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;
        }
        controls.isInteracting = true;
      },
      onPanResponderMove: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls || !state.camera || !state.rootGroup) return;
        const touches = evt.nativeEvent.touches || [];
        if (touches.length === 2) {
          const distance = getTouchDistance(touches[0], touches[1]);
          if (controls.lastDistance > 0) {
            const delta = distance - controls.lastDistance;
            const nextDistance = clamp(controls.distance - delta * 0.01, 1.2, 12);
            controls.distance = nextDistance;
            state.camera.position.set(0, 0, nextDistance);
            state.camera.lookAt(0, 0, 0);
          }
          controls.lastDistance = distance;
          return;
        }

        if (touches.length === 1 && !controls.isPinching) {
          const dx = touches[0].pageX - (controls.lastX ?? touches[0].pageX);
          const dy = touches[0].pageY - (controls.lastY ?? touches[0].pageY);
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;

          const speed = 0.005;
          controls.rotationY += dx * speed;
          controls.rotationX = clamp(controls.rotationX + dy * speed, -Math.PI / 2, Math.PI / 2);

          state.rootGroup.rotation.y = controls.rotationY;
          state.rootGroup.rotation.x = controls.rotationX;
        }
      },
      onPanResponderRelease: () => {
        const controls = stateRef.current.controls;
        if (!controls) return;
        controls.isPinching = false;
        controls.lastDistance = 0;
        controls.isInteracting = false;
      },
      onPanResponderTerminate: () => {
        const controls = stateRef.current.controls;
        if (!controls) return;
        controls.isPinching = false;
        controls.lastDistance = 0;
        controls.isInteracting = false;
      },
    })
  ).current;

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
      camera.lookAt(0, 0, 0);

      const rootGroup = new THREE.Group();
      scene.add(rootGroup);

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
      rootGroup.add(points);

      const controls = {
        rotationX: -Math.PI / 3,
        rotationY: 0,
        distance: camera.position.z,
        lastX: 0,
        lastY: 0,
        lastDistance: 0,
        isPinching: false,
        isInteracting: false,
      };
      rootGroup.rotation.x = controls.rotationX;

      loadSeatModel(rootGroup).catch(err => {
        console.warn('glb: load failed', err);
      });

      stateRef.current = {
        scene,
        camera,
        renderer,
        rootGroup,
        geometry,
        points,
        positions,
        colors,
        basePositions,
        gl,
        controls,
      };

      updatePoints(data);

      const animate = () => {
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

  return (
    <GLView
      style={[styles.view, style]}
      onContextCreate={onContextCreate}
      {...panResponder.panHandlers}
    />
  );
}

const styles = StyleSheet.create({
  view: {
    flex: 1,
    backgroundColor: '#0b0f16',
  },
});
