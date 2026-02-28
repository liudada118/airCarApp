import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Asset} from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import {GLView} from 'expo-gl';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {addSide, lineInterpnew, jetWhite3} from '../../util/util';

// ─── 常量 ────────────────────────────────────────────────────────────────────
const SEPARATION = 100;
const POINT_SCALE = 0.005;
const HIDE_THRESHOLD_RATIO = 0.3;
const ENABLE_POINT_HIDE = false;
const MODEL_ASSET = require('../../image/chair3.glb');
const DEFAULT_SETTINGS = {
  gauss: 1,
  color: 2550,
  height: 1,
  coherent: 1,
};
// 数据更新频率：15Hz
const SEAT_UPDATE_INTERVAL = 1000 / 15;
const MODEL_TARGET_SIZE = 220;
const CAMERA_MIN_DISTANCE = 80;
const CAMERA_MAX_DISTANCE = 600;

// 按需渲染：手势结束后继续渲染的帧数（用于惯性/过渡）
const IDLE_RENDER_FRAMES = 3;

// ─── 点图贴合参数（根据 chair3.glb 几何分析精确计算） ─────────────────────
const DEFAULT_POINT_FIT_LAYOUT = {
  center: {position: [0, -82, 42], rotation: [-Math.PI / 2 + 0.15, 0, 0]},
  centersit: {position: [0, 5, -52], rotation: [-0.1, 0, 0]},
  leftsit: {position: [42, 8, -48], rotation: [-0.1, 0.6, 0]},
  rightsit: {position: [-42, 8, -48], rotation: [-0.1, -0.6, 0]},
};

const DEFAULT_POINT_MAP_ROTATE = {x: 0, y: 0, z: 0};
const POINT_MAP_SCALE_DEFAULT = 1.8;

// ─── 插值配置（保持原有点数不变） ────────────────────────────────────────────
const sitleftConfig = {sitnum1: 3, sitnum2: 2, sitInterp: 5, sitInterp1: 1, sitOrder: 3};
const sitConfig = {sitnum1: 10, sitnum2: 6, sitInterp: 4, sitInterp1: 5, sitOrder: 3};
const backConfig = {sitnum1: 3, sitnum2: 2, sitInterp: 8, sitInterp1: 2, sitOrder: 2};
const sitConfigBack = {sitnum1: 10, sitnum2: 6, sitInterp: 9, sitInterp1: 6, sitOrder: 3};

const allConfig = {
  sit: {
    dataConfig: sitConfig,
    name: 'center',
    pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
  },
  necksit: {
    dataConfig: backConfig,
    name: 'leftsit',
    pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
  },
  backsit: {
    dataConfig: backConfig,
    name: 'rightsit',
    pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
  },
  sitsit: {
    dataConfig: sitConfigBack,
    name: 'centersit',
    pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
  },
};

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function getInterpolatedGrid(config) {
  const {sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder} = config;
  const amountX = 1 + (sitnum1 - 1) * sitInterp + sitOrder * 2;
  const amountY = 1 + (sitnum2 - 1) * sitInterp1 + sitOrder * 2;
  return {amountX, amountY, total: amountX * amountY};
}

function addTotal(configs) {
  configs.forEach(config => {
    config.total = getInterpolatedGrid(config).total;
  });
}

addTotal([sitleftConfig, backConfig, sitConfig, sitConfigBack]);

