import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, PanResponder, StyleSheet, Text, View} from 'react-native';
import {Asset} from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import {GLView} from 'expo-gl';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {addSide, gaussBlur_return, lineInterpnew, jetWhite3} from '../util/util';

const SEPARATION = 100;
const POINT_SCALE = 0.005;
const MODEL_ASSET = require('../image/chair3.glb');
const POINT_SPRITE = require('../image/circle.png');
const DEFAULT_SETTINGS = {
  gauss: 1,
  color: 2550,
  height: 1,
  coherent: 1,
};
const SEAT_UPDATE_INTERVAL = 1000 / 15;
const MODEL_TARGET_SIZE = 220;
const CAMERA_MIN_DISTANCE = 80;
const CAMERA_MAX_DISTANCE = 600;

const sitleftConfig = {sitnum1: 3, sitnum2: 2, sitInterp: 5, sitInterp1: 1, sitOrder: 3};
const sitConfig = {sitnum1: 10, sitnum2: 6, sitInterp: 4, sitInterp1: 5, sitOrder: 3};
const backConfig = {sitnum1: 3, sitnum2: 2, sitInterp: 8, sitInterp1: 2, sitOrder: 2};
const sitConfigBack = {sitnum1: 10, sitnum2: 6, sitInterp: 9, sitInterp1: 6, sitOrder: 3};

const allConfig = {
  sit: {
    dataConfig: sitConfig,
    name: 'center',
    pointConfig: {position: [0, 0, 0], rotation: [-9.23, 0, 0]},
  },
  necksit: {
    dataConfig: backConfig,
    name: 'leftsit',
    pointConfig: {position: [0, 0, 0], rotation: [-4.365, 0, 0]},
  },
  backsit: {
    dataConfig: backConfig,
    name: 'rightsit',
    pointConfig: {position: [0, 0, 0], rotation: [-4.365, 0, 0]},
  },
  sitsit: {
    dataConfig: sitConfigBack,
    name: 'centersit',
    pointConfig: {position: [0, 0, 0], rotation: [-4.365, 0, 0]},
  },
};

function addTotal(configs) {
  configs.forEach(config => {
    const {sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder} = config;
    const amountX = sitnum1 * sitInterp + sitOrder * 2;
    const amountY = sitnum2 * sitInterp1 + sitOrder * 2;
    config.total = amountX * amountY;
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
      }
    );
  });
}

function createCircleTexture(size = 64) {
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
          alpha = Math.max(0, Math.round((radius - dist) / feather * 255));
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
  texture.minFilter = THREE.LinearMipMapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

async function loadPointSprite(material) {
  const canUseDom = typeof document !== 'undefined' && document.createElementNS;
  if (canUseDom) {
    const asset = Asset.fromModule(POINT_SPRITE);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (uri) {
      const loader = new THREE.TextureLoader();
      return new Promise((resolve, reject) => {
        try {
          loader.load(
            uri,
            texture => {
              texture.colorSpace = THREE.SRGBColorSpace;
              material.map = texture;
              material.alphaTest = 0.2;
              material.transparent = true;
              material.depthWrite = false;
              material.needsUpdate = true;
              resolve(texture);
            },
            undefined,
            err => {
              console.warn('points: sprite load failed', err);
              reject(err);
            }
          );
        } catch (err) {
          console.warn('points: sprite load crashed', err);
          reject(err);
        }
      });
    }
  }

  const texture = createCircleTexture();
  material.map = texture;
  material.alphaTest = 0.2;
  material.transparent = true;
  material.depthWrite = false;
  material.needsUpdate = true;
  return texture;
}

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

function initPoint(config, pointConfig, name, group) {
  const {sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder} = config;
  const {position, rotation} = pointConfig;
  const amountX = sitnum1 * sitInterp + sitOrder * 2;
  const amountY = sitnum2 * sitInterp1 + sitOrder * 2;
  const numParticles = amountX * amountY;
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
  geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    vertexColors: true,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    depthTest: true,
    blending: THREE.NormalBlending,
    opacity: 0.4,
    size: name === 'center' ? 1 : 1.2,
  });

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

  loadPointSprite(material).catch(() => {});
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

