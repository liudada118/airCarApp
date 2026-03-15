import React, {useCallback, useEffect, useMemo, useState, useRef} from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  NativeEventEmitter,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import {TopBar, SeatDiagram, ConnectionErrorModal} from '../components';
import IconFont from '../components/IconFont';
import CarAirRN from '../components/CarAirRN';

// icon 图片资源
const iconSitStatus = require('../assets/icons/icon-sitStatus.png');
const iconAirStatus = require('../assets/icons/icon-airStatus.png');
const iconSetting = require('../assets/icons/icon-setting.png');
const iconOnSeat = require('../assets/icons/icon-onSeat.png');
const iconOutSeat = require('../assets/icons/icon-outSeat.png');
const iconCustomAirbag = require('../assets/icons/icon-customAirbag.png');
import type {
  SeatStatus,
  ConnectionStatus,
  AirbagValues,
  AirbagCommandStates,
  AlgoSeatStatus,
  AlgoBodyShapeInfo,
  BodyShape,
  BodyShapeState,
  AlgoResult,
} from '../types';
import {parseAirbagCommand, DEFAULT_AIRBAG_COMMAND_STATES, ALL_AIRBAG_ZONES} from '../types';
import {mockSerial} from '../mock/mockSerialData';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

const DEFAULT_BAUD_RATE = 1000000;
const INITIAL_SENSOR_FRAME: number[] = new Array(144).fill(0);
let hasTriedAutoConnect = false;

/** 是否使用模拟数据（无真实硬件时自动启用） */
const USE_MOCK = Platform.OS !== 'android';

interface HomeScreenProps {
  onNavigateToCustomize: () => void;
  adaptiveEnabled: boolean;
  onAdaptiveChange: (enabled: boolean) => void;
  connectionStatus: ConnectionStatus;
  onConnectionStatusChange: (status: ConnectionStatus) => void;
  onBodyShapeChange?: (shape: BodyShape) => void;
}

interface SerialDevice {
  vendorId: number;
  productId: number;
  deviceName?: string;
}

interface SerialModuleType {
  listDevices?: () => Promise<unknown>;
  open?: (vendorId: number, productId: number) => Promise<boolean>;
  openWithOptions?: (
    vendorId: number,
    productId: number,
    options: {baudRate: number},
  ) => Promise<boolean>;
  resetPendingOpen?: () => void;
  close?: () => void;
  setAlgoMode?: (enabled: boolean) => void;
  sendAirbagCommand?: (zone: string, action: string) => Promise<string>;
  sendStopAllFrame?: () => Promise<string>;
}

interface SerialResultEvent {
  data?: string;
  result?: string;
  error?: string;
}

const {SerialModule} = NativeModules as {
  SerialModule?: SerialModuleType;
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function parseSerialFrame(payload: string): number[] | null {
  if (!payload.trim()) {
    return null;
  }

  const parts = payload.split(',');
  const result: number[] = [];

  for (let i = 0; i < parts.length; i += 1) {
    const value = Number.parseInt(parts[i].trim(), 10);
    if (Number.isNaN(value)) {
      return null;
    }
    result.push(value);
  }

  return result;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as {message?: unknown}).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return '连接失败，请检查传感器设备';
}

function pickTargetDevice(devices: SerialDevice[]): SerialDevice | undefined {
  return devices.find(d => Number(d?.productId ?? 0) !== 0) ?? devices[0];
}

// ─── 从新算法结果中提取状态 ──────────────────────────────────────

/** 默认的 seat_status */
const DEFAULT_SEAT_STATUS: AlgoSeatStatus = {
  state: 'OFF_SEAT',
  is_off_seat: true,
  is_seated: false,
  is_resetting: false,
};

/** 默认的 body_shape_info */
const DEFAULT_BODY_SHAPE_INFO: AlgoBodyShapeInfo = {
  body_shape: '',
  body_shape_state: 'IDLE',
  confidence: 0.0,
  probabilities: {},
  preference: {
    active_body_shape: null,
    using_preference: false,
    is_recording: false,
    recording_progress: null,
  },
};

/** 从算法 JSON 结果中解析三个核心字段 */
// 实时算法数据类型
interface RealtimeAlgoData {
  cushion_sum: number;
  backrest_sum: number;
  living_confidence: number;
  seat_state: string;
  frame_count: number;
  living_status: string;
  body_type: string;
  control_decision_data: {
    lumbar?: {upper_pressure: number; lower_pressure: number; ratio: number; threshold_passed: boolean; action: string};
    side_wings?: {left_pressure: number; right_pressure: number; ratio: number; left_action: string; right_action: string};
    leg_support?: {
      butt_pressure: number; leg_pressure: number; ratio: number; action: string;
      left_butt_pressure?: number; left_leg_pressure?: number; left_ratio?: number; left_action?: string;
      right_butt_pressure?: number; right_leg_pressure?: number; right_ratio?: number; right_action?: string;
    };
  } | null;
  body_features: {
    cushion?: {original_sum: number; filtered_sum: number; max_value: number};
    backrest?: {original_sum: number; filtered_sum: number; max_value: number};
    body_size_type?: string;
    body_size_raw?: number;
  } | null;
  living_detection_data: {
    enabled?: boolean;
    status?: string;
    queue?: {size: number; current_length: number; is_full: boolean};
    control_lock?: {adaptive_control_unlocked: boolean; message: string};
    current_detection?: {is_living?: boolean; confidence?: number; threshold?: number; sad_score?: number};
  } | null;
  body_type_detection_data: {
    enabled?: boolean;
    body_type?: string;
    queue?: {size: number; current_length: number; is_full: boolean};
    lock?: {locked: boolean; locked_value?: string; message: string};
    current_detection?: {body_size_type?: string; body_size_raw?: number; cushion_filtered_sum?: number};
  } | null;
  deflate_cooldown: {
    enabled?: boolean;
    max_commands?: number;
    groups?: Record<string, {locked: boolean; counter: number}>;
  } | null;
  body_shape_info: {
    body_shape: string;
    body_shape_state: string;
    confidence: number;
    probabilities: Record<string, number>;
  } | null;
}

function parseAlgoResult(resultJson: string): {
  seatStatus: SeatStatus;
  algoSeatStatus: AlgoSeatStatus;
  bodyShapeInfo: AlgoBodyShapeInfo;
  commandStates: AirbagCommandStates;
  rawCommand: number[] | null;
  livingStatus: string;
  bodyType: string;
  realtimeData: RealtimeAlgoData;
} | null {
  try {
    const parsed = JSON.parse(resultJson) as Partial<AlgoResult>;

    // 优先使用新的 seat_status 字段
    const algoSeatStatus: AlgoSeatStatus = parsed.seat_status ?? {
      state: parsed.seat_state ?? 'OFF_SEAT',
      is_off_seat:
        parsed.seat_state === 'OFF_SEAT' ||
        parsed.seat_state === 'RESETTING',
      is_seated:
        parsed.seat_state === 'CUSHION_ONLY' ||
        parsed.seat_state === 'ADAPTIVE_LOCKED',
      is_resetting: parsed.seat_state === 'RESETTING',
    };

    // 优先使用新的 body_shape_info 字段
    const bodyShapeInfo: AlgoBodyShapeInfo = parsed.body_shape_info ?? {
      ...DEFAULT_BODY_SHAPE_INFO,
    };
    // 调试：打印离座状态
    console.log('[SeatStatus] seat_status:', JSON.stringify(parsed.seat_status), 'seat_state:', parsed.seat_state, '=> is_off_seat:', algoSeatStatus.is_off_seat, 'state:', algoSeatStatus.state);
    // 调试：打印 body_shape_info
    console.log('[BodyShape] raw:', JSON.stringify(parsed.body_shape_info), 'state:', bodyShapeInfo.body_shape_state, 'shape:', bodyShapeInfo.body_shape);

    // 映射到简化的 SeatStatus
    const seatStatus: SeatStatus = algoSeatStatus.is_seated
      ? 'seated'
      : 'away';

    // 兼容字段
    const livingStatus =
      typeof parsed.living_status === 'string'
        ? parsed.living_status
        : '未知';
    const bodyType =
      typeof parsed.body_type === 'string' ? parsed.body_type : '未判断';

    // 解析 airbag_command
    const _rawCmd = parsed.airbag_command?.command ?? parsed.control_command ?? null;
    const rawCommand = Array.isArray(_rawCmd) ? _rawCmd : null;
    const commandStates = parseAirbagCommand(rawCommand);

    // 提取实时算法数据
    const realtimeData: RealtimeAlgoData = {
      cushion_sum: (parsed as any).cushion_sum ?? 0,
      backrest_sum: (parsed as any).backrest_sum ?? 0,
      living_confidence: (parsed as any).living_confidence ?? 0,
      seat_state: (parsed as any).seat_state ?? 'OFF_SEAT',
      frame_count: (parsed as any).frame_count ?? 0,
      living_status: livingStatus,
      body_type: bodyType,
      control_decision_data: (parsed as any).control_decision_data ?? null,
      body_features: (parsed as any).body_features ?? null,
      living_detection_data: (parsed as any).living_detection_data ?? null,
      body_type_detection_data: (parsed as any).body_type_detection_data ?? null,
      deflate_cooldown: (parsed as any).deflate_cooldown ?? null,
      body_shape_info: (parsed as any).body_shape_info ?? null,
    };

    return {
      seatStatus,
      algoSeatStatus,
      bodyShapeInfo,
      commandStates,
      rawCommand,
      livingStatus,
      bodyType,
      realtimeData,
    };
  } catch (_error) {
    return null;
  }
}

