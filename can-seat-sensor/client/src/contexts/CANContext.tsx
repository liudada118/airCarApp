/**
 * CAN设备管理上下文
 * 管理CAN设备连接、数据接收、模拟器状态
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
  bytesToHex,
  canIdToString,
  SENSOR_MAP,
  FRAME_DELIMITER,
  parseCANMessage,
  type CANFrame,
} from "@/lib/canProtocol";
import {
  CANSimulator,
  DEFAULT_SIMULATOR_CONFIG,
  type SimulatorConfig,
  type SimulationMode,
} from "@/lib/canSimulator";
import { nanoid } from "nanoid";

// ─── 连接状态 ───────────────────────────────────────────
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "simulating";

export interface DeviceInfo {
  canId: number;
  name: string;
  status: ConnectionStatus;
  data: SensorData;
  frameRate: number;
}

// ─── Context 类型 ───────────────────────────────────────
export interface CANContextValue {
  // 连接状态
  connectionStatus: ConnectionStatus;
  isSimulating: boolean;

  // 设备数据
  backrestData: SensorData;
  cushionData: SensorData;
  activeDevice: number; // CAN_ID_BACKREST or CAN_ID_CUSHION
  setActiveDevice: (canId: number) => void;

  // 串口配置
  config: SerialConfig;
  setConfig: (c: SerialConfig) => void;

  // 串口设备
  ports: PortEntry[];
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
}

interface PortEntry {
  index: number;
  port: any;
  label: string;
  info: any;
}

const CANContext = createContext<CANContextValue | null>(null);

function buildPortLabel(port: any, idx: number): string {
  try {
    const info = port.getInfo?.() ?? {};
    if (info.usbVendorId) {
      const vid = info.usbVendorId.toString(16).toUpperCase().padStart(4, "0");
      const pid = (info.usbProductId ?? 0).toString(16).toUpperCase().padStart(4, "0");
      return `CAN 适配器 (VID:${vid} PID:${pid})`;
    }
  } catch { /* ignore */ }
  return `CAN 设备 ${idx + 1}`;
}

