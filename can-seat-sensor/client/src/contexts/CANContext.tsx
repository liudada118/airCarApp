/**
 * CAN设备管理上下文
 * 支持两种连接模式：
 * 1. WebUSB (candleLight/gs_usb) — 直接通过USB与CAN适配器通信
 * 2. Web Serial — 通过串口连接CAN适配器
 */
import { createContext, useContext, useCallback, useState, useRef, useEffect } from "react";
import {
  CAN_ID_BACKREST,
  CAN_ID_CUSHION,
  type SensorData,
  type LogEntry,
  type SerialConfig,
  DEFAULT_SERIAL_CONFIG,
  BAUD_RATE_OPTIONS,
  createEmptySensorData,
  SENSOR_MAP,
  FRAME_DELIMITER,
  parseCANMessage,
  bytesToHex,
  type CANFrame,
} from "@/lib/canProtocol";
import {
  CANSimulator,
  DEFAULT_SIMULATOR_CONFIG,
  type SimulatorConfig,
  type SimulationMode,
} from "@/lib/canSimulator";
import {
  CandleLightDevice,
  type CANFrameRaw,
  type CandleLightStatus,
} from "@/lib/candleLight";
import { nanoid } from "nanoid";

// ─── 连接模式 ───────────────────────────────────────────
export type TransportMode = "webusb" | "serial";
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "simulating";

export interface USBDeviceEntry {
  device: USBDevice;
  label: string;
  vendorId: number;
  productId: number;
}

export interface SerialPortEntry {
  index: number;
  port: any;
  label: string;
  info: any;
}

// ─── Context 类型 ───────────────────────────────────────
export interface CANContextValue {
  // 连接模式
  transportMode: TransportMode;
  setTransportMode: (mode: TransportMode) => void;
  isWebUSBAvailable: boolean;
  isSerialAvailable: boolean;

  // 连接状态
  connectionStatus: ConnectionStatus;
  isSimulating: boolean;

  // 设备数据
  backrestData: SensorData;
  cushionData: SensorData;
  activeDevice: number;
  setActiveDevice: (canId: number) => void;

  // CAN 波特率配置
  canBitrate: number;
  setCanBitrate: (rate: number) => void;

  // 串口配置 (仅 serial 模式)
  config: SerialConfig;
  setConfig: (c: SerialConfig) => void;

  // WebUSB 设备 (仅 webusb 模式)
  usbDevices: USBDeviceEntry[];
  selectedUSBDeviceIndex: number;
  setSelectedUSBDeviceIndex: (idx: number) => void;
  scanUSBDevices: () => Promise<void>;
  requestUSBDevice: () => Promise<void>;

  // 串口设备 (仅 serial 模式)
  ports: SerialPortEntry[];
  selectedPortIndex: number;
  setSelectedPortIndex: (idx: number) => void;
  refreshPorts: () => Promise<void>;
  requestNewPort: () => Promise<void>;

  // 连接操作
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // 模拟器
  simulatorConfig: SimulatorConfig;
  setSimulatorConfig: (c: Partial<SimulatorConfig>) => void;
  startSimulation: () => void;
  stopSimulation: () => void;

  // 过滤
  adcThreshold: number;
  setAdcThreshold: (v: number) => void;

  // 日志
  logs: LogEntry[];
  clearLogs: () => void;

  // 错误
  error: string | null;

  // 帧率
  frameRate: number;
  frameCount: number;
}

const CANContext = createContext<CANContextValue | null>(null);

// ─── 辅助函数 ───────────────────────────────────────────
function buildPortLabel(port: any, idx: number): string {
  try {
    const info = port.getInfo?.() ?? {};
    if (info.usbVendorId) {
      const vid = info.usbVendorId.toString(16).toUpperCase().padStart(4, "0");
      const pid = (info.usbProductId ?? 0).toString(16).toUpperCase().padStart(4, "0");
      return `串口设备 (VID:${vid} PID:${pid})`;
    }
  } catch { /* ignore */ }
  return `串口设备 ${idx + 1}`;
}

function buildUSBDeviceLabel(device: USBDevice): string {
  const name = device.productName || "USB-CAN Adapter";
  const vid = (device.vendorId ?? 0).toString(16).toUpperCase().padStart(4, "0");
  const pid = (device.productId ?? 0).toString(16).toUpperCase().padStart(4, "0");
  return `${name} (${vid}:${pid})`;
}

