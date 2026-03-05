import { useCallback, useRef, useState } from "react";
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

export interface UseSerialReturn {
  isConnected: boolean;
  isConnecting: boolean;
  config: SerialConfig;
  setConfig: (c: SerialConfig) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (data: Uint8Array) => Promise<void>;
  logs: LogEntry[];
  clearLogs: () => void;
  lastReceived: FrameData | null;
  error: string | null;
}

export function useSerial(): UseSerialReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [config, setConfig] = useState<SerialConfig>({ ...DEFAULT_SERIAL_OPTIONS });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastReceived, setLastReceived] = useState<FrameData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const readingRef = useRef(false);
  const bufferRef = useRef<number[]>([]);

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

  const connect = useCallback(async () => {
    if (!("serial" in navigator)) {
      setError("当前浏览器不支持 Web Serial API，请使用 Chrome/Edge 浏览器");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const port = await (navigator as any).serial.requestPort();
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
  }, [config, startReading]);

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
    connect,
    disconnect,
    send,
    logs,
    clearLogs,
    lastReceived,
    error,
  };
}