export function CANProvider({ children }: { children: React.ReactNode }) {
  // ── 状态 ─────────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [backrestData, setBackrestData] = useState<SensorData>(createEmptySensorData());
  const [cushionData, setCushionData] = useState<SensorData>(createEmptySensorData());
  const [activeDevice, setActiveDevice] = useState<number>(CAN_ID_BACKREST);
  const [config, setConfig] = useState<SerialConfig>({ ...DEFAULT_SERIAL_CONFIG });
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [selectedPortIndex, setSelectedPortIndex] = useState(-1);
  const [simulatorConfig, setSimulatorConfigState] = useState<SimulatorConfig>({ ...DEFAULT_SIMULATOR_CONFIG });
  const [adcThreshold, setAdcThreshold] = useState(5);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [frameRate, setFrameRate] = useState(0);

  const simulatorRef = useRef<CANSimulator | null>(null);
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const readingRef = useRef(false);
  const bufferRef = useRef<number[]>([]);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(Date.now());

  // ── 帧率计算 ─────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFrameTimeRef.current) / 1000;
      if (elapsed > 0) {
        setFrameRate(Math.round(frameCountRef.current / elapsed));
        frameCountRef.current = 0;
        lastFrameTimeRef.current = now;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── 日志 ─────────────────────────────────────────────
  const addLog = useCallback((entry: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs((prev) => {
      const newLog: LogEntry = { ...entry, id: nanoid(), timestamp: Date.now() };
      const updated = [newLog, ...prev];
      return updated.length > 500 ? updated.slice(0, 500) : updated;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  // ── 模拟器数据回调 ───────────────────────────────────
  const handleSimData = useCallback((canId: number, data: SensorData) => {
    frameCountRef.current++;
    if (canId === CAN_ID_BACKREST) {
      setBackrestData(data);
    } else if (canId === CAN_ID_CUSHION) {
      setCushionData(data);
    }
  }, []);

  // ── 串口枚举 ─────────────────────────────────────────
  const isSerialAvailable = useCallback((): boolean => {
    try {
      return "serial" in navigator && !!(navigator as any).serial;
    } catch { return false; }
  }, []);

  const refreshPorts = useCallback(async () => {
    if (!isSerialAvailable()) return;
    try {
      const rawPorts: any[] = await (navigator as any).serial.getPorts();
      const entries: PortEntry[] = rawPorts.map((p, i) => ({
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
  }, [selectedPortIndex, isSerialAvailable]);

  const requestNewPort = useCallback(async () => {
    if (!isSerialAvailable()) {
      setError("当前浏览器不支持 Web Serial API，请使用 Chrome/Edge 浏览器");
      return;
    }
    try {
      await (navigator as any).serial.requestPort();
      await refreshPorts();
    } catch (err: any) {
      if (err.name !== "NotFoundError") setError(`请求设备失败: ${err.message}`);
    }
  }, [refreshPorts, isSerialAvailable]);

  // ── 串口数据解析 ─────────────────────────────────────
  const processBuffer = useCallback(() => {
    const buffer = bufferRef.current;
    // 寻找帧分隔符 0xAA 0x55 0x03 0x99
    while (buffer.length >= DATA_LENGTH_TOTAL) {
      const delimIdx = findDelimiter(buffer);
      if (delimIdx === -1) {
        // 保留最后几个字节以防分隔符跨越
        if (buffer.length > 4) {
          bufferRef.current = buffer.slice(-4);
        }
        return;
      }
      if (delimIdx > 0) {
        buffer.splice(0, delimIdx);
      }
      if (buffer.length < DATA_LENGTH_TOTAL) return;

      // 跳过4字节分隔符
      const dataStart = 4;
      const dataEnd = dataStart + 1024;

      // 解析CAN帧（每8字节一个CAN报文）
      // 前半部分为靠背(0x460)，后半部分为坐垫(0x461)
      // 实际上协议中CAN ID是通过CAN总线传输的，串口转发时可能有不同封装
      // 这里简化处理：前512字节为靠背，后512字节为坐垫
      const timestamp = Date.now();

      // 解析靠背数据（前512字节）
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

      // 解析坐垫数据（后512字节）
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

  // ── 串口读取循环 ─────────────────────────────────────
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

  // ── 连接 ─────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!isSerialAvailable()) {
      setError("当前浏览器不支持 Web Serial API，请使用 Chrome/Edge 浏览器");
      return;
    }
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
  }, [config, startReading, selectedPortIndex, ports, isSerialAvailable]);

  // ── 断开 ─────────────────────────────────────────────
  const disconnect = useCallback(async () => {
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

  // ── 模拟器控制 ───────────────────────────────────────
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

  // ── 串口事件监听 ─────────────────────────────────────
  useEffect(() => {
    if (!isSerialAvailable()) return;
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
  }, [refreshPorts, isSerialAvailable]);

  // ── 清理 ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (simulatorRef.current) simulatorRef.current.stop();
    };
  }, []);

  const value: CANContextValue = {
    connectionStatus,
    isSimulating: connectionStatus === "simulating",
    backrestData,
    cushionData,
    activeDevice,
    setActiveDevice,
    config,
    setConfig,
    ports,
    selectedPortIndex,
    setSelectedPortIndex,
    refreshPorts,
    requestNewPort,
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
  };

  return <CANContext.Provider value={value}>{children}</CANContext.Provider>;
}

export function useCANContext(): CANContextValue {
  const ctx = useContext(CANContext);
  if (!ctx) throw new Error("useCANContext must be used within CANProvider");
  return ctx;
}

// ── 辅助函数 ───────────────────────────────────────────
const DATA_LENGTH_TOTAL = 1028; // 4字节分隔符 + 1024字节数据

function findDelimiter(buffer: number[]): number {
  for (let i = 0; i <= buffer.length - 4; i++) {
    if (
      buffer[i] === FRAME_DELIMITER[0] &&
      buffer[i + 1] === FRAME_DELIMITER[1] &&
      buffer[i + 2] === FRAME_DELIMITER[2] &&
      buffer[i + 3] === FRAME_DELIMITER[3]
    ) {
      return i;
    }
  }
  return -1;
}

function getSubIdIndex(subId: number): number {
  return SENSOR_MAP.findIndex(m => m.subId === subId);
}