function createSmoothBig() {
  return {
    left: new Array(sitleftConfig.total).fill(1),
    right: new Array(sitleftConfig.total).fill(1),
    center: new Array(sitConfig.total).fill(1),
    leftsit: new Array(backConfig.total).fill(1),
    rightsit: new Array(backConfig.total).fill(1),
    centersit: new Array(sitConfigBack.total).fill(1),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTouchDistance(a, b) {
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── 预计算高斯卷积核（避免每帧调用 Math.exp） ─────────────────────────────
// 原始 gaussBlur_return 对每个像素的每个卷积核元素都调用 Math.exp()，
// 但权重只取决于 (ix-j, iy-i) 的偏移量，与像素位置无关。
// 预计算一次即可，每次数据更新节省约 24 万次 Math.exp 调用。

function buildGaussKernel(r) {
  const rs = Math.ceil(r * 2.57);
  const size = 2 * rs + 1;
  const kernel = new Float64Array(size * size);
  let wsum = 0;
  let idx = 0;
  for (let dy = -rs; dy <= rs; dy++) {
    for (let dx = -rs; dx <= rs; dx++) {
      const dsq = dx * dx + dy * dy;
      const w = Math.exp(-dsq / (2 * r * r)) / (Math.PI * 2 * r * r);
      kernel[idx++] = w;
      wsum += w;
    }
  }
  // 归一化，使权重和为 1（消除边界截断误差）
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= wsum;
  }
  return {kernel, rs, size};
}

// 预计算 r=1 的高斯核（全局只算一次）
const GAUSS_KERNEL = buildGaussKernel(DEFAULT_SETTINGS.gauss);

/**
 * 优化版高斯模糊：使用预计算的归一化权重表
 * 相比原版 gaussBlur_return，消除了每像素 49 次 Math.exp 调用
 */
function gaussBlurFast(scl, w, h, resultBuf) {
  const {kernel, rs, size} = GAUSS_KERNEL;
  const result = resultBuf || new Array(scl.length).fill(0);

  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      let val = 0;
      let kidx = 0;
      for (let dy = -rs; dy <= rs; dy++) {
        const y = i + dy;
        // 边界钳制
        const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
        const rowOff = cy * w;
        for (let dx = -rs; dx <= rs; dx++) {
          const x = j + dx;
          const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
          val += scl[rowOff + cx] * kernel[kidx];
          kidx++;
        }
      }
      result[i * w + j] = Math.round(val);
    }
  }
  return result;
}

// ─── 预分配临时数组（避免每帧 GC） ───────────────────────────────────────────
// 为每个区域预分配 lineInterp → addSide → gaussBlur 的中间缓冲区

function createWorkBuffers() {
  const buffers = {};
  Object.keys(allConfig).forEach(key => {
    const config = allConfig[key].dataConfig;
    const {sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder} = config;
    const interpW = 1 + (sitnum2 - 1) * sitInterp1;
    const interpH = 1 + (sitnum1 - 1) * sitInterp;
    const sideW = interpW + sitOrder * 2;
    const sideH = interpH + sitOrder * 2;
    buffers[allConfig[key].name] = {
      gaussBuf: new Array(sideW * sideH).fill(0),
    };
  });
  return buffers;
}

// ─── 模型加载 ────────────────────────────────────────────────────────────────

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
        const scale = maxDim > 0 ? MODEL_TARGET_SIZE / maxDim : 1;
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
      },
    );
  });
}

// ─── 圆形纹理（程序生成，全局共享单例） ─────────────────────────────────────
// 优化：所有点图材质共享同一个纹理实例，减少 GPU 纹理切换

let _sharedCircleTexture = null;

function getSharedCircleTexture(size = 32) {
  if (_sharedCircleTexture) {
    return _sharedCircleTexture;
  }
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;
  const feather = 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let alpha = 0;
      if (dist <= radius) {
        alpha = 255;
        if (dist > radius - feather) {
          alpha = Math.max(0, Math.round(((radius - dist) / feather) * 255));
        }
      }
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter; // 不用 mipmap，减少内存
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  _sharedCircleTexture = texture;
  return texture;
}

// ─── 点图数据处理 ────────────────────────────────────────────────────────────

function normalizeSeatData(values) {
  const normalized = new Array(144).fill(0);
  if (!Array.isArray(values)) {
    return normalized;
  }
  const limit = Math.min(values.length, 144);
  for (let i = 0; i < limit; i += 1) {
    const value = Number(values[i]);
    normalized[i] = Number.isFinite(value) ? value : 0;
  }
  return normalized;
}

