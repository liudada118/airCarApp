import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { ConnectionStatus } from '../types';

type SerialMode = 'auto' | 'manual' | 'unknown';

export interface SerialDevice {
  vendorId: number;
  productId: number;
  deviceName: string;
}

interface SerialDataEvent {
  data?: string;
}

interface SerialResultEvent {
  data?: string;
  result?: string;
  error?: string;
}

interface SerialModeEvent {
  modeValue?: number;
  auto?: boolean;
  manual?: boolean;
}

interface SerialModuleNative {
  listDevices: () => Promise<unknown>;
  open: (vendorId: number, productId: number) => Promise<boolean>;
  openWithOptions?: (
    vendorId: number,
    productId: number,
    options: { baudRate: number },
  ) => Promise<boolean>;
  write?: (text: string) => Promise<boolean>;
  close?: () => void;
  resetPendingOpen?: () => void;
}

export interface SerialConnectionValue {
  isSupported: boolean;
  devices: SerialDevice[];
  connectedDevice: SerialDevice | null;
  connectionStatus: ConnectionStatus;
  connecting: boolean;
  connectionError: string | null;
  lastSerialData: string;
  lastSerialResult: string;
  mode: SerialMode;
  refreshDevices: () => Promise<SerialDevice[]>;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  clearError: () => void;
  send: (text: string) => Promise<boolean>;
}

const DEFAULT_BAUD_RATE = 1000000;
const CH340_VENDOR_ID = 0x1a86;
const CH340_PRODUCT_IDS = new Set([0x7523, 0x5523]);

const SerialContext = createContext<SerialConnectionValue | null>(null);

const nativeSerialModule = (
  NativeModules as { SerialModule?: SerialModuleNative }
).SerialModule;

const serialModule: SerialModuleNative | undefined =
  Platform.OS === 'android' ? nativeSerialModule : undefined;

function normalizeError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  try {
    return JSON.stringify(error);
  } catch (_error) {
    return 'Unknown serial error';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function normalizeDevices(raw: unknown): SerialDevice[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item, index) => {
      const record = item as Record<string, unknown>;
      const vendorId = Number(record.vendorId);
      const productId = Number(record.productId);
      const fallbackName = `USB-${index + 1}`;
      const deviceName =
        typeof record.deviceName === 'string' && record.deviceName.trim()
          ? record.deviceName
          : fallbackName;

      if (!Number.isFinite(vendorId) || !Number.isFinite(productId)) {
        return null;
      }

      return {
        vendorId: Number(vendorId),
        productId: Number(productId),
        deviceName,
      };
    })
    .filter((device): device is SerialDevice => device !== null);
}

function pickTargetDevice(devices: SerialDevice[]): SerialDevice | null {
  if (devices.length === 0) {
    return null;
  }

  const ch340 = devices.find(
    device =>
      device.vendorId === CH340_VENDOR_ID &&
      CH340_PRODUCT_IDS.has(device.productId),
  );

  if (ch340) {
    return ch340;
  }

  const nonZeroProduct = devices.find(device => device.productId !== 0);
  return nonZeroProduct ?? devices[0];
}

