import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
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
import {addSide, lineInterpnew} from '../../util/util';
import {cushionPreValue, cushionQuadOf} from '../utils/cushionQuadrant';

// ─── 常量 ────────────────────────────────────────────────────────────────────
const SEPARATION = 100;
const POINT_SCALE = 0.005;
const HIDE_THRESHOLD_RATIO = 0.3;
const ENABLE_POINT_HIDE = false; // 暂时关闭点隐藏(旧阈值对新数据量级太高会全隐藏),先让点云可见
// 点抽稀:每隔 POINT_STRIDE 个点显示一个(矩形布局)。越大点越少。
// 1=全部显示;2=每隔一个(约 1/4 点);3=更稀。不改变点阵范围/贴合位置。
// 柔化热力场需要点密集叠加,用 1(全显示)。
const POINT_STRIDE = 1;
// 矩形边缘淡出:从边界往里 EDGE_FADE_POINTS 个点内透明度从 0 渐入,消除硬直角边界。
const EDGE_FADE_POINTS = 5;
// 低压透明度地板:压力越低越透明(0=完全消失)。留一点底让静止时能看到淡淡的场。
const LOW_ALPHA_FLOOR = 0.12;
// 无压力阈值:归一化压力(smoothBig/color)低于此值视为「没压力」→ 直接不显示这些点(shader discard)。
const NO_PRESSURE_NORM = 0.05;
// 整体色调提亮系数:RGB 统一乘该值(clamp 到 1),让点云更亮。
const COLOR_BRIGHTNESS = 1.35;

// ─── 云图配色:5 个 RGB 锚点(高压→低压)生成 25 级调色板 ─────────────────
// colorRGB[0]=最高压端颜色, colorRGB[4]=最低压端颜色。每个是 [r,g,b](0~255)。
// 默认 5 个颜色还原「红→橙→黄→蓝→蓝紫」的原彩虹表。
const DEFAULT_RGB = [
  [220, 20, 20],   // 最高压
  [245, 75, 5],
  [255, 255, 0],
  [0, 160, 255],
  [25, 25, 110],  // 最低压
];
// 预设方案:每个是 5 个 RGB 锚点(高压→低压)。第5个(最低压)默认收在深蓝紫。
const COLOR_PRESETS = {
  彩虹: [[220, 20, 20], [245, 75, 5], [255, 255, 0], [0, 160, 255], [25, 25, 110]],
  蓝红: [[255, 30, 30], [220, 20, 120], [150, 20, 180], [60, 40, 200], [25, 25, 110]],
  火焰: [[255, 240, 120], [255, 180, 0], [255, 90, 0], [200, 20, 0], [25, 25, 110]],
  蓝绿: [[0, 255, 120], [0, 230, 200], [0, 190, 255], [40, 90, 230], [25, 25, 110]],
};
const CLOUD_PALETTE_STOPS = 128;

// 渐变过渡:把锚点之间的线性比例 fr(0~1) 重新映射,控制「过渡带」宽窄。
//   gradientOn=false → 硬色带:每段只显示锚点原色(fr<0.5取前色,否则后色),就是「5 个颜色」。
//   gradientOn=true  → 中间一段做过渡,strength(0~100)=过渡带占整段的宽度:
//                      100 = 整段都在过渡(完全线性平滑,和以前一样);
//                      越小 → 两端锚点原色占得越多,只在正中间窄窄一条过渡(红↔橘中间才有红橘)。
function remapFrac(fr, gradientOn, strength) {
  if (!gradientOn) return fr < 0.5 ? 0 : 1;
  const w = Math.max(0.02, Math.min(1, (Number(strength) || 0) / 100));
  if (w >= 0.999) return fr;
  const lo = (1 - w) / 2; // 过渡带前后各留 (1-w)/2 的纯色
  if (fr <= lo) return 0;
  if (fr >= 1 - lo) return 1;
  return (fr - lo) / w;
}

// 5 个 RGB 锚点 → 多级调色板(在锚点之间按 remapFrac 过渡)。
// 返回数组 index 0 = 高压端(rgb[0]), index n-1 = 低压端(rgb[4])。
function buildPalette(rgb, gradientOn = true, strength = 100) {
  const anchors = (Array.isArray(rgb) && rgb.length >= 2) ? rgb : DEFAULT_RGB;
  const seg = anchors.length - 1;
  const n = CLOUD_PALETTE_STOPS;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const fp = (i / (n - 1)) * seg;
    const a = Math.floor(fp);
    const b = Math.min(a + 1, seg);
    const fr = remapFrac(fp - a, gradientOn, strength);
    const c0 = anchors[a];
    const c1 = anchors[b];
    out[i] = [
      c0[0] + (c1[0] - c0[0]) * fr,
      c0[1] + (c1[1] - c0[1]) * fr,
      c0[2] + (c1[2] - c0[2]) * fr,
    ];
  }
  return out;
}

// 调色板缓存:颜色/渐变参数不变时复用,避免每帧重建。
const rgbKey = (rgb) => (Array.isArray(rgb) ? rgb : DEFAULT_RGB).map(c => c.join('-')).join(',');
const paletteKey = (rgb, gradientOn, strength) =>
  rgbKey(rgb) + '|' + (gradientOn ? 1 : 0) + '|' + Math.round(Number(strength) || 0);
let _paletteCache = buildPalette(DEFAULT_RGB, true, 100);
let _paletteKey = paletteKey(DEFAULT_RGB, true, 100);
function getPalette(rgb, gradientOn = true, strength = 100) {
  const key = paletteKey(rgb, gradientOn, strength);
  if (key !== _paletteKey) {
    _paletteCache = buildPalette(rgb, gradientOn, strength);
    _paletteKey = key;
  }
  return _paletteCache;
}

