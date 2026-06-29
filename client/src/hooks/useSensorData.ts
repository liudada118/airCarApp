import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeActiveStats,
  computeConsistency,
  computeRepeatability,
  computeUniformity,
  DEFAULT_ACTIVE_THRESHOLD,
  type BasicStats,
  type ConsistencyResult,
  type RepeatabilityResult,
  type UniformityResult,
} from "@/lib/analysis";
import {
  MockSerialService,
  SerialService,
  type ConnectionStatus,
  type MatrixSize,
  type SerialConfig,
} from "@/lib/serial-service";

const MAX_HISTORY_FRAMES = 100;

/**
 * UI更新节流间隔（毫秒）
 * 约33ms = 30FPS，足以保证视觉流畅且不造成React渲染压力
 */
const UI_THROTTLE_MS = 33;

/**
 * 分析计算节流间隔（帧数）
 * 每10帧做一次分析计算
 */
const ANALYSIS_THROTTLE_FRAMES = 20;

export function useSensorData() {
  const [matrixData, setMatrixData] = useState<number[]>([]);
  const [matrixSize, setMatrixSize] = useState<MatrixSize>("32x32");
  const [adcThreshold, setAdcThreshold] = useState<number>(DEFAULT_ACTIVE_THRESHOLD);
  const [stats, setStats] = useState<BasicStats>({
    min: 0, max: 0, mean: 0, std: 0, median: 0, range: 0,
    activePoints: 0, totalPoints: 0, activeRate: 0,
  });
  const [uniformity, setUniformity] = useState<UniformityResult>({
    rsd: 0, cv: 0, score: 0, grade: "异常",
    stdDev: 0, mean: 0,
    rowMeans: [], colMeans: [],
    maxPoint: [0, 0, 0], minPoint: [0, 0, 0],
  });
  const [repeatability, setRepeatability] = useState<RepeatabilityResult>({
    errorFSO: 0, score: 0, grade: "异常",
    pointStdDevs: [], pointMaxDevs: [],
    meanStdDev: 0, maxDeviation: 0, fso: 255,
    sampleCount: 0, gainRepeatability: 0, baselineDrift: 0,
  });
  const [consistency, setConsistency] = useState<ConsistencyResult>({
    score: 0, grade: "异常",
    spatialScore: 0, temporalScore: 0,
    rowCV: 0, colCV: 0,
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false, portName: "", baudRate: 1000000, framesReceived: 0, fps: 0, lastFrameTime: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [config, setConfig] = useState<SerialConfig>({
    baudRate: 1000000,
    matrixSize: "32x32",
  });

  const serviceRef = useRef<SerialService | MockSerialService | null>(null);
  const historyRef = useRef<number[][]>([]);
  const adcThresholdRef = useRef<number>(DEFAULT_ACTIVE_THRESHOLD);

  // ---- UI节流相关ref ----
  /** 最新帧数据（串口回调写入，UI定时读取） */
  const latestDataRef = useRef<number[] | null>(null);
  /** 最新矩阵规格 */
  const latestSizeRef = useRef<MatrixSize>("32x32");
  /** 上次UI刷新时间戳 */
  const lastUIUpdateRef = useRef<number>(0);
  /** requestAnimationFrame ID */
  const rafIdRef = useRef<number>(0);
  /** 是否有待处理的帧 */
  const pendingFrameRef = useRef<boolean>(false);
  /** 帧计数器（用于分析节流） */
  const frameCountRef = useRef<number>(0);

  // Keep ref in sync with state for use in callbacks
  const updateAdcThreshold = useCallback((value: number) => {
    setAdcThreshold(value);
    adcThresholdRef.current = value;
  }, []);

  const getDim = useCallback((size: MatrixSize): number => {
    switch (size) {
      case "5x5": return 5;
      case "10x10": return 10;
      case "16x16": return 16;
      case "32x32": return 32;
    }
  }, []);

  /**
   * 将最新数据刷新到React状态（在RAF中调用）
   */
  const flushToState = useCallback(() => {
    const data = latestDataRef.current;
    if (!data) return;

    const size = latestSizeRef.current;
    pendingFrameRef.current = false;

    // 更新UI状态
    setMatrixData(data);
    setMatrixSize(size);

    // 分析计算节流
    frameCountRef.current++;
    if (frameCountRef.current % ANALYSIS_THROTTLE_FRAMES === 0) {
      const dim = getDim(size);
      const threshold = adcThresholdRef.current;

      // 基本统计
      const activeStats = computeActiveStats(data, threshold);
      setStats(activeStats);

      // 1. 均匀性 (空间维度)
      const uniformityResult = computeUniformity(data, dim, threshold);
      setUniformity(uniformityResult);

      // 2. 重复性 (时间维度)
      let repResult: RepeatabilityResult = {
        errorFSO: 0, score: 0, grade: "异常",
        pointStdDevs: [], pointMaxDevs: [],
        meanStdDev: 0, maxDeviation: 0, fso: 255,
        sampleCount: historyRef.current.length,
        gainRepeatability: 0, baselineDrift: 0,
      };
      if (historyRef.current.length >= 10) {
        const recentFrames = historyRef.current.slice(-50);
        repResult = computeRepeatability(recentFrames, threshold);
      }
      setRepeatability(repResult);

      // 3. 一致性 (综合维度)
      const consistencyResult = computeConsistency(uniformityResult, repResult);
      setConsistency(consistencyResult);
    }
  }, [getDim]);

  /**
   * 调度UI更新：使用requestAnimationFrame + 时间间隔双重节流
   */
  const scheduleUIUpdate = useCallback(() => {
    if (pendingFrameRef.current) return; // 已有待处理的帧
    pendingFrameRef.current = true;

    const now = performance.now();
    const elapsed = now - lastUIUpdateRef.current;

    if (elapsed >= UI_THROTTLE_MS) {
      // 距离上次更新已超过阈值，立即在下一帧刷新
      rafIdRef.current = requestAnimationFrame(() => {
        lastUIUpdateRef.current = performance.now();
        flushToState();
      });
    } else {
      // 延迟到下一个合适时间点
      const delay = UI_THROTTLE_MS - elapsed;
      setTimeout(() => {
        rafIdRef.current = requestAnimationFrame(() => {
          lastUIUpdateRef.current = performance.now();
          flushToState();
        });
      }, delay);
    }
  }, [flushToState]);

  /**
   * 串口数据回调（高频调用，不直接触发React渲染）
   * 只更新ref和历史记录，通过scheduleUIUpdate节流UI更新
   */
  const handleData = useCallback((data: number[], size: MatrixSize) => {
    // 更新最新数据到ref（零开销）
    latestDataRef.current = data;
    latestSizeRef.current = size;

    // 存储历史帧（用于重复性分析）
    historyRef.current.push([...data]);
    if (historyRef.current.length > MAX_HISTORY_FRAMES) {
      historyRef.current.shift();
    }

    // 调度UI更新（节流）
    scheduleUIUpdate();
  }, [scheduleUIUpdate]);

  const handleStatus = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    setIsConnected(status.connected);
  }, []);

  const connectSerial = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.disconnect();
    }
    const service = new SerialService(config);
    service.setDataCallback(handleData);
    service.setStatusCallback(handleStatus);
    serviceRef.current = service;
    setIsDemo(false);
    try {
      await service.connect();
    } catch (err) {
      serviceRef.current = null;
      throw err;
    }
  }, [config, handleData, handleStatus]);

  const connectDemo = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.disconnect();
    }
    const service = new MockSerialService(config);
    service.setDataCallback(handleData);
    service.setStatusCallback(handleStatus);
    serviceRef.current = service;
    setIsDemo(true);
    await service.connect();
  }, [config, handleData, handleStatus]);

  const disconnect = useCallback(async () => {
    if (serviceRef.current) {
      await serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    // 取消待处理的RAF
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
    pendingFrameRef.current = false;
    latestDataRef.current = null;
    setIsConnected(false);
    setIsDemo(false);
    historyRef.current = [];
  }, []);

  const updateConfig = useCallback((newConfig: Partial<SerialConfig>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      if (serviceRef.current) {
        serviceRef.current.updateConfig(newConfig);
      }
      if (newConfig.matrixSize) {
        setMatrixSize(newConfig.matrixSize);
        historyRef.current = [];
        latestSizeRef.current = newConfig.matrixSize;
      }
      return updated;
    });
  }, []);

  const resetAnalysis = useCallback(() => {
    historyRef.current = [];
    frameCountRef.current = 0;
    setRepeatability({
      errorFSO: 0, score: 0, grade: "异常",
      pointStdDevs: [], pointMaxDevs: [],
      meanStdDev: 0, maxDeviation: 0, fso: 255,
      sampleCount: 0, gainRepeatability: 0, baselineDrift: 0,
    });
    setUniformity({
      rsd: 0, cv: 0, score: 0, grade: "异常",
      stdDev: 0, mean: 0,
      rowMeans: [], colMeans: [],
      maxPoint: [0, 0, 0], minPoint: [0, 0, 0],
    });
    setConsistency({
      score: 0, grade: "异常",
      spatialScore: 0, temporalScore: 0,
      rowCV: 0, colCV: 0,
    });
  }, []);

  // 清理RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    matrixData,
    matrixSize,
    adcThreshold,
    updateAdcThreshold,
    stats,
    uniformity,
    repeatability,
    consistency,
    connectionStatus,
    isConnected,
    isDemo,
    config,
    connectSerial,
    connectDemo,
    disconnect,
    updateConfig,
    resetAnalysis,
    serialSupported: SerialService.isSupported(),
  };
}