export const SerialProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [devices, setDevices] = useState<SerialDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<SerialDevice | null>(
    null,
  );
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastSerialData, setLastSerialData] = useState('');
  const [lastSerialResult, setLastSerialResult] = useState('');
  const [mode, setMode] = useState<SerialMode>('unknown');

  const isSupported = Boolean(serialModule?.listDevices && serialModule?.open);

  const refreshDevices = useCallback(async (): Promise<SerialDevice[]> => {
    if (!serialModule?.listDevices) {
      setDevices([]);
      return [];
    }

    try {
      const list = normalizeDevices(await serialModule.listDevices());
      setDevices(list);
      return list;
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError(normalizeError(error));
      return [];
    }
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!serialModule?.listDevices || !serialModule?.open) {
      setConnectionStatus('error');
      setConnectionError('Serial module is unavailable on this platform.');
      return false;
    }

    if (connecting) {
      return false;
    }

    setConnecting(true);
    setConnectionError(null);

    try {
      let currentDevices = await refreshDevices();
      if (currentDevices.length === 0) {
        throw new Error('No USB serial device found.');
      }

      let target = pickTargetDevice(currentDevices);
      if (!target) {
        throw new Error('No eligible USB serial device found.');
      }

      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        serialModule.resetPendingOpen?.();
        if (attempt > 0) {
          serialModule.close?.();
          await sleep(400 + attempt * 250);
          currentDevices = await refreshDevices();
          target = pickTargetDevice(currentDevices);
          if (!target) {
            break;
          }
        }

        try {
          if (serialModule.openWithOptions) {
            await serialModule.openWithOptions(target.vendorId, target.productId, {
              baudRate: DEFAULT_BAUD_RATE,
            });
          } else {
            await serialModule.open(target.vendorId, target.productId);
          }

          setConnectedDevice(target);
          setConnectionStatus('connected');
          setConnectionError(null);
          return true;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError ?? new Error('Failed to open serial connection.');
    } catch (error) {
      setConnectedDevice(null);
      setConnectionStatus('error');
      setConnectionError(normalizeError(error));
      return false;
    } finally {
      setConnecting(false);
    }
  }, [connecting, refreshDevices]);

  const disconnect = useCallback(() => {
    serialModule?.resetPendingOpen?.();
    serialModule?.close?.();
    setConnectedDevice(null);
    setConnectionStatus('disconnected');
  }, []);

  const clearError = useCallback(() => {
    setConnectionError(null);
    setConnectionStatus(current =>
      current === 'error' ? 'disconnected' : current,
    );
  }, []);

  const send = useCallback(async (text: string): Promise<boolean> => {
    if (!serialModule?.write) {
      setConnectionStatus('error');
      setConnectionError('Serial write is unavailable.');
      return false;
    }

    try {
      await serialModule.write(text);
      return true;
    } catch (error) {
      setConnectionStatus('error');
      setConnectionError(normalizeError(error));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!serialModule) {
      return;
    }

    serialModule.resetPendingOpen?.();
    refreshDevices().catch(() => undefined);

    const emitter = new NativeEventEmitter(serialModule as never);

    const dataSub = emitter.addListener('onSerialData', (event: SerialDataEvent) => {
      const payload = typeof event.data === 'string' ? event.data : '';
      if (!payload) {
        return;
      }
      setLastSerialData(payload);
    });

    const resultSub = emitter.addListener(
      'onSerialResult',
      (event: SerialResultEvent) => {
        if (typeof event.result === 'string' && event.result) {
          setLastSerialResult(event.result);
        }
        if (typeof event.error === 'string' && event.error) {
          setConnectionError(event.error);
        }
      },
    );

    const modeSub = emitter.addListener('onSerialMode', (event: SerialModeEvent) => {
      if (event.auto === true || event.modeValue === 0) {
        setMode('auto');
        return;
      }
      if (event.manual === true || event.modeValue === 1) {
        setMode('manual');
        return;
      }
      setMode('unknown');
    });

    return () => {
      dataSub.remove();
      resultSub.remove();
      modeSub.remove();
      serialModule.close?.();
    };
  }, [refreshDevices]);

  const value = useMemo<SerialConnectionValue>(
    () => ({
      isSupported,
      devices,
      connectedDevice,
      connectionStatus,
      connecting,
      connectionError,
      lastSerialData,
      lastSerialResult,
      mode,
      refreshDevices,
      connect,
      disconnect,
      clearError,
      send,
    }),
    [
      isSupported,
      devices,
      connectedDevice,
      connectionStatus,
      connecting,
      connectionError,
      lastSerialData,
      lastSerialResult,
      mode,
      refreshDevices,
      connect,
      disconnect,
      clearError,
      send,
    ],
  );

  return (
    <SerialContext.Provider value={value}>{children}</SerialContext.Provider>
  );
};

export function useSerialConnection(): SerialConnectionValue | null {
  return useContext(SerialContext);
}