// 与 jetWhite3 同样的映射逻辑(min=0,range=max*2),使用动态调色板。
// x=0 → 表末尾(低压色),x 越大越靠表头(高压色)。
function cloudColor(palette, max, x) {
  const pal = palette || _paletteCache;
  const n = pal.length;
  const range = max * 2;
  const t = range > 0 ? Math.max(0, Math.min(x / range, 1)) : 0;
  const idx = t * (n - 1);
  const f = Math.floor(idx);
  const c = Math.min(f + 1, n - 1);
  const frac = idx - f;
  const c0 = pal[n - 1 - f];
  const c1 = pal[n - 1 - c];
  return [
    c0[0] + (c1[0] - c0[0]) * frac,
    c0[1] + (c1[1] - c0[1]) * frac,
    c0[2] + (c1[2] - c0[2]) * frac,
  ];
}
const MODEL_ASSET = require('../assets/3D/111.glb');
// 分区(坐垫/靠背)各自可调的参数:颜色/显示 + 平滑/滤波 + 渐变过渡。
const DEFAULT_ZONE = {
  gauss: 2.5,        // 高斯(用户备份还原值)
  color: 425,        // 色阶映射范围(用户备份还原值)
  height: 1.0,       // 高度(用户备份还原值)
  coherent: 1.0,     // 第二层平滑(插值后):越小越跟手
  rawSmooth: 1.0,    // 第一层平滑(插值前):越小越跟手
  deadZone: 20,      // 死区阈值(用户备份还原值)
  gradientOn: true,  // 渐变过渡开关:关=5 个硬色带
  gradient: 15,      // 渐变过渡强弱 0~100:100=完全平滑,越小色带越硬(用户备份还原值)
};
// 分区字段名(坐垫/靠背各存一份;其余为全局共享)。
const ZONE_SETTING_KEYS = Object.keys(DEFAULT_ZONE);
// 配置「还原版本号」:升到新值时,旧设备上一次会被强制还原成下面这套默认值,
// 之后用户的改动照常持久化。改默认值想让老设备生效就把这个数字 +1。
const SETTINGS_RESTORE_VERSION = 2;
// 顶部「坐垫/靠背」切换用的标签(键与 allConfig 一致)。
const PANEL_ZONE_LABELS = {cushion: '坐垫', backrest: '靠背'};
const DEFAULT_SETTINGS = {
  // ── 版本 ──
  _v: SETTINGS_RESTORE_VERSION,
  // ── 全局共享 ──
  zeroFrameThreshold: 10, // 全 0 帧检测:帧总和低于此值视为气囊动作干扰帧,直接跳过
  colorRGB: DEFAULT_RGB.map(c => [...c]), // 云图 5 段颜色 RGB(高压→低压),坐垫靠背共用
  colorPreset: '彩虹',                     // 当前配色预设名(改单圈颜色后置为「自定义」)
  // ── 分区各一份 ──
  cushion: {...DEFAULT_ZONE},
  backrest: {...DEFAULT_ZONE},
};

// 迁移:把持久化读回的设置(可能是旧「扁平」格式)归一成新结构。
// 旧格式里的 color/gauss/... 会被复制到坐垫和靠背两份里(你原来调的值不丢)。
function normalizeSettings(saved) {
  const s = saved || {};
  // 一次性还原:设备上存的版本号低于当前 → 用户要求还原成备份默认值(只做一次)。
  // 还原后回写新版本号,之后用户的改动照常持久化,不会被再次覆盖。
  if ((s._v || 0) < SETTINGS_RESTORE_VERSION) {
    return {
      _v: SETTINGS_RESTORE_VERSION,
      zeroFrameThreshold: DEFAULT_SETTINGS.zeroFrameThreshold,
      colorRGB: DEFAULT_SETTINGS.colorRGB.map(c => [...c]),
      colorPreset: DEFAULT_SETTINGS.colorPreset,
      cushion: {...DEFAULT_ZONE},
      backrest: {...DEFAULT_ZONE},
    };
  }
  const out = {
    _v: SETTINGS_RESTORE_VERSION,
    zeroFrameThreshold: s.zeroFrameThreshold != null ? s.zeroFrameThreshold : DEFAULT_SETTINGS.zeroFrameThreshold,
    colorRGB: Array.isArray(s.colorRGB) ? s.colorRGB.map(c => [...c]) : DEFAULT_SETTINGS.colorRGB.map(c => [...c]),
    colorPreset: s.colorPreset || DEFAULT_SETTINGS.colorPreset,
  };
  // 旧扁平格式里的分区字段(若存在):作为坐垫/靠背的共同起点
  const flat = {};
  ZONE_SETTING_KEYS.forEach(k => { if (s[k] != null) flat[k] = s[k]; });
  out.cushion = {...DEFAULT_ZONE, ...flat, ...(s.cushion || {})};
  out.backrest = {...DEFAULT_ZONE, ...flat, ...(s.backrest || {})};
  return out;
}
// 数据更新频率：15Hz（匹配串口数据源）
const SEAT_UPDATE_INTERVAL = 1000 / 15;
const MODEL_TARGET_SIZE = 220;
const CAMERA_MIN_DISTANCE = 80;
const CAMERA_MAX_DISTANCE = 600;

// 按需渲染：手势结束后继续渲染的帧数
const IDLE_RENDER_FRAMES = 3;

// ─── 点图贴合参数（根据 chair3.glb 几何分析精确计算） ─────────────────────
// 注意：新网格(坐垫6×8/靠背7×8)长宽比与旧版(10×6)不同，这些贴合值是起点，
// 需在 3D 视图右侧调节面板里拖滑块微调，然后「打印参数」把结果填回这里。
const DEFAULT_POINT_FIT_LAYOUT = {
  // 用户实机调定并固化(坐垫/靠背贴合座椅)——还原为用户备份截图值
  center: {position: [13, -65, -29], rotation: [3.28, 0, 0], sx: 4.7, sy: 2.5, sz: 3.9},
  centersit: {position: [15, 8, 32], rotation: [2.01, 0, 0], sx: 4.5, sy: 0.7, sz: 6.2},
  leftsit: {position: [-28, -9, -30], rotation: [1.35, 0, -0.50], sx: 3.3, sy: 3.3, sz: 3.3},
  rightsit: {position: [64, -7, -10], rotation: [1.35, 0, 0.50], sx: 3.3, sy: 3.3, sz: 3.3},
};
const DEFAULT_POINT_SIZE = 8.5;  // 默认点大小

// layout 状态({px,py,pz,rx,ry,rz,sx,sy,sz})→ applyPointFitToModel 用的 {position,rotation,sx,sy,sz}
function layoutStateToFitMap(layout) {
  const map = {};
  Object.keys(layout || {}).forEach(name => {
    const l = layout[name];
    if (!l) return;
    map[name] = {
      position: [l.px, l.py, l.pz],
      rotation: [l.rx, l.ry, l.rz],
      sx: l.sx, sy: l.sy, sz: l.sz,
    };
  });
  return map;
}

const DEFAULT_POINT_MAP_ROTATE = {x: 0, y: 0, z: 0};
const POINT_MAP_SCALE_DEFAULT = 1.8;

// ─── 调节面板配置 ────────────────────────────────────────────────────────────
const PANEL_WIDTH = 300;
const ZONE_NAMES = ['center', 'centersit'];
const ZONE_LABELS = {
  center: '坐垫',
  centersit: '靠背',
};

// ─── 新传感器数据规格 ──────────────────────────────────────────────────────
// airbag_13Hz 算法输出：坐垫 6行×8列(48点) + 靠背 7行×8列(56点) = 104
// 数据为「列优先」一维数组，喂给渲染器前转成「行优先」。
const CUSHION_ROWS = 6, CUSHION_COLS = 8, CUSHION_LEN = 48;
const BACKREST_ROWS = 7, BACKREST_COLS = 8, BACKREST_LEN = 56;
const SENSOR_TOTAL = CUSHION_LEN + BACKREST_LEN; // 104

