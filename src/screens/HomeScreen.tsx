import React, {useCallback, useEffect, useState, useRef} from 'react';
import {
  Dimensions,
  NativeEventEmitter,
  NativeModules,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Colors, FontSize, Spacing, BorderRadius} from '../theme';
import {TopBar, SeatDiagram, ConnectionErrorModal} from '../components';
import IconFont from '../components/IconFont';
import CarAirRN from '../components/CarAirRN';
import type {
  SeatStatus,
  ConnectionStatus,
  AirbagValues,
  AlgoSeatStatus,
  AlgoBodyShapeInfo,
  BodyShape,
  BodyShapeState,
  AlgoResult,
} from '../types';
import {mockSerial} from '../mock/mockSerialData';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

const DEFAULT_BAUD_RATE = 1000000;
const INITIAL_SENSOR_FRAME: number[] = new Array(144).fill(0);
let hasTriedAutoConnect = false;

/** 是否使用模拟数据（无真实硬件时自动启用） */
const USE_MOCK = Platform.OS !== 'android';

interface HomeScreenProps {
  onNavigateToCustomize: () => void;
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
function parseAlgoResult(resultJson: string): {
  seatStatus: SeatStatus;
  algoSeatStatus: AlgoSeatStatus;
  bodyShapeInfo: AlgoBodyShapeInfo;
  livingStatus: string;
  bodyType: string;
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

    return {
      seatStatus,
      algoSeatStatus,
      bodyShapeInfo,
      livingStatus,
      bodyType,
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
  return shape;
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

// ─── 组件 ────────────────────────────────────────────────────────

const HomeScreen: React.FC<HomeScreenProps> = ({onNavigateToCustomize}) => {
  const [seatStatus, setSeatStatus] = useState<SeatStatus>('away');
  const [algoSeatStatus, setAlgoSeatStatus] =
    useState<AlgoSeatStatus>(DEFAULT_SEAT_STATUS);
  const [bodyShapeInfo, setBodyShapeInfo] =
    useState<AlgoBodyShapeInfo>(DEFAULT_BODY_SHAPE_INFO);
  const [livingStatus, setLivingStatus] = useState<string>('离座');
  const [bodyType, setBodyType] = useState<string>('未判断');

  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [connecting, setConnecting] = useState(false);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState(true);
  const [showConnectionError, setShowConnectionError] = useState(false);
  const [connectionErrorMessage, setConnectionErrorMessage] = useState('');

  const [airbagValues] = useState<AirbagValues>({
    shoulder: 3,
    lumbar: 5,
    sideWing: 4,
    hipFirmness: 2,
    legRest: 3,
  });

  const [sensorData, setSensorData] = useState<number[]>(INITIAL_SENSOR_FRAME);

  // ─── 处理算法结果 ──────────────────────────────────────
  const handleAlgoResult = useCallback((resultJson: string) => {
    const parsed = parseAlgoResult(resultJson);
    if (!parsed) {
      return;
    }
    setSeatStatus(parsed.seatStatus);
    setAlgoSeatStatus(parsed.algoSeatStatus);
    setBodyShapeInfo(parsed.bodyShapeInfo);
    setLivingStatus(parsed.livingStatus);
    setBodyType(parsed.bodyType);
  }, []);

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
          setSensorData(parsed);
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
      if (!payload) {
        return;
      }

      const parsed = parseSerialFrame(payload);
      if (parsed) {
        setSensorData(parsed);
      }
    });

    const resultSub = emitter.addListener(
      'onSerialResult',
      (event: SerialResultEvent) => {
        if (typeof event.result === 'string' && event.result) {
          handleAlgoResult(event.result);
        }

        if (typeof event.error === 'string' && event.error) {
          setConnectionStatus('error');
          setConnectionErrorMessage(event.error);
          setShowConnectionError(true);
        }
      },
    );

    return () => {
      dataSub.remove();
      resultSub.remove();
    };
  }, [handleAlgoResult]);

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
      <TopBar connectionStatus={connectionStatus} />

      <View style={styles.content}>
        {/* ─── 左侧面板 ─── */}
        <View style={styles.leftPanel}>
          {/* 座椅状态 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconFont name="bianji" size={14} color={Colors.textGray} />
              <Text style={styles.sectionTitle}>座椅状态</Text>
            </View>
            <View style={styles.seatStatusRow}>
              <View
                style={[
                  styles.seatStatusCard,
                  seatStatus === 'seated' && styles.seatStatusCardActive,
                ]}>
                <IconFont
                  name="zaizuo"
                  size={36}
                  color={
                    seatStatus === 'seated' ? Colors.primary : Colors.textGray
                  }
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
                <IconFont
                  name="lizuo"
                  size={36}
                  color={
                    seatStatus === 'away' ? Colors.primary : Colors.textGray
                  }
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

            {/* 详细状态标签 */}
            <View style={styles.detailStatusRow}>
              <View style={styles.detailStatusItem}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: algoSeatStatus.is_seated
                        ? Colors.success
                        : Colors.textGray,
                    },
                  ]}
                />
                <Text style={styles.detailStatusText}>
                  {getSeatStateLabel(algoSeatStatus)}
                </Text>
              </View>
              <View style={styles.detailStatusItem}>
                <Text style={styles.detailStatusLabel}>活体：</Text>
                <Text
                  style={[
                    styles.detailStatusText,
                    livingStatus === '活体' && {color: Colors.success},
                    livingStatus === '静物' && {color: Colors.error},
                  ]}>
                  {livingStatus}
                </Text>
              </View>
              <View style={styles.detailStatusItem}>
                <Text style={styles.detailStatusLabel}>体型：</Text>
                <Text
                  style={[
                    styles.detailStatusText,
                    bodyType === '大人' && {color: Colors.success},
                    bodyType === '小孩' && {color: '#5AC8FA'},
                  ]}>
                  {bodyType}
                </Text>
              </View>
            </View>
          </View>

          {/* 体型分析 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconFont name="bianji" size={14} color={Colors.textGray} />
              <Text style={styles.sectionTitle}>体型分析</Text>
            </View>
            <View style={styles.bodyShapeCard}>
              {/* 分类状态 */}
              <View style={styles.bodyShapeHeader}>
                <View style={styles.bodyShapeStateRow}>
                  <View
                    style={[
                      styles.bodyShapeStateBadge,
                      bodyShapeInfo.body_shape_state === 'COMPLETED' && {
                        backgroundColor: 'rgba(52, 199, 89, 0.15)',
                      },
                      bodyShapeInfo.body_shape_state === 'COLLECTING' && {
                        backgroundColor: 'rgba(0, 122, 255, 0.15)',
                      },
                      bodyShapeInfo.body_shape_state === 'CLASSIFYING' && {
                        backgroundColor: 'rgba(255, 149, 0, 0.15)',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.bodyShapeStateText,
                        bodyShapeInfo.body_shape_state === 'COMPLETED' && {
                          color: Colors.success,
                        },
                        bodyShapeInfo.body_shape_state === 'COLLECTING' && {
                          color: Colors.primary,
                        },
                        bodyShapeInfo.body_shape_state === 'CLASSIFYING' && {
                          color: Colors.warning,
                        },
                      ]}>
                      {getBodyShapeStateLabel(bodyShapeInfo.body_shape_state)}
                    </Text>
                  </View>
                </View>

                {/* 体型结果 */}
                <View style={styles.bodyShapeResult}>
                  <Text
                    style={[
                      styles.bodyShapeValue,
                      {
                        color: getBodyShapeColor(bodyShapeInfo.body_shape),
                      },
                    ]}>
                    {getBodyShapeLabel(bodyShapeInfo.body_shape)}
                  </Text>
                  {bodyShapeInfo.confidence > 0 && (
                    <Text style={styles.bodyShapeConfidence}>
                      置信度 {Math.round(bodyShapeInfo.confidence * 100)}%
                    </Text>
                  )}
                </View>
              </View>

              {/* 概率分布条 */}
              {Object.keys(bodyShapeInfo.probabilities).length > 0 && (
                <View style={styles.probContainer}>
                  {renderProbabilityBar(
                    '瘦小',
                    bodyShapeInfo.probabilities['瘦小'] ?? 0,
                    '#5AC8FA',
                    bodyShapeInfo.body_shape === '瘦小',
                  )}
                  {renderProbabilityBar(
                    '中等',
                    bodyShapeInfo.probabilities['中等'] ?? 0,
                    Colors.success,
                    bodyShapeInfo.body_shape === '中等',
                  )}
                  {renderProbabilityBar(
                    '高大',
                    bodyShapeInfo.probabilities['高大'] ?? 0,
                    Colors.warning,
                    bodyShapeInfo.body_shape === '高大',
                  )}
                </View>
              )}

              {/* 品味记忆状态 */}
              {bodyShapeInfo.preference.using_preference && (
                <View style={styles.preferenceRow}>
                  <IconFont
                    name="bianji"
                    size={12}
                    color={Colors.primary}
                  />
                  <Text style={styles.preferenceText}>
                    已应用「{bodyShapeInfo.preference.active_body_shape}」品味记忆
                  </Text>
                </View>
              )}
              {bodyShapeInfo.preference.is_recording &&
                bodyShapeInfo.preference.recording_progress && (
                  <View style={styles.recordingRow}>
                    <Text style={styles.recordingText}>
                      品味记录中...{' '}
                      {bodyShapeInfo.preference.recording_progress.progress_pct}%
                    </Text>
                    <View style={styles.recordingBarBg}>
                      <View
                        style={[
                          styles.recordingBarFill,
                          {
                            width: `${bodyShapeInfo.preference.recording_progress.progress_pct}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                )}
            </View>
          </View>

          {/* 气囊状态 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconFont name="bianji" size={14} color={Colors.textGray} />
              <Text style={styles.sectionTitle}>气囊状态</Text>
            </View>
            <View style={styles.airbagStatusCard}>
              <Text style={styles.airbagStatusText}>
                {adaptiveEnabled ? '当前为自适应调节状态' : '自适应调节已关闭'}
              </Text>
              <View style={styles.seatThumbnail}>
                <SeatDiagram
                  activeZone={null}
                  scale={0.55}
                  showAllActive
                  values={airbagValues}
                />
              </View>
              <View style={styles.divider} />
              <TouchableOpacity
                onPress={onNavigateToCustomize}
                activeOpacity={0.7}>
                <View style={styles.customizeLinkRow}>
                  <IconFont
                    name="keshihuatiaojie"
                    size={14}
                    color={Colors.primary}
                  />
                  <Text style={styles.customizeLink}>自定义气囊调节</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ─── 右侧面板 ─── */}
        <View style={styles.rightPanel}>
          {/* 自适应调节开关 */}
          <View style={styles.adaptiveSection}>
            <View style={styles.sectionHeader}>
              <IconFont name="bianji" size={14} color={Colors.textGray} />
              <Text style={styles.sectionTitle}>自适应调节</Text>
            </View>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  adaptiveEnabled && styles.toggleButtonActive,
                ]}
                onPress={() => setAdaptiveEnabled(true)}
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
                onPress={() => setAdaptiveEnabled(false)}
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

          {/* 3D 座椅模型 */}
          <View style={styles.seat3DContainer}>
            <CarAirRN
              data={sensorData as unknown as never[]}
              style={styles.carAir3D}
            />
          </View>
        </View>
      </View>

      {/* 连接异常弹窗 */}
      <ConnectionErrorModal
        visible={showConnectionError}
        onDismiss={() => {
          setShowConnectionError(false);
          if (connectionStatus === 'error') {
            setConnectionStatus('disconnected');
          }
        }}
      />

      {showConnectionError && connectionErrorMessage ? (
        <View style={styles.errorHint}>
          <Text style={styles.errorHintText}>{connectionErrorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  // ─── 左侧面板 ───
  leftPanel: {
    width: SCREEN_WIDTH * 0.35,
    paddingRight: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    color: Colors.textGray,
    fontWeight: '500',
  },
  // ─── 座椅状态 ───
  seatStatusRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  seatStatusCard: {
    width: 120,
    height: 100,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.transparent,
  },
  seatStatusCardActive: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(0, 122, 255, 0.08)',
  },
  seatStatusText: {
    fontSize: FontSize.md,
    color: Colors.textGray,
    marginTop: Spacing.sm,
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
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  airbagStatusText: {
    fontSize: FontSize.md,
    color: Colors.textWhite,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  seatThumbnail: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderGray,
    marginVertical: Spacing.md,
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
  seat3DContainer: {
    flex: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  carAir3D: {
    flex: 1,
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