function splitSeatData(ndata1) {
  const left = ndata1.slice(0, 6);
  const right = ndata1.slice(6, 12);
  const center = ndata1.slice(12, 12 + 60);

  const leftsit = ndata1.slice(72, 72 + 6);
  const rightsit = ndata1.slice(72 + 6, 72 + 12);
  const centersit = ndata1.slice(72 + 12, 72 + 12 + 60);

  for (let i = 0; i < 1; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      [leftsit[i * 2 + j], leftsit[(2 - i) * 2 + j]] = [
        leftsit[(2 - i) * 2 + j],
        leftsit[i * 2 + j],
      ];
    }
  }

  for (let i = 0; i < 1; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      [rightsit[i * 2 + j], rightsit[(2 - i) * 2 + j]] = [
        rightsit[(2 - i) * 2 + j],
        rightsit[i * 2 + j],
      ];
    }
  }

  for (let i = 0; i < 5; i += 1) {
    for (let j = 0; j < 6; j += 1) {
      [centersit[i * 6 + j], centersit[(9 - i) * 6 + j]] = [
        centersit[(9 - i) * 6 + j],
        centersit[i * 6 + j],
      ];
    }
  }

  return {
    left: leftsit,
    right: rightsit,
    center: centersit,
    leftsit: right,
    rightsit: left,
    centersit: center,
  };
}

// ─── 点图初始化与更新 ────────────────────────────────────────────────────────