// ─── 插值配置（按新几何：坐垫 6×8 / 靠背 7×8） ───────────────────────────────
// lineInterpnew(ndata1, width=sitnum2=列数, height=sitnum1=行数)
// interp 取值让插值后点数与旧版相近（约 40×35），保持点云密度观感一致。
const cushionConfig = {sitnum1: CUSHION_ROWS, sitnum2: CUSHION_COLS, sitInterp: 7, sitInterp1: 4, sitOrder: 3};
const backrestConfig = {sitnum1: BACKREST_ROWS, sitnum2: BACKREST_COLS, sitInterp: 6, sitInterp1: 4, sitOrder: 3};

const allConfig = {
  cushion: {
    dataConfig: cushionConfig,
    name: 'center',   // 复用 DEFAULT_POINT_FIT_LAYOUT 的 center 贴合位置(坐垫)
    pointConfig: {position: [0, 0, 0], rotation: [0, 0, 0]},
    flipRow: true,     // 座椅前后方向（发现前后反了改这里）
    flipHeight: false,
  },
  backrest: {
    dataConfig: backrestConfig,
    name: 'centersit', // 复用 centersit 贴合位置(靠背)
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

addTotal([cushionConfig, backrestConfig]);

function createSmoothBig() {
  const obj = {};
  Object.keys(allConfig).forEach(key => {
    const {name, dataConfig} = allConfig[key];
    obj[name] = new Array(dataConfig.total).fill(1);
  });
  return obj;
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

const GAUSS_KERNEL = buildGaussKernel(DEFAULT_ZONE.gauss);

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
  // console.log('[loadSeatModel] 开始加载模型...');
  const asset = Asset.fromModule(MODEL_ASSET);
  // console.log('[loadSeatModel] asset hash:', asset.hash, 'downloaded:', asset.downloaded);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) {
    // console.warn('[loadSeatModel] 模型 URI 为空，无法加载');
    return null;
  }
  // console.log('[loadSeatModel] 模型 URI:', uri);

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
          // console.warn('glb: parse ok but no scene');
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
        // console.warn('glb: parse error', err);
        reject(err);
      },
    );
  });
}

// ─── 圆形纹理（共享单例） ───────────────────────────────────────────────────

let _sharedCircleTexture = null;

function getSharedCircleTexture(size = 64) {
  if (_sharedCircleTexture) {
    return _sharedCircleTexture;
  }
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const radius = size / 2 - 1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 高斯柔化：中心不透明，向边缘平滑衰减到 0（发光光斑，不是硬边圆点）
      const t = dist / radius; // 0=中心, 1=边缘
      let alpha = 0;
      if (t < 1) {
        alpha = Math.exp(-3.2 * t * t) * (1 - t); // 高斯衰减 + 边缘归零
      }
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
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
  const normalized = new Array(SENSOR_TOTAL).fill(0);
  if (!Array.isArray(values)) {
    return normalized;
  }
  const limit = Math.min(values.length, SENSOR_TOTAL);
  for (let i = 0; i < limit; i += 1) {
    const value = Number(values[i]);
    normalized[i] = Number.isFinite(value) ? value : 0;
  }
  return normalized;
}

/** 列优先一维 → 行优先一维（渲染器/插值按行优先访问 ndata1[row*cols+col]） */
function colMajorToRowMajor(arr, rows, cols) {
  const out = new Array(rows * cols).fill(0);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const v = arr[r + c * rows]; // 列优先下标
      out[r * cols + c] = Number.isFinite(v) ? v : 0;
    }
  }
  return out;
}