// ─── 体型分类状态的中文映射 ──────────────────────────────────────

function getBodyShapeStateLabel(state: BodyShapeState): string {
  switch (state) {
    case 'IDLE':
      return '等待识别';
    case 'COLLECTING':
      return '数据采集中';
    case 'CLASSIFYING':
      return '分析中';
    case 'COMPLETED':
      return '识别完成';
    case 'DISABLED':
      return '未启用';
    default:
      return '未知';
  }
}

function getBodyShapeLabel(shape: BodyShape): string {
  if (!shape) {
    return '未识别';
  }
  switch (shape) {
    case '瘦小':
      return '轻盈型';
    case '中等':
      return '均衡型';
    case '高大':
      return '稳健型';
    default:
      return shape;
  }
}

function getBodyShapeColor(shape: BodyShape): string {
  switch (shape) {
    case '瘦小':
      return '#5AC8FA';
    case '中等':
      return Colors.success;
    case '高大':
      return Colors.warning;
    default:
      return Colors.textGray;
  }
}

function getSeatStateLabel(state: AlgoSeatStatus): string {
  if (state.is_off_seat) {
    return '离座';
  }
  if (state.is_resetting) {
    return '复位中';
  }
  if (state.state === 'CUSHION_ONLY') {
    return '检测中';
  }
  if (state.state === 'ADAPTIVE_LOCKED') {
    return '自适应调节中';
  }
  return '未知';
}

// ─── 气囊 zone 中文标签 ─────────────────────────────────────────
const ZONE_CN_LABELS: Record<string, string> = {
  shoulderL: '肩部左',
  shoulderR: '肩部右',
  sideWingL: '腰侧左',
  sideWingR: '腰侧右',
  lumbarUp: '腰中上',
  lumbarDown: '腰中下',
  cushionFL: '坐垫前左',
  cushionFR: '坐垫前右',
  cushionRL: '坐垫后左',
  cushionRR: '坐垫后右',
};

// ─── 矩阵热力图颜色映射 ─────────────────────────────────────────────
/** 将传感器值(0-255)映射为热力图颜色 */
/** 安全格式化数字，防止 undefined/null 调用 .toFixed() 崩溃 */
function safeFixed(val: any, digits: number = 0): string {
  if (val == null || typeof val !== 'number' || isNaN(val)) return '--';
  return val.toFixed(digits);
}

function matrixCellColor(val: number): string {
  if (val <= 0) return '#1a1a2e';
  const t = Math.min(val / 255, 1);
  // 蓝 -> 青 -> 绿 -> 黄 -> 红
  const stops = [
    {p: 0.0, r: 0, g: 0, b: 80},
    {p: 0.25, r: 0, g: 100, b: 200},
    {p: 0.5, r: 0, g: 200, b: 100},
    {p: 0.75, r: 220, g: 200, b: 0},
    {p: 1.0, r: 255, g: 50, b: 20},
  ];
  let i = 0;
  for (i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1].p) break;
  }
  const s0 = stops[i];
  const s1 = stops[Math.min(i + 1, stops.length - 1)];
  const f = s1.p === s0.p ? 0 : (t - s0.p) / (s1.p - s0.p);
  const r = Math.round(s0.r + (s1.r - s0.r) * f);
  const g = Math.round(s0.g + (s1.g - s0.g) * f);
  const b = Math.round(s0.b + (s1.b - s0.b) * f);
  return `rgb(${r},${g},${b})`;
}

// ─── 组件 ────────────────────────────────────────────────────────────

