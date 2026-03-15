import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  NativeModules,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
const ENABLE_POINT_HIDE = true;
const MODEL_ASSET = require('../../image/chair3.glb');
const DEFAULT_SETTINGS = {
  gauss: 1.5,
  color: 325, // 色阶映射范围
  height: 0.3,
  coherent: 1.3, // 第二层平滑（插值后）：轻度平滑，新值占 77%
  rawSmooth: 1.5, // 第一层平滑（插值前）：轻度平滑，新值占 77%
  deadZone: 0, // 死区阈值：0=不启用死区
  zeroFrameThreshold: 10, // 全 0 帧检测：帧总和低于此值视为气囊动作干扰帧，直接跳过
};
// 数据更新频率：15Hz（匹配串口数据源）
const SEAT_UPDATE_INTERVAL = 1000 / 15;
const MODEL_TARGET_SIZE = 220;
const CAMERA_MIN_DISTANCE = 80;
const CAMERA_MAX_DISTANCE = 600;

// 按需渲染：手势结束后继续渲染的帧数
const IDLE_RENDER_FRAMES = 3;

// ─── 点图贴合参数（根据 chair3.glb 几何分析精确计算） ─────────────────────
const DEFAULT_POINT_FIT_LAYOUT = {
  center: {position: [16, -58, 45], rotation: [2.96, 0, 0], scale: 5.2},
  centersit: {position: [52, 38, -43], rotation: [1.32, 0, 0], scale: 3.9},
  leftsit: {position: [-33, -20, -13], rotation: [1.35, 0, 0], scale: 3.3},
  rightsit: {position: [61, -20, -13], rotation: [1.35, 0, 0], scale: 3.3},
};

const DEFAULT_POINT_MAP_ROTATE = {x: 0, y: 0, z: 0};
const POINT_MAP_SCALE_DEFAULT = 1.8;

// ─── 调节面板配置 ────────────────────────────────────────────────────────────
const PANEL_WIDTH = 300;
// 暂时取消侧翼展示（leftsit=右侧翼, rightsit=左侧翼）
const ZONE_NAMES = ['center', 'centersit'];
const ZONE_LABELS = {
  center: '坐垫',
  centersit: '靠背',
  leftsit: '右侧翼',
  rightsit: '左侧翼',
};

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
    flipRow: true,     // 座椅前后矩阵顺序翻转
    flipHeight: false,
  },
  // 暂时取消侧翼展示
  // necksit: {
  //   dataConfig: backConfig,
  //   name: 'leftsit',
  //   pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
  //   flipRow: false,
  //   flipHeight: true,
  // },
  // backsit: {
  //   dataConfig: backConfig,
  //   name: 'rightsit',
  //   pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
  //   flipRow: false,
  //   flipHeight: true,
  // },
  sitsit: {
    dataConfig: sitConfigBack,
    name: 'centersit',
    pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
    flipRow: false,
    flipHeight: true,  // 靠背高度方向翻转
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

// ─── 预计算高斯卷积核 ──────────────────────────────────────────────────────

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
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= wsum;
  }
  return {kernel, rs, size};
}

const GAUSS_KERNEL = buildGaussKernel(DEFAULT_SETTINGS.gauss);

function gaussBlurFast(scl, w, h, resultBuf, gaussKernel) {
  const {kernel, rs} = gaussKernel || GAUSS_KERNEL;
  const result = resultBuf || new Array(scl.length).fill(0);

  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      let val = 0;
      let kidx = 0;
      for (let dy = -rs; dy <= rs; dy++) {
        const y = i + dy;
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

// ─── 预分配临时数组 ─────────────────────────────────────────────────────────

function createWorkBuffers() {
  const buffers = {};
  Object.keys(allConfig).forEach(key => {
    const config = allConfig[key].dataConfig;
    const {sitnum2, sitnum1, sitInterp, sitInterp1, sitOrder} = config;
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
  console.log('[loadSeatModel] 开始加载模型...');
  const asset = Asset.fromModule(MODEL_ASSET);
  console.log('[loadSeatModel] asset hash:', asset.hash, 'downloaded:', asset.downloaded);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) {
    console.warn('[loadSeatModel] 模型 URI 为空，无法加载');
    return null;
  }
  console.log('[loadSeatModel] 模型 URI:', uri);

  const file = new FileSystem.File(uri);
  const buffer = await file.arrayBuffer();
  // console.log('glb: bytes', buffer.byteLength);

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

        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y -= 0.6;

        group.add(model);

        // 调试：打印模型加载后的实际位置和尺寸
        const box2 = new THREE.Box3().setFromObject(model);
        const center2 = new THREE.Vector3();
        const size2 = new THREE.Vector3();
        box2.getCenter(center2);
        box2.getSize(size2);
        // [Model] logs disabled for production

        resolve(model);
      },
      err => {
        console.warn('glb: parse error', err);
        reject(err);
      },
    );
  });
}