/** 输入 ndata1 = [坐垫48(列优先6×8), 靠背56(列优先7×8)]，拆成两个区域的行优先网格 */
function splitSeatData(ndata1) {
  const cushionCol = ndata1.slice(0, CUSHION_LEN);
  const backrestCol = ndata1.slice(CUSHION_LEN, CUSHION_LEN + BACKREST_LEN);
  return {
    center: colMajorToRowMajor(cushionCol, CUSHION_ROWS, CUSHION_COLS),
    centersit: colMajorToRowMajor(backrestCol, BACKREST_ROWS, BACKREST_COLS),
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
    opacity: 1.0,
    size: DEFAULT_POINT_SIZE,
    map: circleTexture,
    alphaTest: 0.0, // 不裁剪柔和边缘，让光斑平滑叠成连续热力场
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
      )
      // vScale 作为 0~1 连续透明度倍率：边缘淡出 + 低压淡出
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n diffuseColor.a *= clamp(vScale, 0.0, 1.0);',
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

    // 每个区域独立 XYZ 缩放
    const sxVal = layout.sx != null ? layout.sx : POINT_MAP_SCALE_DEFAULT;
    const syVal = layout.sy != null ? layout.sy : POINT_MAP_SCALE_DEFAULT;
    const szVal = layout.sz != null ? layout.sz : POINT_MAP_SCALE_DEFAULT;
    mesh.scale.set(
      POINT_SCALE * (Number.isFinite(sxVal) ? sxVal : 1),
      POINT_SCALE * (Number.isFinite(syVal) ? syVal : 1),
      POINT_SCALE * (Number.isFinite(szVal) ? szVal : 1),
    );

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

  const _ds = dynSettings || DEFAULT_SETTINGS;
  const {color, height, coherent} = _ds;
  const palette = getPalette(_ds.colorRGB, _ds.gradientOn, _ds.gradient);

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

      // 归一化压力(0~1),供隐藏判断与透明度共用
      const norm = color > 0 ? Math.max(0, Math.min(1, smoothBig[l] / color)) : 0;
      if (scales) {
        // 抽稀:每隔 POINT_STRIDE 显示一个点(矩形布局,减少点数,不改变贴合)
        const thinned = POINT_STRIDE > 1 && (ix % POINT_STRIDE !== 0 || iy % POINT_STRIDE !== 0);
        // 没压力的点直接不显示(不再置灰),只显示有压力的点
        if (norm <= NO_PRESSURE_NORM || thinned) {
          scales[j] = 0;
        } else {
          // 边缘淡出:离矩形边界越近越透明(用几何行列 ix/iy,不受 flipRow 影响)
          const distEdge = Math.min(ix, amountX - 1 - ix, iy, amountY - 1 - iy);
          const edgeFade = Math.max(0, Math.min(1, distEdge / EDGE_FADE_POINTS));
          // 有压力的点直接以(接近)满透明度显示,不再按压力压暗
          scales[j] = edgeFade;
        }
      }

      const rgb = cloudColor(palette, color, smoothBig[l]);
      // 整体提亮:RGB 统一乘 COLOR_BRIGHTNESS 后 clamp 到 [0,1]
      colors[k] = Math.min(1, (rgb[0] / 255) * COLOR_BRIGHTNESS);
      colors[k + 1] = Math.min(1, (rgb[1] / 255) * COLOR_BRIGHTNESS);
      colors[k + 2] = Math.min(1, (rgb[2] / 255) * COLOR_BRIGHTNESS);

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

function CarAirRNInner({data = [], style, showDebugPanel = true, onBaselineChange, cushionPre, cushionTopGain}, ref) {
  const stateRef = useRef({});
  const dataRef = useRef(data);
  // 把「清零预压力」开关状态回调给父组件(HomeScreen)，让它把这一帧记录下来。
  // 用 ref 存回调，避免 useImperativeHandle 的空依赖捕获到旧引用。
  const onBaselineChangeRef = useRef(onBaselineChange);
  onBaselineChangeRef.current = onBaselineChange;
  // 坐垫「分四块手动预压力」[左上,右上,左下,右下]，由父组件(热力图弹窗)设置。
  // 靠背仍减去清零那一帧；坐垫改减这四块各自设定的值。
  const cushionPreRef = useRef(cushionPre);
  cushionPreRef.current = cushionPre;
  // 坐垫「左上/右上」两块的放大倍数:减去的预压力 = 该块设定值 × 倍数(默认 1=不放大)。
  // 过量减去静息基线→压低低压区,只留强压,让这两块的压力云图变动更猛烈。
  const cushionTopGainRef = useRef(cushionTopGain);
  cushionTopGainRef.current = cushionTopGain;
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
          const merged = normalizeSettings(saved); // 迁移旧扁平格式→坐垫/靠背各一份
          setPointSettings(merged);
          pointSettingsRef.current = merged;
          // 坐垫/靠背各建一个高斯核
          if (stateRef.current) {
            stateRef.current._gaussKernel = {
              cushion: buildGaussKernel(merged.cushion.gauss),
              backrest: buildGaussKernel(merged.backrest.gauss),
            };
            stateRef.current.dirty = true;
          }
        } catch (_) {}
      }
      settingsLoadedRef.current = true;
    }).catch(() => { settingsLoadedRef.current = true; });
  }, []);

  // 改某个分区(zoneKey='cushion'|'backrest')的某个参数。坐垫/靠背互不影响。
  const updateZoneSetting = useCallback((zoneKey, key, value) => {
    setPointSettings(prev => {
      const zonePrev = prev[zoneKey] || DEFAULT_ZONE;
      const nextZone = {...zonePrev, [key]: value};
      const next = {...prev, [zoneKey]: nextZone};
      pointSettingsRef.current = next;
      const fs = stateRef.current;
      // 平滑参数变更:重置平滑缓冲区(全局一份 buf,重置无妨)
      if (key === 'rawSmooth' || key === 'coherent') {
        fs.rawSmoothInited = false;
      }
      if (key === 'gauss') {
        // 只重建该分区的高斯核
        fs._gaussKernel = fs._gaussKernel || {};
        fs._gaussKernel[zoneKey] = buildGaussKernel(value);
      }
      if (key === 'gradient' || key === 'gradientOn') {
        // 纯配色调整:强制下一帧重新着色立即生效
        fs.lastDataHash = -1;
      }
      fs.dirty = true;
      // 持久化到 SharedPreferences
      NativeModules.SerialModule?.savePointSettings?.(JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // 强制下一帧重新着色(即使数据没变):用于纯配色调整时立即生效。
  const forceRecolor = useCallback(() => {
    const fs = stateRef.current;
    if (fs) {
      fs.lastDataHash = -1; // 与任何真实 hash(>=0)都不相等 → 触发重算
      fs.dirty = true;
    }
  }, []);

  // 应用整套配色预设(5 段 RGB)
  const applyColorPreset = useCallback((name) => {
    const preset = COLOR_PRESETS[name];
    if (!preset) return;
    setPointSettings(prev => {
      const next = {...prev, colorRGB: preset.map(c => [...c]), colorPreset: name};
      pointSettingsRef.current = next;
      forceRecolor();
      NativeModules.SerialModule?.savePointSettings?.(JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [forceRecolor]);

  // 调整某一圈的某个 RGB 通道(ring 0=最高压 … 4=最低压;ch 0=R 1=G 2=B),自动切到「自定义」
  const updateColorChannel = useCallback((ring, ch, value) => {
    setPointSettings(prev => {
      const base = (prev.colorRGB && prev.colorRGB.length >= 5) ? prev.colorRGB : DEFAULT_RGB;
      const rgb = base.map(c => [...c]);
      rgb[ring][ch] = value;
      const next = {...prev, colorRGB: rgb, colorPreset: '自定义'};
      pointSettingsRef.current = next;
      forceRecolor();
      NativeModules.SerialModule?.savePointSettings?.(JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [forceRecolor]);

  // 暴露清零/取消清零方法给父组件
  useImperativeHandle(ref, () => ({
    /** 记录当前帧为基线，后续帧减去基线值 */
    zeroBaseline() {
      const fs = stateRef.current;
      const currentData = dataRef.current;
      if (Array.isArray(currentData) && currentData.length >= SENSOR_TOTAL) {
        const normalized = normalizeSeatData(currentData);
        fs.baseline = normalized.slice(0, SENSOR_TOTAL);
        // 重置平滑缓冲区，避免旧数据残留
        fs.rawSmoothInited = false;
        fs.dirty = true;
        setBaselineActive(true);
        onBaselineChangeRef.current?.(true);
      }
    },
    /** 取消清零，恢复原始数据 */
    clearBaseline() {
      const fs = stateRef.current;
      fs.baseline = null;
      fs.rawSmoothInited = false;
      fs.dirty = true;
      setBaselineActive(false);
      onBaselineChangeRef.current?.(false);
    },
    /** 是否已清零 */
    isBaselineActive() {
      return !!stateRef.current.baseline;
    },
    /** 算法判断离座时调用：立即清零 3D 图所有点位数据，并冻结数据更新 */
    resetToZero() {
      const fs = stateRef.current;
      // console.log('[CarAirRN] resetToZero 调用, smoothBig存在:', !!fs.smoothBig, 'pointMeshes存在:', !!fs.pointMeshes);
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
        sx: def.sx != null ? def.sx : POINT_MAP_SCALE_DEFAULT,
        sy: def.sy != null ? def.sy : POINT_MAP_SCALE_DEFAULT,
        sz: def.sz != null ? def.sz : POINT_MAP_SCALE_DEFAULT,
      };
    });
    return init;
  });
  const [activeZone, setActiveZone] = useState('center');
  // 顶部「颜色/显示 · 平滑/滤波 · 渐变过渡」当前编辑的分区(坐垫/靠背)
  const [panelZone, setPanelZone] = useState('cushion');
  const [pointSize, setPointSize] = useState(DEFAULT_POINT_SIZE);

  // 整体视角参数
  const [viewParams, setViewParams] = useState({
    camDist: 300,   // 相机距离
    rootRx: 0.323,  // rootGroup X 旋转(用户实机调定的默认加载朝向)
    rootRy: -2.728, // rootGroup Y 旋转
    rootPx: 0,      // rootGroup X 位移(0=水平居中；旧值 71 会把座椅推偏)
    rootPy: 13,     // rootGroup Y 位移
    rootPz: -100,   // rootGroup Z 位移
    // pointGroup 整体旋转
    grpRx: DEFAULT_POINT_MAP_ROTATE.x,
    grpRy: DEFAULT_POINT_MAP_ROTATE.y,
    grpRz: DEFAULT_POINT_MAP_ROTATE.z,
    // 座椅模型自身参数
    modelPx: 3,     // 模型 X 位移(用户实机调定)
    modelPy: 0,     // 模型 Y 位移
    modelPz: 0,     // 模型 Z 位移
    modelRx: 0,     // 模型 X 旋转
    modelRy: 1.57,  // 模型 Y 旋转
    modelRz: 0,     // 模型 Z 旋转
    modelScale: 1,  // 模型缩放倍率（相对于自动计算的基准缩放）
  });

  // 布局/视角/点大小的最新值 ref(供异步的「模型加载完成」回调 & 保存函数读取)
  const layoutRef = useRef(layout);
  const viewParamsRef = useRef(viewParams);
  const pointSizeRef = useRef(pointSize);
  const viewLoadedRef = useRef(false); // 视角持久化是否已加载完(避免早期渲染回调用默认值覆盖存档)
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  useEffect(() => { viewParamsRef.current = viewParams; }, [viewParams]);
  useEffect(() => { pointSizeRef.current = pointSize; }, [pointSize]);

  // 把「布局+视角+点大小」打包持久化到 SharedPreferences(view 键)。防抖到帧末。
  const saveViewTimerRef = useRef(null);
  const saveViewSettings = useCallback(() => {
    if (saveViewTimerRef.current) clearTimeout(saveViewTimerRef.current);
    saveViewTimerRef.current = setTimeout(() => {
      const payload = {
        layout: layoutRef.current,
        viewParams: viewParamsRef.current,
        pointSize: pointSizeRef.current,
      };
      NativeModules.SerialModule?.saveViewSettings?.(JSON.stringify(payload)).catch(() => {});
    }, 300);
  }, []);

  // 把持久化的视角参数应用到已存在的 3D 场景(rootGroup/model/pointGroup)。
  const applyViewParamsToScene = useCallback((vp) => {
    const s = stateRef.current;
    if (!s || !vp) return;
    if (s.camera && s.controls) {
      if (Number.isFinite(vp.camDist)) { s.camera.position.z = vp.camDist; s.controls.distance = vp.camDist; }
    }
    if (s.rootGroup && s.controls) {
      if (Number.isFinite(vp.rootRx)) { s.rootGroup.rotation.x = vp.rootRx; s.controls.rotationX = vp.rootRx; }
      if (Number.isFinite(vp.rootRy)) { s.rootGroup.rotation.y = vp.rootRy; s.controls.rotationY = vp.rootRy; }
      if (Number.isFinite(vp.rootPx)) s.rootGroup.position.x = vp.rootPx;
      if (Number.isFinite(vp.rootPy)) s.rootGroup.position.y = vp.rootPy;
      if (Number.isFinite(vp.rootPz)) s.rootGroup.position.z = vp.rootPz;
    }
    if (s.pointGroup) {
      if (Number.isFinite(vp.grpRx)) s.pointGroup.rotation.x = vp.grpRx;
      if (Number.isFinite(vp.grpRy)) s.pointGroup.rotation.y = vp.grpRy;
      if (Number.isFinite(vp.grpRz)) s.pointGroup.rotation.z = vp.grpRz;
    }
    const model = s.model;
    if (model) {
      const bp = model._basePosition;
      if (bp) {
        if (Number.isFinite(vp.modelPx)) model.position.x = bp.x + vp.modelPx;
        if (Number.isFinite(vp.modelPy)) model.position.y = bp.y + vp.modelPy;
        if (Number.isFinite(vp.modelPz)) model.position.z = bp.z + vp.modelPz;
      }
      model.rotation.set(vp.modelRx ?? 0, vp.modelRy ?? 1.57, vp.modelRz ?? 0);
      if (model._baseScale != null && Number.isFinite(vp.modelScale)) {
        model.scale.setScalar(model._baseScale * vp.modelScale);
      }
    }
    s.dirty = true;
  }, []);

  // 启动时加载持久化的视角/布局/点大小
  useEffect(() => {
    NativeModules.SerialModule?.loadViewSettings?.().then(json => {
      if (json) {
        try {
          const saved = JSON.parse(json);
          if (saved.layout) {
            setLayout(prev => ({...prev, ...saved.layout}));
            layoutRef.current = {...layoutRef.current, ...saved.layout};
          }
          if (saved.viewParams) {
            setViewParams(prev => ({...prev, ...saved.viewParams}));
            viewParamsRef.current = {...viewParamsRef.current, ...saved.viewParams};
          }
          if (Number.isFinite(saved.pointSize)) {
            setPointSize(saved.pointSize);
            pointSizeRef.current = saved.pointSize;
          }
          // 场景若已就绪则立即套用一遍(模型/网格已在则生效,未就绪由加载回调兜底)
          const s = stateRef.current;
          if (s?.pointMeshes && saved.layout) {
            applyPointFitToModel(s.model, s.pointMeshes, layoutStateToFitMap({...layoutRef.current}));
          }
          if (saved.viewParams) applyViewParamsToScene(viewParamsRef.current);
          if (Number.isFinite(saved.pointSize) && s?.pointMeshes) {
            Object.values(s.pointMeshes).forEach(m => { if (m?.material) { m.material.size = saved.pointSize; m.material.needsUpdate = true; } });
            if (s) s.dirty = true;
          }
        } catch (_) {}
      }
      viewLoadedRef.current = true;
    }).catch(() => { viewLoadedRef.current = true; });
  }, [applyViewParamsToScene]);

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

      // 每个区域独立 XYZ 缩放
      const sxF = Number.isFinite(l.sx) ? l.sx : POINT_MAP_SCALE_DEFAULT;
      const syF = Number.isFinite(l.sy) ? l.sy : POINT_MAP_SCALE_DEFAULT;
      const szF = Number.isFinite(l.sz) ? l.sz : POINT_MAP_SCALE_DEFAULT;
      mesh.scale.set(POINT_SCALE * sxF, POINT_SCALE * syF, POINT_SCALE * szF);
    });

    s.dirty = true;
  }, []);

  // 应用点大小到所有点图
  const applyPointSize = useCallback((size) => {
    const s = stateRef.current;
    if (!s.pointMeshes) return;
    Object.values(s.pointMeshes).forEach(mesh => {
      if (mesh && mesh.material) {
        mesh.material.size = size;
        mesh.material.needsUpdate = true;
      }
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

  // updateViewParam 后持久化(用 effect 追新值,避免闭包旧值)
  const updateViewParamPersist = useCallback((param, value) => {
    updateViewParam(param, value);
    viewParamsRef.current = {...viewParamsRef.current, [param]: value};
    saveViewSettings();
  }, [updateViewParam, saveViewSettings]);

  // 更新某个区域的某个参数
  const updateZoneParam = useCallback((zone, param, value) => {
    setLayout(prev => {
      const next = {...prev, [zone]: {...prev[zone], [param]: value}};
      applyLayout(next);
      layoutRef.current = next;
      saveViewSettings();
      return next;
    });
  }, [applyLayout, saveViewSettings]);

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
      sx: def.sx != null ? def.sx : POINT_MAP_SCALE_DEFAULT,
      sy: def.sy != null ? def.sy : POINT_MAP_SCALE_DEFAULT,
      sz: def.sz != null ? def.sz : POINT_MAP_SCALE_DEFAULT,
    };
    setLayout(prev => {
      const next = {...prev, [activeZone]: resetVal};
      applyLayout(next);
      layoutRef.current = next;
      saveViewSettings();
      return next;
    });
  }, [activeZone, applyLayout, saveViewSettings]);

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
        sx: def.sx != null ? def.sx : POINT_MAP_SCALE_DEFAULT,
        sy: def.sy != null ? def.sy : POINT_MAP_SCALE_DEFAULT,
        sz: def.sz != null ? def.sz : POINT_MAP_SCALE_DEFAULT,
      };
    });
    setLayout(init);
    applyLayout(init);
    // 重置点大小
    setPointSize(DEFAULT_POINT_SIZE);
    applyPointSize(DEFAULT_POINT_SIZE);
    // 重置座椅模型参数到初始值
    const model = stateRef.current.model;
    if (model) {
      if (model._basePosition) {
        model.position.x = model._basePosition.x + 0;
        model.position.y = model._basePosition.y + 0;
        model.position.z = model._basePosition.z + 0;
      }
      model.rotation.set(0, 1.57, 0);
      if (model._baseScale) {
        model.scale.setScalar(model._baseScale);
      }
      stateRef.current.dirty = true;
    }
    setViewParams(prev => {
      const nextVp = {
        ...prev,
        modelPx: 0, modelPy: 0, modelPz: 0,
        modelRx: 0, modelRy: 1.57, modelRz: 0,
        modelScale: 1,
      };
      viewParamsRef.current = nextVp;
      return nextVp;
    });
    // 重置后把布局/视角/点大小一并持久化
    layoutRef.current = init;
    pointSizeRef.current = DEFAULT_POINT_SIZE;
    saveViewSettings();
  }, [applyLayout, applyPointSize, saveViewSettings]);

  // 打印当前参数到控制台
  const logParams = useCallback(() => {
    const output = {};
    ZONE_NAMES.forEach(name => {
      const l = layout[name];
      output[name] = {
        position: [parseFloat(l.px.toFixed(2)), parseFloat(l.py.toFixed(2)), parseFloat(l.pz.toFixed(2))],
        rotation: [parseFloat(l.rx.toFixed(4)), parseFloat(l.ry.toFixed(4)), parseFloat(l.rz.toFixed(4))],
        scale: {x: parseFloat(l.sx.toFixed(2)), y: parseFloat(l.sy.toFixed(2)), z: parseFloat(l.sz.toFixed(2))},
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
    // GL context 可能重建(切后台/弹窗重挂/丢context)：先取消上一个渲染循环,避免同时跑两个循环。
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    mountedRef.current = true;
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
    scene.background = new THREE.Color(0x2b333e); // 压力云图背景:纯色

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
      rotationX: 0.323,   // 用户实机调定的默认加载朝向
      rotationY: -2.728,
      distance: camera.position.z,
      lastX: 0,
      lastY: 0,
      lastPinchDistance: 0,
      isPinching: false,
      isInteracting: false,
    };
    rootGroup.rotation.x = controls.rotationX;
    rootGroup.rotation.y = controls.rotationY;
    rootGroup.position.x = 0;   // 0=水平居中(旧值 71 会把座椅推到右边)
    rootGroup.position.y = 13;
    rootGroup.position.z = -100;

    setLoading(true);
    setLoadError(null);
    loadSeatModel(rootGroup)
      .then(model => {
        // console.log('[CarAirRN] 模型加载完成, mounted:', mountedRef.current, 'model:', !!model);
        if (!mountedRef.current) {
          // console.warn('[CarAirRN] 组件已卸载，放弃模型加载结果');
          return;
        }
        stateRef.current.model = model;
        // 保存模型的基准位置和缩放，供调节面板使用
        if (model) {
          model._basePosition = model.position.clone();
          model._baseScale = model.scale.x; // setScalar 后 xyz相同
          // 应用初始座椅模型参数
          // 新模型(carSeatModel.glb)已在 loadSeatModel 里自动居中到原点，
          // 偏移先设 0，运行后用调试面板滑块(modelPx/Py/Pz)微调再填回这里。
          model.position.x = model._basePosition.x + 3;
          model.position.y = model._basePosition.y + 0;
          model.position.z = model._basePosition.z + 0;
          model.rotation.set(0, 1.57, 0);
        }
        // 布局:有持久化(用户存过)就用存的,否则用代码默认
        const fitMap = layoutStateToFitMap(layoutRef.current);
        applyPointFitToModel(model, pointMeshes, Object.keys(fitMap).length ? fitMap : DEFAULT_POINT_FIT_LAYOUT);
        // 点大小
        if (Number.isFinite(pointSizeRef.current)) {
          Object.values(pointMeshes).forEach(m => { if (m?.material) { m.material.size = pointSizeRef.current; m.material.needsUpdate = true; } });
        }
        // 视角(相机/rootGroup/pointGroup/model)——用最新(可能持久化)的值覆盖硬编码初值
        applyViewParamsToScene(viewParamsRef.current);
        stateRef.current.dirty = true;
        setLoading(false);
        if (!model) {
          setLoadError('model missing');
        }
      })
      .catch(err => {
        // console.warn('[CarAirRN] 模型加载失败:', err?.message || String(err));
        if (!mountedRef.current) return;
        setLoading(false);
        setLoadError(err?.message || String(err));
      });

    // 第一层平滑缓冲区：原始 144 字节数据的帧间混合
    const rawSmoothBuf = new Float32Array(SENSOR_TOTAL);
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
      _gaussKernel: {cushion: GAUSS_KERNEL, backrest: GAUSS_KERNEL}, // 坐垫/靠背各一个动态高斯核
    };

    const animate = () => {
      if (!mountedRef.current) return;
      // 无论本帧成功还是抛异常,都要续下一帧,否则循环一崩就永久黑屏(座椅+云图全没)。
      const scheduleNext = () => {
        if (mountedRef.current) frameRef.current = requestAnimationFrame(animate);
      };
      try {
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
        return;
      }

      // 旋转/拖动期间跳过重的热力场重算(插值+高斯+着色),
      // 只做便宜的相机变换渲染,避免每 ~66ms 一次重算卡住旋转帧。
      // 松手后 isInteracting=false，数据自动恢复更新。
      const interacting = !!(frameState.controls && frameState.controls.isInteracting);

      if (
        !interacting &&
        (!frameState.lastSeatUpdate ||
          now - frameState.lastSeatUpdate >= SEAT_UPDATE_INTERVAL)
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

          // 清零：减去预压力。
          //   靠背(bi>=CUSHION_LEN)：仍减去「清零」那一帧记录的基线值（逻辑不变）。
          //   坐垫(bi<CUSHION_LEN) ：不再减那一帧，改减「分四块手动设定」的预压力值。
          if (frameState.baseline) {
            const cp = cushionPreRef.current;
            const topGain = Number(cushionTopGainRef.current) || 1;
            for (let bi = 0; bi < SENSOR_TOTAL; bi++) {
              let v;
              if (bi < CUSHION_LEN) {
                const base = cp ? cushionPreValue(bi, cp) : 0;
                const q = cushionQuadOf(bi); // 0左上 1右上 2左下 3右下
                const diff = seatData[bi] - base; // 减完预压力后的变动
                // 左上/右上:把「减完预压力后的变动」再放大 topGain 倍
                // 例:实际60 预压力40 → diff=20,倍数2 → 40。压力变一点云图就很明显。
                v = q === 0 || q === 1 ? diff * topGain : diff;
              } else {
                v = seatData[bi] - frameState.baseline[bi];
              }
              seatData[bi] = Math.max(0, v);
            }
          }

          // 全 0 帧检测：气囊动作时传感器可能返回全 0 或异常低值数据
          const _dynSettings = pointSettingsRef.current;
          const zeroThreshold = _dynSettings.zeroFrameThreshold || 10;
          let frameSum = 0;
          for (let zi = 0; zi < SENSOR_TOTAL; zi++) {
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


          // 第一层平滑：原始数据帧间混合（在插值放大之前）。坐垫/靠背各用自己的帧平滑。
          const rawBuf = frameState.rawSmoothBuf;
          const alphaCushion = (_dynSettings.cushion?.rawSmooth) || 1;
          const alphaBackrest = (_dynSettings.backrest?.rawSmooth) || 1;
          if (!frameState.rawSmoothInited) {
            // 第一帧直接拷贝
            for (let ri = 0; ri < SENSOR_TOTAL; ri++) {
              rawBuf[ri] = seatData[ri];
            }
            frameState.rawSmoothInited = true;
          } else {
            for (let ri = 0; ri < SENSOR_TOTAL; ri++) {
              const a = ri < CUSHION_LEN ? alphaCushion : alphaBackrest;
              rawBuf[ri] = rawBuf[ri] + (seatData[ri] - rawBuf[ri]) / a;
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
            // 该分区(坐垫/靠背)自己的设置 + 共享配色 + 该分区高斯核
            const zoneCfg = _dynSettings[key] || DEFAULT_ZONE;
            const kern = (frameState._gaussKernel && frameState._gaussKernel[key]) || GAUSS_KERNEL;
            const dynS = {...zoneCfg, colorRGB: _dynSettings.colorRGB, _gaussKernel: kern};
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
      } catch (e) {
        // 单帧异常(最常见是 GL context 丢失时 render/endFrameEXP 抛错)不应杀死整个循环:
        // 吞掉本帧错误,靠 finally 续下一帧,context 恢复/重建后画面自动回来。
      } finally {
        scheduleNext();
      }
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

      {/* 调节面板：用 Modal 渲染到屏幕根层，贴「屏幕」最右边（不再被压力云图框裁剪） */}
      <Modal
        visible={showDebugPanel && panelVisible}
        transparent
        animationType="slide"
        onRequestClose={togglePanel}>
        <View style={styles.panelModalRoot}>
          {/* 左侧透明遮罩：点一下关闭面板 */}
          <TouchableOpacity style={styles.panelBackdrop} activeOpacity={1} onPress={togglePanel} />
          <View style={styles.panelScreenRight}>
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
                  onBaselineChangeRef.current?.(false);
                } else {
                  const fs = stateRef.current;
                  const currentData = dataRef.current;
                  if (Array.isArray(currentData) && currentData.length >= SENSOR_TOTAL) {
                    const normalized = normalizeSeatData(currentData);
                    fs.baseline = normalized.slice(0, SENSOR_TOTAL);
                    fs.rawSmoothInited = false;
                    fs.dirty = true;
                    setBaselineActive(true);
                    onBaselineChangeRef.current?.(true);
                  }
                }
              }}>
              <Text style={styles.actionBtnText}>
                {baselineActive ? '✖ 取消清零' : '清零预压力'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ─── 顶部:坐垫/靠背分区切换(下面「颜色/显示·平滑/滤波·渐变过渡」按此分区分别控制) ─── */}
          <View style={styles.zoneTabs}>
            {['cushion', 'backrest'].map(zk => (
              <TouchableOpacity
                key={zk}
                style={[styles.zoneTab, panelZone === zk && styles.zoneTabActive]}
                onPress={() => setPanelZone(zk)}>
                <Text style={[styles.zoneTabText, panelZone === zk && styles.zoneTabTextActive]}>
                  {PANEL_ZONE_LABELS[zk]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 点图参数调节(仅作用于当前分区 panelZone) */}
          <Text style={styles.sectionLabel}>颜色 / 显示（{PANEL_ZONE_LABELS[panelZone]}）</Text>
          <StepControl
            label="色阶"
            value={pointSettings[panelZone].color}
            min={50}
            max={2000}
            step={25}
            decimals={0}
            onValueChange={v => updateZoneSetting(panelZone, 'color', v)}
          />
          <StepControl
            label="高度"
            value={pointSettings[panelZone].height}
            min={-5}
            max={5}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneSetting(panelZone, 'height', v)}
          />
          <StepControl
            label="高斯"
            value={pointSettings[panelZone].gauss}
            min={0}
            max={5}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneSetting(panelZone, 'gauss', v)}
          />

          <Text style={styles.sectionLabel}>平滑 / 滤波（{PANEL_ZONE_LABELS[panelZone]}）</Text>
          <StepControl
            label="帧平滑"
            value={pointSettings[panelZone].rawSmooth}
            min={1}
            max={10}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneSetting(panelZone, 'rawSmooth', v)}
          />
          <StepControl
            label="插值平滑"
            value={pointSettings[panelZone].coherent}
            min={1}
            max={10}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneSetting(panelZone, 'coherent', v)}
          />
          <StepControl
            label="死区"
            value={pointSettings[panelZone].deadZone}
            min={0}
            max={50}
            step={1}
            decimals={0}
            onValueChange={v => updateZoneSetting(panelZone, 'deadZone', v)}
          />

          {/* ─── 渐变过渡:开关 + 强弱(按当前分区;写在云图配色上面) ─── */}
          <Text style={styles.sectionLabel}>渐变过渡（{PANEL_ZONE_LABELS[panelZone]}）</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity
              style={[styles.presetBtn, pointSettings[panelZone].gradientOn && styles.presetBtnActive]}
              onPress={() => updateZoneSetting(panelZone, 'gradientOn', true)}>
              <Text style={[styles.presetBtnText, pointSettings[panelZone].gradientOn && styles.presetBtnTextActive]}>
                开(渐变)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.presetBtn, !pointSettings[panelZone].gradientOn && styles.presetBtnActive]}
              onPress={() => updateZoneSetting(panelZone, 'gradientOn', false)}>
              <Text style={[styles.presetBtnText, !pointSettings[panelZone].gradientOn && styles.presetBtnTextActive]}>
                关(硬色带)
              </Text>
            </TouchableOpacity>
          </View>
          <StepControl
            label="渐变强弱"
            value={pointSettings[panelZone].gradient}
            min={0}
            max={100}
            step={5}
            decimals={0}
            onValueChange={v => updateZoneSetting(panelZone, 'gradient', v)}
          />

          {/* ─── 云图配色:预设 + 逐圈 RGB ─── */}
          <Text style={styles.sectionLabel}>云图配色</Text>
          {/* 预设方案(整体一键切换) */}
          <View style={styles.presetRow}>
            {Object.keys(COLOR_PRESETS).map(name => (
              <TouchableOpacity
                key={name}
                style={[styles.presetBtn, pointSettings.colorPreset === name && styles.presetBtnActive]}
                onPress={() => applyColorPreset(name)}>
                <Text style={[styles.presetBtnText, pointSettings.colorPreset === name && styles.presetBtnTextActive]}>
                  {name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* 调色板预览条(高压左 → 低压右) */}
          <View style={styles.gradientPreview}>
            {getPalette(pointSettings.colorRGB, pointSettings[panelZone].gradientOn, pointSettings[panelZone].gradient).map((c, i) => (
              <View
                key={i}
                style={{flex: 1, backgroundColor: `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`}}
              />
            ))}
          </View>
          <View style={styles.gradientLabelRow}>
            <Text style={styles.gradientLabel}>高压</Text>
            <Text style={styles.gradientLabel}>低压</Text>
          </View>
          {/* 逐圈 RGB(第1圈=最高压 … 第5圈=最低压),每圈 R/G/B 各 0~255。 */}
          {[0, 1, 2, 3, 4].map(ring => {
            const rgbArr = (pointSettings.colorRGB && pointSettings.colorRGB.length >= 5 ? pointSettings.colorRGB : DEFAULT_RGB)[ring];
            const ringLabel = ['第1圈(最高压)', '第2圈', '第3圈', '第4圈', '第5圈(最低压)'][ring];
            return (
              <View key={ring} style={styles.rgbRing}>
                <View style={styles.rgbRingHeader}>
                  <View style={[styles.rgbSwatch, {backgroundColor: `rgb(${Math.round(rgbArr[0])},${Math.round(rgbArr[1])},${Math.round(rgbArr[2])})`}]} />
                  <Text style={styles.rgbRingLabel}>{ringLabel}</Text>
                </View>
                {['R', 'G', 'B'].map((chName, ch) => (
                  <StepControl
                    key={chName}
                    label={chName}
                    value={rgbArr[ch]}
                    min={0}
                    max={255}
                    step={5}
                    decimals={0}
                    onValueChange={v => updateColorChannel(ring, ch, v)}
                  />
                ))}
              </View>
            );
          })}

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
            label="X 缩放"
            value={zoneLayout.sx ?? 1}
            min={0.1}
            max={20}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneParam(activeZone, 'sx', v)}
          />
          <StepControl
            label="Y 缩放"
            value={zoneLayout.sy ?? 1}
            min={0.1}
            max={20}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneParam(activeZone, 'sy', v)}
          />
          <StepControl
            label="Z 缩放"
            value={zoneLayout.sz ?? 1}
            min={0.1}
            max={20}
            step={0.1}
            decimals={1}
            onValueChange={v => updateZoneParam(activeZone, 'sz', v)}
          />

          <Text style={styles.sectionLabel}>点大小</Text>
          <StepControl
            label="点大小"
            value={pointSize}
            min={0.5}
            max={10}
            step={0.5}
            decimals={1}
            onValueChange={v => { setPointSize(v); applyPointSize(v); pointSizeRef.current = v; saveViewSettings(); }}
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
            onValueChange={v => updateViewParamPersist('modelPx', v)}
          />
          <StepControl
            label="Y 位移"
            value={viewParams.modelPy}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParamPersist('modelPy', v)}
          />
          <StepControl
            label="Z 位移"
            value={viewParams.modelPz}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParamPersist('modelPz', v)}
          />

          <Text style={styles.sectionLabel}>座椅旋转</Text>
          <StepControl
            label="X 旋转"
            value={viewParams.modelRx}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParamPersist('modelRx', v)}
          />
          <StepControl
            label="Y 旋转"
            value={viewParams.modelRy}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParamPersist('modelRy', v)}
          />
          <StepControl
            label="Z 旋转"
            value={viewParams.modelRz}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParamPersist('modelRz', v)}
          />

          <Text style={styles.sectionLabel}>座椅缩放</Text>
          <StepControl
            label="缩放"
            value={viewParams.modelScale}
            min={0.1}
            max={5}
            step={0.05}
            decimals={2}
            onValueChange={v => updateViewParamPersist('modelScale', v)}
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
            onValueChange={v => updateViewParamPersist('rootPx', v)}
          />
          <StepControl
            label="Y 位移"
            value={viewParams.rootPy}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParamPersist('rootPy', v)}
          />
          <StepControl
            label="Z 位移"
            value={viewParams.rootPz}
            min={-1000}
            max={1000}
            step={1}
            decimals={0}
            onValueChange={v => updateViewParamPersist('rootPz', v)}
          />

          <Text style={styles.sectionLabel}>整体旋转</Text>
          <StepControl
            label="X 旋转"
            value={viewParams.rootRx}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParamPersist('rootRx', v)}
          />
          <StepControl
            label="Y 旋转"
            value={viewParams.rootRy}
            min={-6.28}
            max={6.28}
            step={0.01}
            decimals={2}
            onValueChange={v => updateViewParamPersist('rootRy', v)}
          />

          <Text style={styles.sectionLabel}>相机距离</Text>
          <StepControl
            label="距离"
            value={viewParams.camDist}
            min={80}
            max={1500}
            step={5}
            decimals={0}
            onValueChange={v => updateViewParamPersist('camDist', v)}
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
          </View>
        </View>
      </Modal>

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
  // Modal 里的布局：左侧透明遮罩(点击关闭) + 右侧面板贴屏幕最右
  panelModalRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  panelBackdrop: {
    flex: 1,
  },
  panelScreenRight: {
    width: PANEL_WIDTH,
    backgroundColor: 'rgba(10, 16, 28, 0.98)',
    borderLeftWidth: 1,
    borderLeftColor: '#1a3050',
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

  // ─── 云图配色 ──────────────────────────────────────────────────────
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  presetBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1a3050',
    backgroundColor: '#0d1520',
  },
  presetBtnActive: {
    backgroundColor: '#1a3a60',
    borderColor: '#2a5a90',
  },
  presetBtnText: {
    color: '#556',
    fontSize: 11,
  },
  presetBtnTextActive: {
    color: '#7cf',
    fontWeight: 'bold',
  },
  gradientPreview: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1a3050',
  },
  gradientLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 4,
  },
  gradientLabel: {
    color: '#556',
    fontSize: 9,
  },
  rgbRing: {
    marginBottom: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#141f2e',
  },
  rgbRingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  rgbSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2a3a50',
  },
  rgbRingLabel: {
    color: '#8ab',
    fontSize: 11,
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