const HomeScreen: React.FC<HomeScreenProps> = ({onNavigateToCustomize, adaptiveEnabled, onAdaptiveChange, connectionStatus, onConnectionStatusChange, onBodyShapeChange}) => {
  // 合并所有算法结果为单个状态对象，减少 setState 调用（8→1），大幅降低重渲染次数
  const [algoState, setAlgoState] = useState({
    seatStatus: 'away' as SeatStatus,
    algoSeatStatus: DEFAULT_SEAT_STATUS as AlgoSeatStatus,
    bodyShapeInfo: DEFAULT_BODY_SHAPE_INFO as AlgoBodyShapeInfo,
    livingStatus: '离座',
    bodyType: '未判断',
    commandStates: DEFAULT_AIRBAG_COMMAND_STATES as AirbagCommandStates,
    rawCommand: null as number[] | null,
    realtimeData: {
      cushion_sum: 0, backrest_sum: 0, living_confidence: 0,
      seat_state: 'OFF_SEAT', frame_count: 0,
      living_status: '未知', body_type: '未判断',
      control_decision_data: null, body_features: null,
      living_detection_data: null, body_type_detection_data: null,
      deflate_cooldown: null,
      body_shape_info: null,
    } as RealtimeAlgoData,
  });

  // connectionStatus 由 App 层管理，通过 props 传入，避免页面切换时状态丢失
  const setConnectionStatus = onConnectionStatusChange;
  const [connecting, setConnecting] = useState(false);
  // adaptiveEnabled 和 onAdaptiveChange 从 props 传入，由 App 统一管理
  const adaptiveEnabledRef = useRef(adaptiveEnabled);
  adaptiveEnabledRef.current = adaptiveEnabled;
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [connectionErrorMessage, setConnectionErrorMessage] = useState('');

  const [airbagValues] = useState<AirbagValues>({
    shoulderL: 3,
    shoulderR: 3,
    sideWingL: 4,
    sideWingR: 4,
    lumbarUp: 5,
    lumbarDown: 5,
    cushionFL: 2,
    cushionFR: 2,
    cushionRL: 3,
    cushionRR: 3,
  });

  // 用 ref 追踪离座状态，供 onSerialData 回调中判断（避免闭包陷阱）
  const seatStatusRef = useRef<SeatStatus>('away');
  // sensorData 用 useRef 存储，3D 组件通过 data prop 读取，避免每帧 setState 触发重渲染
  const carAirRef = useRef<any>(null);
  // 清零防抖：记录最后一次清零的时间戳，防止离座/在座状态快速切换导致闪烁
  const lastResetTimeRef = useRef<number>(0);
  const frozenRef = useRef<boolean>(false);
  const sensorDataRef = useRef<number[]>(INITIAL_SENSOR_FRAME);
  const [sensorDataVersion, setSensorDataVersion] = useState(0); // 仅矩阵弹窗需要时触发更新
  const [showMatrix, setShowMatrix] = useState(false);
  const showMatrixRef = useRef(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showRealtimeData, setShowRealtimeData] = useState(false);
  const [showNonStdFrames, setShowNonStdFrames] = useState(false);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const nonStdFramesRef = useRef<{hex: string; length: number; timestamp: number; csv: string}[]>([]);
  const [nonStdFrameVersion, setNonStdFrameVersion] = useState(0);
  const [configData, setConfigData] = useState<Record<string, {value: any; comment: string | null}> | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  // realtimeData 已合并到 algoState 中

   // ─── 处理算法结果（单次 setState，减少 87.5% 重渲染）────────────
  const handleAlgoResult = useCallback((resultJson: string) => {
    const parsed = parseAlgoResult(resultJson);
    if (!parsed) return;
    // 更新离座状态 ref
    seatStatusRef.current = parsed.seatStatus;
    // 算法判断离座时：清空传感器数据 + 立即清零 3D 图
    // OFF_SEAT 或 RESETTING 状态都应该清零：
    //   - OFF_SEAT: 完全离座
    //   - RESETTING: 人已离开，气囊正在复位（等待130帧才到OFF_SEAT太慢）
    const shouldClear3D = parsed.algoSeatStatus.is_off_seat || parsed.algoSeatStatus.is_resetting;
    const now = Date.now();
    if (shouldClear3D) {
      sensorDataRef.current = INITIAL_SENSOR_FRAME;
      // 立即清零 3D 点位数据并冻结，阻止传感器残留数据重新填充
      if (!frozenRef.current) {
        console.log('[3D清零] 首次触发清零+冻结! state:', parsed.algoSeatStatus.state, 'carAirRef:', !!carAirRef.current);
      }
      lastResetTimeRef.current = now;
      frozenRef.current = true;
      carAirRef.current?.resetToZero?.();
    } else {
      // 非离座状态（入座/自适应）：解冻3D图数据更新
      // 防抖：清零后至少保持2秒冻结，防止状态快速切换导致闪烁
      const timeSinceReset = now - lastResetTimeRef.current;
      if (frozenRef.current && timeSinceReset < 2000) {
        console.log('[3D清零] 防抖中, 距上次清零:', timeSinceReset, 'ms, 忽略解冻');
        // 保持冻结，继续调用 resetToZero 确保清零状态
        carAirRef.current?.resetToZero?.();
        return; // 不更新 algoState，保持离座显示
      }
      if (frozenRef.current) {
        console.log('[3D解冻] 解冻! state:', parsed.algoSeatStatus.state, 'timeSinceReset:', timeSinceReset, 'ms');
        frozenRef.current = false;
      }
      carAirRef.current?.unfreeze?.();
    }
    // 通知体型变化（触发按体型加载气囊缓存）
    if (parsed.bodyShapeInfo.body_shape) {
      onBodyShapeChange?.(parsed.bodyShapeInfo.body_shape);
    }
    // commandStates 由51字节回传指令控制（onNonStandardFrame），算法结果不覆盖
    // rawCommand 仍然从算法结果更新，用于指令弹窗显示
    setAlgoState(prev => ({
      ...prev,
      seatStatus: parsed.seatStatus,
      algoSeatStatus: parsed.algoSeatStatus,
      bodyShapeInfo: parsed.bodyShapeInfo,
      // commandStates 保留 prev 值，由 onNonStandardFrame 更新
      rawCommand: parsed.rawCommand,
      livingStatus: parsed.livingStatus,
      bodyType: parsed.bodyType,
      realtimeData: parsed.realtimeData,
    }));
  }, [onBodyShapeChange]);

  // ─── Python 配置管理 ──────────────────────────────────────
  const loadConfig = useCallback(() => {
    setConfigLoading(true);
    NativeModules.SerialModule?.getConfig?.()
      .then((json: string) => {
        try {
          const parsed = JSON.parse(json);
          if (parsed.error) {
            console.warn('getConfig error:', parsed.error);
          } else {
            setConfigData(parsed);
          }
        } catch (e) {
          console.warn('getConfig parse error:', e);
        }
        setConfigLoading(false);
      })
      .catch((e: any) => {
        console.warn('getConfig failed:', e);
        setConfigLoading(false);
      });
  }, []);

  const handleSetConfig = useCallback((key: string, value: any) => {
    const valueJson = JSON.stringify(value);
    console.log('[Config] 设置配置:', key, '=', valueJson);
    NativeModules.SerialModule?.setConfig?.(key, valueJson)
      .then((json: string) => {
        try {
          const result = JSON.parse(json);
          if (result.ok) {
            console.log('[Config] 配置写入成功:', key, '=', value);
            setConfigData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                [key]: {...prev[key], value},
              };
            });
          } else {
            console.warn('[Config] 配置写入失败:', key, result.error);
          }
        } catch (e) {
          console.warn('[Config] 解析响应失败:', e);
        }
      })
      .catch((e: any) => {
        console.warn('[Config] setConfig 调用失败:', key, e?.message || e);
      });
  }, []);

  const handleResetConfig = useCallback(() => {
    NativeModules.SerialModule?.resetConfig?.()
      .then((json: string) => {
        try {
          const result = JSON.parse(json);
          if (result.ok) {
            loadConfig(); // 重新加载
          }
        } catch (_) {}
      })
      .catch(() => {});
  }, [loadConfig]);

  const openConfigModal = useCallback(() => {
    setShowConfig(true);
    loadConfig();
  }, [loadConfig]);

  // ─── 模拟串口逻辑 ──────────────────────────────────────
  const mockStartedRef = useRef(false);

  useEffect(() => {
    if (!USE_MOCK || mockStartedRef.current) {
      return;
    }
    mockStartedRef.current = true;

    // 模拟连接成功
    setConnectionStatus('connecting');
    const connectTimer = setTimeout(() => {
      setConnectionStatus('connected');
      mockSerial.setScenario('adaptive_locked');
      mockSerial.start(77);
    }, 800);

    const removeDataListener = mockSerial.addDataListener(event => {
      if (event.data) {
        const parsed = parseSerialFrame(event.data);
        if (parsed) {
          // 3D图显示完全由算法离座/在座状态控制（冻结/解冻机制）
          sensorDataRef.current = parsed;
        }
      }
    });

    const removeResultListener = mockSerial.addResultListener(event => {
      if (event.result) {
        handleAlgoResult(event.result);
      }
    });

    return () => {
      clearTimeout(connectTimer);
      removeDataListener();
      removeResultListener();
      mockSerial.stop();
    };
  }, [handleAlgoResult]);

  // ─── 真实串口逻辑 ──────────────────────────────────────
  const autoConnectSensor = useCallback(async () => {
    if (USE_MOCK || connecting || connectionStatus === 'connected') {
      return;
    }

    if (Platform.OS !== 'android') {
      setConnectionStatus('error');
      setConnectionErrorMessage('当前平台不支持 USB 串口传感器连接');
      setShowConnectionError(true);
      return;
    }

    if (
      !SerialModule?.listDevices ||
      (!SerialModule.openWithOptions && !SerialModule.open)
    ) {
      setConnectionStatus('error');
      setConnectionErrorMessage('SerialModule 不可用，请检查原生模块集成');
      setShowConnectionError(true);
      return;
    }

    setConnecting(true);
    setConnectionStatus('connecting');
    setShowConnectionError(false);
    setConnectionErrorMessage('');

    try {
      const list = await SerialModule.listDevices();
      const devices = (Array.isArray(list) ? list : []) as SerialDevice[];
      const target = pickTargetDevice(devices);

      if (!target) {
        throw new Error('未检测到可用传感器设备');
      }

      const openSelected = async () => {
        if (SerialModule.openWithOptions) {
          await SerialModule.openWithOptions(
            target.vendorId,
            target.productId,
            {baudRate: DEFAULT_BAUD_RATE},
          );
          return;
        }

        if (SerialModule.open) {
          await SerialModule.open(target.vendorId, target.productId);
        }
      };

      SerialModule.resetPendingOpen?.();
      try {
        await openSelected();
      } catch (_firstError) {
        SerialModule.close?.();
        await sleep(120);
        SerialModule.resetPendingOpen?.();
        await openSelected();
      }

      setConnectionStatus('connected');
    } catch (error) {
      setConnectionStatus('error');
      setConnectionErrorMessage(getErrorMessage(error));
      setShowConnectionError(true);
    } finally {
      setConnecting(false);
    }
  }, [connecting, connectionStatus]);

  useEffect(() => {
    if (USE_MOCK || hasTriedAutoConnect) {
      return;
    }

    hasTriedAutoConnect = true;
    autoConnectSensor().catch(() => undefined);
  }, [autoConnectSensor]);

  useEffect(() => {
    if (USE_MOCK || !SerialModule) {
      return;
    }

    const emitter = new NativeEventEmitter(SerialModule as never);

    const dataSub = emitter.addListener('onSerialData', event => {
      const payload =
        event && typeof event.data === 'string' ? event.data : '';
      if (!payload) return;
      const parsed = parseSerialFrame(payload);
      if (parsed) {
        // 3D图显示完全由算法离座/在座状态控制：
        //   离座时 CarAirRN 已被冻结(resetToZero)  → 传感器数据照常更新但不影响3D渲染
        //   在座时 CarAirRN 已解冻(unfreeze)       → 传感器数据正常驱动3D渲染
        sensorDataRef.current = parsed;
        // 仅当矩阵弹窗打开时触发渲染更新
        if (showMatrixRef.current) {
          setSensorDataVersion(v => v + 1);
        }
      }
    });

    const resultSub = emitter.addListener(
      'onSerialResult',
      (event: SerialResultEvent) => {
        if (typeof event.result === 'string' && event.result) {
          handleAlgoResult(event.result);
        }
        // 注意：不再将 event.error 当作连接错误处理
        // Python 算法错误通过 onAlgoError 事件单独上报，不影响连接状态
      },
    );

    // 监听真正的串口断线事件（由 Native 层读取线程或写入连续失败触发）
    const disconnectSub = emitter.addListener(
      'onSerialDisconnect',
      (event: {reason?: string}) => {
        console.warn('[Serial] Disconnected:', event.reason);
        setConnectionStatus('error');
        setConnectionErrorMessage(event.reason || '串口连接已断开');
        setShowConnectionError(true);
      },
    );

    // 监听算法处理错误（仅记录日志，不影响连接状态）
    const algoErrorSub = emitter.addListener(
      'onAlgoError',
      (event: {error?: string}) => {
        console.warn('[AlgoError]', event.error);
      },
    );

    const modeSub = emitter.addListener('onSerialMode', (event: {data?: string; modeValue?: number; manual?: boolean; auto?: boolean}) => {
      // 模式帧仅记录日志，不控制自适应调节（自适应由用户手动开关控制）
      console.log('[ModeFrame] modeValue=', event.modeValue, 'auto=', event.auto, 'manual=', event.manual);
    });

    const nonStdSub = emitter.addListener('onNonStandardFrame', (event: {data?: string; hex?: string; length?: number; timestamp?: number}) => {
      const entry = {
        hex: event.hex ?? '',
        length: event.length ?? 0,
        timestamp: event.timestamp ?? Date.now(),
        csv: event.data ?? '',
      };
      const frames = nonStdFramesRef.current;
      frames.unshift(entry);
      if (frames.length > 50) frames.length = 50;
      setNonStdFrameVersion(v => v + 1);

      // 解析回传指令（长度∙51）更新气囊状态
      if (entry.csv && (entry.length ?? 0) >= 21) {
        try {
          const bytes = entry.csv.split(',').map(Number);
          if (bytes.length >= 21) {
            const newStates = parseAirbagCommand(bytes);
            console.log('[NonStdFrame] 解析回传指令, length:', bytes.length, 'states:', JSON.stringify(newStates));
            setAlgoState(prev => ({
              ...prev,
              commandStates: newStates,
              rawCommand: bytes,
            }));
          }
        } catch (e) {
          console.warn('[NonStdFrame] 解析失败:', e);
        }
      }
    });

    return () => {
      dataSub.remove();
      resultSub.remove();
      disconnectSub.remove();
      algoErrorSub.remove();
      modeSub.remove();
      nonStdSub.remove();
    };
  }, [handleAlgoResult, onAdaptiveChange]);

  // ─── 解构 algoState，避免大量代码修改 ────────────────────────
  const {seatStatus, algoSeatStatus, bodyShapeInfo, commandStates, rawCommand, livingStatus, bodyType, realtimeData} = algoState;
  const sensorData = sensorDataRef.current;

  // ─── 入座定时充气逻辑（cushionFL + cushionFR，每分钟充气3s，最多3次，离座重置）───
  const seatedInflateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seatedInflateCountRef = useRef<number>(0);
  const seatedInflateStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 清理辅助函数
    const clearAllTimers = () => {
      if (seatedInflateTimerRef.current) {
        clearInterval(seatedInflateTimerRef.current);
        seatedInflateTimerRef.current = null;
      }
      if (seatedInflateStopTimerRef.current) {
        clearTimeout(seatedInflateStopTimerRef.current);
        seatedInflateStopTimerRef.current = null;
      }
    };

    if (seatStatus === 'seated') {
      // 入座：启动每60秒一次的定时器
      if (seatedInflateTimerRef.current) return; // 已在运行，不重复启动
      seatedInflateCountRef.current = 0; // 重置计数

      const doInflate = () => {
        if (seatedInflateCountRef.current >= 3) {
          // 已达最大次数，停止定时器
          clearAllTimers();
          console.log('[SeatedInflate] 已完成3次充气，停止定时任务');
          return;
        }

        const sm = NativeModules.SerialModule as SerialModuleType | undefined;
        if (!sm?.sendAirbagCommand) {
          console.warn('[SeatedInflate] sendAirbagCommand 不可用');
          return;
        }

        seatedInflateCountRef.current += 1;
        const count = seatedInflateCountRef.current;
        console.log(`[SeatedInflate] 第${count}次充气开始 (cushionFL + cushionFR)`);

        // 发送充气指令
        sm.sendAirbagCommand('cushionFL', 'inflate').catch(e =>
          console.warn('[SeatedInflate] cushionFL inflate error:', e?.message || e),
        );
        sm.sendAirbagCommand('cushionFR', 'inflate').catch(e =>
          console.warn('[SeatedInflate] cushionFR inflate error:', e?.message || e),
        );

        // 3秒后发送停止（保压）指令
        seatedInflateStopTimerRef.current = setTimeout(() => {
          console.log(`[SeatedInflate] 第${count}次充气结束，发送stop`);
          sm.sendAirbagCommand('cushionFL', 'stop').catch(e =>
            console.warn('[SeatedInflate] cushionFL stop error:', e?.message || e),
          );
          sm.sendAirbagCommand('cushionFR', 'stop').catch(e =>
            console.warn('[SeatedInflate] cushionFR stop error:', e?.message || e),
          );
          seatedInflateStopTimerRef.current = null;
        }, 3000);
      };

      // 第一次在入座后60秒触发
      seatedInflateTimerRef.current = setInterval(doInflate, 60000);
      console.log('[SeatedInflate] 入座，启动定时充气（每60s一次，最多3次）');
    } else {
      // 离座：重置一切
      clearAllTimers();
      seatedInflateCountRef.current = 0;
      console.log('[SeatedInflate] 离座，重置定时充气');
    }

    return () => {
      clearAllTimers();
    };
  }, [seatStatus]);

  // ─── 渲染辅助 ──────────────────────────────────────────

  /** 体型概率条 */
  const renderProbabilityBar = (
    label: string,
    value: number,
    color: string,
    isActive: boolean,
  ) => (
    <View style={styles.probRow} key={label}>
      <Text
        style={[styles.probLabel, isActive && {color, fontWeight: '600'}]}>
        {label}
      </Text>
      <View style={styles.probBarBg}>
        <View
          style={[
            styles.probBarFill,
            {width: `${Math.round(value * 100)}%`, backgroundColor: color},
          ]}
        />
      </View>
      <Text
        style={[styles.probValue, isActive && {color, fontWeight: '600'}]}>
        {Math.round(value * 100)}%
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <TopBar
        connectionStatus={connectionStatus}
        onLogoPress={() => setShowDebugPanel(prev => !prev)}
        onRetry={() => {
          hasTriedAutoConnect = false;
          setShowConnectionError(false);
          setConnectionErrorMessage('');
          setConnectionStatus('disconnected');
          setTimeout(() => {
            autoConnectSensor().catch(() => undefined);
          }, 100);
        }}
      />

      {/* ─── 3D 座椅模型（全屏背景） ─── */}
      <View style={styles.fullscreen3DBackground}>
        <CarAirRN
          ref={carAirRef}
          data={sensorData as unknown as never[]}
          style={styles.carAir3D}
          showDebugPanel={showDebugPanel}
        />
      </View>

      <View style={styles.content} pointerEvents="box-none">
        {/* ─── 左侧面板 ─── */}
        <ScrollView style={styles.leftPanel} showsVerticalScrollIndicator={false} contentContainerStyle={styles.leftPanelContent}>
          {/* 座椅状态 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Image source={iconSitStatus} style={styles.sectionIcon} resizeMode="contain" />
              <Text style={styles.sectionTitle}>座椅状态</Text>
            </View>
            <View style={styles.seatStatusRow}>
              <View
                style={[
                  styles.seatStatusCard,
                  seatStatus === 'seated' && styles.seatStatusCardActive,
                ]}>
                <Image
                  source={iconOnSeat}
                  style={[styles.seatIcon, {tintColor: seatStatus === 'seated' ? Colors.primary : Colors.textGray}]}
                  resizeMode="contain"
                />
                <Text
                  style={[
                    styles.seatStatusText,
                    seatStatus === 'seated' && styles.seatStatusTextActive,
                  ]}>
                  在座
                </Text>
              </View>

              <View
                style={[
                  styles.seatStatusCard,
                  seatStatus === 'away' && styles.seatStatusCardActive,
                ]}>
                <Image
                  source={iconOutSeat}
                  style={[styles.seatIcon, {tintColor: seatStatus === 'away' ? Colors.primary : Colors.textGray}]}
                  resizeMode="contain"
                />
                <Text
                  style={[
                    styles.seatStatusText,
                    seatStatus === 'away' && styles.seatStatusTextActive,
                  ]}>
                  离座
                </Text>
              </View>
            </View>
          </View>

          {/* 气囊状态 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Image source={iconAirStatus} style={styles.sectionIcon} resizeMode="contain" />
              <Text style={styles.sectionTitle}>气囊状态</Text>
            </View>
            <View style={styles.airbagStatusCard}>
              <Text style={styles.airbagStatusText}>
                {adaptiveEnabled
                  ? (bodyShapeInfo.body_shape
                      ? `当前为\u201C${getBodyShapeLabel(bodyShapeInfo.body_shape)}\u201D体型自适应调节`
                      : '当前为体型自适应调节')
                  : '自适应调节已关闭'}
              </Text>
              <View style={styles.seatDiagramContainer}>
                <SeatDiagram
                  activeZone={null}
                  scale={0.95}
                  commandStates={commandStates}
                />
              </View>
              <View style={styles.divider} />
              <TouchableOpacity
                onPress={() => {
                  // 进入自定义气囊调节前，关闭算法模式（停止透传算法指令）
                  SerialModule?.setAlgoMode?.(false);
                  // 发送全停保压帧，让所有气囊进入保压状态
                  SerialModule?.sendStopAllFrame?.().then(() => {
                    console.log('[AlgoMode] 进入自定义气囊调节，已发送全停保压帧');
                  }).catch((e: any) => {
                    console.warn('[AlgoMode] 发送全停保压帧失败:', e?.message || e);
                  });
                  console.log('[AlgoMode] 进入自定义气囊调节，算法模式已关闭');
                  onNavigateToCustomize();
                }}
                activeOpacity={0.7}>
                <View style={styles.customizeLinkRow}>
                  <Image
                    source={iconCustomAirbag}
                    style={[styles.customizeLinkIcon, {tintColor: Colors.primary}]}
                    resizeMode="contain"
                  />
                  <Text style={styles.customizeLink}>自定义气囊调节</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* ─── 右侧面板 ─── */}
        <View style={styles.rightPanel} pointerEvents="box-none">
          {/* 自适应调节开关 */}
          <View style={styles.adaptiveSection}>
            <View style={styles.sectionHeader}>
              <Image source={iconSetting} style={styles.sectionIcon} resizeMode="contain" />
              <Text style={styles.sectionTitle}>自适应调节</Text>
            </View>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  adaptiveEnabled && styles.toggleButtonActive,
                ]}
                onPress={() => {
                  onAdaptiveChange(true);
                  SerialModule?.setAlgoMode?.(true);
                  console.log('[AlgoMode] 自适应调节已开启');
                }}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.toggleText,
                    adaptiveEnabled && styles.toggleTextActive,
                  ]}>
                  开启
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  !adaptiveEnabled && styles.toggleButtonInactive,
                ]}
                onPress={() => {
                  onAdaptiveChange(false);
                  SerialModule?.setAlgoMode?.(false);
                  // 发送全停保压帧
                  SerialModule?.sendStopAllFrame?.().then(() => {
                    console.log('[AlgoMode] 自适应调节关闭，已发送全停保压帧');
                  }).catch((e: any) => {
                    console.warn('[AlgoMode] 发送全停保压帧失败:', e?.message || e);
                  });
                  console.log('[AlgoMode] 自适应调节已关闭');
                }}
                activeOpacity={0.7}>
                <Text
                  style={[
                    styles.toggleText,
                    !adaptiveEnabled && styles.toggleTextInactive,
                  ]}>
                  关闭
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 悬浮按钮组 - 右上角（点击Logo切换显示） */}
          {showDebugPanel && (
          <View style={styles.floatingBtnGroupWrapper}>
            <View style={styles.floatingBtnGroup}>
              <TouchableOpacity
                style={styles.matrixToggleBtn}
                onPress={() => { setShowMatrix(true); showMatrixRef.current = true; }}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>矩阵</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matrixToggleBtn, {marginLeft: 6}]}
                onPress={openConfigModal}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>配置</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matrixToggleBtn, {marginLeft: 6}]}
                onPress={() => setShowRealtimeData(true)}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>数据</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matrixToggleBtn, {marginLeft: 6, backgroundColor: nonStdFramesRef.current.length > 0 ? 'rgba(255,59,48,0.7)' : 'rgba(0,0,0,0.55)'}]}
                onPress={() => setShowNonStdFrames(true)}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>回传{nonStdFramesRef.current.length > 0 ? `(${nonStdFramesRef.current.length})` : ''}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matrixToggleBtn, {marginLeft: 6}]}
                onPress={() => setShowCommandModal(true)}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>指令</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}
        </View>
      </View>

      {/* 原始传感器矩阵弹窗 */}
      <Modal
        visible={showMatrix}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowMatrix(false); showMatrixRef.current = false; }}>
        <View style={styles.matrixModalOverlay}>
          <View style={styles.matrixModalContent}>
            <View style={styles.matrixModalHeader}>
              <Text style={styles.matrixModalTitle}>原始传感器矩阵</Text>
              <TouchableOpacity
                onPress={() => { setShowMatrix(false); showMatrixRef.current = false; }}
                activeOpacity={0.7}
                style={styles.matrixModalClose}>
                <Text style={styles.matrixModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.matrixRow}>
              {/* 靠背区域 */}
              <View style={styles.matrixBlock}>
                <Text style={styles.matrixLabel}>靠背 (10×6)</Text>
                <View style={styles.matrixGrid}>
                  {Array.from({length: 10}, (_, row) => (
                    <View key={`back-r${row}`} style={styles.matrixGridRow}>
                      {Array.from({length: 6}, (_, col) => {
                        const idx = 12 + row * 6 + col;
                        const val = sensorData[idx] || 0;
                        return (
                          <View
                            key={`back-${row}-${col}`}
                            style={[
                              styles.matrixCell,
                              {backgroundColor: matrixCellColor(val)},
                            ]}>
                            <Text style={styles.matrixCellText}>{val}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
              {/* 侧翼 */}
              <View style={styles.matrixBlock}>
                <Text style={styles.matrixLabel}>左/右翼 (3×2)</Text>
                <View style={styles.matrixGrid}>
                  {Array.from({length: 3}, (_, row) => (
                    <View key={`wing-r${row}`} style={styles.matrixGridRow}>
                      {Array.from({length: 2}, (_, col) => {
                        const idx = 0 + row * 2 + col;
                        const val = sensorData[idx] || 0;
                        return (
                          <View
                            key={`lw-${row}-${col}`}
                            style={[
                              styles.matrixCell,
                              {backgroundColor: matrixCellColor(val)},
                            ]}>
                            <Text style={styles.matrixCellText}>{val}</Text>
                          </View>
                        );
                      })}
                      <View style={styles.matrixCellSpacer} />
                      {Array.from({length: 2}, (_, col) => {
                        const idx = 6 + row * 2 + col;
                        const val = sensorData[idx] || 0;
                        return (
                          <View
                            key={`rw-${row}-${col}`}
                            style={[
                              styles.matrixCell,
                              {backgroundColor: matrixCellColor(val)},
                            ]}>
                            <Text style={styles.matrixCellText}>{val}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={[styles.matrixRow, {marginTop: 8}]}>
              {/* 坐垫区域 */}
              <View style={styles.matrixBlock}>
                <Text style={styles.matrixLabel}>坐垫 (10×6)</Text>
                <View style={styles.matrixGrid}>
                  {Array.from({length: 10}, (_, row) => (
                    <View key={`sit-r${row}`} style={styles.matrixGridRow}>
                      {Array.from({length: 6}, (_, col) => {
                        const idx = 84 + row * 6 + col;
                        const val = sensorData[idx] || 0;
                        return (
                          <View
                            key={`sit-${row}-${col}`}
                            style={[
                              styles.matrixCell,
                              {backgroundColor: matrixCellColor(val)},
                            ]}>
                            <Text style={styles.matrixCellText}>{val}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
              {/* 坐垫侧翼 */}
              <View style={styles.matrixBlock}>
                <Text style={styles.matrixLabel}>左/右垫翼 (3×2)</Text>
                <View style={styles.matrixGrid}>
                  {Array.from({length: 3}, (_, row) => (
                    <View key={`swing-r${row}`} style={styles.matrixGridRow}>
                      {Array.from({length: 2}, (_, col) => {
                        const idx = 72 + row * 2 + col;
                        const val = sensorData[idx] || 0;
                        return (
                          <View
                            key={`lsw-${row}-${col}`}
                            style={[
                              styles.matrixCell,
                              {backgroundColor: matrixCellColor(val)},
                            ]}>
                            <Text style={styles.matrixCellText}>{val}</Text>
                          </View>
                        );
                      })}
                      <View style={styles.matrixCellSpacer} />
                      {Array.from({length: 2}, (_, col) => {
                        const idx = 78 + row * 2 + col;
                        const val = sensorData[idx] || 0;
                        return (
                          <View
                            key={`rsw-${row}-${col}`}
                            style={[
                              styles.matrixCell,
                              {backgroundColor: matrixCellColor(val)},
                            ]}>
                            <Text style={styles.matrixCellText}>{val}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Python 配置弹窗 */}
      {showConfig && (
      <Modal
        visible={showConfig}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfig(false)}>
        <View style={styles.matrixModalOverlay}>
          <View style={[styles.matrixModalContent, {maxWidth: 600, maxHeight: '85%'}]}>
            <View style={styles.matrixModalHeader}>
              <Text style={styles.matrixModalTitle}>算法配置</Text>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('确认重置', '是否恢复所有配置为默认值？', [
                      {text: '取消', style: 'cancel'},
                      {text: '确认', onPress: handleResetConfig},
                    ]);
                  }}
                  activeOpacity={0.7}
                  style={{marginRight: 12, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.warning, borderRadius: 4}}>
                  <Text style={{color: '#fff', fontSize: 12}}>重置默认</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowConfig(false)}
                  activeOpacity={0.7}
                  style={styles.matrixModalClose}>
                  <Text style={styles.matrixModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            {configLoading ? (
              <View style={{padding: 40, alignItems: 'center'}}>
                <Text style={{color: Colors.textGray}}>加载中...</Text>
              </View>
            ) : configData ? (
              <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={true}>
                {(() => {
                  // 按一级 key 分组
                  const groups: Record<string, {key: string; value: any; comment: string | null}[]> = {};
                  Object.entries(configData).forEach(([key, info]) => {
                    const group = key.split('.')[0];
                    if (!groups[group]) groups[group] = [];
                    groups[group].push({key, value: info.value, comment: info.comment});
                  });
                  const GROUP_LABELS: Record<string, string> = {
                    system: '系统',
                    control: '控制',
                    lumbar: '腰托',
                    side_wings: '侧翼',
                    leg_support: '腿托',
                    matrix: '传感器矩阵',
                    protocol: '通信协议',
                    airbag_mapping: '气囊映射',
                    living_detection: '活体检测',
                    body_type_detection: '体型检测',
                    integrated_system: '集成座椅系统',
                    body_shape_classification: '体型三分类',
                    tap_massage: '拍打按摩',
                  };
                  return Object.entries(groups).map(([group, items]) => (
                    <View key={group} style={{marginBottom: 12}}>
                      <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>
                        {GROUP_LABELS[group] || group}
                      </Text>
                      {items.map(item => {
                        const isArray = Array.isArray(item.value);
                        const isBool = typeof item.value === 'boolean';
                        const shortKey = item.key.split('.').slice(1).join('.');
                        return (
                          <View key={item.key} style={styles.cfgRow}>
                            <View style={{flex: 1, marginRight: 8}}>
                              <Text style={styles.cfgKey} numberOfLines={1}>{shortKey}</Text>
                              {item.comment ? <Text style={styles.cfgComment} numberOfLines={1}>{item.comment}</Text> : null}
                            </View>
                            {isBool ? (
                              <TouchableOpacity
                                onPress={() => handleSetConfig(item.key, !item.value)}
                                activeOpacity={0.7}
                                style={[styles.cfgBoolBtn, {backgroundColor: item.value ? Colors.primary : Colors.textGray}]}>
                                <Text style={{color: '#fff', fontSize: 11}}>{item.value ? 'true' : 'false'}</Text>
                              </TouchableOpacity>
                            ) : isArray ? (
                              <Text style={styles.cfgValueText} numberOfLines={1}>[{item.value.join(', ')}]</Text>
                            ) : (
                              <TextInput
                                style={styles.cfgInput}
                                defaultValue={String(item.value)}
                                keyboardType="numeric"
                                returnKeyType="done"
                                onEndEditing={(e) => {
                                  const text = e.nativeEvent.text.trim();
                                  if (text === '' || text === String(item.value)) return;
                                  const num = Number(text);
                                  if (!isNaN(num)) {
                                    handleSetConfig(item.key, num);
                                  } else {
                                    handleSetConfig(item.key, text);
                                  }
                                }}
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ));
                })()}
              </ScrollView>
            ) : (
              <View style={{padding: 40, alignItems: 'center'}}>
                <Text style={{color: Colors.textGray}}>无配置数据</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      )}

      {/* 实时算法数据弹窗 */}
      {showRealtimeData && (
      <Modal
        visible={showRealtimeData}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRealtimeData(false)}>
        <View style={styles.matrixModalOverlay}>
          <View style={[styles.matrixModalContent, {maxWidth: 600, maxHeight: '85%'}]}>
            <View style={styles.matrixModalHeader}>
              <Text style={styles.matrixModalTitle}>实时算法数据</Text>
              <TouchableOpacity
                onPress={() => setShowRealtimeData(false)}
                activeOpacity={0.7}
                style={styles.matrixModalClose}>
                <Text style={styles.matrixModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={true}>
              {/* 基础状态 */}
              <View style={{marginBottom: 12}}>
                <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>基础状态</Text>
                <View style={styles.cfgRow}>
                  <View style={{flex: 1}}><Text style={styles.cfgKey}>座椅状态</Text></View>
                  <Text style={[styles.cfgValueText, {color: realtimeData.seat_state === 'ADAPTIVE_LOCKED' ? '#4CAF50' : realtimeData.seat_state === 'OFF_SEAT' ? '#FF5722' : '#FFC107'}]}>{realtimeData.seat_state}</Text>
                </View>
                <View style={styles.cfgRow}>
                  <View style={{flex: 1}}><Text style={styles.cfgKey}>帧计数</Text></View>
                  <Text style={styles.cfgValueText}>{realtimeData.frame_count}</Text>
                </View>
                <View style={styles.cfgRow}>
                  <View style={{flex: 1}}><Text style={styles.cfgKey}>坐垫压力和</Text></View>
                  <Text style={styles.cfgValueText}>{safeFixed(realtimeData.cushion_sum, 1)}</Text>
                </View>
                <View style={styles.cfgRow}>
                  <View style={{flex: 1}}><Text style={styles.cfgKey}>靠背压力和</Text></View>
                  <Text style={styles.cfgValueText}>{safeFixed(realtimeData.backrest_sum, 1)}</Text>
                </View>
                <View style={styles.cfgRow}>
                  <View style={{flex: 1}}><Text style={styles.cfgKey}>活体状态</Text></View>
                  <Text style={styles.cfgValueText}>{realtimeData.living_status}</Text>
                </View>
                <View style={styles.cfgRow}>
                  <View style={{flex: 1}}><Text style={styles.cfgKey}>体型判断</Text></View>
                  <Text style={styles.cfgValueText}>{realtimeData.body_type}</Text>
                </View>
                <View style={styles.cfgRow}>
                  <View style={{flex: 1}}><Text style={styles.cfgKey}>活体置信度</Text></View>
                  <Text style={styles.cfgValueText}>{safeFixed(realtimeData.living_confidence, 3)}</Text>
                </View>
              </View>

              {/* 体型三分类 */}
              {realtimeData.body_shape_info && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>体型三分类</Text>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>状态</Text></View>
                    <Text style={[styles.cfgValueText, {color: realtimeData.body_shape_info.body_shape_state === 'COMPLETED' ? '#4CAF50' : realtimeData.body_shape_info.body_shape_state === 'COLLECTING' ? '#FFC107' : '#999'}]}>
                      {realtimeData.body_shape_info.body_shape_state}
                    </Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>体型</Text></View>
                    <Text style={styles.cfgValueText}>{realtimeData.body_shape_info.body_shape || '未识别'}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>置信度</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.body_shape_info.confidence, 3)}</Text>
                  </View>
                  {realtimeData.body_shape_info.probabilities && Object.keys(realtimeData.body_shape_info.probabilities).length > 0 && (
                    <View style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>概率分布</Text></View>
                      <Text style={styles.cfgValueText}>
                        {Object.entries(realtimeData.body_shape_info.probabilities).map(([k, v]) => `${k}:${safeFixed(v as number, 2)}`).join(' ')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* 控制决策 - 腰托 */}
              {realtimeData.control_decision_data?.lumbar && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>控制决策 - 腰托</Text>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>上背压力</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.lumbar.upper_pressure, 1)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>下背压力</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.lumbar.lower_pressure, 1)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>上下比</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.lumbar.ratio, 3)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>阈值通过</Text></View>
                    <Text style={[styles.cfgValueText, {color: realtimeData.control_decision_data.lumbar.threshold_passed ? '#4CAF50' : '#FF5722'}]}>
                      {realtimeData.control_decision_data.lumbar.threshold_passed ? 'true' : 'false'}
                    </Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>动作</Text></View>
                    <Text style={[styles.cfgValueText, {color: realtimeData.control_decision_data.lumbar.action === 'INFLATE' ? '#4CAF50' : realtimeData.control_decision_data.lumbar.action === 'DEFLATE' ? '#FF5722' : '#FFC107'}]}>
                      {realtimeData.control_decision_data.lumbar.action}
                    </Text>
                  </View>
                </View>
              )}

              {/* 控制决策 - 侧翼 */}
              {realtimeData.control_decision_data?.side_wings && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>控制决策 - 侧翼</Text>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>左侧压力</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.side_wings.left_pressure, 1)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>右侧压力</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.side_wings.right_pressure, 1)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>左右比</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.side_wings.ratio, 3)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>左侧动作</Text></View>
                    <Text style={[styles.cfgValueText, {color: realtimeData.control_decision_data.side_wings.left_action === 'INFLATE' ? '#4CAF50' : realtimeData.control_decision_data.side_wings.left_action === 'DEFLATE' ? '#FF5722' : '#FFC107'}]}>
                      {realtimeData.control_decision_data.side_wings.left_action}
                    </Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>右侧动作</Text></View>
                    <Text style={[styles.cfgValueText, {color: realtimeData.control_decision_data.side_wings.right_action === 'INFLATE' ? '#4CAF50' : realtimeData.control_decision_data.side_wings.right_action === 'DEFLATE' ? '#FF5722' : '#FFC107'}]}>
                      {realtimeData.control_decision_data.side_wings.right_action}
                    </Text>
                  </View>
                </View>
              )}

              {/* 控制决策 - 腿托 */}
              {realtimeData.control_decision_data?.leg_support && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>控制决策 - 腿托</Text>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>臀部压力</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.leg_support.butt_pressure, 1)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>腿部压力</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.leg_support.leg_pressure, 1)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>腿臀比</Text></View>
                    <Text style={styles.cfgValueText}>{safeFixed(realtimeData.control_decision_data.leg_support.ratio, 3)}</Text>
                  </View>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>整体动作</Text></View>
                    <Text style={[styles.cfgValueText, {color: realtimeData.control_decision_data.leg_support.action === 'INFLATE' ? '#4CAF50' : realtimeData.control_decision_data.leg_support.action === 'DEFLATE' ? '#FF5722' : '#FFC107'}]}>
                      {realtimeData.control_decision_data.leg_support.action}
                    </Text>
                  </View>
                  {realtimeData.control_decision_data.leg_support.left_action && (
                    <>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>左腿托</Text><Text style={styles.cfgComment}>比值: {safeFixed(realtimeData.control_decision_data.leg_support.left_ratio, 2)}</Text></View>
                        <Text style={[styles.cfgValueText, {color: realtimeData.control_decision_data.leg_support.left_action === 'INFLATE' ? '#4CAF50' : realtimeData.control_decision_data.leg_support.left_action === 'DEFLATE' ? '#FF5722' : '#FFC107'}]}>
                          {realtimeData.control_decision_data.leg_support.left_action}
                        </Text>
                      </View>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>右腿托</Text><Text style={styles.cfgComment}>比值: {safeFixed(realtimeData.control_decision_data.leg_support.right_ratio, 2)}</Text></View>
                        <Text style={[styles.cfgValueText, {color: realtimeData.control_decision_data.leg_support.right_action === 'INFLATE' ? '#4CAF50' : realtimeData.control_decision_data.leg_support.right_action === 'DEFLATE' ? '#FF5722' : '#FFC107'}]}>
                          {realtimeData.control_decision_data.leg_support.right_action}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* 身体特征 */}
              {realtimeData.body_features && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>身体特征</Text>
                  {realtimeData.body_features.cushion && (
                    <>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>坐垫原始压力</Text></View>
                        <Text style={styles.cfgValueText}>{safeFixed(realtimeData.body_features.cushion.original_sum, 1)}</Text>
                      </View>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>坐垫滤波压力</Text></View>
                        <Text style={styles.cfgValueText}>{safeFixed(realtimeData.body_features.cushion.filtered_sum, 1)}</Text>
                      </View>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>坐垫最大值</Text></View>
                        <Text style={styles.cfgValueText}>{safeFixed(realtimeData.body_features.cushion.max_value, 1)}</Text>
                      </View>
                    </>
                  )}
                  {realtimeData.body_features.backrest && (
                    <>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>靠背原始压力</Text></View>
                        <Text style={styles.cfgValueText}>{safeFixed(realtimeData.body_features.backrest.original_sum, 1)}</Text>
                      </View>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>靠背滤波压力</Text></View>
                        <Text style={styles.cfgValueText}>{safeFixed(realtimeData.body_features.backrest.filtered_sum, 1)}</Text>
                      </View>
                      <View style={styles.cfgRow}>
                        <View style={{flex: 1}}><Text style={styles.cfgKey}>靠背最大值</Text></View>
                        <Text style={styles.cfgValueText}>{safeFixed(realtimeData.body_features.backrest.max_value, 1)}</Text>
                      </View>
                    </>
                  )}
                  {realtimeData.body_features.body_size_type && (
                    <View style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>体型分类</Text><Text style={styles.cfgComment}>原始值: {safeFixed(realtimeData.body_features.body_size_raw, 1)}</Text></View>
                      <Text style={styles.cfgValueText}>{realtimeData.body_features.body_size_type}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* 活体检测 */}
              {realtimeData.living_detection_data?.enabled && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>活体检测</Text>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>状态</Text></View>
                    <Text style={styles.cfgValueText}>{realtimeData.living_detection_data.status ?? '--'}</Text>
                  </View>
                  {realtimeData.living_detection_data.queue && (
                    <View style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>队列进度</Text></View>
                      <Text style={styles.cfgValueText}>{realtimeData.living_detection_data.queue.current_length}/{realtimeData.living_detection_data.queue.size}</Text>
                    </View>
                  )}
                  {realtimeData.living_detection_data.control_lock && (
                    <View style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>控制锁</Text></View>
                      <Text style={[styles.cfgValueText, {color: realtimeData.living_detection_data.control_lock.adaptive_control_unlocked ? '#4CAF50' : '#FF5722'}]}>
                        {realtimeData.living_detection_data.control_lock.message}
                      </Text>
                    </View>
                  )}
                  {realtimeData.living_detection_data.current_detection?.sad_score != null && (
                    <View style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>SAD分数</Text></View>
                      <Text style={styles.cfgValueText}>{safeFixed(realtimeData.living_detection_data.current_detection.sad_score, 3)}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* 体型检测 */}
              {realtimeData.body_type_detection_data?.enabled && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>体型检测</Text>
                  <View style={styles.cfgRow}>
                    <View style={{flex: 1}}><Text style={styles.cfgKey}>体型</Text></View>
                    <Text style={styles.cfgValueText}>{realtimeData.body_type_detection_data.body_type ?? '--'}</Text>
                  </View>
                  {realtimeData.body_type_detection_data.queue && (
                    <View style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>队列进度</Text></View>
                      <Text style={styles.cfgValueText}>{realtimeData.body_type_detection_data.queue.current_length}/{realtimeData.body_type_detection_data.queue.size}</Text>
                    </View>
                  )}
                  {realtimeData.body_type_detection_data.lock && (
                    <View style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>锁定状态</Text></View>
                      <Text style={[styles.cfgValueText, {color: realtimeData.body_type_detection_data.lock.locked ? '#4CAF50' : '#FFC107'}]}>
                        {realtimeData.body_type_detection_data.lock.message}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* 放气冷却 */}
              {realtimeData.deflate_cooldown?.enabled && realtimeData.deflate_cooldown.groups && (
                <View style={{marginBottom: 12}}>
                  <Text style={{color: Colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>放气冷却</Text>
                  {Object.entries(realtimeData.deflate_cooldown.groups).map(([group, state]) => (
                    <View key={group} style={styles.cfgRow}>
                      <View style={{flex: 1}}><Text style={styles.cfgKey}>{group}</Text></View>
                      <Text style={[styles.cfgValueText, {color: state.locked ? '#FF5722' : '#4CAF50'}]}>
                        {state.locked ? `锁定(${state.counter})` : `正常(${state.counter})`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{height: 20}} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}

      {/* 非标准帧回传数据弹窗 */}
      {showNonStdFrames && (
      <Modal
        visible={showNonStdFrames}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNonStdFrames(false)}>
        <View style={styles.matrixModalOverlay}>
          <View style={[styles.matrixModalContent, {maxWidth: 700, maxHeight: '85%'}]}>
            <View style={styles.matrixModalHeader}>
              <Text style={styles.matrixModalTitle}>非标准帧回传数据 (非144字节)</Text>
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <TouchableOpacity
                  onPress={() => { nonStdFramesRef.current = []; setNonStdFrameVersion(v => v + 1); }}
                  activeOpacity={0.7}
                  style={{marginRight: 12, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.warning, borderRadius: 4}}>
                  <Text style={{color: '#fff', fontSize: 12}}>清空</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowNonStdFrames(false)}
                  activeOpacity={0.7}
                  style={styles.matrixModalClose}>
                  <Text style={styles.matrixModalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={true}>
              {nonStdFramesRef.current.length === 0 ? (
                <View style={{padding: 40, alignItems: 'center'}}>
                  <Text style={{color: Colors.textGray}}>暂无非标准帧数据</Text>
                  <Text style={{color: Colors.textGray, fontSize: 11, marginTop: 8}}>当串口收到非144字节的帧时将显示在这里</Text>
                </View>
              ) : (
                nonStdFramesRef.current.map((frame, idx) => {
                  const time = new Date(frame.timestamp);
                  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${time.getMilliseconds().toString().padStart(3, '0')}`;
                  return (
                    <View key={`nsf-${idx}-${frame.timestamp}`} style={{paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)'}}>
                      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3}}>
                        <Text style={{fontSize: 11, color: '#90A4AE', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'}}>#{nonStdFramesRef.current.length - idx}</Text>
                        <Text style={{fontSize: 11, color: '#90A4AE'}}>{timeStr}</Text>
                        <Text style={{fontSize: 11, color: frame.length < 144 ? '#FF9800' : '#F44336', fontWeight: '600'}}>{frame.length} bytes</Text>
                      </View>
                      <Text style={{fontSize: 10, color: '#E0E0E0', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14}} selectable>{frame.hex}</Text>
                    </View>
                  );
                })
              )}
              <View style={{height: 20}} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}

      {/* 连接异常弹窗 */}
      <ConnectionErrorModal
        visible={showConnectionError}
        onDismiss={() => {
          setShowConnectionError(false);
          if (connectionStatus === 'error') {
            setConnectionStatus('disconnected');
          }
        }}
        onRetry={() => {
          hasTriedAutoConnect = false;
          setShowConnectionError(false);
          setConnectionErrorMessage('');
          setConnectionStatus('disconnected');
          setTimeout(() => {
            autoConnectSensor().catch(() => undefined);
          }, 100);
        }}
        retrying={connecting}
      />

      {showConnectionError && connectionErrorMessage ? (
        <View style={styles.errorHint}>
          <Text style={styles.errorHintText}>{connectionErrorMessage}</Text>
        </View>
      ) : null}

      {/* 控制指令弹窗 */}
      {showCommandModal && (
      <Modal
        visible={showCommandModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCommandModal(false)}>
        <View style={styles.matrixModalOverlay}>
          <View style={[styles.matrixModalContent, {maxWidth: 400, maxHeight: '70%'}]}>
            <View style={styles.matrixModalHeader}>
              <Text style={styles.matrixModalTitle}>控制指令</Text>
              <TouchableOpacity
                onPress={() => setShowCommandModal(false)}
                activeOpacity={0.7}
                style={styles.matrixModalClose}>
                <Text style={styles.matrixModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={true}>
              {ALL_AIRBAG_ZONES.map((zone, i) => {
                const cmd = commandStates[zone];
                const label = ZONE_CN_LABELS[zone] || zone;
                const cmdLabel = cmd === 3 ? '↑充' : cmd === 4 ? '↓放' : '--';
                const cmdColor = cmd === 3 ? Colors.primary : cmd === 4 ? Colors.warning : Colors.textGray;
                return (
                  <View key={zone} style={styles.cfgRow}>
                    <View style={{flex: 1}}>
                      <Text style={styles.cfgKey}>{i + 1}. {label}</Text>
                    </View>
                    <Text style={[styles.cfgValueText, {color: cmdColor, fontWeight: '600'}]}>{cmdLabel}</Text>
                  </View>
                );
              })}
              {rawCommand && rawCommand.length > 0 && (
                <View style={{paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)'}}>
                  <Text style={{fontSize: 10, color: Colors.textGray, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 14}} selectable>
                    {rawCommand.map(v => v.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fullscreen3DBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    zIndex: 1,
  },
  // ─── 左侧面板 ───
  leftPanel: {
    width: SCREEN_WIDTH * 0.25,
    maxWidth: SCREEN_WIDTH * 0.25,
    flexShrink: 0,
    flexGrow: 0,
    paddingRight: Spacing.sm,
  },
  leftPanelContent: {
    paddingBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    color: 'rgba(142, 142, 160, 0.9)',
    fontWeight: '600',
  },
  sectionIcon: {
    width: 15,
    height: 15,
    tintColor: Colors.primary,
  },
  seatIcon: {
    width: 36,
    height: 36,
  },
  customizeLinkIcon: {
    width: 14,
    height: 14,
  },
  // ─── 座椅状态 ───
  seatStatusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  seatStatusCard: {
    width: 100,
    height: 80,
    backgroundColor: 'rgba(60, 60, 67, 0.45)',
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  seatStatusCardActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  seatStatusText: {
    fontSize: FontSize.sm,
    color: Colors.textGray,
    marginTop: Spacing.xs,
    fontWeight: '500',
  },
  seatStatusTextActive: {
    color: Colors.primary,
  },
  // ─── 详细状态标签 ───
  detailStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  detailStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailStatusLabel: {
    fontSize: FontSize.sm,
    color: Colors.textGray,
  },
  detailStatusText: {
    fontSize: FontSize.sm,
    color: Colors.textLightGray,
    fontWeight: '500',
  },
  // ─── 体型分析 ───
  bodyShapeCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  bodyShapeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  bodyShapeStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bodyShapeStateBadge: {
    backgroundColor: 'rgba(142, 142, 147, 0.15)',
    borderRadius: BorderRadius.round,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  bodyShapeStateText: {
    fontSize: FontSize.xs,
    color: Colors.textGray,
    fontWeight: '500',
  },
  bodyShapeResult: {
    alignItems: 'flex-end',
  },
  bodyShapeValue: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textGray,
  },
  bodyShapeConfidence: {
    fontSize: FontSize.xs,
    color: Colors.textGray,
    marginTop: 2,
  },
  // ─── 概率分布条 ───
  probContainer: {
    gap: Spacing.sm,
  },
  probRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  probLabel: {
    fontSize: FontSize.xs,
    color: Colors.textGray,
    width: 28,
    textAlign: 'right',
  },
  probBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  probBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  probValue: {
    fontSize: FontSize.xs,
    color: Colors.textGray,
    width: 32,
    textAlign: 'right',
  },
  // ─── 品味记忆 ───
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGray,
  },
  preferenceText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '500',
  },
  recordingRow: {
    marginTop: Spacing.sm,
  },
  recordingText: {
    fontSize: FontSize.xs,
    color: Colors.warning,
    marginBottom: Spacing.xs,
  },
  recordingBarBg: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  recordingBarFill: {
    height: '100%',
    backgroundColor: Colors.warning,
    borderRadius: 2,
  },
  // ─── 气囊状态 ───
  airbagStatusCard: {
    backgroundColor: 'rgba(41, 45, 50, 0.85)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  airbagStatusText: {
    fontSize: FontSize.sm,
    color: Colors.textWhite,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  seatDiagramContainer: {
    alignItems: 'center',
    paddingVertical: 0,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderGray,
    marginVertical: Spacing.sm,
  },
  customizeLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  customizeLink: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '500',
  },
  // ─── 右侧面板 ───
  rightPanel: {
    flex: 1,
  },
  adaptiveSection: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.round,
    padding: 3,
  },
  toggleButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.round,
  },
  toggleButtonActive: {
    backgroundColor: Colors.primary,
  },
  toggleButtonInactive: {
    backgroundColor: Colors.cardBackgroundLight,
  },
  toggleText: {
    fontSize: FontSize.md,
    color: Colors.textGray,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: Colors.textWhite,
  },
  toggleTextInactive: {
    color: Colors.textGray,
  },
  carAir3D: {
    flex: 1,
  },
  // ─── 悬浮按钮组 ───
  floatingBtnGroupWrapper: {
    position: 'absolute',
    top: 50,
    right: 8,
    zIndex: 10,
  },
  floatingBtnGroup: {
    flexDirection: 'row',
  },
  matrixToggleBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matrixToggleBtnText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
  },
  cfgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  cfgKey: {
    fontSize: 13,
    color: '#E0E0E0',
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cfgComment: {
    fontSize: 11,
    color: '#90A4AE',
    marginTop: 2,
  },
  cfgInput: {
    width: 100,
    height: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 4,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cfgBoolBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 4,
    minWidth: 55,
    alignItems: 'center' as const,
  },
  cfgValueText: {
    fontSize: 12,
    color: '#B0BEC5',
    maxWidth: 140,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // ─── 矩阵弹窗 ───
  matrixModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matrixModalContent: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    minWidth: 340,
    maxWidth: '80%',
  },
  matrixModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  matrixModalTitle: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
    fontWeight: '600',
  },
  matrixModalClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matrixModalCloseText: {
    fontSize: 14,
    color: Colors.textGray,
    fontWeight: '600',
  },
  matrixRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  matrixBlock: {
    alignItems: 'center',
  },
  matrixLabel: {
    fontSize: 9,
    color: Colors.textGray,
    marginBottom: 2,
  },
  matrixGrid: {
    gap: 1,
  },
  matrixGridRow: {
    flexDirection: 'row',
    gap: 1,
  },
  matrixCell: {
    width: 16,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 1,
  },
  matrixCellText: {
    fontSize: 6,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  matrixCellSpacer: {
    width: 4,
  },
  // ─── 控制指令 ───
  cmdCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  cmdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  cmdZoneText: {
    fontSize: FontSize.xs,
    color: Colors.textGray,
  },
  cmdValueText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  cmdHexRow: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cmdHexText: {
    fontSize: 8,
    color: Colors.textGray,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 12,
  },
  // ─── 错误提示 ───
  errorHint: {
    position: 'absolute',
    left: Spacing.xxl,
    right: Spacing.xxl,
    bottom: Spacing.xxl,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  errorHintText: {
    color: '#fff',
    fontSize: FontSize.sm,
  },
});

export default HomeScreen;