function sitRenew(config, name, ndata1, smoothBig, particles) {
  if (!particles || !particles.geometry) {
    return;
  }
  const {sitnum1, sitnum2, sitInterp, sitInterp1, sitOrder} = config;
  const amountX = 1 + (sitnum1 - 1) * sitInterp + sitOrder * 2;
  const amountY = 1 + (sitnum2 - 1) * sitInterp1 + sitOrder * 2;
  const numParticles = amountX * amountY;
  const position = new Float32Array(numParticles * 3);
  const colors = new Float32Array(numParticles * 3);

  const {gauss, color, height, coherent} = DEFAULT_SETTINGS;

  const bigArr = lineInterpnew(ndata1, sitnum2, sitnum1, sitInterp1, sitInterp);
  const bigArrs = addSide(
    bigArr,
    1 + (sitnum2 - 1) * sitInterp1,
    1 + (sitnum1 - 1) * sitInterp,
    sitOrder,
    sitOrder
  );
  const bigArrg = gaussBlur_return(
    bigArrs,
    1 + (sitnum2 - 1) * sitInterp1 + sitOrder * 2,
    1 + (sitnum1 - 1) * sitInterp + sitOrder * 2,
    gauss
  );

  let k = 0;
  let l = 0;
  for (let ix = 0; ix < amountX; ix += 1) {
    for (let iy = 0; iy < amountY; iy += 1) {
      const value = bigArrg[l] * 10;
      smoothBig[l] = smoothBig[l] + (value - smoothBig[l]) / coherent;

      position[k] = iy * SEPARATION - (amountX * SEPARATION) / 2;
      position[k + 1] = -smoothBig[l] * height;
      position[k + 2] = ix * SEPARATION - (amountY * SEPARATION) / 2;

      // if (value <= (color * 6) / 26) {
      //   position[k] = -1600;
      //   position[k + 1] = 2800;
      //   position[k + 2] = -4700;
      // }

      const rgb = jetWhite3(0, color, smoothBig[l]);
      colors[k] = rgb[0] / 255;
      colors[k + 1] = rgb[1] / 255;
      colors[k + 2] = rgb[2] / 255;

      k += 3;
      l += 1;
    }
  }

  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;
  particles.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  particles.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// CarAirRN组件：用于显示3D汽车座椅模型并支持交互操作
// 接收data数组用于控制座椅点的显示状态，以及可选的style样式
export default function CarAirRN({data = [], style}) {
  // 使用useRef创建组件状态的引用，避免不必要的重渲染
  const stateRef = useRef({});
  const dataRef = useRef(data);
  // 存储动画帧ID，用于在组件卸载时取消动画
  const frameRef = useRef(null);
  // 标记组件是否已挂载，用于避免在组件卸载后执行状态更新
  const mountedRef = useRef(true);
  // 加载状态，用于显示加载指示器
  const [loading, setLoading] = useState(true);
  // 加载错误状态，用于显示错误信息
  const [loadError, setLoadError] = useState(null);
  
  // 创建手势响应器，处理触摸交互（单指旋转和双指缩放）
  const panResponder = useRef(
    PanResponder.create({
      // 在触摸开始时是否成为响应者
      onStartShouldSetPanResponder: () => true,
      // 在触摸移动时是否成为响应者
      onMoveShouldSetPanResponder: () => true,
      
      // 手势开始时的处理
      onPanResponderGrant: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls) return;
        const touches = evt.nativeEvent.touches || [];
        
        // 双指触摸：初始化缩放状态
        if (touches.length === 2) {
          controls.isPinching = true;
          controls.lastDistance = getTouchDistance(touches[0], touches[1]);
        } 
        // 单指触摸：初始化旋转状态
        else if (touches.length === 1) {
          controls.isPinching = false;
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;
        }
        controls.isInteracting = true;
      },
      
      // 手势移动时的处理
      onPanResponderMove: evt => {
        const state = stateRef.current;
        const controls = state.controls;
        if (!controls || !state.camera || !state.rootGroup) return;
        const touches = evt.nativeEvent.touches || [];
        
        // 双指触摸：处理缩放
        if (touches.length === 2) {
          const distance = getTouchDistance(touches[0], touches[1]);
          if (controls.lastDistance > 0) {
            // 计算缩放距离变化
            const delta = distance - controls.lastDistance;
            // 限制缩放范围在1.2到12之间
            const nextDistance = clamp(
              controls.distance - delta * 0.01,
              CAMERA_MIN_DISTANCE,
              CAMERA_MAX_DISTANCE
            );
            controls.distance = nextDistance;
            // 更新相机位置
            state.camera.position.set(0, 0, nextDistance);
            state.camera.lookAt(0, 0, 0);
          }
          controls.lastDistance = distance;
          return;
        }

        // 单指触摸：处理旋转
        if (touches.length === 1 && !controls.isPinching) {
          // 计算手指移动距离
          const dx = touches[0].pageX - (controls.lastX ?? touches[0].pageX);
          const dy = touches[0].pageY - (controls.lastY ?? touches[0].pageY);
          controls.lastX = touches[0].pageX;
          controls.lastY = touches[0].pageY;

          // 旋转速度系数
          const speed = 0.005;
          // 更新旋转角度，限制X轴旋转范围
          controls.rotationY += dx * speed;
          controls.rotationX = clamp(controls.rotationX + dy * speed, -Math.PI / 2, Math.PI / 2);

          // 应用旋转到模型
          state.rootGroup.rotation.y = controls.rotationY;
          state.rootGroup.rotation.x = controls.rotationX;
        }
      },
      
      // 手势结束时的处理
      onPanResponderRelease: () => {
        const controls = stateRef.current.controls;
        if (!controls) return;
        // 重置缩放和交互状态
        controls.isPinching = false;
        controls.lastDistance = 0;
        controls.isInteracting = false;
      },
      
      // 手势被其他组件接管时的处理
      onPanResponderTerminate: () => {
        const controls = stateRef.current.controls;
        if (!controls) return;
        // 重置缩放和交互状态
        controls.isPinching = false;
        controls.lastDistance = 0;
        controls.isInteracting = false;
      },
    })
  ).current;

  // 初始化3D场景和渲染器
  const onContextCreate = useCallback(
    gl => {
      // 获取画布尺寸
      const {drawingBufferWidth: width, drawingBufferHeight: height} = gl;
      // 创建模拟画布对象，兼容Three.js
      const canvas = {
        width,
        height,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
      };

      // 创建3D场景
      const scene = new THREE.Scene();
      // 设置深蓝色背景
      scene.background = new THREE.Color(0x0b0f16);

      // 创建透视相机
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 3000);
      // 设置相机初始位置
      camera.position.set(0, 0, 300);
      // 相机朝向原点
      camera.lookAt(0, 0, 0);

      // 创建根组，用于整体旋转
      const rootGroup = new THREE.Group();
      scene.add(rootGroup);

      // 创建WebGL渲染器
      const renderer = new THREE.WebGLRenderer({
        canvas,
        context: gl,
        antialias: true,
      });
      // 设置渲染器尺寸和像素比
      renderer.setSize(width, height);
      renderer.setPixelRatio(gl.pixelRatio || 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      // 添加定向光源
      const light = new THREE.DirectionalLight(0xffffff, 1.2);
      light.position.set(3, 4, 5);
      scene.add(light);
      // 添加环境光
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));

      const pointGroup = new THREE.Group();
      rootGroup.add(pointGroup);
      const pointMeshes = initPoints(pointGroup);
      const smoothBig = createSmoothBig();

      // 初始化控制器状态
      const controls = {
        rotationX: -Math.PI / 3, // 初始X轴旋转角度
        rotationY: 0,            // 初始Y轴旋转角度
        distance: camera.position.z, // 初始相机距离
        lastX: 0,                // 上次触摸X坐标
        lastY: 0,                // 上次触摸Y坐标
        lastDistance: 0,          // 上次双指距离
        isPinching: false,       // 是否正在缩放
        isInteracting: false,    // 是否正在交互
      };
      // 应用初始旋转
      rootGroup.rotation.x = controls.rotationX;

      // 开始加载座椅模型
      setLoading(true);
      setLoadError(null);
      loadSeatModel(rootGroup)
        .then(model => {
          // 检查组件是否仍然挂载
          if (!mountedRef.current) return;
          setLoading(false);
          // 检查模型是否加载成功
          if (!model) {
            setLoadError('model missing');
          }
        })
        .catch(err => {
          console.warn('glb: load failed', err);
          if (!mountedRef.current) return;
          setLoading(false);
          setLoadError(err?.message || String(err));
        });

      // 保存状态引用
      stateRef.current = {
        scene,
        camera,
        renderer,
        rootGroup,
        pointGroup,
        pointMeshes,
        smoothBig,
        gl,
        controls,
      };

      // 创建渲染循环
      const animate = () => {
        const now = Date.now();
        const frameState = stateRef.current;
        if (!frameState.lastSeatUpdate || now - frameState.lastSeatUpdate >= SEAT_UPDATE_INTERVAL) {
          const seatData = normalizeSeatData(dataRef.current);
          const split = splitSeatData(seatData);
          Object.keys(allConfig).forEach(key => {
            const config = allConfig[key];
            const name = config.name;
            const mesh = frameState.pointMeshes?.[name];
            const smooth = frameState.smoothBig?.[name];
            if (!mesh || !smooth) return;
            sitRenew(config.dataConfig, name, split[name], smooth, mesh);
          });
          frameState.lastSeatUpdate = now;
        }
        renderer.render(scene, camera);
        gl.endFrameEXP();
        frameRef.current = requestAnimationFrame(animate);
      };
      animate();
    },
    []
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // 组件卸载时的清理工作
  useEffect(() => {
    return () => {
      // 标记组件已卸载
      mountedRef.current = false;
      // 取消动画帧
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  // 渲染组件UI
  return (
    <View style={[styles.container, style]}>
      {/* 3D视图 */}
      <GLView
        style={styles.view}
        onContextCreate={onContextCreate}
        {...panResponder.panHandlers}
      />
      {/* 加载指示器 */}
      {loading ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#7cc4ff" />
          <Text style={styles.loadingText}>Loading model...</Text>
        </View>
      ) : null}
      {/* 错误提示 */}
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
