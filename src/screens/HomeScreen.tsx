import React, { useCallback, useEffect, useState } from 'react';
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
import { Colors, FontSize, Spacing, BorderRadius } from '../theme';
import {
  TopBar,
  SeatDiagram,
  ConnectionErrorModal,
} from '../components';
import IconFont from '../components/IconFont';
import CarAirRN from '../components/CarAirRN';
import type {
  SeatStatus,
  ConnectionStatus,
  AirbagValues,
} from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DEFAULT_BAUD_RATE = 1000000;
const EMPTY_SENSOR_FRAME: number[] = new Array(144).fill(0);
let hasTriedAutoConnect = false;

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
    options: { baudRate: number },
  ) => Promise<boolean>;
  resetPendingOpen?: () => void;
  close?: () => void;
}

interface SerialResultEvent {
  data?: string;
  result?: string;
  error?: string;
}

const { SerialModule } = NativeModules as {
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
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return '连接失败，请检查传感器设备';
}

function pickTargetDevice(devices: SerialDevice[]): SerialDevice | undefined {
  return devices.find(d => Number(d?.productId ?? 0) !== 0) ?? devices[0];
}

function mapSeatStateFromAlgoResult(result: string): SeatStatus | null {
  try {
    const parsed = JSON.parse(result) as {
      algorData?: { living_status?: unknown; seat_state?: unknown };
      living_status?: unknown;
      seat_state?: unknown;
    };

    const livingStatus =
      parsed.algorData?.living_status ?? parsed.living_status;
    if (typeof livingStatus === 'string') {
      const normalized = livingStatus.trim();
      if (normalized === '离座') {
        return 'away';
      }
      if (normalized === '在座') {
        return 'seated';
      }
    }

    const seatState = parsed.algorData?.seat_state ?? parsed.seat_state;
    if (typeof seatState !== 'string' || !seatState) {
      return null;
    }

    if (seatState === 'OFF_SEAT' || seatState === 'RESETTING') {
      return 'away';
    }

    return 'seated';
  } catch (_error) {
    return null;
  }
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateToCustomize }) => {
  const [seatStatus, setSeatStatus] = useState<SeatStatus>('seated');
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

  const [sensorData, setSensorData] = useState<number[]>(EMPTY_SENSOR_FRAME);

  const autoConnectSensor = useCallback(async () => {
    if (connecting || connectionStatus === 'connected') {
      return;
    }

    if (Platform.OS !== 'android') {
      setConnectionStatus('error');
      setConnectionErrorMessage('当前平台不支持 USB 串口传感器连接');
      setShowConnectionError(true);
      return;
    }

    if (!SerialModule?.listDevices || (!SerialModule.openWithOptions && !SerialModule.open)) {
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
            { baudRate: DEFAULT_BAUD_RATE },
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
    if (hasTriedAutoConnect) {
      return;
    }

    hasTriedAutoConnect = true;
    autoConnectSensor().catch(() => undefined);
  }, [autoConnectSensor]);

  useEffect(() => {
    if (!SerialModule) {
      return;
    }

    const emitter = new NativeEventEmitter(SerialModule as never);

    const dataSub = emitter.addListener('onSerialData', event => {
      const payload = event && typeof event.data === 'string' ? event.data : '';
      if (!payload) {
        return;
      }

      const parsed = parseSerialFrame(payload);
      if (parsed) {
        setSensorData(parsed);
      }
    });

    const resultSub = emitter.addListener('onSerialResult', (event: SerialResultEvent) => {
      if (typeof event.result === 'string' && event.result) {
        console.log('[AlgorithmResult]', event.result);
        const nextSeatStatus = mapSeatStateFromAlgoResult(event.result);
        if (nextSeatStatus) {
          setSeatStatus(nextSeatStatus);
        }
      }

      if (typeof event.error === 'string' && event.error) {
        setConnectionStatus('error');
        setConnectionErrorMessage(event.error);
        setShowConnectionError(true);
      }
    });

    return () => {
      dataSub.remove();
      resultSub.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <TopBar connectionStatus={connectionStatus} />

      <View style={styles.content}>
        <View style={styles.leftPanel}>
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
                ]}
              >
                <IconFont
                  name="zaizuo"
                  size={36}
                  color={seatStatus === 'seated' ? Colors.primary : Colors.textGray}
                />
                <Text
                  style={[
                    styles.seatStatusText,
                    seatStatus === 'seated' && styles.seatStatusTextActive,
                  ]}
                >
                  在座
                </Text>
              </View>

              <View
                style={[
                  styles.seatStatusCard,
                  seatStatus === 'away' && styles.seatStatusCardActive,
                ]}
              >
                <IconFont
                  name="lizuo"
                  size={36}
                  color={seatStatus === 'away' ? Colors.primary : Colors.textGray}
                />
                <Text
                  style={[
                    styles.seatStatusText,
                    seatStatus === 'away' && styles.seatStatusTextActive,
                  ]}
                >
                  离座
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconFont name="bianji" size={14} color={Colors.textGray} />
              <Text style={styles.sectionTitle}>气囊状态</Text>
            </View>
            <View style={styles.airbagStatusCard}>
              <Text style={styles.bodyTypeText}>当前为自适应调节状态</Text>
              <View style={styles.seatThumbnail}>
                <SeatDiagram
                  activeZone={null}
                  scale={0.55}
                  showAllActive
                  values={airbagValues}
                />
              </View>
              <View style={styles.divider} />
              <TouchableOpacity onPress={onNavigateToCustomize} activeOpacity={0.7}>
                <View style={styles.customizeLinkRow}>
                  <IconFont name="keshihuatiaojie" size={14} color={Colors.primary} />
                  <Text style={styles.customizeLink}>自定义气囊调节</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.rightPanel}>
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
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.toggleText,
                    adaptiveEnabled && styles.toggleTextActive,
                  ]}
                >
                  开启
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  !adaptiveEnabled && styles.toggleButtonInactive,
                ]}
                onPress={() => setAdaptiveEnabled(false)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !adaptiveEnabled && styles.toggleTextInactive,
                  ]}
                >
                  关闭
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.seat3DContainer}>
            <CarAirRN data={sensorData as unknown as never[]} style={styles.carAir3D} />
          </View>
        </View>
      </View>

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
  leftPanel: {
    width: SCREEN_WIDTH * 0.35,
    paddingRight: Spacing.xl,
  },
  rightPanel: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.xl,
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
  airbagStatusCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  bodyTypeText: {
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