const DATA_LENGTH_TOTAL = 1028;

function findDelimiter(buffer: number[]): number {
  for (let i = 0; i <= buffer.length - 4; i++) {
    if (
      buffer[i] === FRAME_DELIMITER[0] &&
      buffer[i + 1] === FRAME_DELIMITER[1] &&
      buffer[i + 2] === FRAME_DELIMITER[2] &&
      buffer[i + 3] === FRAME_DELIMITER[3]
    ) return i;
  }
  return -1;
}

function getSubIdIndex(subId: number): number {
  return SENSOR_MAP.findIndex(m => m.subId === subId);
}

// ─── Provider ───────────────────────────────────────────
export function CANProvider({ children }: { children: React.ReactNode }) {
  // ── 连接模式 ────────────────────────────────────────
  const webUSBAvailable = CandleLightDevice.isAvailable();
  const serialAvailable = (() => {
    try { return "serial" in navigator && !!(navigator as any).serial; } catch { return false; }
  })();

  const [transportMode, setTransportMode] = useState<TransportMode>(
    webUSBAvailable ? "webusb" : "serial"
  );

  // ── 状态 ────────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [backrestData, setBackrestData] = useState<SensorData>(createEmptySensorData());
  const [cushionData, setCushionData] = useState<SensorData>(createEmptySensorData());
  const [activeDevice, setActiveDevice] = useState<number>(CAN_ID_BACKREST);
  const [canBitrate, setCanBitrate] = useState(500000);
  const [config, setConfig] = useState<SerialConfig>({ ...DEFAULT_SERIAL_CONFIG });
  const [error, setError] = useState<string | null>(null);
  const [frameRate, setFrameRate] = useState(0);

  // WebUSB 设备列表
  const [usbDevices, setUsbDevices] = useState<USBDeviceEntry[]>([]);
  const [selectedUSBDeviceIndex, setSelectedUSBDeviceIndex] = useState(-1);

  // Serial 端口列表
  const [ports, setPorts] = useState<SerialPortEntry[]>([]);
  const [selectedPortIndex, setSelectedPortIndex] = useState(-1);

  // 模拟器
  const [simulatorConfig, setSimulatorConfigState] = useState<SimulatorConfig>({ ...DEFAULT_SIMULATOR_CONFIG });
  const [adcThreshold, setAdcThreshold] = useState(5);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Refs
  const simulatorRef = useRef<CANSimulator | null>(null);
  const candleLightRef = useRef<CandleLightDevice | null>(null);
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const readingRef = useRef(false);
  const bufferRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const [frameCount, setFrameCount] = useState(0);
  const lastFrameTimeRef = useRef(Date.now());

  // ── 帧率计算 ────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFrameTimeRef.current) / 1000;
      if (elapsed > 0) {
        const count = frameCountRef.current;
        setFrameRate(Math.round(count / elapsed));
        setFrameCount(prev => prev + count);
        frameCountRef.current = 0;
        lastFrameTimeRef.current = now;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── 日志 ────────────────────────────────────────────
  const addLog = useCallback((entry: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs(prev => {
      const newLog: LogEntry = { ...entry, id: nanoid(), timestamp: Date.now() };
      const updated = [newLog, ...prev];
      return updated.length > 500 ? updated.slice(0, 500) : updated;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // ── 模拟器数据回调 ──────────────────────────────────
  const handleSimData = useCallback((canId: number, data: SensorData) => {
    frameCountRef.current++;
    if (canId === CAN_ID_BACKREST) setBackrestData(data);
    else if (canId === CAN_ID_CUSHION) setCushionData(data);
  }, []);

  // ════════════════════════════════════════════════════
  // WebUSB (candleLight) 相关
  // ════════════════════════════════════════════════════

  // 处理 CAN 帧回调
  const handleCANFrame = useCallback((frame: CANFrameRaw) => {
    frameCountRef.current++;
    const canId = frame.canId;
    const timestamp = frame.timestamp;

    // 防御性检查：数据长度至少2字节（subId + 1个数据字节）
    if (!frame.data || frame.data.length < 2) {
      console.warn(`[CAN] 异常帧: canId=0x${canId.toString(16)}, len=${frame.data?.length ?? 0}`);
      return;
    }

    // 日志记录（前50帧详细记录，之后每100帧记录一次）
    const fc = frameCountRef.current;
    if (fc <= 50 || fc % 100 === 0) {
      const subId = frame.data[0];
      addLog({
        direction: "receive",
        canId,
        subId,
        rawHex: bytesToHex(frame.data),
        sensorValues: Array.from(frame.data.slice(1, 8)).map((v, i) => ({
          id: `byte${i + 1}`,
          value: v,
        })),
      });
    }

    // 只处理我们关心的 CAN ID
    if (canId !== CAN_ID_BACKREST && canId !== CAN_ID_CUSHION) {
      if (frameCountRef.current <= 20) {
        console.info(`[CAN] 忽略未知CAN ID: 0x${canId.toString(16).toUpperCase()}`);
      }
      return;
    }

    // 构建 CANFrame 用于解析
    const canFrame: CANFrame = {
      canId,
      rawBytes: frame.data,
      timestamp,
    };

    if (canId === CAN_ID_BACKREST) {
      setBackrestData(prev => parseCANMessage(canFrame, prev));
    } else {
      setCushionData(prev => parseCANMessage(canFrame, prev));
    }
  }, [addLog]);

  // 扫描已授权的 USB 设备
  const scanUSBDevices = useCallback(async () => {
    if (!webUSBAvailable) return;
    const cl = new CandleLightDevice();
    try {
      const devices = await cl.getDevices();
      const entries: USBDeviceEntry[] = devices.map(d => ({
        device: d,
        label: buildUSBDeviceLabel(d),
        vendorId: d.vendorId,
        productId: d.productId,
      }));
      setUsbDevices(entries);
      if (entries.length > 0 && selectedUSBDeviceIndex === -1) setSelectedUSBDeviceIndex(0);
      if (selectedUSBDeviceIndex >= entries.length) setSelectedUSBDeviceIndex(entries.length > 0 ? 0 : -1);
    } catch (err) {
      console.error("Scan USB devices failed:", err);
    }
  }, [webUSBAvailable, selectedUSBDeviceIndex]);

  // 请求新的 USB 设备（弹出浏览器选择框）
  const requestUSBDevice = useCallback(async () => {
    if (!webUSBAvailable) {
      setError("当前浏览器不支持 WebUSB API，请使用 Chrome/Edge 浏览器");
      return;
    }
    const cl = new CandleLightDevice();
    try {
      const device = await cl.requestDevice();
      if (device) {
        await scanUSBDevices();
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        setError(`请求USB设备失败: ${err.message}`);
      }
    }
  }, [webUSBAvailable, scanUSBDevices]);

  // WebUSB 连接
  const connectWebUSB = useCallback(async () => {
    setConnectionStatus("connecting");
    setError(null);

    try {
      let device: USBDevice;
      if (selectedUSBDeviceIndex >= 0 && selectedUSBDeviceIndex < usbDevices.length) {
        device = usbDevices[selectedUSBDeviceIndex].device;
      } else {
        // 弹出选择框
        const cl = new CandleLightDevice();
        const d = await cl.requestDevice();
        if (!d) {
          setConnectionStatus("disconnected");
          return;
        }
        device = d;
      }

      const cl = new CandleLightDevice();
      candleLightRef.current = cl;

      // 注册帧回调
      cl.on("frame", handleCANFrame);
      cl.on("error", (err) => {
        console.error("CandleLight error:", err);
        setError(`CAN通信错误: ${err.message}`);
      });
      cl.on("statusChange", (status) => {
        if (status === "error" || status === "disconnected") {
          setConnectionStatus("disconnected");
        }
      });

      await cl.connect(device, canBitrate);
      setConnectionStatus("connected");
    } catch (err: any) {
      setError(`连接失败: ${err.message}`);
      setConnectionStatus("disconnected");
      candleLightRef.current = null;
    }
  }, [selectedUSBDeviceIndex, usbDevices, canBitrate, handleCANFrame]);

  // WebUSB 断开
  const disconnectWebUSB = useCallback(async () => {
    if (candleLightRef.current) {
      await candleLightRef.current.disconnect();
      candleLightRef.current = null;
    }
    setConnectionStatus("disconnected");
  }, []);

  // ════════════════════════════════════════════════════
  // Web Serial 相关
  // ════════════════════════════════════════════════════

  const refreshPorts = useCallback(async () => {
    if (!serialAvailable) return;
    try {
      const rawPorts: any[] = await (navigator as any).serial.getPorts();
      const entries: SerialPortEntry[] = rawPorts.map((p, i) => ({
        index: i, port: p, label: buildPortLabel(p, i), info: p.getInfo?.() ?? {},
      }));
      setPorts(entries);
      if (entries.length > 0 && selectedPortIndex === -1) setSelectedPortIndex(0);
      if (selectedPortIndex >= entries.length) setSelectedPortIndex(entries.length > 0 ? 0 : -1);
    } catch (err: any) {
      if (!err?.message?.includes("permissions policy")) {
        console.error("Failed to enumerate ports:", err);
      }
    }
  }, [selectedPortIndex, serialAvailable]);

  const requestNewPort = useCallback(async () => {
    if (!serialAvailable) {
      setError("当前浏览器不支持 Web Serial API，请使用 Chrome/Edge 浏览器");
      return;
    }
    try {
      await (navigator as any).serial.requestPort();
      await refreshPorts();
    } catch (err: any) {
      if (err.name !== "NotFoundError") setError(`请求设备失败: ${err.message}`);
    }
  }, [refreshPorts, serialAvailable]);

  // 串口数据解析
  const processBuffer = useCallback(() => {
    const buffer = bufferRef.current;
    while (buffer.length >= DATA_LENGTH_TOTAL) {
      const delimIdx = findDelimiter(buffer);
      if (delimIdx === -1) {
        if (buffer.length > 4) bufferRef.current = buffer.slice(-4);
        return;
      }
      if (delimIdx > 0) buffer.splice(0, delimIdx);
      if (buffer.length < DATA_LENGTH_TOTAL) return;

      const dataStart = 4;
      const timestamp = Date.now();

      // 靠背数据（前512字节）
      for (const mapping of SENSOR_MAP) {
        const idx = getSubIdIndex(mapping.subId);
        if (idx < 0) continue;
        const offset = dataStart + (idx * 8);
        if (offset + 8 > buffer.length) continue;
        const rawBytes = new Uint8Array(buffer.slice(offset, offset + 8));
        const frame: CANFrame = { canId: CAN_ID_BACKREST, rawBytes, timestamp };
        setBackrestData(prev => parseCANMessage(frame, prev));
        frameCountRef.current++;
      }

      // 坐垫数据（后512字节）
      const cushionStart = dataStart + 512;
      for (const mapping of SENSOR_MAP) {
        const idx = getSubIdIndex(mapping.subId);
        if (idx < 0) continue;
        const offset = cushionStart + (idx * 8);
        if (offset + 8 > buffer.length) continue;
        const rawBytes = new Uint8Array(buffer.slice(offset, offset + 8));
        const frame: CANFrame = { canId: CAN_ID_CUSHION, rawBytes, timestamp };
        setCushionData(prev => parseCANMessage(frame, prev));
        frameCountRef.current++;
      }

      buffer.splice(0, DATA_LENGTH_TOTAL);
    }
  }, []);

  const startReading = useCallback(async (port: any) => {
    readingRef.current = true;
    bufferRef.current = [];
    try {
      while (port.readable && readingRef.current) {
        const reader = port.readable.getReader();
        readerRef.current = reader;
        try {
          while (readingRef.current) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              bufferRef.current.push(...value);
              processBuffer();
            }
          }
        } finally {
          reader.releaseLock();
          readerRef.current = null;
        }
      }
    } catch (err: any) {
      if (readingRef.current) setError(`读取错误: ${err.message}`);
    }
  }, [processBuffer]);

  const connectSerial = useCallback(async () => {
    setConnectionStatus("connecting");
    setError(null);
    try {
      let port: any;
      if (selectedPortIndex >= 0 && selectedPortIndex < ports.length) {
        port = ports[selectedPortIndex].port;
      } else {
        port = await (navigator as any).serial.requestPort();
      }
      await port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
      });
      portRef.current = port;
      setConnectionStatus("connected");
      startReading(port);
    } catch (err: any) {
      setError(`连接失败: ${err.message}`);
      setConnectionStatus("disconnected");
    }
  }, [config, startReading, selectedPortIndex, ports]);

  const disconnectSerial = useCallback(async () => {
    readingRef.current = false;
    try {
      if (readerRef.current) await readerRef.current.cancel();
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (err: any) {
      console.error("Disconnect error:", err);
    }
    setConnectionStatus("disconnected");
    bufferRef.current = [];
  }, []);

  // ════════════════════════════════════════════════════
  // 统一连接/断开接口
  // ════════════════════════════════════════════════════

  const connect = useCallback(async () => {
    if (transportMode === "webusb") {
      await connectWebUSB();
    } else {
      await connectSerial();
    }
  }, [transportMode, connectWebUSB, connectSerial]);

  const disconnect = useCallback(async () => {
    if (transportMode === "webusb") {
      await disconnectWebUSB();
    } else {
      await disconnectSerial();
    }
    setBackrestData(createEmptySensorData());
    setCushionData(createEmptySensorData());
  }, [transportMode, disconnectWebUSB, disconnectSerial]);

  // ── 模拟器控制 ──────────────────────────────────────
  const startSimulation = useCallback(() => {
    if (simulatorRef.current) simulatorRef.current.stop();
    const sim = new CANSimulator(simulatorConfig, handleSimData);
    simulatorRef.current = sim;
    sim.startDual();
    setConnectionStatus("simulating");
    setError(null);
  }, [simulatorConfig, handleSimData]);

  const stopSimulation = useCallback(() => {
    if (simulatorRef.current) {
      simulatorRef.current.stop();
      simulatorRef.current = null;
    }
    setConnectionStatus("disconnected");
    setBackrestData(createEmptySensorData());
    setCushionData(createEmptySensorData());
  }, []);

  const setSimulatorConfig = useCallback((c: Partial<SimulatorConfig>) => {
    setSimulatorConfigState(prev => {
      const next = { ...prev, ...c };
      if (simulatorRef.current?.isRunning()) {
        simulatorRef.current.updateConfig(next);
      }
      return next;
    });
  }, []);

  // ── 事件监听 ────────────────────────────────────────
  useEffect(() => {
    // WebUSB 设备连接/断开事件
    if (webUSBAvailable) {
      const onUSBConnect = () => scanUSBDevices();
      const onUSBDisconnect = () => scanUSBDevices();
      navigator.usb.addEventListener("connect", onUSBConnect);
      navigator.usb.addEventListener("disconnect", onUSBDisconnect);
      scanUSBDevices();
      return () => {
        navigator.usb.removeEventListener("connect", onUSBConnect);
        navigator.usb.removeEventListener("disconnect", onUSBDisconnect);
      };
    }
  }, [webUSBAvailable, scanUSBDevices]);

  useEffect(() => {
    // Web Serial 设备连接/断开事件
    if (serialAvailable) {
      let serial: any;
      try { serial = (navigator as any).serial; } catch { return; }
      const onConnect = () => refreshPorts();
      const onDisconnect = () => refreshPorts();
      try {
        serial.addEventListener("connect", onConnect);
        serial.addEventListener("disconnect", onDisconnect);
        refreshPorts();
      } catch { return; }
      return () => {
        try {
          serial.removeEventListener("connect", onConnect);
          serial.removeEventListener("disconnect", onDisconnect);
        } catch { /* ignore */ }
      };
    }
  }, [refreshPorts, serialAvailable]);

  // ── 清理 ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (simulatorRef.current) simulatorRef.current.stop();
      if (candleLightRef.current) candleLightRef.current.disconnect();
    };
  }, []);

  const value: CANContextValue = {
    transportMode,
    setTransportMode,
    isWebUSBAvailable: webUSBAvailable,
    isSerialAvailable: serialAvailable,
    connectionStatus,
    isSimulating: connectionStatus === "simulating",
    backrestData,
    cushionData,
    activeDevice,
    setActiveDevice,
    canBitrate,
    setCanBitrate,
    config,
    setConfig,
    ports,
    selectedPortIndex,
    setSelectedPortIndex,
    refreshPorts,
    requestNewPort,
    usbDevices,
    selectedUSBDeviceIndex,
    setSelectedUSBDeviceIndex,
    scanUSBDevices,
    requestUSBDevice,
    connect,
    disconnect,
    simulatorConfig,
    setSimulatorConfig,
    startSimulation,
    stopSimulation,
    adcThreshold,
    setAdcThreshold,
    logs,
    clearLogs,
    error,
    frameRate,
    frameCount,
  };

  return <CANContext.Provider value={value}>{children}</CANContext.Provider>;
}

export function useCANContext(): CANContextValue {
  const ctx = useContext(CANContext);
  if (!ctx) throw new Error("useCANContext must be used within CANProvider");
  return ctx;
}