function initPoint(config, pointConfig, name, group) {
  const {position, rotation} = pointConfig;
  const {amountX, amountY, total: numParticles} = getInterpolatedGrid(config);
  const positions = new Float32Array(numParticles * 3);
  const scales = new Float32Array(numParticles);
  const colors = new Float32Array(numParticles * 3);

  let i = 0;
  let j = 0;
  for (let ix = 0; ix < amountX; ix += 1) {
    for (let iy = 0; iy < amountY; iy += 1) {
      positions[i] = iy * SEPARATION - (amountX * SEPARATION) / 2;
      positions[i + 1] = 0;
      positions[i + 2] = ix * SEPARATION - (amountY * SEPARATION) / 2;

      scales[j] = 1;
      colors[i] = 0;
      colors[i + 1] = 0;
      colors[i + 2] = 1;
      i += 3;
      j += 1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // 共享圆形纹理（所有点图材质共用一个）
  const circleTexture = getSharedCircleTexture();

  const material = new THREE.PointsMaterial({
    vertexColors: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    opacity: 0.6,
    size: name === 'center' || name === 'centersit' ? 2 : 2.5,
    map: circleTexture,
    alphaTest: 0.2,
  });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float aScale;\nvarying float vScale;\nvoid main() {',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vScale = aScale;',
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'varying float vScale;\nvoid main() {',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\n if (vScale <= 0.0) discard;',
      );
  };
  material.needsUpdate = true;

  const particles = new THREE.Points(geometry, material);
  particles.scale.set(POINT_SCALE, POINT_SCALE, POINT_SCALE);
  if (position?.length) {
    particles.position.set(...position);
  }
  if (rotation?.length) {
    particles.rotation.set(...rotation);
  }
  particles.name = name;
  group.add(particles);

  return particles;
}

function initPoints(group) {
  const meshes = {};
  Object.keys(allConfig).forEach(key => {
    const obj = allConfig[key];
    meshes[obj.name] = initPoint(obj.dataConfig, obj.pointConfig, obj.name, group);
  });
  return meshes;
}

function applyPointFitToModel(model, pointMeshes, layoutMap = DEFAULT_POINT_FIT_LAYOUT) {
  if (!model || !pointMeshes) {
    return;
  }
  const localCenter = new THREE.Vector3(0, -0.6, 0);

  Object.keys(layoutMap).forEach(name => {
    const mesh = pointMeshes[name];
    const layout = layoutMap[name];
    if (!mesh || !layout) {
      return;
    }
    mesh.position.set(
      localCenter.x + layout.position[0],
      localCenter.y + layout.position[1],
      localCenter.z + layout.position[2],
    );
    mesh.rotation.set(...layout.rotation);
  });
}

function applyPointScaleToMeshes(pointMeshes, scaleFactor = 1) {
  if (!pointMeshes) {
    return;
  }
  const safeFactor = Number.isFinite(scaleFactor) ? scaleFactor : 1;
  const meshScale = POINT_SCALE * safeFactor;
  Object.values(pointMeshes).forEach(mesh => {
    if (!mesh?.scale) {
      return;
    }
    mesh.scale.set(meshScale, meshScale, meshScale);
  });
}

function applyPointRotateToGroup(pointGroup, rotateMap = DEFAULT_POINT_MAP_ROTATE) {
  if (!pointGroup?.rotation) {
    return;
  }
  const x = Number.isFinite(rotateMap?.x) ? rotateMap.x : 0;
  const y = Number.isFinite(rotateMap?.y) ? rotateMap.y : 0;
  const z = Number.isFinite(rotateMap?.z) ? rotateMap.z : 0;
  pointGroup.rotation.set(x, y, z);
}

// 使用优化版高斯模糊 + 复用 buffer
function sitRenew(config, name, ndata1, smoothBig, particles, workBuf) {
  if (!particles || !particles.geometry) {
    return;
  }
  const geometry = particles.geometry;
  const {sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder} = config;
  const {amountX, amountY} = getInterpolatedGrid(config);

  const posAttr = geometry.getAttribute('position');
  const colorAttr = geometry.getAttribute('color');
  const scalesAttr = geometry.getAttribute('aScale');
  const position = posAttr.array;
  const colors = colorAttr.array;
  const scales = scalesAttr?.array instanceof Float32Array ? scalesAttr.array : null;

  const {color, height, coherent} = DEFAULT_SETTINGS;

  const bigArr = lineInterpnew(ndata1, sitnum2, sitnum1, sitInterp1, sitInterp);
  const bigArrs = addSide(
    bigArr,
    1 + (sitnum2 - 1) * sitInterp1,
    1 + (sitnum1 - 1) * sitInterp,
    sitOrder,
    sitOrder,
  );

  // 使用预计算权重的快速高斯模糊，复用 buffer
  const gaussBuf = workBuf?.gaussBuf;
  const bigArrg = gaussBlurFast(
    bigArrs,
    1 + (sitnum2 - 1) * sitInterp1 + sitOrder * 2,
    1 + (sitnum1 - 1) * sitInterp + sitOrder * 2,
    gaussBuf,
  );

  let k = 0;
  let l = 0;
  let j = 0;
  const hideThreshold = color * HIDE_THRESHOLD_RATIO;
  for (let ix = 0; ix < amountX; ix += 1) {
    for (let iy = 0; iy < amountY; iy += 1) {
      const rawValue = Number(bigArrg[l]) * 10;
      const value = Number.isFinite(rawValue) ? rawValue : 0;
      smoothBig[l] = smoothBig[l] + (value - smoothBig[l]) / coherent;

      position[k] = iy * SEPARATION - (amountX * SEPARATION) / 2;
      position[k + 1] = -smoothBig[l] * height;
      position[k + 2] = ix * SEPARATION - (amountY * SEPARATION) / 2;

      if (scales) {
        const isHidden = ENABLE_POINT_HIDE && value <= hideThreshold;
        scales[j] = isHidden ? 0 : 1;
      }

      const rgb = jetWhite3(0, color, smoothBig[l]);
      colors[k] = rgb[0] / 255;
      colors[k + 1] = rgb[1] / 255;
      colors[k + 2] = rgb[2] / 255;

      k += 3;
      l += 1;
      j += 1;
    }
  }

  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  if (scalesAttr) {
    scalesAttr.needsUpdate = true;
  }
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function CarAirRN({data = [], style}) {
  const stateRef = useRef({});
  const dataRef = useRef(data);
  const frameRef = useRef(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // 手势响应器：单指旋转 + 双指缩放
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,

      onPanResponderGrant: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls) {
          return;
        }
        const touches = evt.nativeEvent.touches || [];

        if (touches.length === 2) {
          controls.isPinching = true;
          controls.lastPinchDistance = getTouchDistance(touches[0], touches[1]);
        } else if (touches.length === 1) {
          controls.isPinching = false;
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;
        }
        controls.isInteracting = true;
        // 标记需要渲染
        state.dirty = true;
      },

      onPanResponderMove: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls || !state.camera || !state.rootGroup) {
          return;
        }
        const touches = evt.nativeEvent.touches || [];

        // ── 双指缩放 ──
        if (touches.length === 2) {
          if (!controls.isPinching) {
            controls.isPinching = true;
            controls.lastPinchDistance = getTouchDistance(touches[0], touches[1]);
            return;
          }
          const currentDistance = getTouchDistance(touches[0], touches[1]);
          if (controls.lastPinchDistance > 0) {
            const pinchRatio = currentDistance / controls.lastPinchDistance;
            const nextDistance = clamp(
              controls.distance / pinchRatio,
              CAMERA_MIN_DISTANCE,
              CAMERA_MAX_DISTANCE,
            );
            controls.distance = nextDistance;
            state.camera.position.set(0, 0, nextDistance);
            state.camera.lookAt(0, 0, 0);
          }
          controls.lastPinchDistance = currentDistance;
          state.dirty = true;
          return;
        }

        // ── 单指旋转 ──
        if (touches.length === 1 && !controls.isPinching) {
          const dx = touches[0].pageX - (controls.lastX ?? touches[0].pageX);
          const dy = touches[0].pageY - (controls.lastY ?? touches[0].pageY);
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;

          const speed = 0.005;
          controls.rotationY += dx * speed;
          controls.rotationX = clamp(
            controls.rotationX + dy * speed,
            -Math.PI / 2,
            Math.PI / 2,
          );

          state.rootGroup.rotation.y = controls.rotationY;
          state.rootGroup.rotation.x = controls.rotationX;
          state.dirty = true;
        }
      },

      onPanResponderRelease: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls) {
          return;
        }
        const touches = evt.nativeEvent.touches || [];
        if (touches.length === 1) {
          controls.isPinching = false;
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;
        } else {
          controls.isPinching = false;
          controls.lastPinchDistance = 0;
          controls.isInteracting = false;
          // 手势结束后再渲染几帧确保画面更新
          state.idleFrames = IDLE_RENDER_FRAMES;
        }
      },

      onPanResponderTerminate: () => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls) {
          return;
        }
        controls.isPinching = false;
        controls.lastPinchDistance = 0;
        controls.isInteracting = false;
        state.idleFrames = IDLE_RENDER_FRAMES;
      },
    }),
  ).current;

  // 初始化 3D 场景
  const onContextCreate = useCallback(gl => {
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

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 3000);
    camera.position.set(0, 0, 300);
    camera.lookAt(0, 0, 0);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl,
      antialias: false, // 关闭抗锯齿，显著降低 GPU 负载
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 灯光
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(3, 4, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // 点图组
    const pointGroup = new THREE.Group();
    rootGroup.add(pointGroup);
    const pointMeshes = initPoints(pointGroup);
    applyPointScaleToMeshes(pointMeshes, POINT_MAP_SCALE_DEFAULT);
    applyPointRotateToGroup(pointGroup, DEFAULT_POINT_MAP_ROTATE);
    const smoothBig = createSmoothBig();

    // 预分配工作缓冲区
    const workBuffers = createWorkBuffers();

    // 控制器状态
    const controls = {
      rotationX: -Math.PI / 3,
      rotationY: 0,
      distance: camera.position.z,
      lastX: 0,
      lastY: 0,
      lastPinchDistance: 0,
      isPinching: false,
      isInteracting: false,
    };
    rootGroup.rotation.x = controls.rotationX;

    // 加载模型
    setLoading(true);
    setLoadError(null);
    loadSeatModel(rootGroup)
      .then(model => {
        if (!mountedRef.current) {
          return;
        }
        stateRef.current.model = model;
        applyPointFitToModel(model, pointMeshes, DEFAULT_POINT_FIT_LAYOUT);
        // 模型加载完成，标记需要渲染
        stateRef.current.dirty = true;
        setLoading(false);
        if (!model) {
          setLoadError('model missing');
        }
      })
      .catch(err => {
        console.warn('glb: load failed', err);
        if (!mountedRef.current) {
          return;
        }
        setLoading(false);
        setLoadError(err?.message || String(err));
      });

    // 保存状态
    stateRef.current = {
      scene,
      camera,
      renderer,
      rootGroup,
      pointGroup,
      pointMeshes,
      smoothBig,
      workBuffers,
      model: null,
      gl,
      controls,
      dirty: true,          // 是否需要渲染
      idleFrames: 0,        // 手势结束后的剩余渲染帧数
      lastSeatUpdate: 0,
      lastDataHash: 0,      // 用于检测数据是否变化
    };

    // ─── 按需渲染循环 ─────────────────────────────────────────────────
    // 核心优化：只在以下情况渲染：
    //   1. dirty 标志为 true（手势交互、数据更新、模型加载完成）
    //   2. idleFrames > 0（手势结束后的过渡帧）
    // 空闲时跳过 renderer.render() 和 gl.endFrameEXP()，大幅降低 GPU 负载
    const animate = () => {
      const now = Date.now();
      const frameState = stateRef.current;

      // 检查是否需要更新数据
      let dataUpdated = false;
      if (
        !frameState.lastSeatUpdate ||
        now - frameState.lastSeatUpdate >= SEAT_UPDATE_INTERVAL
      ) {
        // 快速检测数据是否变化（避免无变化时重复计算）
        const currentData = dataRef.current;
        let hash = 0;
        if (Array.isArray(currentData)) {
          // 简单 hash：取几个采样点求和
          for (let si = 0; si < currentData.length; si += 12) {
            hash += (currentData[si] || 0);
          }
        }

        if (hash !== frameState.lastDataHash || !frameState.lastSeatUpdate) {
          frameState.lastDataHash = hash;
          const seatData = normalizeSeatData(currentData);
          const split = splitSeatData(seatData);
          Object.keys(allConfig).forEach(key => {
            const config = allConfig[key];
            const name = config.name;
            const mesh = frameState.pointMeshes?.[name];
            const smooth = frameState.smoothBig?.[name];
            if (!mesh || !smooth) {
              return;
            }
            const workBuf = frameState.workBuffers?.[name];
            sitRenew(config.dataConfig, name, split[name], smooth, mesh, workBuf);
          });
          dataUpdated = true;
          frameState.dirty = true;
        }
        frameState.lastSeatUpdate = now;
      }

      // 按需渲染：只在有变化时才调用 render
      const shouldRender = frameState.dirty || frameState.idleFrames > 0;

      if (shouldRender) {
        renderer.render(scene, camera);
        gl.endFrameEXP();

        // 重置 dirty 标志
        frameState.dirty = false;
        if (frameState.idleFrames > 0) {
          frameState.idleFrames--;
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <View style={[styles.container, style]}>
      <GLView
        style={styles.view}
        onContextCreate={onContextCreate}
        {...panResponder.panHandlers}
      />
      {loading ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#7cc4ff" />
          <Text style={styles.loadingText}>Loading model...</Text>
        </View>
      ) : null}
      {!loading && loadError ? (
        <View pointerEvents="none" style={styles.errorOverlay}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  view: {
    flex: 1,
    backgroundColor: '#0b0f16',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 15, 22, 0.6)',
  },
  loadingText: {
    marginTop: 12,
    color: '#d6e6ff',
    fontSize: 14,
  },
  errorOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(220, 60, 60, 0.85)',
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
  },
});
