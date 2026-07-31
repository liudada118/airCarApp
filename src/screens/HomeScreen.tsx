import React, {useCallback, useEffect, useMemo, useState, useRef} from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import {LinearGradient} from 'expo-linear-gradient';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import {TopBar, SeatCushion, VoiceBar, ConnectionErrorModal, Toast} from '../components';
import IconFont from '../components/IconFont';
import CarAirRN from '../components/CarAirRN';
import SeatMatrix46, {PressureLegend} from '../components/SeatMatrix46';
import AirbagFullFrameModal from '../components/AirbagFullFrameModal';
import AirbagHeatmap from '../components/AirbagHeatmap';
import {parseAirbagFullFrame, AirbagFullFrame} from '../utils/airbagFullFrame';
import {
  playVoice,
  VOICE_SEGMENTS,
  segmentIndexAt,
  estimateDurationMs,
  type VoiceKey,
} from '../utils/voicePlayer';

// icon 图片资源
const iconSitStatus = require('../assets/icons/icon-sitStatus.png');
const iconAirStatus = require('../assets/icons/icon-airStatus.png');
const iconSetting = require('../assets/icons/icon-setting.png');
const iconOnSeat = require('../assets/icons/icon-onSeat.png');
const iconOutSeat = require('../assets/icons/icon-outSeat.png');
// 新 UI 图标(座椅状态 / 乘员识别)
const iconSeated = require('../assets/images/icon/seated.png');
const iconAway = require('../assets/images/icon/away.png');
const iconOccupantPerson = require('../assets/images/icon/occupantPerson.png');
const iconOccupantObject = require('../assets/images/icon/occupantObject.png');
// 全屏背景图(空间感)
const bgImage = require('../assets/seat/bg.png');
// ── 线性渐变配色 ──
const GRAD_BTN = ['#559BEA', '#2978CE'] as const;    // 开启 / 自定义气囊调节 选中
const GRAD_TRACK = ['#29313D', '#313A47'] as const;  // 未选中开关 / 压力云图底色
const GRAD_STATUS = ['#1B3450', '#1D63B0'] as const; // 座椅状态 / 乘员识别 选中
const STATUS_BORDER = '#3897FF';                     // 座椅状态 / 乘员识别 选中外边框
// 右栏内容组宽度:在座+离座 两个方块的总宽,乘员识别卡片也用它 → 左右对齐。改这个数=整组变宽/窄。
const GROUP_W = 272;
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
// 启动首次连上串口后发一次 mode=3(开启自适应),让算法和默认「开启」的 UI 对齐。
// 只发一次:断线重连不重发,避免覆盖用户手动关掉的自适应。
let hasSentStartupAdaptive = false;

/** 是否使用模拟数据（无真实硬件时自动启用） */
// 新板子（1372 字节 float32 帧，算法在单片机内完成）已接入，改为读取真实串口。
// 注意：新帧目前只用于「板子数据帧」弹窗展示，暂未驱动主界面座椅/3D，
// 因此主界面的在座/离座、气囊状态在接入新帧前会保持静止，属正常现象。
// const USE_MOCK = Platform.OS !== 'android';
const USE_MOCK = false;

// 语音播报总开关：true=播 MP3 + 弹语音条；false=只弹语音条、不出声。
const VOICE_AUDIO_ENABLED = true;