// ─── 圆形纹理（共享单例） ───────────────────────────────────────────────────

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
  texture.minFilter = THREE.LinearFilter;
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

  const circleTexture = getSharedCircleTexture();

  const material = new THREE.PointsMaterial({
    vertexColors: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true,
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

    // 每个区域独立缩放
    const scaleFactor = layout.scale != null ? layout.scale : POINT_MAP_SCALE_DEFAULT;
    const safeFactor = Number.isFinite(scaleFactor) ? scaleFactor : 1;
    const meshScale = POINT_SCALE * safeFactor;
    mesh.scale.set(meshScale, meshScale, meshScale);

    // [PointFit] log disabled
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

function sitRenew(config, name, ndata1, smoothBig, particles, workBuf, flipRow = false, flipHeight = false, dynSettings = null) {
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

  const {color, height, coherent} = dynSettings || DEFAULT_SETTINGS;

  const bigArr = lineInterpnew(ndata1, sitnum2, sitnum1, sitInterp1, sitInterp);
  const bigArrs = addSide(
    bigArr,
    1 + (sitnum2 - 1) * sitInterp1,
    1 + (sitnum1 - 1) * sitInterp,
    sitOrder,
    sitOrder,
  );

  const gaussBuf = workBuf?.gaussBuf;
  const gaussKernel = dynSettings?._gaussKernel || GAUSS_KERNEL;
  const bigArrg = gaussBlurFast(
    bigArrs,
    1 + (sitnum2 - 1) * sitInterp1 + sitOrder * 2,
    1 + (sitnum1 - 1) * sitInterp + sitOrder * 2,
    gaussBuf,
    gaussKernel,
  );

  const heightSign = flipHeight ? 1 : -1;
  let k = 0;
  let j = 0;
  const hideThreshold = color * HIDE_THRESHOLD_RATIO;
  for (let ix = 0; ix < amountX; ix += 1) {
    // flipRow: 翻转行遍历方向（座椅前后）
    const dataRow = flipRow ? (amountX - 1 - ix) : ix;
    for (let iy = 0; iy < amountY; iy += 1) {
      const l = dataRow * amountY + iy;
      const rawValue = Number(bigArrg[l]) * 10;
      // 死区处理：低于阈值的原始值直接归零，消除低值区域的噪声抖动
      const deadZone = (dynSettings || DEFAULT_SETTINGS).deadZone || 0;
      const clampedValue = (Number.isFinite(rawValue) && rawValue > deadZone * 10) ? rawValue : 0;
      smoothBig[l] = smoothBig[l] + (clampedValue - smoothBig[l]) / coherent;

      position[k] = iy * SEPARATION - (amountX * SEPARATION) / 2;
      position[k + 1] = heightSign * smoothBig[l] * height;
      position[k + 2] = ix * SEPARATION - (amountY * SEPARATION) / 2;

      if (scales) {
        // 用平滑后的值判断隐藏，避免阈值附近反复闪烁
        const isHidden = ENABLE_POINT_HIDE && smoothBig[l] <= hideThreshold;
        scales[j] = isHidden ? 0 : 1;
      }

      const rgb = jetWhite3(0, color, smoothBig[l]);
      colors[k] = rgb[0] / 255;
      colors[k + 1] = rgb[1] / 255;
      colors[k + 2] = rgb[2] / 255;

      k += 3;
      j += 1;
    }
  }

  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  if (scalesAttr) {
    scalesAttr.needsUpdate = true;
  }
}

// ─── 简易滑块组件（纯 RN 实现，无需额外依赖） ──────────────────────────────

function StepControl({label, value, min, max, step, onValueChange, decimals = 2}) {
  const [editing, setEditing] = useState(false);
  const [inputText, setInputText] = useState('');

  const doStep = (direction) => {
    let newVal = value + direction * step;
    newVal = clamp(newVal, min, max);
    onValueChange(parseFloat(newVal.toFixed(decimals)));
  };

  // 长按连续调节
  const timerRef = useRef(null);
  const startRepeat = (direction) => {
    doStep(direction);
    timerRef.current = setInterval(() => doStep(direction), 120);
  };
  const stopRepeat = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleFocus = () => {
    setEditing(true);
    setInputText(value.toFixed(decimals));
  };

  const handleSubmit = () => {
    setEditing(false);
    const parsed = parseFloat(inputText);
    if (Number.isFinite(parsed)) {
      const clamped = clamp(parsed, min, max);
      onValueChange(parseFloat(clamped.toFixed(decimals)));
    }
  };

  return (
    <View style={stepStyles.row}>
      <Text style={stepStyles.label}>{label}</Text>
      <TouchableOpacity
        style={stepStyles.btn}
        onPress={() => doStep(-1)}
        onLongPress={() => startRepeat(-1)}
        onPressOut={stopRepeat}
        activeOpacity={0.5}>
        <Text style={stepStyles.btnText}>−</Text>
      </TouchableOpacity>
      <View style={stepStyles.valueBox}>
        <TextInput
          style={stepStyles.valueInput}
          value={editing ? inputText : value.toFixed(decimals)}
          onChangeText={setInputText}
          onFocus={handleFocus}
          onBlur={handleSubmit}
          onSubmitEditing={handleSubmit}
          keyboardType="numeric"
          selectTextOnFocus
          returnKeyType="done"
        />
      </View>
      <TouchableOpacity
        style={stepStyles.btn}
        onPress={() => doStep(1)}
        onLongPress={() => startRepeat(1)}
        onPressOut={stopRepeat}
        activeOpacity={0.5}>
        <Text style={stepStyles.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    height: 30,
  },
  label: {
    color: '#aac',
    fontSize: 11,
    width: 24,
    textAlign: 'right',
    marginRight: 6,
  },
  btn: {
    width: 32,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#1a3050',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: '#7af',
    fontSize: 16,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  valueBox: {
    flex: 1,
    height: 26,
    marginHorizontal: 4,
    borderRadius: 4,
    backgroundColor: '#0d1520',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueInput: {
    flex: 1,
    color: '#cde',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
    padding: 0,
    margin: 0,
    height: 26,
  },
});

// ─── 主组件 ──────────────────────────────────────────────────────────────────

function CarAirRNInner({data = [], style, showDebugPanel = true}, ref) {
  const stateRef = useRef({});
  const dataRef = useRef(data);
  const frameRef = useRef(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [baselineActive, setBaselineActive] = useState(false);

  // 点图参数（可动态调节，持久化到 SharedPreferences）
  const [pointSettings, setPointSettings] = useState({...DEFAULT_SETTINGS});
  const pointSettingsRef = useRef({...DEFAULT_SETTINGS});
  const settingsLoadedRef = useRef(false);

  // 启动时加载持久化配置
  useEffect(() => {
    NativeModules.SerialModule?.loadPointSettings?.().then(json => {
      if (json) {
        try {
          const saved = JSON.parse(json);
          const merged = {...DEFAULT_SETTINGS, ...saved};
          setPointSettings(merged);
          pointSettingsRef.current = merged;
          // 同步高斯核
          if (saved.gauss != null && stateRef.current) {
            stateRef.current._gaussKernel = buildGaussKernel(merged.gauss);
          }
          if (stateRef.current) stateRef.current.dirty = true;
        } catch (_) {}
      }
      settingsLoadedRef.current = true;
    }).catch(() => { settingsLoadedRef.current = true; });
  }, []);

  const updatePointSetting = useCallback((key, value) => {
    setPointSettings(prev => {
      const next = {...prev, [key]: value};
      pointSettingsRef.current = next;
      // 对于平滑参数变更，重置平滑缓冲区
      if (key === 'rawSmooth' || key === 'coherent') {
        const fs = stateRef.current;
        fs.rawSmoothInited = false;
        fs.dirty = true;
      }
      if (key === 'gauss') {
        // 重建高斯核
        stateRef.current._gaussKernel = buildGaussKernel(value);
        stateRef.current.dirty = true;
      }
      stateRef.current.dirty = true;
      // 持久化到 SharedPreferences
      NativeModules.SerialModule?.savePointSettings?.(JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // 暴露清零/取消清零方法给父组件
  useImperativeHandle(ref, () => ({
    /** 记录当前帧为基线，后续帧减去基线值 */
    zeroBaseline() {
      const fs = stateRef.current;
      const currentData = dataRef.current;
      if (Array.isArray(currentData) && currentData.length >= 144) {
        const normalized = normalizeSeatData(currentData);
        fs.baseline = normalized.slice(0, 144);
        // 重置平滑缓冲区，避免旧数据残留
        fs.rawSmoothInited = false;
        fs.dirty = true;
        setBaselineActive(true);
      }
    },
    /** 取消清零，恢复原始数据 */
    clearBaseline() {
      const fs = stateRef.current;
      fs.baseline = null;
      fs.rawSmoothInited = false;
      fs.dirty = true;
      setBaselineActive(false);
    },
    /** 是否已清零 */
    isBaselineActive() {
      return !!stateRef.current.baseline;
    },
    /** 算法判断离座时调用：立即清零 3D 图所有点位数据，并冻结数据更新 */
    resetToZero() {
      const fs = stateRef.current;
      console.log('[CarAirRN] resetToZero 调用, smoothBig存在:', !!fs.smoothBig, 'pointMeshes存在:', !!fs.pointMeshes);
      // 冻结数据更新：渲染循环不再用传感器数据更新 smoothBig
      fs._frozen = true;
      // 将 smoothBig 所有区域填 0
      if (fs.smoothBig) {
        Object.keys(fs.smoothBig).forEach(key => {
          const arr = fs.smoothBig[key];
          if (Array.isArray(arr)) {
            arr.fill(0);
          }
        });
      }
      // 清零第一层平滑缓冲区
      if (fs.rawSmoothBuf) {
        fs.rawSmoothBuf.fill(0);
      }
      // 直接把所有 3D 点位的 position.y 设为 0、scale 设为 0，确保 GPU 立即渲染清零
      if (fs.pointMeshes) {
        Object.keys(fs.pointMeshes).forEach(name => {
          const mesh = fs.pointMeshes[name];
          if (!mesh || !mesh.geometry) return;
          const posAttr = mesh.geometry.getAttribute('position');
          const colorAttr = mesh.geometry.getAttribute('color');
          const scalesAttr = mesh.geometry.getAttribute('aScale');
          if (posAttr) {
            const pos = posAttr.array;
            // 只清零 y 分量（高度），保留 x/z 位置
            for (let i = 1; i < pos.length; i += 3) {
              pos[i] = 0;
            }
            posAttr.needsUpdate = true;
          }
          if (colorAttr) {
            // 设为白色 (1,1,1)
            colorAttr.array.fill(1);
            colorAttr.needsUpdate = true;
          }
          if (scalesAttr) {
            // 隐藏所有点
            scalesAttr.array.fill(0);
            scalesAttr.needsUpdate = true;
          }
        });
      }
      fs.rawSmoothInited = false;
      fs._zeroFrameCount = 99;
      fs.lastDataHash = -1;
      fs.dirty = true;
    },
    /** 算法判断重新入座时调用：解冻数据更新，恢复3D图显示 */
    unfreeze() {
      const fs = stateRef.current;
      fs._frozen = false;
      fs.rawSmoothInited = false;
      fs.lastDataHash = -1;
      fs.dirty = true;
    },
  }));

  // ─── 调节面板状态 ──────────────────────────────────────────────────
  const [panelVisible, setPanelVisible] = useState(false);
  const panelAnim = useRef(new Animated.Value(PANEL_WIDTH)).current;

  // 点图布局参数（可调，每个区域独立 scale）
  const [layout, setLayout] = useState(() => {
    const init = {};
    ZONE_NAMES.forEach(name => {
      const def = DEFAULT_POINT_FIT_LAYOUT[name];
      init[name] = {
        px: def.position[0],
        py: def.position[1],
        pz: def.position[2],
        rx: def.rotation[0],
        ry: def.rotation[1],
        rz: def.rotation[2],
        s: def.scale != null ? def.scale : POINT_MAP_SCALE_DEFAULT,
      };
    });
    return init;
  });
  const [activeZone, setActiveZone] = useState('center');

  // 整体视角参数
  const [viewParams, setViewParams] = useState({
    camDist: 300,   // 相机距离
    rootRx: 0.21,   // rootGroup X 旋转
    rootRy: -0.54,  // rootGroup Y 旋转
    rootPx: 71,     // rootGroup X 位移
    rootPy: 13,     // rootGroup Y 位移
    rootPz: -100,   // rootGroup Z 位移
    // pointGroup 整体旋转
    grpRx: DEFAULT_POINT_MAP_ROTATE.x,
    grpRy: DEFAULT_POINT_MAP_ROTATE.y,
    grpRz: DEFAULT_POINT_MAP_ROTATE.z,
    // 座椅模型自身参数
    modelPx: 234,   // 模型 X 位移
    modelPy: 6,     // 模型 Y 位移
    modelPz: 431,   // 模型 Z 位移
    modelRx: 0,     // 模型 X 旋转
    modelRy: 1.57,  // 模型 Y 旋转
    modelRz: 0,     // 模型 Z 旋转
    modelScale: 1,  // 模型缩放倍率（相对于自动计算的基准缩放）
  });

  // 将布局变化应用到 3D 场景
  const applyLayout = useCallback((newLayout) => {
    const s = stateRef.current;
    if (!s.pointMeshes) return;
    const localCenter = new THREE.Vector3(0, -0.6, 0);

    ZONE_NAMES.forEach(name => {
      const mesh = s.pointMeshes[name];
      const l = newLayout[name];
      if (!mesh || !l) return;
      mesh.position.set(
        localCenter.x + l.px,
        localCenter.y + l.py,
        localCenter.z + l.pz,
      );
      mesh.rotation.set(l.rx, l.ry, l.rz);

      // 每个区域独立缩放
      const safeFactor = Number.isFinite(l.s) ? l.s : POINT_MAP_SCALE_DEFAULT;
      const meshScale = POINT_SCALE * safeFactor;
      mesh.scale.set(meshScale, meshScale, meshScale);
    });

    s.dirty = true;
  }, []);

  // 切换面板
  const togglePanel = useCallback(() => {
    const toVisible = !panelVisible;
    setPanelVisible(toVisible);
    Animated.timing(panelAnim, {
      toValue: toVisible ? 0 : PANEL_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [panelVisible, panelAnim]);

  // 更新整体视角参数
  const updateViewParam = useCallback((param, value) => {
    setViewParams(prev => {
      const next = {...prev, [param]: value};
      const s = stateRef.current;
      if (!s.camera || !s.rootGroup || !s.controls) return next;
      if (param === 'camDist') {
        s.camera.position.z = value;
        s.controls.distance = value;
      } else if (param === 'rootRx') {
        s.rootGroup.rotation.x = value;
        s.controls.rotationX = value;
      } else if (param === 'rootRy') {
        s.rootGroup.rotation.y = value;
        s.controls.rotationY = value;
      } else if (param === 'rootPx') {
        s.rootGroup.position.x = value;
      } else if (param === 'rootPy') {
        s.rootGroup.position.y = value;
      } else if (param === 'rootPz') {
        s.rootGroup.position.z = value;
      } else if (param === 'grpRx') {
        if (s.pointGroup) s.pointGroup.rotation.x = value;
      } else if (param === 'grpRy') {
        if (s.pointGroup) s.pointGroup.rotation.y = value;
      } else if (param === 'grpRz') {
        if (s.pointGroup) s.pointGroup.rotation.z = value;
      } else if (param.startsWith('model')) {
        // 座椅模型自身参数
        const model = s.model;
        if (model) {
          if (param === 'modelPx') {
            model.position.x = (model._basePosition?.x ?? 0) + value;
          } else if (param === 'modelPy') {
            model.position.y = (model._basePosition?.y ?? 0) + value;
          } else if (param === 'modelPz') {
            model.position.z = (model._basePosition?.z ?? 0) + value;
          } else if (param === 'modelRx') {
            model.rotation.x = value;
          } else if (param === 'modelRy') {
            model.rotation.y = value;
          } else if (param === 'modelRz') {
            model.rotation.z = value;
          } else if (param === 'modelScale') {
            const baseScale = model._baseScale ?? 1;
            model.scale.setScalar(baseScale * value);
          }
        }
      }
      s.dirty = true;
      return next;
    });
  }, []);

  // 更新某个区域的某个参数
  const updateZoneParam = useCallback((zone, param, value) => {
    setLayout(prev => {
      const next = {...prev, [zone]: {...prev[zone], [param]: value}};
      applyLayout(next);
      return next;
    });
  }, [applyLayout]);

  // 重置当前区域
  const resetZone = useCallback(() => {
    const def = DEFAULT_POINT_FIT_LAYOUT[activeZone];
    if (!def) return;
    const resetVal = {
      px: def.position[0],
      py: def.position[1],
      pz: def.position[2],
      rx: def.rotation[0],
      ry: def.rotation[1],
      rz: def.rotation[2],
      s: def.scale != null ? def.scale : POINT_MAP_SCALE_DEFAULT,
    };
    setLayout(prev => {
      const next = {...prev, [activeZone]: resetVal};
      applyLayout(next);
      return next;
    });
  }, [activeZone, applyLayout]);

  // 重置全部
  const resetAll = useCallback(() => {
    const init = {};
    ZONE_NAMES.forEach(name => {
      const def = DEFAULT_POINT_FIT_LAYOUT[name];
      init[name] = {
        px: def.position[0],
        py: def.position[1],
        pz: def.position[2],
        rx: def.rotation[0],
        ry: def.rotation[1],
        rz: def.rotation[2],
        s: def.scale != null ? def.scale : POINT_MAP_SCALE_DEFAULT,
      };
    });
    setLayout(init);
    applyLayout(init);
    // 重置座椅模型参数到初始值
    const model = stateRef.current.model;
    if (model) {
      if (model._basePosition) {
        model.position.x = model._basePosition.x + 234;
        model.position.y = model._basePosition.y + 6;
        model.position.z = model._basePosition.z + 431;
      }
      model.rotation.set(0, 1.57, 0);
      if (model._baseScale) {
        model.scale.setScalar(model._baseScale);
      }
      stateRef.current.dirty = true;
    }
    setViewParams(prev => ({
      ...prev,
      modelPx: 234, modelPy: 6, modelPz: 431,
      modelRx: 0, modelRy: 1.57, modelRz: 0,
      modelScale: 1,
    }));
  }, [applyLayout]);

  // 打印当前参数到控制台
  const logParams = useCallback(() => {
    const output = {};
    ZONE_NAMES.forEach(name => {
      const l = layout[name];
      output[name] = {
        position: [parseFloat(l.px.toFixed(2)), parseFloat(l.py.toFixed(2)), parseFloat(l.pz.toFixed(2))],
        rotation: [parseFloat(l.rx.toFixed(4)), parseFloat(l.ry.toFixed(4)), parseFloat(l.rz.toFixed(4))],
        scale: parseFloat(l.s.toFixed(2)),
      };
    });
    output._model = {
      position: [viewParams.modelPx, viewParams.modelPy, viewParams.modelPz],
      rotation: [viewParams.modelRx, viewParams.modelRy, viewParams.modelRz],
      scale: viewParams.modelScale,
    };
    console.log('[CarAirRN] 当前参数:', JSON.stringify(output, null, 2));
  }, [layout, viewParams]);

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
        if (!controls) return;
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
        state.dirty = true;
      },

      onPanResponderMove: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls || !state.camera || !state.rootGroup) return;
        const touches = evt.nativeEvent.touches || [];

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
        if (!controls) return;
        const touches = evt.nativeEvent.touches || [];
        if (touches.length === 1) {
          controls.isPinching = false;
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;
        } else {
          controls.isPinching = false;
          controls.lastPinchDistance = 0;
          controls.isInteracting = false;
          state.idleFrames = IDLE_RENDER_FRAMES;
        }
      },

      onPanResponderTerminate: () => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls) return;
        controls.isPinching = false;
        controls.lastPinchDistance = 0;
        controls.isInteracting = false;
        state.idleFrames = IDLE_RENDER_FRAMES;
      },
    }),
  ).current;

  // 初始化 3D 场景
  const onContextCreate = useCallback(gl => {
    // ─── expo-gl 补丁：修复重新创建 GL context 时部分方法返回 undefined 导致 THREE.js .trim() 报错 ───
    const _origGetShaderInfoLog = gl.getShaderInfoLog.bind(gl);
    gl.getShaderInfoLog = (shader) => {
      const result = _origGetShaderInfoLog(shader);
      return result ?? '';
    };
    const _origGetProgramInfoLog = gl.getProgramInfoLog.bind(gl);
    gl.getProgramInfoLog = (program) => {
      const result = _origGetProgramInfoLog(program);
      return result ?? '';
    };
    // getShaderSource 也可能返回 undefined
    if (gl.getShaderSource) {
      const _origGetShaderSource = gl.getShaderSource.bind(gl);
      gl.getShaderSource = (shader) => {
        const result = _origGetShaderSource(shader);
        return result ?? '';
      };
    }

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

    // ─── 网格背景（设计图还原） ───
    const gridHelper = new THREE.GridHelper(600, 30, 0x1a2030, 0x1a2030);
    gridHelper.position.y = -120;
    gridHelper.material.opacity = 0.4;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 3000);
    camera.position.set(0, 0, 300);
    camera.lookAt(0, 0, 0);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl,
      antialias: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(3, 4, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const pointGroup = new THREE.Group();
    rootGroup.add(pointGroup);
    const pointMeshes = initPoints(pointGroup);
    // applyPointFitToModel 中已处理每个区域的独立 scale，无需全局 applyPointScaleToMeshes
    applyPointRotateToGroup(pointGroup, DEFAULT_POINT_MAP_ROTATE);
    const smoothBig = createSmoothBig();
    const workBuffers = createWorkBuffers();

    const controls = {
      rotationX: 0.21,
      rotationY: -0.54,
      distance: camera.position.z,
      lastX: 0,
      lastY: 0,
      lastPinchDistance: 0,
      isPinching: false,
      isInteracting: false,
    };
    rootGroup.rotation.x = controls.rotationX;
    rootGroup.rotation.y = controls.rotationY;
    rootGroup.position.x = 71;
    rootGroup.position.y = 13;
    rootGroup.position.z = -100;

    setLoading(true);
    setLoadError(null);
    loadSeatModel(rootGroup)
      .then(model => {
        console.log('[CarAirRN] 模型加载完成, mounted:', mountedRef.current, 'model:', !!model);
        if (!mountedRef.current) {
          console.warn('[CarAirRN] 组件已卸载，放弃模型加载结果');
          return;
        }
        stateRef.current.model = model;
        // 保存模型的基准位置和缩放，供调节面板使用
        if (model) {
          model._basePosition = model.position.clone();
          model._baseScale = model.scale.x; // setScalar 后 xyz相同
          // 应用初始座椅模型参数
          model.position.x = model._basePosition.x + 234;
          model.position.y = model._basePosition.y + 6;
          model.position.z = model._basePosition.z + 431;
          model.rotation.set(0, 1.57, 0);
        }
        applyPointFitToModel(model, pointMeshes, DEFAULT_POINT_FIT_LAYOUT);
        stateRef.current.dirty = true;
        setLoading(false);
        if (!model) {
          setLoadError('model missing');
        }
      })
      .catch(err => {
        console.warn('[CarAirRN] 模型加载失败:', err?.message || String(err));
        if (!mountedRef.current) return;
        setLoading(false);
        setLoadError(err?.message || String(err));
      });

    // 第一层平滑缓冲区：原始 144 字节数据的帧间混合
    const rawSmoothBuf = new Float32Array(144);
    let rawSmoothInited = false;

    stateRef.current = {
      scene,
      camera,
      renderer,
      rootGroup,
      pointGroup,
      pointMeshes,
      smoothBig,
      workBuffers,
      rawSmoothBuf,
      rawSmoothInited,
      model: null,
      gl,
      controls,
      dirty: true,
      idleFrames: 0,
      lastSeatUpdate: 0,
      lastDataHash: 0,
      baseline: null, // 清零基线：144 元素数组，null 表示未清零
      _gaussKernel: GAUSS_KERNEL, // 动态高斯核
    };

    const animate = () => {
      const now = Date.now();
      const frameState = stateRef.current;

      // ━━━ 最高优先级：算法离座冻结 ━━━
      // 冻结时完全跳过数据更新，只渲染已清零的 smoothBig
      if (frameState._frozen) {
        // 首次冻结时需要渲染一帧把清零状态写入GPU
        if (frameState.dirty) {
          renderer.render(scene, camera);
          gl.endFrameEXP();
          frameState.dirty = false;
        }
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      if (
        !frameState.lastSeatUpdate ||
        now - frameState.lastSeatUpdate >= SEAT_UPDATE_INTERVAL
      ) {
        const currentData = dataRef.current;
        let hash = 0;
        if (Array.isArray(currentData)) {
          for (let si = 0; si < currentData.length; si += 12) {
            hash += (currentData[si] || 0);
          }
        }
        // 全 0 帧时 hash=0，如果上一帧也是 0 会被跳过，需要特殊处理
        // 当存在未完成的零帧计数时，强制更新
        const hasZeroPending = (frameState._zeroFrameCount || 0) > 0 && hash === 0;

        if (hash !== frameState.lastDataHash || !frameState.lastSeatUpdate || hasZeroPending) {
          frameState.lastDataHash = hash;

          const seatData = normalizeSeatData(currentData);

          // 清零：减去基线预压力
          if (frameState.baseline) {
            for (let bi = 0; bi < 144; bi++) {
              seatData[bi] = Math.max(0, seatData[bi] - frameState.baseline[bi]);
            }
          }

          // 全 0 帧检测：气囊动作时传感器可能返回全 0 或异常低值数据
          const _dynSettings = pointSettingsRef.current;
          const zeroThreshold = _dynSettings.zeroFrameThreshold || 10;
          let frameSum = 0;
          for (let zi = 0; zi < 144; zi++) {
            frameSum += seatData[zi];
          }
          const isZeroFrame = frameSum < zeroThreshold;

          if (isZeroFrame) {
            // 全 0 帧：可能是离座或气囊动作干扰
            if (!frameState._zeroFrameCount) {
              frameState._zeroFrameCount = 0;
            }
            frameState._zeroFrameCount++;

            if (frameState._zeroFrameCount <= 3 && frameState.rawSmoothInited) {
              // 连续 3 帧以内的全 0：可能是气囊动作干扰，跳过不更新
              frameState.lastSeatUpdate = now;
              frameRef.current = requestAnimationFrame(animate);
              return;
            }
            // 连续超过 3 帧全 0：真正离座，清零 3D 图
            // 重置平滑缓冲区，让 3D 图归零
            frameState.rawSmoothInited = false;
            frameState.smoothBig = createSmoothBig();
          } else {
            // 非零帧，重置计数器
            frameState._zeroFrameCount = 0;
          }


          // 第一层平滑：原始 144 字节数据帧间混合（在插值放大之前）
          const rawBuf = frameState.rawSmoothBuf;
          const rawAlpha = _dynSettings.rawSmooth || 1;
          if (!frameState.rawSmoothInited) {
            // 第一帧直接拷贝
            for (let ri = 0; ri < 144; ri++) {
              rawBuf[ri] = seatData[ri];
            }
            frameState.rawSmoothInited = true;
          } else {
            for (let ri = 0; ri < 144; ri++) {
              rawBuf[ri] = rawBuf[ri] + (seatData[ri] - rawBuf[ri]) / rawAlpha;
            }
          }
          // 用平滑后的数据进行分割和插值
          const smoothedRaw = Array.from(rawBuf, v => Math.round(v));
          const split = splitSeatData(smoothedRaw);


          Object.keys(allConfig).forEach(key => {
            const config = allConfig[key];
            const name = config.name;
            const mesh = frameState.pointMeshes?.[name];
            const smooth = frameState.smoothBig?.[name];
            if (!mesh || !smooth) return;
            const workBuf = frameState.workBuffers?.[name];
            const dynS = {..._dynSettings, _gaussKernel: frameState._gaussKernel};
            sitRenew(config.dataConfig, name, split[name], smooth, mesh, workBuf, config.flipRow, config.flipHeight, dynS);
          });
          frameState.dirty = true;
        }
        frameState.lastSeatUpdate = now;
      }

      const shouldRender = frameState.dirty || frameState.idleFrames > 0;

      if (shouldRender) {
        renderer.render(scene, camera);
        gl.endFrameEXP();
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

  // ─── 当前区域的参数 ────────────────────────────────────────────────
  const zoneLayout = layout[activeZone] || {};

  return (
    <View style={[styles.container, style]}>
      {/* 3D 视图 */}
      <GLView
        style={styles.view}
        onContextCreate={onContextCreate}
        {...panResponder.panHandlers}
      />

      {/* 右侧开关按钮 */}
      {showDebugPanel && (
      <TouchableOpacity
        style={[styles.toggleBtn, panelVisible && styles.toggleBtnOpen]}
        onPress={togglePanel}
        activeOpacity={0.7}>
        <Text style={styles.toggleBtnText}>{panelVisible ? '>' : '<'}</Text>
      </TouchableOpacity>
      )}

      {/* 右侧调节面板 */}
      {showDebugPanel && (
      <Animated.View
        style={[
          styles.panel,
          {transform: [{translateX: panelAnim}]},
        ]}
        pointerEvents={panelVisible ? 'auto' : 'none'}>
        <ScrollView
          style={styles.panelScroll}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}>
          {/* 标题 */}
          <Text style={styles.panelTitle}>点图参数调节</Text>

          {/* 清零预压力 */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.actionBtn, {flex: 1}, baselineActive && {backgroundColor: '#e74c3c'}]}
              onPress={() => {
                if (baselineActive) {
                  const fs = stateRef.current;
                  fs.baseline = null;
                  fs.rawSmoothInited = false;
                  fs.dirty = true;
                  setBaselineActive(false);
                } else {
                  const fs = stateRef.current;
                  const currentData = dataRef.current;
                  if (Array.isArray(currentData) && currentData.length >= 144) {
                    const normalized = normalizeSeatData(currentData);
                    fs.baseline = normalized.slice(0, 144);
                    fs.rawSmoothInited = false;
                    fs.dirty = true;
                    setBaselineActive(true);
                  }
                }
              }}>
              <Text style={styles.actionBtnText}>
                {baselineActive ? '✖ 取消清零' : '清零预压力'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 点图参数调节 */}
          <Text style={styles.sectionLabel}>颜色 / 显示</Text>
          <StepControl
            label="色阶"
            value={pointSettings.color}
            min={50}
            max={2000}
            step={25}
            decimals={0}
            onValueChange={v => updatePointSetting('color', v)}
          />
          <StepControl
            label="高度"
            value={pointSettings.height}
            min={0.1}
            max={5}
            step={0.1}
            decimals={1}
            onValueChange={v => updatePointSetting('height', v)}
          />
          <StepControl
            label="高斯"
            value={pointSettings.gauss}
            min={0}
            max={5}
            step={0.1}
            decimals={1}
            onValueChange={v => updatePointSetting('gauss', v)}
          />

          <Text style={styles.sectionLabel}>平滑 / 滤波</Text>
          <StepControl
            label="帧平滑"
            value={pointSettings.rawSmooth}
            min={1}
            max={10}
            step={0.1}
            decimals={1}
            onValueChange={v => updatePointSetting('rawSmooth', v)}
          />
          <StepControl
            label="插值平滑"
            value={pointSettings.coherent}
            min={1}
            max={10}
            step={0.1}
            decimals={1}
            onValueChange={v => updatePointSetting('coherent', v)}
          />
          <StepControl
            label="死区"
            value={pointSettings.deadZone}
            min={0}
            max={50}
            step={1}
            decimals={0}
            onValueChange={v => updatePointSetting('deadZone', v)}
          />

          {/* ─── 热力图区域调节 ─── */}
          <Text style={styles.sectionLabel}>热力图区域</Text>
          <View style={styles.zoneTabs}>
            {ZONE_NAMES.map(name => (
              <TouchableOpacity
                key={name}
                style={[styles.zoneTab, activeZone === name && styles.zoneTabActive]}
                onPress={() => setActiveZone(name)}>
                <Text style={[styles.zoneTabText, activeZone === name && styles.zoneTabTextActive]}>
                  {ZONE_LABELS[name]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>{ZONE_LABELS[activeZone]} - 位置</Text>
          <StepControl
            label="X 位移"
            value={zoneLayout.px ?? 0}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateZoneParam(activeZone, 'px', v)}
          />
          <StepControl
            label="Y 位移"
            value={zoneLayout.py ?? 0}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateZoneParam(activeZone, 'py', v)}
          />
          <StepControl
            label="Z 位移"
            value={zoneLayout.pz ?? 0}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateZoneParam(activeZone, 'pz', v)}
          />

          <Text style={styles.sectionLabel}>{ZONE_LABELS[activeZone]} - 旋转</Text>
          <StepControl
            label="X 旋转"
            value={zoneLayout.rx ?? 0}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateZoneParam(activeZone, 'rx', v)}
          />
          <StepControl
            label="Y 旋转"
            value={zoneLayout.ry ?? 0}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateZoneParam(activeZone, 'ry', v)}
          />
          <StepControl
            label="Z 旋转"
            value={zoneLayout.rz ?? 0}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateZoneParam(activeZone, 'rz', v)}
          />

          <Text style={styles.sectionLabel}>{ZONE_LABELS[activeZone]} - 缩放</Text>
          <StepControl
            label="缩放"
            value={zoneLayout.s ?? 1}
            min={0.1}
            max={10}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneParam(activeZone, 's', v)}
          />

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.actionBtn, {flex: 1}]} onPress={resetZone}>
              <Text style={styles.actionBtnText}>重置{ZONE_LABELS[activeZone]}</Text>
            </TouchableOpacity>
          </View>

          {/* ─── 座椅模型调节 ─── */}
          <Text style={styles.sectionLabel}>座椅位置</Text>
          <StepControl
            label="X 位移"
            value={viewParams.modelPx}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParam('modelPx', v)}
          />
          <StepControl
            label="Y 位移"
            value={viewParams.modelPy}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParam('modelPy', v)}
          />
          <StepControl
            label="Z 位移"
            value={viewParams.modelPz}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParam('modelPz', v)}
          />

          <Text style={styles.sectionLabel}>座椅旋转</Text>
          <StepControl
            label="X 旋转"
            value={viewParams.modelRx}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParam('modelRx', v)}
          />
          <StepControl
            label="Y 旋转"
            value={viewParams.modelRy}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParam('modelRy', v)}
          />
          <StepControl
            label="Z 旋转"
            value={viewParams.modelRz}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParam('modelRz', v)}
          />

          <Text style={styles.sectionLabel}>座椅缩放</Text>
          <StepControl
            label="缩放"
            value={viewParams.modelScale}
            min={0.1}
            max={5}
            step={0.05}
            decimals={2}
            onValueChange={v => updateViewParam('modelScale', v)}
          />

          {/* ─── 整体调节（rootGroup，同时影响点图和座椅模型） ─── */}
          <Text style={styles.sectionLabel}>整体位置</Text>
          <StepControl
            label="X 位移"
            value={viewParams.rootPx}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParam('rootPx', v)}
          />
          <StepControl
            label="Y 位移"
            value={viewParams.rootPy}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParam('rootPy', v)}
          />
          <StepControl
            label="Z 位移"
            value={viewParams.rootPz}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParam('rootPz', v)}
          />

          <Text style={styles.sectionLabel}>整体旋转</Text>
          <StepControl
            label="X 旋转"
            value={viewParams.rootRx}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParam('rootRx', v)}
          />
          <StepControl
            label="Y 旋转"
            value={viewParams.rootRy}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParam('rootRy', v)}
          />

          <Text style={styles.sectionLabel}>相机距离</Text>
          <StepControl
            label="距离"
            value={viewParams.camDist}
            min={80}
            max={1500}
            step={5}
            decimals={0}
            onValueChange={v => updateViewParam('camDist', v)}
          />

          {/* 操作按钮 */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={resetAll}>
              <Text style={styles.actionBtnText}>重置全部</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.logBtn]} onPress={logParams}>
              <Text style={styles.actionBtnText}>打印参数</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </Animated.View>
      )}

      {/* Loading */}
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

  // ─── 开关按钮 ──────────────────────────────────────────────────────
  toggleBtn: {
    position: 'absolute',
    right: 4,
    top: '45%',
    width: 24,
    height: 48,
    borderRadius: 4,
    backgroundColor: 'rgba(30, 50, 80, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  toggleBtnOpen: {
    right: PANEL_WIDTH + 4,
  },
  toggleBtnText: {
    color: '#7af',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ─── 调节面板 ──────────────────────────────────────────────────────
  panel: {
    position: 'absolute',
    right: 0,
    top: 80,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: 'rgba(10, 16, 28, 0.95)',
    borderLeftWidth: 1,
    borderLeftColor: '#1a3050',
    borderTopLeftRadius: 12,
    zIndex: 10,
  },
  panelScroll: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  panelTitle: {
    color: '#d6e6ff',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },

  // ─── 区域选择 Tab ──────────────────────────────────────────────────
  zoneTabs: {
    flexDirection: 'row',
    marginBottom: 10,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1a3050',
  },
  zoneTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#0d1520',
  },
  zoneTabActive: {
    backgroundColor: '#1a3a60',
  },
  zoneTabText: {
    color: '#556',
    fontSize: 11,
  },
  zoneTabTextActive: {
    color: '#7cf',
    fontWeight: 'bold',
  },

  // ─── Section 标签 ──────────────────────────────────────────────────
  sectionLabel: {
    color: '#6a8aaa',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
    letterSpacing: 0.5,
  },

  // ─── 操作按钮 ──────────────────────────────────────────────────────
  btnRow: {
    flexDirection: 'row',
    marginTop: 12,
    marginBottom: 20,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 5,
    backgroundColor: '#1a3050',
    alignItems: 'center',
  },
  logBtn: {
    backgroundColor: '#2a4a30',
  },
  actionBtnText: {
    color: '#8cf',
    fontSize: 11,
    fontWeight: 'bold',
  },

  // ─── Loading / Error ──────────────────────────────────────────────
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


const CarAirRN = forwardRef(CarAirRNInner);
export default CarAirRN;
