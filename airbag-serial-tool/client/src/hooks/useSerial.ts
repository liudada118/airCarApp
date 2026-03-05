import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_SERIAL_OPTIONS,
  FRAME_LENGTH,
  FRAME_HEAD,
  FRAME_TAIL,
  bytesToHex,
  decodeFrame,
  type FrameData,
  type LogEntry,
  type SerialConfig,
} from "@/lib/protocol";
import { nanoid } from "nanoid";

/** Minimal typing for a Web Serial port object */
interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface PortEntry {
  /** Internal index used to identify the port in the list */
  index: number;
  /** The underlying Web Serial port object */
  port: any;
  /** Human-readable label */
  label: string;
  /** USB vendor / product info (if available) */
  info: SerialPortInfo;
}

export interface UseSerialReturn {
  isConnected: boolean;
  isConnecting: boolean;
  config: SerialConfig;
  setConfig: (c: SerialConfig) => void;
  /** Available (already-authorised) serial ports */
  ports: PortEntry[];
  /** Currently selected port index (-1 = none) */
  selectedPortIndex: number;
  setSelectedPortIndex: (idx: number) => void;
  /** Refresh the list of authorised ports */
  refreshPorts: () => Promise<void>;
  /** Request a *new* port via the browser picker and add it to the list */
  requestNewPort: () => Promise<void>;
  /** Connect to the currently selected port */
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (data: Uint8Array) => Promise<void>;
  logs: LogEntry[];
  clearLogs: () => void;
  lastReceived: FrameData | null;
  error: string | null;
}

function buildPortLabel(port: any, idx: number): string {
  try {
    const info: SerialPortInfo = port.getInfo?.() ?? {};
    if (info.usbVendorId) {
      const vid = info.usbVendorId.toString(16).toUpperCase().padStart(4, "0");
      const pid = (info.usbProductId ?? 0).toString(16).toUpperCase().padStart(4, "0");
      return `USB 串口 (VID:${vid} PID:${pid})`;
    }
  } catch {
    // getInfo may not be available
  }
  return `串口设备 ${idx + 1}`;
}