interface HomeScreenProps {
  onNavigateToCustomize: () => void;
  adaptiveEnabled: boolean;
  onAdaptiveChange: (enabled: boolean) => void;
  connectionStatus: ConnectionStatus;
  onConnectionStatusChange: (status: ConnectionStatus) => void;
  onBodyShapeChange?: (shape: BodyShape) => void;
  /** 注册重置入座定时充气的回调，供外部调用 */
  onRegisterResetSeatedInflate?: (resetFn: () => void) => void;
  /** 在座/离座状态变化时上报，供自定义弹窗联动「点」显示 */
  onSeatStatusChange?: (status: SeatStatus) => void;
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
  /** 设置气囊覆盖层，在指定时间内将某个 zone 的指令合并到算法帧中发送 */
  setAirbagOverride?: (zone: string, action: string, durationMs: number) => Promise<string>;
  /** 清除气囊覆盖层 */
  clearAirbagOverride?: () => Promise<string>;
  /** 发一次 frontCmd 脉冲(自定义气囊/品味命令)：[modeCmd, partCmd, direction] */
  pulseFrontCmd?: (mode: number, part: number, dir: number) => Promise<boolean>;
  /** 手动按摩：true=立即启动，false=立即停止；算法仍会在入座 5 分钟后自动启动 */
  setLongSitMassageEnabled?: (enabled: boolean) => Promise<boolean>;
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

// 已知 USB 转串口芯片的厂商 ID（十进制）：
//   0x1A86=6790  沁恒 CH340/CH341/CH9102
//   0x0403=1027  FTDI
//   0x10C4=4292  Silicon Labs CP210x
//   0x067B=1659  Prolific PL2303
const KNOWN_SERIAL_VENDOR_IDS = [6790, 1027, 4292, 1659];
// 明确忽略的非串口设备厂商（避免误当串口打开）：0x2109=8457 VIA Labs USB Hub
const IGNORED_VENDOR_IDS = [8457];

function pickTargetDevice(devices: SerialDevice[]): SerialDevice | undefined {
  // 打印所有设备，便于排查选错设备的问题
  // eslint-disable-next-line no-console
  console.log('[Serial] listDevices =>', JSON.stringify(devices));
  // 先排除 USB Hub 等已知非串口设备
  const candidates = devices.filter(
    d => !IGNORED_VENDOR_IDS.includes(Number(d?.vendorId ?? 0)),
  );
  // 优先选已知串口芯片（CH340=0x1A86 等）
  const known = candidates.find(d =>
    KNOWN_SERIAL_VENDOR_IDS.includes(Number(d?.vendorId ?? 0)),
  );
  if (known) return known;
  return candidates.find(d => Number(d?.productId ?? 0) !== 0) ?? candidates[0];
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
    // console.log('[SeatStatus] seat_status:', JSON.stringify(parsed.seat_status), 'seat_state:', parsed.seat_state, '=> is_off_seat:', algoSeatStatus.is_off_seat, 'state:', algoSeatStatus.state);
    // 调试：打印 body_shape_info
    // console.log('[BodyShape] raw:', JSON.stringify(parsed.body_shape_info), 'state:', bodyShapeInfo.body_shape_state, 'shape:', bodyShapeInfo.body_shape);

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

/**
 * C 算法(airbag_13Hz, 92帧链路) 的 reasonCode → 在座/离座。
 * 依据算法文档 5.3：
 *   1,2,3,5,7,8 → 在座；6 → 离座；0,4 → 保持上一个状态（返回 prev）。
 */
function seatStatusFromReasonCode(
  reasonCode: number,
  prev: SeatStatus,
): SeatStatus {
  switch (Math.round(reasonCode)) {
    case 1:
    case 2:
    case 3:
    case 5:
    case 7:
    case 8:
      return 'seated';
    case 6:
      return 'away';
    default: // 0、4 以及任何未知值：保持上一个状态
      return prev;
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

// ─── 组件 ────────────────────────────────────────────────────────────

// ─── 右栏:座椅状态方块(自动识别，不可点) ─────────────────────────
const StatusSquare: React.FC<{active: boolean; icon: any; label: string}> = ({active, icon, label}) => {
  const inner = (
    <>
      <Image
        source={icon}
        style={[styles.statusIcon, {tintColor: active ? Colors.textWhite : Colors.textGray}]}
        resizeMode="contain"
      />
      <Text style={[styles.statusLabel, active && styles.statusLabelActive]}>{label}</Text>
    </>
  );
  return active ? (
    <LinearGradient colors={GRAD_STATUS} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={[styles.statusSquare, styles.statusSquareActive]}>
      {inner}
    </LinearGradient>
  ) : (
    <View style={[styles.statusSquare, styles.statusSquareInactive]}>{inner}</View>
  );
};

// ─── 右栏:乘员识别卡片(数据驱动，自动亮，不可点) ─────────────────────
const OccupantCard: React.FC<{
  active: boolean;
  icon: any;
  title: string;
  subtitle: string;
  onPress?: () => void;
}> = ({active, icon, title, subtitle, onPress}) => {
  const inner = (
    <>
      <View style={[styles.occupantRing, active && styles.occupantRingActive]}>
        <Image
          source={icon}
          style={[styles.occupantIcon, {tintColor: active ? Colors.textWhite : Colors.textGray}]}
          resizeMode="contain"
        />
      </View>
      <View style={styles.occupantTextWrap}>
        <Text style={[styles.occupantTitle, active && styles.occupantTitleActive]}>{title}</Text>
        <Text style={[styles.occupantSubtitle, active && styles.occupantSubtitleActive]}>{subtitle}</Text>
      </View>
    </>
  );
  const body = active ? (
    <LinearGradient colors={GRAD_STATUS} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={[styles.occupantCard, styles.occupantCardActive]}>
      {inner}
    </LinearGradient>
  ) : (
    <View style={[styles.occupantCard, styles.occupantCardInactive]}>{inner}</View>
  );
  // 有 onPress 才可点；数据驱动展示时用 View 包裹（不可点）
  return onPress ? (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.occupantTouch}>
      {body}
    </TouchableOpacity>
  ) : (
    <View style={styles.occupantTouch}>{body}</View>
  );
};

// ─── 通用滑块式开关(点开启/关闭,蓝色滑块滑动过去)。宽度自适应父容器。─────────
const SLIDE_PAD = 4; // 滑块与轨道边距
const SlideToggle: React.FC<{
  on: boolean;
  onChange: (v: boolean) => void;
  style?: any; // 轨道额外样式(主要用来指定宽度)
  onLabel?: string;  // "开启态"文字
  offLabel?: string; // "关闭态"文字
}> = ({on, onChange, style, onLabel = '开启', offLabel = '关闭'}) => {
  // 0 = 开启(滑块在左) / 1 = 关闭(滑块在右)
  const slide = useRef(new Animated.Value(on ? 0 : 1)).current;
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    Animated.timing(slide, {
      toValue: on ? 0 : 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [on, slide]);
  const thumbW = trackW > 0 ? (trackW - SLIDE_PAD * 2) / 2 : 0; // 滑块宽=轨道一半
  const translateX = slide.interpolate({inputRange: [0, 1], outputRange: [0, thumbW]});
  return (
    <View
      style={[styles.slideTrack, style]}
      onLayout={e => setTrackW(e.nativeEvent.layout.width)}>
      {/* 蓝色滑块(滑动) */}
      <Animated.View style={[styles.slideThumb, {width: thumbW, transform: [{translateX}]}]}>
        <LinearGradient colors={GRAD_BTN} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.slideThumbFill} />
      </Animated.View>
      {/* 两个可点区域(文字固定,滑块从下面滑过) */}
      <TouchableOpacity style={styles.slideHalf} activeOpacity={0.9} onPress={() => onChange(true)}>
        <Text style={[styles.slideText, on && styles.slideTextActive]}>{onLabel}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.slideHalf} activeOpacity={0.9} onPress={() => onChange(false)}>
        <Text style={[styles.slideText, !on && styles.slideTextActive]}>{offLabel}</Text>
      </TouchableOpacity>
    </View>
  );
};

const HomeScreen: React.FC<HomeScreenProps> = ({onNavigateToCustomize, adaptiveEnabled, onAdaptiveChange, connectionStatus, onConnectionStatusChange, onBodyShapeChange, onRegisterResetSeatedInflate, onSeatStatusChange}) => {
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
  // C 算法(92帧)链路：用 reasonCode 驱动在座/离座时，记住上一次状态
  // （reasonCode=0/4 表示「保持上一个状态」，需要沿用）
  const airbag13SeatRef = useRef<SeatStatus>('away');
  // 乘员识别：新 C 包直接输出 isLiving/isStatic，App 不再自攒窗口。
  // livingLatchedRef 只用于欢迎语去抖：记住上一帧 isLiving 是否为高，取 0→1 上升沿播一次。
  const livingLatchedRef = useRef<boolean>(false);
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
  // 乘员识别:仅页面选中态(暂无功能，后续接数据)
  const [occupantType, setOccupantType] = useState<'person' | 'object' | null>(null);
  // 右下角语音提示条(彩球+文字)。目前纯 UI:visible 控制显隐,text 写死。
  // 【数据口子】以后有数据时:setVoiceBar({visible: true, text: 按数据生成的提示}) 即可弹出。
  const [voiceBar, setVoiceBar] = useState<{visible: boolean; text: string}>({
    visible: false,
    text: '识别到当前路况颠簸，已启动两侧气囊支撑',
  });
  // 中间座椅 8 部位「点」的全局开/关(测试用;以后接数据)
  const [dotsOn, setDotsOn] = useState(false);
  // 新功能:14 个「大涟漪点」的全局开/关(测试用;以后接数据)
  const [bigDotsOn, setBigDotsOn] = useState(false);

  // ─── 新板子 1372 字节 float32 数据帧 ──────────────────────────
  // 每来一帧就存到 ref（不触发重渲染），弹窗打开时用定时器限流刷新显示
  const airbagFrameRef = useRef<AirbagFullFrame | null>(null);
  const airbagFrameCountRef = useRef(0);
  const [showAirbagData, setShowAirbagData] = useState(false);
  const [airbagDataVersion, setAirbagDataVersion] = useState(0);
  const [airbagFps, setAirbagFps] = useState(0); // 实测帧率（约每秒更新一次）

  // ─── 新算法 airbag_13Hz 热力图（数据来自原生 onAirbag13Result 事件）───
  // 每帧存 ref（不触发重渲染），弹窗打开时限流刷新显示
  const airbag13Ref = useRef<{
    cushion: number[];
    backrest: number[];
    reasonCode: number;
    isFullSeat: number;
  } | null>(null);
  const [showAirbagHeatmap, setShowAirbagHeatmap] = useState(false);
  const [airbag13View, setAirbag13View] = useState<{
    cushion: number[];
    backrest: number[];
    reasonCode: number;
    isFullSeat: number;
  } | null>(null);
  // 触发重渲染,把最新压力(104点)作为新引用喂给 3D 压力云图
  const [, setSeat3dTick] = useState(0);
  // 假压力调试:打开后喂一份"满压力"假数据(方便对齐 3D 点云位置),关掉回真数据
  const [fakePressure, setFakePressure] = useState(false);
  const fakePressureRef = useRef(false);

  // ─── 久坐按摩(座椅按摩调节)───
  // 久坐状态每帧存 ref,限流刷新显示(时间是分钟级,1s 刷新足够)
  const massageRef = useRef({minutes: 0, remainSec: 0, active: 0});
  const [massageView, setMassageView] = useState({minutes: 0, remainSec: 0, active: false});
  const lastMassagePromptRef = useRef(0); // longSitPrompt 上升沿检测
  const prevMassageActiveRef = useRef(0); // longSitMassageActive 上升沿检测(按摩开启→关闭自适应)
  const [massageToast, setMassageToast] = useState(false); // "久坐按摩已启动"提示

  // ─── 下发命令监控(临时测试面板)───
  const downlinkRef = useRef<{hex: string; gears: number[]} | null>(null);
  const [showDownlink, setShowDownlink] = useState(false);
  const [downlinkView, setDownlinkView] = useState<{hex: string; gears: number[]} | null>(null);
  // 正常气囊(1～10)当前真实动作区域，只由硬件回传控制。
  const [liveAirbagGlowZones, setLiveAirbagGlowZones] = useState<string[]>([]);
  const liveAirbagGlowKeyRef = useRef('');
  const liveAirbagGlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateLiveAirbagGlow = useCallback((zones: string[]) => {
    const uniqueZones = Array.from(new Set(zones)).sort();
    const nextKey = uniqueZones.join('|');
    if (nextKey !== liveAirbagGlowKeyRef.current) {
      liveAirbagGlowKeyRef.current = nextKey;
      setLiveAirbagGlowZones(uniqueZones);
    }
    if (liveAirbagGlowTimerRef.current) {
      clearTimeout(liveAirbagGlowTimerRef.current);
      liveAirbagGlowTimerRef.current = null;
    }
    // 防止串口突然停止回传时蓝光卡住；正常回传周期约 500ms。
    if (uniqueZones.length > 0) {
      liveAirbagGlowTimerRef.current = setTimeout(() => {
        liveAirbagGlowTimerRef.current = null;
        liveAirbagGlowKeyRef.current = '';
        setLiveAirbagGlowZones([]);
      }, 1200);
    }
  }, []);

  // ─── 首页座椅图「逐部位闪烁」口子 ───
  // 【口子】以后气囊「非手动」变动(算法自适应/久坐按摩等)时,调 flashSeatParts(['back',...]) 触发闪烁。
  const [seatFlash, setSeatFlash] = useState<{zones: string[]; seq: number} | null>(null);
  const seatFlashSeqRef = useRef(0);
  const flashSeatParts = useCallback((zones: string[]) => {
    if (!zones?.length) return;
    seatFlashSeqRef.current += 1;
    setSeatFlash({zones, seq: seatFlashSeqRef.current});
  }, []);

  // ─── 语音播报 + 语音条：按数据触发，严格串行排队 ──────────────
  const voiceHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceQueueRef = useRef<VoiceKey[]>([]);
  const voicePlayingRef = useRef(false);
  const voiceMountedRef = useRef(true);
  const playNextVoiceRef = useRef<() => void>(() => {});
  // 字幕：当前显示第几段(-1=还没开始)，以及无音频时推假进度的定时器
  const voiceSegIdxRef = useRef(-1);
  const voiceSegTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 按播放进度把语音条文字换成对应那一句；只在「换句」时 setState，
  // 否则 100ms 一次的进度回调会让整个首页疯狂重渲染。
  const showVoiceSegment = useCallback((key: VoiceKey, progress: number) => {
    const idx = segmentIndexAt(key, progress);
    if (idx === voiceSegIdxRef.current) return;
    voiceSegIdxRef.current = idx;
    const seg = VOICE_SEGMENTS[key][idx];
    if (seg) setVoiceBar({visible: true, text: seg.text});
  }, []);

  playNextVoiceRef.current = () => {
    if (!voiceMountedRef.current || voicePlayingRef.current) return;
    const key = voiceQueueRef.current.shift();
    if (!key) {
      setVoiceBar(prev => (prev.visible ? {...prev, visible: false} : prev));
      return;
    }

    voicePlayingRef.current = true;
    // 先亮第一句，等 duration 就绪后由进度回调接着往后推
    voiceSegIdxRef.current = -1;
    showVoiceSegment(key, 0);

    let finished = false;
    const finishCurrent = () => {
      if (finished) return;
      finished = true;
      if (voiceHideTimerRef.current) {
        clearTimeout(voiceHideTimerRef.current);
        voiceHideTimerRef.current = null;
      }
      if (voiceSegTimerRef.current) {
        clearInterval(voiceSegTimerRef.current);
        voiceSegTimerRef.current = null;
      }

      // 当前语音播完后稍作停留，再切换到队列中的下一条。
      voiceHideTimerRef.current = setTimeout(() => {
        voiceHideTimerRef.current = null;
        if (!voiceMountedRef.current) return;
        voicePlayingRef.current = false;
        if (voiceQueueRef.current.length > 0) {
          playNextVoiceRef.current();
        } else {
          setVoiceBar(prev => (prev.visible ? {...prev, visible: false} : prev));
        }
      }, 700);
    };

    if (VOICE_AUDIO_ENABLED) {
      // 正常使用音频完成事件推进队列；60 秒仅用于播放器异常时防止队列永久卡住。
      voiceHideTimerRef.current = setTimeout(finishCurrent, 60000);
      playVoice(key, finishCurrent, progress => {
        if (!voiceMountedRef.current || finished) return;
        showVoiceSegment(key, progress);
      });
    } else {
      // 不出声时没有真实进度，按字数估算整句时长，用假进度把字幕走完。
      const durMs = estimateDurationMs(key);
      const startedAt = Date.now();
      voiceSegTimerRef.current = setInterval(() => {
        if (!voiceMountedRef.current || finished) return;
        showVoiceSegment(key, (Date.now() - startedAt) / durMs);
      }, 120);
      voiceHideTimerRef.current = setTimeout(finishCurrent, durMs);
    }
  };

  const triggerVoice = useCallback((key: VoiceKey) => {
    voiceQueueRef.current.push(key);
    playNextVoiceRef.current();
  }, []);
  // 上升沿(0→1)检测用的上一帧值：健康三项
  const prevSpineRef = useRef(0);
  const prevBumpRef = useRef(0);
  const prevMotionRef = useRef(0);
  // 「试听语音」按钮的循环下标(依次播 5 条)
  const voiceTestIdxRef = useRef(0);
  useEffect(
    () => {
      voiceMountedRef.current = true;
      return () => {
        voiceMountedRef.current = false;
        voiceQueueRef.current = [];
        voicePlayingRef.current = false;
        if (voiceHideTimerRef.current) clearTimeout(voiceHideTimerRef.current);
        if (voiceSegTimerRef.current) clearInterval(voiceSegTimerRef.current);
      };
    },
    [],
  );

  // 入座定时充气提示弹窗
  const [seatedInflateToast, setSeatedInflateToast] = useState(false);
  const nonStdFramesRef = useRef<{hex: string; length: number; timestamp: number; csv: string}[]>([]);
  const [nonStdFrameVersion, setNonStdFrameVersion] = useState(0);
  const [configData, setConfigData] = useState<Record<string, {value: any; comment: string | null}> | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  // C 算法阈值（airbag_13Hz 标定输入，运行时可改，改完即时生效并存设备）
  const [airbagThresholds, setAirbagThresholds] = useState<
    {name: string; group: string; label: string; value: number; default: number}[] | null
  >(null);
  // realtimeData 已合并到 algoState 中

   // ─── 处理算法结果（单次 setState，减少 87.5% 重渲染）────────────
  const handleAlgoResult = useCallback((resultJson: string) => {
    const parsed = parseAlgoResult(resultJson);
    if (!parsed) return;
    // 【console 演示】每次算法出结果时打印一行，可在 React Native DevTools 的 Console 看到
    console.log('[SHROOM演示] 座椅状态=', parsed.seatStatus, ' 体型=', parsed.bodyType);
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
        // console.log('[3D清零] 首次触发清零+冻结! state:', parsed.algoSeatStatus.state, 'carAirRef:', !!carAirRef.current);
      }
      lastResetTimeRef.current = now;
      frozenRef.current = true;
      carAirRef.current?.resetToZero?.();
    } else {
      // 非离座状态（入座/自适应）：解冻3D图数据更新
      // 防抖：清零后至少保持2秒冻结，防止状态快速切换导致闪烁
      const timeSinceReset = now - lastResetTimeRef.current;
      if (frozenRef.current && timeSinceReset < 2000) {
        // console.log('[3D清零] 防抖中, 距上次清零:', timeSinceReset, 'ms, 忽略解冻');
        // 保持冻结，继续调用 resetToZero 确保清零状态
        carAirRef.current?.resetToZero?.();
        return; // 不更新 algoState，保持离座显示
      }
      if (frozenRef.current) {
        // console.log('[3D解冻] 解冻! state:', parsed.algoSeatStatus.state, 'timeSinceReset:', timeSinceReset, 'ms');
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
            // console.warn('getConfig error:', parsed.error);
          } else {
            setConfigData(parsed);
          }
        } catch (e) {
          // console.warn('getConfig parse error:', e);
        }
        setConfigLoading(false);
      })
      .catch((e: any) => {
        // console.warn('getConfig failed:', e);
        setConfigLoading(false);
      });
  }, []);

  const handleSetConfig = useCallback((key: string, value: any) => {
    const valueJson = JSON.stringify(value);
    // console.log('[Config] 设置配置:', key, '=', valueJson);
    NativeModules.SerialModule?.setConfig?.(key, valueJson)
      .then((json: string) => {
        try {
          const result = JSON.parse(json);
          if (result.ok) {
            // console.log('[Config] 配置写入成功:', key, '=', value);
            setConfigData(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                [key]: {...prev[key], value},
              };
            });
          } else {
            // console.warn('[Config] 配置写入失败:', key, result.error);
          }
        } catch (e) {
          // console.warn('[Config] 解析响应失败:', e);
        }
      })
      .catch((e: any) => {
        // console.warn('[Config] setConfig 调用失败:', key, e?.message || e);
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

  // ─── C 算法阈值管理（airbag_13Hz 标定输入）────────────────────
  const loadThresholds = useCallback(() => {
    NativeModules.SerialModule?.getAirbagThresholds?.()
      .then((arr: any[]) => setAirbagThresholds(Array.isArray(arr) ? arr : []))
      .catch(() => setAirbagThresholds([]));
  }, []);

  const handleSetThreshold = useCallback((name: string, value: number) => {
    NativeModules.SerialModule?.setAirbagThreshold?.(name, value)
      .then((ok: boolean) => {
        if (ok) {
          setAirbagThresholds(prev =>
            prev ? prev.map(t => (t.name === name ? {...t, value} : t)) : prev,
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleResetThresholds = useCallback(() => {
    NativeModules.SerialModule?.resetAirbagThresholds?.()
      .then(() => loadThresholds())
      .catch(() => {});
  }, [loadThresholds]);

  const openConfigModal = useCallback(() => {
    setShowConfig(true);
    loadConfig();
    loadThresholds();
  }, [loadConfig, loadThresholds]);

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

      // 启动首次连上 → 发一次 mode=3(开启自适应),对齐默认「开启」的 UI。仅一次。
      if (!hasSentStartupAdaptive) {
        hasSentStartupAdaptive = true;
        // console.log('[自适应下发] mode=3(开) 触发=启动首次连上');
        SerialModule?.pulseFrontCmd?.(3, 0, 0).catch(() => {});
      }
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
        // console.warn('[Serial] Disconnected:', event.reason);
        setConnectionStatus('error');
        setConnectionErrorMessage(event.reason || '串口连接已断开');
        setShowConnectionError(true);
      },
    );

    // 监听算法处理错误（仅记录日志，不影响连接状态）
    const algoErrorSub = emitter.addListener(
      'onAlgoError',
      (event: {error?: string}) => {
        // console.warn('[AlgoError]', event.error);
      },
    );

    const modeSub = emitter.addListener('onSerialMode', (event: {data?: string; modeValue?: number; manual?: boolean; auto?: boolean}) => {
      // 模式帧仅记录日志，不控制自适应调节（自适应由用户手动开关控制）
      // console.log('[ModeFrame] modeValue=', event.modeValue, 'auto=', event.auto, 'manual=', event.manual);
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

      // 气囊回传帧（格式同下发 frame[55]：[0]帧头 + 24 组 [编号,档位]，档位在 bytes[id*2]，3充/4放）
      // → 更新气囊指令状态 + 驱动「下发监控」面板 + 首页座椅充放气闪烁（这是气囊硬件回传的真实动作）
      if (entry.csv && entry.length === 51) {
        try {
          const bytes = entry.csv.split(',').map(Number);
          const hasValidHeader = bytes[0] === 0x1f;
          const hasValidIds = Array.from(
            {length: 24},
            (_, i) => bytes[1 + i * 2] === i + 1,
          ).every(Boolean);
          if (bytes.length === 51 && hasValidHeader && hasValidIds) {
            const newStates = parseAirbagCommand(bytes);
            // console.log('[NonStdFrame] 解析回传指令, length:', bytes.length, 'states:', JSON.stringify(newStates));
            setAlgoState(prev => ({
              ...prev,
              commandStates: newStates,
              rawCommand: bytes,
            }));

            // 从回传帧取 24 个气囊档位：gears[id-1] = bytes[id*2]（短帧缺失的按 0 处理）
            const gears: number[] = [];
            let anyActive = false;
            for (let id = 1; id <= 24; id++) {
              const gear = bytes[id * 2] ?? 0;
              gears.push(gear);
              if (gear === 3 || gear === 4) anyActive = true;
            }
            // 蓝光只在「充气(档位=3)」时亮；放气(4)和其它档位都不亮。
            const liveZones = new Set<string>();
            gears.slice(0, 10).forEach((g, idx) => {
              if (g !== 3) return;
              const id = idx + 1;
              if (id === 1 || id === 2) liveZones.add(id === 1 ? 'topL' : 'topR');
              // 03↔midR、04↔midL。因两张 mid 发光图之前被互换过,这里交叉映射抵消,
              // 使 03 充气时右侧(midR)亮、04 充气时左侧(midL)亮。
              else if (id === 3 || id === 4) liveZones.add(id === 3 ? 'midL' : 'midR');
              else if (id === 5 || id === 6) liveZones.add('back');
              else if (id === 7 || id === 8) liveZones.add('cushion');
              else if (id === 9 || id === 10) liveZones.add(id === 9 ? 'legR' : 'legL');
            });
            // 即使只有 11～24 号按摩气囊动作，这里也是空数组，正常气囊蓝光会关闭。
            updateLiveAirbagGlow(Array.from(liveZones));

            // 气囊编号(1-based)→ 首页座椅图部位。有动作(档位≠0)就闪对应部位。
            if (anyActive) {
              // 监控只保留硬件确认正在充/放气的回传帧，全 0 帧不覆盖最后一次动作。
              downlinkRef.current = {hex: entry.hex, gears};
            }
          }
        } catch (e) {
          // console.warn('[NonStdFrame] 解析失败:', e);
        }
      }
    });

    // 新板子 1372 字节 float32 数据帧 → 解析后存入 ref（不触发重渲染）
    const airbagSub = emitter.addListener('onAirbagFullFrame', (event: {data?: string}) => {
      if (typeof event.data !== 'string' || !event.data) return;
      const parsed = parseAirbagFullFrame(event.data);
      if (parsed) {
        airbagFrameRef.current = parsed;
        airbagFrameCountRef.current += 1;
      }
    });

    // 新算法 airbag_13Hz 结果（每帧一次）→ 存 ref，弹窗打开时限流刷新
    const airbag13Sub = emitter.addListener(
      'onAirbag13Result',
      (event: {
        cushion?: number[];
        backrest?: number[];
        reasonCode?: number;
        isFullSeat?: number;
        isLivingRaw?: number;
        detectionTriggered?: number;
        isLiving?: number;
        isStatic?: number;
        longSitMinutes?: number;
        longSitCycleRemain?: number;
        longSitPrompt?: number;
        longSitMassageActive?: number;
        spineProtectActive?: number;
        spineProtectSide?: number;
        bumpReliefActive?: number;
        motionSicknessActive?: number;
        healthReasonCode?: number;
      }) => {
        const cushion = event.cushion ?? [];
        const backrest = event.backrest ?? [];
        airbag13Ref.current = {
          cushion,
          backrest,
          reasonCode: event.reasonCode ?? 0,
          isFullSeat: event.isFullSeat ?? 0,
        };
        // 久坐按摩状态存 ref(限流刷新显示)
        massageRef.current = {
          minutes: event.longSitMinutes ?? 0,
          remainSec: (event.longSitCycleRemain ?? 0) / 13,
          active: event.longSitMassageActive ?? 0,
        };
        // longSitPrompt 上升沿 → 弹"久坐按摩已启动"
        const prompt = event.longSitPrompt ?? 0;
        if (prompt >= 0.5 && lastMassagePromptRef.current < 0.5) {
          setMassageToast(true);
          // longSitPrompt 只在到达定时时间自动启动时产生；手动启动不播报语音条。
          triggerVoice('massage_on');
        }
        lastMassagePromptRef.current = prompt;

        // ── 健康提示 & 久坐按摩：上升沿(0→1)触发语音播报 + 语音条 ──
        const spine = event.spineProtectActive ?? 0;
        const bump = event.bumpReliefActive ?? 0;
        const motion = event.motionSicknessActive ?? 0;
        const massageActive = event.longSitMassageActive ?? 0;
        // 14 个按摩气囊涟漪严格跟随算法实际运行状态（自动或手动启动都生效）。
        setBigDotsOn(massageActive >= 0.5);
        // 按摩开启(上升沿 0→1)→ 气囊自适应切到关闭：算法在按摩期间本就暂停自适应跟随
        // (living 被 !massageEnable 门控)。这里同步 UI 开关并下发 [5,0,0] 锁存 pAdaptiveOff，
        // 使按摩结束后自适应仍保持关闭，不自动切回开启(需用户手动开)。已关则保持关，不重发。
        if (massageActive >= 0.5 && prevMassageActiveRef.current < 0.5) {
          if (adaptiveEnabledRef.current) {
            // console.log('[自适应下发] mode=5(关) 触发=按摩开启自动关自适应');
            onAdaptiveChange(false);
            SerialModule?.pulseFrontCmd?.(5, 0, 0).catch(() => {});
          }
        }
        prevMassageActiveRef.current = massageActive;
        if (spine >= 0.5 && prevSpineRef.current < 0.5) triggerVoice('spine_protect');
        prevSpineRef.current = spine;
        if (bump >= 0.5 && prevBumpRef.current < 0.5) triggerVoice('bump_relief');
        prevBumpRef.current = bump;
        if (motion >= 0.5 && prevMotionRef.current < 0.5) triggerVoice('motion_sickness');
        prevMotionRef.current = motion;

        // ── 先算「在座/离座」，再决定 3D 云图喂不喂 ──
        const reason = event.reasonCode ?? 0;
        const nextSeat = seatStatusFromReasonCode(reason, airbag13SeatRef.current);

        // 喂 3D 压力云图:[坐垫48, 靠背56]=104,新数组(新引用)触发 CarAirRN 更新。
        // 仅「在座」时喂真实数据;「离座」时 CarAirRN 已被 resetToZero 冻结,即便传感器
        // 仍有微弱残留也不喂、不显示。假压力开启时不覆盖(用假数据对齐位置)。
        if (!fakePressureRef.current && nextSeat === 'seated') {
          sensorDataRef.current = cushion.concat(backrest);
          setSeat3dTick(t => (t + 1) & 0xffff);
        }
        // ── 用 reasonCode 驱动首页「在座/离座」方块（92帧 C 算法链路）──
        if (nextSeat !== airbag13SeatRef.current) {
          airbag13SeatRef.current = nextSeat;
          seatStatusRef.current = nextSeat;
          setAlgoState(prev =>
            prev.seatStatus === nextSeat ? prev : {...prev, seatStatus: nextSeat},
          );
          // 在座 → 点亮座椅「点」+ 解冻云图；离座 → 关闭「点」+ 清零并冻结云图。
          setDotsOn(nextSeat === 'seated');
          // 假压力调试模式下不动冻结状态（否则假数据会被一起隐藏）。
          if (!fakePressureRef.current) {
            if (nextSeat === 'seated') {
              carAirRef.current?.unfreeze?.();
            } else {
              carAirRef.current?.resetToZero?.();
            }
          }
          // 注：欢迎语不在这里播。入座瞬间乘员识别还没跑完（可能是静物占位），
          // 改到下方「确认活人」的上升沿才播（静物占位不播）。
          // 上报给 App，供自定义气囊弹窗同步联动
          onSeatStatusChange?.(nextSeat);
        }

        // ── 乘员识别：直接用算法输出的两个字段 isLiving / isStatic ──
        // 新 C 包已在算法内做完活体/静物判定，App 不再自己攒窗口：
        //   isLiving=1  → 「乘员入座」亮
        //   isStatic=1  → 「静物占位」亮
        //   两者都为 0  → 识别中 / 离座，两张卡都不亮（无中间默认值）
        const living = (event.isLiving ?? 0) >= 0.5;
        const isStaticObj = (event.isStatic ?? 0) >= 0.5;
        const nextOccupant: 'person' | 'object' | null = living
          ? 'person'
          : isStaticObj
          ? 'object'
          : null;
        setOccupantType(prev => (prev === nextOccupant ? prev : nextOccupant));

        // 欢迎语：仅在「活体」上升沿(0→1)播一次；静物占位/识别中不播。
        // 离座后算法把 isLiving 归 0，下次真人再落座能重新触发。
        if (living && !livingLatchedRef.current) triggerVoice('seat_welcome');
        livingLatchedRef.current = living;
      },
    );

    // 下发命令监控(临时测试面板):有气囊在动时收到
    // 注：气囊充放气「下发监控」面板 + 首页座椅闪烁改由气囊回传帧驱动（见上方 onNonStandardFrame），
    // 不再用 onAirbagDownlink（那是我发给算法的 frame[55]，非硬件回传的真实动作）。

    return () => {
      dataSub.remove();
      resultSub.remove();
      disconnectSub.remove();
      algoErrorSub.remove();
      modeSub.remove();
      nonStdSub.remove();
      airbagSub.remove();
      airbag13Sub.remove();
      if (liveAirbagGlowTimerRef.current) {
        clearTimeout(liveAirbagGlowTimerRef.current);
        liveAirbagGlowTimerRef.current = null;
      }
    };
  }, [handleAlgoResult, onAdaptiveChange, onSeatStatusChange, triggerVoice, updateLiveAirbagGlow]);

  // 弹窗打开时按 250ms（约 4Hz）限流刷新显示，避免每帧重渲染卡顿。
  // 同时每约 1 秒用帧计数实测一次真实帧率（收帧不受限流影响，全部照收）。
  useEffect(() => {
    if (!showAirbagData) return;
    let lastCount = airbagFrameCountRef.current;
    let lastTime = Date.now();
    const timer = setInterval(() => {
      setAirbagDataVersion(v => v + 1);
      const now = Date.now();
      const elapsed = now - lastTime;
      if (elapsed >= 1000) {
        const count = airbagFrameCountRef.current;
        setAirbagFps(Math.round(((count - lastCount) * 1000) / elapsed));
        lastCount = count;
        lastTime = now;
      }
    }, 250);
    return () => clearInterval(timer);
  }, [showAirbagData]);

  // 热力图弹窗打开时，每 200ms 从 ref 刷新一次显示（避免 13Hz 直接 setState 卡顿）
  useEffect(() => {
    if (!showAirbagHeatmap) return;
    const timer = setInterval(() => {
      setAirbag13View(airbag13Ref.current);
    }, 200);
    return () => clearInterval(timer);
  }, [showAirbagHeatmap]);

  // 久坐按摩状态每 1s 刷新一次显示（时间是分钟级，无需高频）
  useEffect(() => {
    const timer = setInterval(() => {
      const m = massageRef.current;
      setMassageView({minutes: m.minutes, remainSec: m.remainSec, active: m.active >= 0.5});
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 下发监控面板打开时,每 200ms 刷新一次
  useEffect(() => {
    if (!showDownlink) return;
    const timer = setInterval(() => setDownlinkView(downlinkRef.current), 200);
    return () => clearInterval(timer);
  }, [showDownlink]);


  // ─── 解构 algoState，避免大量代码修改 ────────────────────────
  const {seatStatus, algoSeatStatus, bodyShapeInfo, commandStates, rawCommand, livingStatus, bodyType, realtimeData} = algoState;
  const sensorData = sensorDataRef.current;

  // 板子数据帧：随限流版本号重新读取 ref（弹窗打开时约每 250ms 刷新一次）
  const airbagFrame = useMemo(
    () => airbagFrameRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [airbagDataVersion, showAirbagData],
  );

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

    if (seatStatus === 'seated' && adaptiveEnabled) {
      // 入座且自适应开启：启动每60秒一次的定时器
      if (seatedInflateTimerRef.current) return; // 已在运行，不重复启动
      seatedInflateCountRef.current = 0; // 重置计数

      const doInflate = () => {
        // 检查自适应是否仍然开启（使用 ref 获取最新值，避免闭包陈旧）
        if (!adaptiveEnabledRef.current) {
          clearAllTimers();
          // console.log('[SeatedInflate] 自适应已关闭，停止定时充气');
          return;
        }

        if (seatedInflateCountRef.current >= 3) {
          // 已达最大次数，停止定时器
          clearAllTimers();
          // console.log('[SeatedInflate] 已完成3次充气，停止定时任务');
          return;
        }

        // 使用模块级 SerialModule 引用
        if (!SerialModule?.setAirbagOverride) {
          // console.warn('[SeatedInflate] setAirbagOverride 不可用, SerialModule:', !!SerialModule);
          return;
        }

        seatedInflateCountRef.current += 1;
        const count = seatedInflateCountRef.current;
        // console.log(`[SeatedInflate] 第${count}次充气开始 (hipFirm override inflate 3000ms)`);

        // 使用 setAirbagOverride 将 hipFirm 充气指令合并到算法帧中，持续3秒
        // 这样算法帧中其他气囊的指令不会被覆盖，hipFirm 会被强制设为充气
        SerialModule.setAirbagOverride('hipFirm', 'inflate', 3000)
          .then(() => {
            // console.log(`[SeatedInflate] 第${count}次 hipFirm override 设置成功，将3秒后自动过期`);
          })
          .catch(e => {
            // console.warn(`[SeatedInflate] 第${count}次 hipFirm override 设置失败:`, e?.message || e);
          });

        // 显示提示弹窗
        setSeatedInflateToast(true);

        // 3秒后无需手动发送 stop，Kotlin 层 override 会自动过期，算法帧恢复原始状态
        // 不再需要 seatedInflateStopTimerRef
      };

      // 第一次在入座后60秒触发
      seatedInflateTimerRef.current = setInterval(doInflate, 60000);
      // console.log('[SeatedInflate] 入座且自适应开启，启动定时充气（每60s一次，最多3次）');
    } else {
      // 离座 或 自适应关闭：重置一切
      clearAllTimers();
      seatedInflateCountRef.current = 0;
      // 清除 override 覆盖层
      SerialModule?.clearAirbagOverride?.().catch(() => {});
      // console.log('[SeatedInflate] 离座或自适应关闭，重置定时充气并清除override');
    }

    return () => {
      clearAllTimers();
    };
  }, [seatStatus, adaptiveEnabled]);

  // 重置入座定时充气的函数（供外部调用，如手动调节气囊时）
  const resetSeatedInflate = useCallback(() => {
    if (seatedInflateTimerRef.current) {
      clearInterval(seatedInflateTimerRef.current);
      seatedInflateTimerRef.current = null;
    }
    if (seatedInflateStopTimerRef.current) {
      clearTimeout(seatedInflateStopTimerRef.current);
      seatedInflateStopTimerRef.current = null;
    }
    // 清除 override 覆盖层，避免手动调节时定时充气仍在生效
    SerialModule?.clearAirbagOverride?.().catch(() => {});
    seatedInflateCountRef.current = 0;
    // console.log('[SeatedInflate] 手动调节气囊，重置定时充气并清除override');
  }, []);

  // 注册重置函数供外部调用
  useEffect(() => {
    if (onRegisterResetSeatedInflate) {
      onRegisterResetSeatedInflate(resetSeatedInflate);
    }
  }, [onRegisterResetSeatedInflate, resetSeatedInflate]);

  // ─── 渲染辅助助 ──────────────────────────────────────────

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
      {/* 全屏背景图(铺底，内容在其上层)。resizeMethod=resize 让 Android 解码时降采样，避免超大图 OOM */}
      <Image
        source={bgImage}
        style={styles.bgImage}
        resizeMode="cover"
        resizeMethod="resize"
      />
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
      <View style={styles.content} pointerEvents="box-none">
        {/* ─── 左侧面板 ─── */}
        <View style={styles.leftPanel} pointerEvents="box-none">
          {/* 气囊自适应调节 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              {/* <Image source={iconSetting} style={styles.sectionIcon} resizeMode="contain" /> */}
              <Text style={styles.sectionTitle}>气囊自适应调节</Text>
            </View>
            {/* 滑块式开关:开=切回自适应跟随[3,0,0];关=关闭自适应[5,0,0](基于已保存的自定义基线) */}
            <SlideToggle
              on={adaptiveEnabled}
              onChange={v => {
                // console.log(`[自适应下发] mode=${v ? 3 : 5}(${v ? '开' : '关'}) 触发=手动点开关`);
                onAdaptiveChange(v);
                SerialModule?.pulseFrontCmd?.(v ? 3 : 5, 0, 0).catch(() => {});
              }}
              style={styles.adaptiveSlide}
              onLabel="开启自适应"
              offLabel="关闭自适应"
            />
            {/* 自定义气囊调节:进入品味模式[1,0,0] 并跳转 */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.customizeTouch}
              onPress={() => {
                // console.log('[自适应下发] mode=1(品味/自定义) 触发=点自定义气囊调节');
                SerialModule?.pulseFrontCmd?.(1, 0, 0).catch(() => {});
                onNavigateToCustomize();
              }}>
              <LinearGradient colors={GRAD_BTN} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.customizeBtnNew}>
                <Text style={styles.customizeTextNew}>自定义气囊调节</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* 实时压力云图(可旋转 3D，后续在此叠加压力点) */}
          <View style={[styles.section, styles.pressureSection]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>实时压力云图</Text>
            </View>
            <LinearGradient colors={GRAD_TRACK} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.pressureBox}>
              <CarAirRN
                ref={carAirRef}
                data={sensorData as unknown as never[]}
                style={styles.carAir3D}
                showDebugPanel={showDebugPanel}
              />
            </LinearGradient>
          </View>
        </View>

        {/* 中间:固定座椅气垫图(不可交互) */}
        <View style={styles.centerPanel} pointerEvents="none">
          <SeatCushion
            style={styles.seatCushion}
            dotsOn={dotsOn}
            glowOn={false}
            liveGlowZones={liveAirbagGlowZones}
            bigDotsOn={bigDotsOn}
            flash={seatFlash}
          />
        </View>

        {/* ─── 右侧面板 ─── */}
        <View style={styles.rightPanel} pointerEvents="box-none">
          {/* 座椅状态(算法自动识别，不可点选) */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              {/* <Image source={iconSitStatus} style={styles.sectionIcon} resizeMode="contain" /> */}
              <Text style={styles.sectionTitle}>座椅状态</Text>
            </View>
            <View style={styles.statusRow}>
              <StatusSquare active={seatStatus === 'seated'} icon={iconSeated} label="在座" />
              <StatusSquare active={seatStatus === 'away'} icon={iconAway} label="离座" />
            </View>
          </View>

          {/* 乘员识别(仅页面，暂无功能) */}
          <View style={[styles.section, styles.occupantSection]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>乘员识别</Text>
            </View>
            <OccupantCard
              active={occupantType === 'person'}
              icon={iconOccupantPerson}
              title="乘员入座"
              subtitle="座椅上有乘员落座"
            />
            <OccupantCard
              active={occupantType === 'object'}
              icon={iconOccupantObject}
              title="静物占位"
              subtitle="座椅上有物品占用"
            />
          </View>

          {/* 座椅按摩调节(久坐自动按摩:开启=允许自动,关闭=停止) */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>座椅按摩调节</Text>
            </View>
            {/* 手动开启/关闭；未手动操作时算法会在连续入座 5 分钟后自动开启。 */}
            <SlideToggle
              on={massageView.active}
              onChange={v => {
                SerialModule?.setLongSitMassageEnabled?.(v).catch(() => {});
              }}
              onLabel="开始按摩"
              offLabel="结束按摩"
            />
            {/* 久坐状态 */}
            <View style={styles.massageStatusRow}>
              <View style={[styles.massageDot, massageView.active && styles.massageDotOn]} />
              <Text style={styles.massageStatusText}>
                {massageView.active
                  ? '按摩运行中'
                  : `已连续入座 ${Math.floor(massageView.minutes)} 分钟`}
              </Text>
            </View>
            {!massageView.active && massageView.remainSec > 0 ? (
              <Text style={styles.massageSubText}>
                距下次自动约 {(massageView.remainSec / 60).toFixed(1)} 分钟
              </Text>
            ) : null}
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
              <TouchableOpacity
                style={[styles.matrixToggleBtn, {marginLeft: 6}]}
                onPress={() => setShowAirbagHeatmap(true)}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>热力图</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matrixToggleBtn, {marginLeft: 6}]}
                onPress={() => setShowDownlink(true)}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>回传监控</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matrixToggleBtn, {marginLeft: 6, backgroundColor: fakePressure ? 'rgba(52,152,219,0.85)' : 'rgba(0,0,0,0.55)'}]}
                onPress={() => {
                  const next = !fakePressure;
                  setFakePressure(next);
                  fakePressureRef.current = next;
                  if (next) {
                    // 造一份"满压力"假数据(中心高、边缘低),列优先: 坐垫6×8 + 靠背7×8
                    const mk = (rows: number, cols: number) => {
                      const a = new Array(rows * cols).fill(0);
                      const cr = (rows - 1) / 2;
                      const cc = (cols - 1) / 2;
                      const maxd = Math.hypot(cr, cc) || 1;
                      for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                          const d = Math.hypot(r - cr, c - cc) / maxd;
                          a[r + c * rows] = Math.round(90 * (1 - d) + 15); // 列优先下标
                        }
                      }
                      return a;
                    };
                    sensorDataRef.current = [...mk(6, 8), ...mk(7, 8)];
                    setSeat3dTick(t => (t + 1) & 0xffff);
                  }
                }}
                activeOpacity={0.7}>
                <Text style={styles.matrixToggleBtnText}>{fakePressure ? '真数据' : '假压力'}</Text>
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
            {/* 46 点布局：主传感 6×6 + 左右翼各竖 5。
                点位对应（哪个物理点落在哪格）待确认，这里 data 暂按顺序切片，仅用于验证布局。 */}
            <View style={{flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap'}}>
              <SeatMatrix46 title="坐垫" data={sensorData.slice(0, 46)} />
              <SeatMatrix46 title="靠背" data={sensorData.slice(46, 92)} />
            </View>
            <PressureLegend />
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
                    Alert.alert('确认重置', '是否恢复所有阈值/配置为默认值？', [
                      {text: '取消', style: 'cancel'},
                      {
                        text: '确认',
                        onPress: () => {
                          handleResetThresholds();
                          handleResetConfig();
                        },
                      },
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
            <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={true}>
              {/* C 算法阈值（本项目，运行时可改，改完即时生效并存设备）*/}
              {airbagThresholds && airbagThresholds.length > 0 ? (() => {
                type Thr = {name: string; group: string; label: string; value: number; default: number};
                const order: string[] = [];
                const grp: Record<string, Thr[]> = {};
                airbagThresholds.forEach(t => {
                  if (!grp[t.group]) {
                    grp[t.group] = [];
                    order.push(t.group);
                  }
                  grp[t.group].push(t);
                });
                return (
                  <View style={{marginBottom: 8}}>
                    <Text style={{color: Colors.warning, fontSize: 13, fontWeight: '700', marginBottom: 6, paddingHorizontal: 12}}>
                      C算法阈值（本项目 · 改完即时生效）
                    </Text>
                    {order.map(g => (
                      <View key={g} style={{marginBottom: 10}}>
                        <Text style={{color: Colors.primary, fontSize: 12, fontWeight: '700', marginBottom: 4, paddingHorizontal: 12}}>{g}</Text>
                        {grp[g].map(t => (
                          <View key={t.name} style={styles.cfgRow}>
                            <View style={{flex: 1, marginRight: 8}}>
                              <Text style={styles.cfgKey} numberOfLines={1}>{t.label}</Text>
                              <Text style={styles.cfgComment} numberOfLines={1}>{t.name} · 默认 {t.default}</Text>
                            </View>
                            <TextInput
                              key={`${t.name}:${t.value}`}
                              style={styles.cfgInput}
                              defaultValue={String(t.value)}
                              keyboardType="numeric"
                              returnKeyType="done"
                              onEndEditing={(e) => {
                                const text = e.nativeEvent.text.trim();
                                const num = Number(text);
                                if (text === '' || isNaN(num) || num === t.value) return;
                                handleSetThreshold(t.name, num);
                              }}
                            />
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                );
              })() : null}

              {/* Python 配置（本项目通常没有；若有则一并展示）*/}
              {configLoading ? (
                <View style={{padding: 20, alignItems: 'center'}}>
                  <Text style={{color: Colors.textGray}}>加载中...</Text>
                </View>
              ) : configData ? (
                (() => {
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
                })()
              ) : null}

              {/* 两边都没有数据时的占位 */}
              {!configLoading && !configData && (!airbagThresholds || airbagThresholds.length === 0) ? (
                <View style={{padding: 40, alignItems: 'center'}}>
                  <Text style={{color: Colors.textGray}}>无配置数据</Text>
                </View>
              ) : null}
            </ScrollView>
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

      {/* 入座定时充气提示 */}
      {/* <Toast
        visible={seatedInflateToast}
        message="检测到您已进行长时间驾驶，自动为您调节坐垫软硬度，如感到不舒适请进入自定义气囊调节界面进行相应气囊自我调节"
        type="info"
        duration={6000}
        onHide={() => setSeatedInflateToast(false)}
      /> */}

      {/* 久坐按摩已启动提示 */}
      {/* <Toast
        visible={massageToast}
        message="久坐按摩已启动"
        type="info"
        duration={5000}
        onHide={() => setMassageToast(false)}
      /> */}

      {/* ─── 右下角:语音提示条(彩球+文字),纯 UI ─── */}
      <VoiceBar visible={voiceBar.visible} text={voiceBar.text} style={styles.voiceBarWrap} />

      {/* ─── 右下角：板子数据帧按钮 ─── */}
      <TouchableOpacity
        style={styles.airbagDataFab}
        onPress={() => setShowAirbagData(true)}
        activeOpacity={0.8}>
        <Text style={styles.airbagDataFabText}>板子数据</Text>
      </TouchableOpacity>

      {/* 测试按钮:依次试听 5 条语音(走真实播放路径:播 MP3 + 弹语音条,播完自动收起) */}
      <TouchableOpacity
        style={styles.voiceTestFab}
        onPress={() => {
          const keys: VoiceKey[] = [
            'seat_welcome',
            'massage_on',
            'spine_protect',
            'bump_relief',
            'motion_sickness',
          ];
          const k = keys[voiceTestIdxRef.current % keys.length];
          voiceTestIdxRef.current += 1;
          triggerVoice(k);
        }}
        activeOpacity={0.8}>
        <Text style={styles.airbagDataFabText}>试听语音</Text>
      </TouchableOpacity>

      {/* 测试按钮:座椅点 开启(蓝)/关闭(白) 切换(以后换成按数据) */}
      <TouchableOpacity
        style={styles.dotsTestFab}
        onPress={() => setDotsOn(prev => !prev)}
        activeOpacity={0.8}>
        <Text style={styles.airbagDataFabText}>{dotsOn ? '点关闭' : '点开启'}</Text>
      </TouchableOpacity>

      {/* 板子数据帧弹窗（1376B / 343×float32） */}
      <AirbagFullFrameModal
        visible={showAirbagData}
        onClose={() => setShowAirbagData(false)}
        frame={airbagFrame}
        frameCount={airbagFrameCountRef.current}
        fps={airbagFps}
      />

      {/* 新算法 airbag_13Hz 压力热力图弹窗（靠背 7×8 + 坐垫 6×8） */}
      {showAirbagHeatmap && (
      <Modal
        visible={showAirbagHeatmap}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAirbagHeatmap(false)}>
        <View style={styles.matrixModalOverlay}>
          <View style={[styles.matrixModalContent, {maxWidth: 720}]}>
            <View style={styles.matrixModalHeader}>
              <Text style={styles.matrixModalTitle}>
                压力热力图（airbag_13Hz）
                {airbag13View
                  ? `　${airbag13View.isFullSeat >= 1 ? '全座' : '未全座'}　reason=${Math.round(airbag13View.reasonCode)}`
                  : ''}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAirbagHeatmap(false)}
                activeOpacity={0.7}
                style={styles.matrixModalClose}>
                <Text style={styles.matrixModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {airbag13View ? (
              <AirbagHeatmap cushion={airbag13View.cushion} backrest={airbag13View.backrest} />
            ) : (
              <View style={{padding: 40, alignItems: 'center'}}>
                <Text style={{color: Colors.textGray}}>等待板子数据…（确认板子已插平板并连接串口）</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      )}

      {/* 下发命令监控(临时测试面板) */}
      {showDownlink && (
      <Modal
        visible={showDownlink}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDownlink(false)}>
        <View style={styles.matrixModalOverlay}>
          <View style={[styles.matrixModalContent, {maxWidth: 520}]}>
            <View style={styles.matrixModalHeader}>
              <Text style={styles.matrixModalTitle}>气囊回传动作监控(气囊动作时刷新)</Text>
              <TouchableOpacity onPress={() => setShowDownlink(false)} activeOpacity={0.7} style={styles.matrixModalClose}>
                <Text style={styles.matrixModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {downlinkView ? (
              <View style={{padding: 8}}>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                  {downlinkView.gears.map((g, i) => (
                    <View
                      key={i}
                      style={{
                        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
                        backgroundColor: g === 3 ? '#2e7d32' : g === 4 ? '#e07a1f' : 'rgba(255,255,255,0.08)',
                      }}>
                      <Text style={{color: '#fff', fontSize: 11}}>
                        {i + 1}:{g === 3 ? '充' : g === 4 ? '放' : g}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{color: Colors.textGray, fontSize: 10, marginTop: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'}} selectable>
                  {downlinkView.hex}
                </Text>
                <Text style={{color: Colors.textGray, fontSize: 11, marginTop: 8}}>
                  绿=充气(3) 橙=放气(4);1-10 支撑气囊,11-24 按摩气囊。数据来自气囊硬件回传帧。全 0 时不刷新(说明当前无动作)。
                </Text>
              </View>
            ) : (
              <View style={{padding: 40, alignItems: 'center'}}>
                <Text style={{color: Colors.textGray}}>等待气囊动作…(坐上去调节 / 开自适应 / 自定义 +/- 时这里会亮)</Text>
              </View>
            )}
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
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.lg,
    zIndex: 1,
  },
  // ─── 左侧面板 ───
  leftPanel: {
    width: SCREEN_WIDTH * 0.23,
    maxWidth: SCREEN_WIDTH * 0.23,
    flexShrink: 0,
    flexGrow: 0,
    paddingRight: Spacing.sm,
    paddingBottom: SCREEN_HEIGHT * 0.04,
  },
  // ─── 中间:固定座椅气垫图 ───
  centerPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatCushion: {
    height: '100%',
  },
  // ─── 气囊自适应调节:外面大盒子 + 里面两个小盒子 ───
  adaptiveToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: 5,                         // 大盒子内边距
    borderRadius: 13,                   // 圆角
    backgroundColor: 'rgba(255,255,255,0.05)', // 大盒子底色
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    width: '90%',                       // 加宽(和下面自定义按钮同宽)
    marginBottom: Spacing.md,
  },
  adaptiveToggleItem: {
    flex: 1,
  },
  toggleFill: {
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleFillInactive: {
    backgroundColor: 'rgba(60, 60, 67, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toggleTextIdle: {
    fontSize: FontSize.md,
    color: Colors.textGray,
    fontWeight: '600',
  },
  // ─── 自定义气囊调节按钮(渐变) ───
  customizeTouch: {
    width: '90%',   // 和开启/关闭同宽
  },
  customizeBtnNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 58,
    borderRadius: BorderRadius.md,
  },
  customizeTextNew: {
    fontSize: 18, // 自定义气囊调节 文字(原 14)
    color: Colors.textWhite,
    fontWeight: '600',
  },
  // ─── 实时压力云图(3D) ───
  pressureSection: {
    flex: 1,
    marginTop: SCREEN_HEIGHT * 0.03,   // 标题与上面"气囊自适应"区的间距
    marginBottom: 0,
  },
  pressureBox: {
    marginTop: Spacing.md,             // 3D 框往下顶一点(与标题拉开)
    height: SCREEN_HEIGHT * 0.5,   // 固定高度,不再撑满剩余空间
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  // ─── 右栏:座椅状态方块 ───
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: GROUP_W,          // 整组固定宽(= 在座+离座 总宽)
    alignSelf: 'flex-start', // 左对齐(不居中)
  },
  statusSquare: {
    flex: 1,                 // 两个平分 statusRow 宽度 → 各 (GROUP_W - gap)/2
    aspectRatio: 1,          // 正方形(高=宽)
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  statusSquareActive: {
    borderWidth: 1.5,
    borderColor: STATUS_BORDER,
  },
  statusSquareInactive: {
    backgroundColor: 'rgba(60, 60, 67, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statusIcon: {
    width: 50, // 在座/离座 图标大小(原 40)
    height: 50,
  },
  statusLabel: {
    fontSize: 18, // 在座/离座 文字大小(原 14)
    color: Colors.textGray,
    fontWeight: '600',
  },
  statusLabelActive: {
    color: Colors.textWhite,
  },
  // ─── 右栏:乘员识别卡片 ───
  occupantTouch: {
    width: GROUP_W,          // 和 在座+离座 总宽一致 → 左右对齐
    alignSelf: 'flex-start', // 左对齐
    marginBottom: Spacing.md,
  },
  occupantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // 图标+文字整组水平居中
    gap: Spacing.lg,
    paddingHorizontal: Spacing.sm, // 左右内边距减小 → 内容更靠边、两侧空白更少
    paddingVertical: Spacing.xxl,  // 上下加高 → 框更高(原 Spacing.lg=16 → 24)
    borderRadius: BorderRadius.lg,
  },
  occupantCardActive: {
    borderWidth: 1.5,
    borderColor: STATUS_BORDER,
  },
  occupantCardInactive: {
    backgroundColor: 'rgba(60, 60, 67, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  occupantRing: {
    width: 54, // 圆圈图标底(原 44)
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  occupantRingActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.5)',
  },
  occupantIcon: {
    width: 30, // 图标(原 24)
    height: 30,
  },
  occupantTextWrap: {
    alignItems: 'flex-start', // 文字块左对齐(标题+小字都靠左)
  },
  occupantTitle: {
    fontSize: 18, // 标题「乘员入座/静物占位」字号(原 14)
    color: Colors.textLightGray,
    fontWeight: '600',
    textAlign: 'left',
  },
  occupantTitleActive: {
    color: Colors.textWhite,
  },
  occupantSubtitle: {
    fontSize: 14, // 副标题字号(原 10)
    color: Colors.textGray,
    marginTop: 3,
    textAlign: 'left',
  },
  occupantSubtitleActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  // ─── 久坐按摩状态 ───
  massageStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  massageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  massageDotOn: {
    backgroundColor: '#4CAF50',
  },
  massageStatusText: {
    fontSize: FontSize.sm,
    color: Colors.textGray,
  },
  massageSubText: {
    fontSize: FontSize.xs,
    color: Colors.textGray,
    marginTop: 2,
  },
  // ─── 座椅按摩调节:滑块式开关 ───
  slideTrack: {
    width: GROUP_W,               // 右边按摩开关:和座椅状态/乘员识别同宽
    height: 76,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignSelf: 'flex-start',      // 左对齐
    overflow: 'hidden',
    position: 'relative',
  },
  // 左栏「气囊自适应调节」滑块:和下面自定义按钮同宽,并与它拉开间距
  adaptiveSlide: {
    width: '90%',                 // 左边自适应开关:和下面"自定义气囊调节"同宽
    marginBottom: Spacing.md,
  },
  slideThumb: {
    position: 'absolute',
    top: SLIDE_PAD,
    left: SLIDE_PAD,
    bottom: SLIDE_PAD,
    // width 由组件动态设置(轨道一半)
    borderRadius: 10,
    overflow: 'hidden',
  },
  slideThumbFill: {
    flex: 1,
    borderRadius: 10,
  },
  slideHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideText: {
    fontSize: 18, // 开启/关闭自适应、开始/结束按摩 文字(原 14)
    fontWeight: '600',
    color: Colors.textGray,
  },
  slideTextActive: {
    color: Colors.textWhite,
  },
  leftPanelContent: {
    paddingBottom: Spacing.xxl,
  },
  section: {
    marginBottom: SCREEN_HEIGHT * 0.02,
  },
  occupantSection: {
    marginTop: SCREEN_HEIGHT * 0.03,   // 与左边"实时压力云图"上方间距对应
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    color: '#B4C0CA',
    fontWeight: '500',
  },
  sectionIcon: {
    width: 16,
    height: 16,
    tintColor: Colors.primary,
  },
  seatIcon: {
    width: 48,
    height: 48,
  },
  customizeLinkIcon: {
    width: 14,
    height: 14,
  },
  // ─── 座椅状态 ───
  seatStatusRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  seatStatusCard: {
    flex: 1,
    height: 100,
    backgroundColor: 'rgba(60, 60, 67, 0.45)',
    borderRadius: BorderRadius.lg,
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
    fontSize: FontSize.lg,
    color: Colors.textGray,
    marginTop: Spacing.md,
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
    paddingHorizontal: Spacing.md,
    paddingTop: SCREEN_HEIGHT * 0.04,
    paddingBottom: SCREEN_HEIGHT * 0.04,
  },
  airbagStatusText: {
    fontSize: FontSize.sm,
    color: Colors.textWhite,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  seatDiagramContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderGray,
    marginVertical: Spacing.sm,
  },
  customizeBtnWrapper: {
    marginTop: SCREEN_HEIGHT * 0.04,
    alignItems: 'center',
  },
  customizeDivider: {
    width: '90%',
    height: 1,
    backgroundColor: Colors.borderGray,
    marginBottom: SCREEN_HEIGHT * 0.02,
  },
  customizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  customizeLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  customizeLink: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '500',
  },
  // ─── 右侧面板(稍窄) ───
  rightPanel: {
    width: SCREEN_WIDTH * 0.24,
    maxWidth: SCREEN_WIDTH * 0.24,
    flexShrink: 0,
    flexGrow: 0,
    paddingLeft: Spacing.sm,
    paddingBottom: SCREEN_HEIGHT * 0.04,
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
  // ─── 右下角 板子数据 按钮 ───
  airbagDataFab: {
    position: 'absolute',
    right: Spacing.xl,
    bottom: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.round,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  airbagDataFabText: {
    color: Colors.textWhite,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  // ─── 语音提示条 + 测试按钮 ───
  voiceBarWrap: {
    position: 'absolute',
    right: Spacing.xl,
    bottom: 80,          // 在"板子数据"按钮上方
    zIndex: 25,
  },
  voiceTestFab: {
    position: 'absolute',
    right: 130,          // "板子数据"左边
    bottom: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: BorderRadius.round,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    zIndex: 20,
  },
  dotsTestFab: {
    position: 'absolute',
    right: 224,          // 弹球测试再往左
    bottom: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: BorderRadius.round,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    zIndex: 20,
  },
  glowTestFab: {
    position: 'absolute',
    right: 318,          // "点开启"再往左
    bottom: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: BorderRadius.round,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    zIndex: 20,
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