export function useSerial(): UseSerialReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [config, setConfig] = useState<SerialConfig>({ ...DEFAULT_SERIAL_OPTIONS });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastReceived, setLastReceived] = useState<FrameData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [selectedPortIndex, setSelectedPortIndex] = useState<number>(-1);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const readingRef = useRef(false);
  const bufferRef = useRef<number[]>([]);

  // ── Port enumeration ──────────────────────────────────────
  const refreshPorts = useCallback(async () => {
    if (!("serial" in navigator)) return;
    try {
      const rawPorts: any[] = await (navigator as any).serial.getPorts();
      const entries: PortEntry[] = rawPorts.map((p, i) => ({
        index: i,
        port: p,
        label: buildPortLabel(p, i),
        info: p.getInfo?.() ?? {},
      }));
      setPorts(entries);

      // Auto-select first port if nothing selected yet
      if (entries.length > 0 && selectedPortIndex === -1) {
        setSelectedPortIndex(0);
      }
      // If current selection is out of range, reset
      if (selectedPortIndex >= entries.length) {
        setSelectedPortIndex(entries.length > 0 ? 0 : -1);
      }
    } catch (err: any) {
      console.error("Failed to enumerate ports:", err);
    }
  }, [selectedPortIndex]);

  /** Request a brand-new port via the browser permission dialog */
  const requestNewPort = useCallback(async () => {
    if (!("serial" in navigator)) {
      setError("当前浏览器不支持 Web Serial API，请使用 Chrome/Edge 浏览器");
      return;
    }
    try {
      await (navigator as any).serial.requestPort();
      // After granting, refresh the full list
      await refreshPorts();
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        setError(`请求串口失败: ${err.message}`);
      }
    }
  }, [refreshPorts]);

  // Listen for connect / disconnect events
  useEffect(() => {
    if (!("serial" in navigator)) return;
    const serial = (navigator as any).serial;

    const onConnect = () => { refreshPorts(); };
    const onDisconnect = () => { refreshPorts(); };

    serial.addEventListener("connect", onConnect);
    serial.addEventListener("disconnect", onDisconnect);

    // Initial enumeration
    refreshPorts();

    return () => {
      serial.removeEventListener("connect", onConnect);
      serial.removeEventListener("disconnect", onDisconnect);
    };
  }, [refreshPorts]);

  // ── Logging ───────────────────────────────────────────────
  const addLog = useCallback((entry: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs((prev) => {
      const newLog: LogEntry = {
        ...entry,
        id: nanoid(),
        timestamp: Date.now(),
      };
      const updated = [newLog, ...prev];
      return updated.length > 500 ? updated.slice(0, 500) : updated;
    });
  }, []);

  // ── Frame parsing ─────────────────────────────────────────
  const processBuffer = useCallback(() => {
    const buffer = bufferRef.current;
    while (buffer.length >= FRAME_LENGTH) {
      const headIdx = buffer.indexOf(FRAME_HEAD);
      if (headIdx === -1) {
        bufferRef.current = [];
        return;
      }
      if (headIdx > 0) {
        buffer.splice(0, headIdx);
      }
      if (buffer.length < FRAME_LENGTH) return;

      const candidate = buffer.slice(0, FRAME_LENGTH);
      if (
        candidate[51] === FRAME_TAIL[0] &&
        candidate[52] === FRAME_TAIL[1] &&
        candidate[53] === FRAME_TAIL[2] &&
        candidate[54] === FRAME_TAIL[3]
      ) {
        const bytes = new Uint8Array(candidate);
        const parsed = decodeFrame(bytes);
        const rawHex = bytesToHex(bytes);

        if (parsed) {
          setLastReceived(parsed);
          addLog({ direction: "receive", rawHex, parsed });
        } else {
          addLog({ direction: "receive", rawHex, parsed: null, error: "解析失败" });
        }
        buffer.splice(0, FRAME_LENGTH);
      } else {
        buffer.splice(0, 1);
      }
    }
  }, [addLog]);

  // ── Reading loop ──────────────────────────────────────────
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
      if (readingRef.current) {
        setError(`读取错误: ${err.message}`);
      }
    }
  }, [processBuffer]);

  // ── Connect ───────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!("serial" in navigator)) {
      setError("当前浏览器不支持 Web Serial API，请使用 Chrome/Edge 浏览器");
      return;
    }
    setIsConnecting(true);
    setError(null);

    try {
      let port: any;

      if (selectedPortIndex >= 0 && selectedPortIndex < ports.length) {
        // Use the selected port from the dropdown
        port = ports[selectedPortIndex].port;
      } else {
        // Fallback: open the browser picker
        port = await (navigator as any).serial.requestPort();
      }

      await port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
      });
      portRef.current = port;
      setIsConnected(true);
      startReading(port);
    } catch (err: any) {
      setError(`连接失败: ${err.message}`);
    } finally {
      setIsConnecting(false);
    }
  }, [config, startReading, selectedPortIndex, ports]);

  // ── Disconnect ────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    readingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (writerRef.current) {
        await writerRef.current.close();
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch (err: any) {
      console.error("Disconnect error:", err);
    }
    setIsConnected(false);
    setLastReceived(null);
    bufferRef.current = [];
  }, []);

  // ── Send ──────────────────────────────────────────────────
  const send = useCallback(async (data: Uint8Array) => {
    if (!portRef.current?.writable) {
      setError("串口未连接或不可写");
      return;
    }
    try {
      const writer = portRef.current.writable.getWriter();
      await writer.write(data);
      writer.releaseLock();

      const rawHex = bytesToHex(data);
      const parsed = decodeFrame(data);
      addLog({ direction: "send", rawHex, parsed });
    } catch (err: any) {
      setError(`发送失败: ${err.message}`);
    }
  }, [addLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    isConnected,
    isConnecting,
    config,
    setConfig,
    ports,
    selectedPortIndex,
    setSelectedPortIndex,
    refreshPorts,
    requestNewPort,
    connect,
    disconnect,
    send,
    logs,
    clearLogs,
    lastReceived,
    error,
  };
}
