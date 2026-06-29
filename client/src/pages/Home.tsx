/**
 * 矩侨工业 - 压力传感器验收分析系统 主页面
 * 设计风格: 深空控制台 - 航天级暗色工业监控 (支持浅色/深色切换)
 * 
 * 布局: 顶部状态栏 | 左侧控制面板(ScrollArea) | 中间矩阵显示 | 右侧分析面板(ScrollArea)
 */
import AcceptanceTestPanel from "@/components/AcceptanceTestPanel";
import { TestReportModal } from "@/components/TestReportModal";
import ConnectionPanel from "@/components/ConnectionPanel";
import MultiDevicePanel from "@/components/MultiDevicePanel";
import PressureMatrix from "@/components/PressureMatrix";
import RecorderPanel from "@/components/RecorderPanel";
import { useSensorData } from "@/hooks/useSensorData";
import { useRecorder } from "@/hooks/useRecorder";
import { useTheme } from "@/contexts/ThemeContext";
import { type FormulaMapperConfig, loadFormulaConfig, saveFormulaConfig, compileFormula, applyFormulaToMatrix, validateFormula } from "@/lib/formula-mapper";
import { type AutoTestConfig, type AutoTestProgress, type PressEvent, INITIAL_PROGRESS, generateSampleId, detectPressPoint, isPointReleased, analyzePointComparison, buildPressEvent } from "@/lib/auto-test";
import { type DeviceInfo, createDeviceInfo } from "@/lib/multi-device";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  Calculator,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Cpu,
  Download,
  Filter,
  Grid3X3,
  Maximize2,
  Moon,
  RotateCcw,
  Settings2,
  Sun,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { JQ_ICON_BASE64 } from "@/lib/logo-icon-base64";

const CIRCUIT_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663390129888/aMhBnLEXmfAchg4j7NF5XT/circuit-pattern-bLbN44S9jPvRWNffnjowkK.webp";

const MAX_POINT_HISTORY = 200;

export default function Home() {
  const {
    matrixData,
    matrixSize,
    adcThreshold,
    updateAdcThreshold,
    stats,
    consistency,
    repeatability,
    connectionStatus,
    isConnected,
    isDemo,
    config,
    connectSerial,
    connectDemo,
    disconnect,
    updateConfig,
    resetAnalysis,
    serialSupported,
  } = useSensorData();

  const getDim = (size: string): number => {
    switch (size) {
      case "5x5": return 5;
      case "10x10": return 10;
      case "16x16": return 16;
      default: return 32;
    }
  };
  const dim = getDim(matrixSize);

  const recorder = useRecorder();
  const { theme, toggleTheme } = useTheme();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [thresholdInput, setThresholdInput] = useState<string>(String(adcThreshold));

  // Formula mapping state
  const [formulaConfig, setFormulaConfig] = useState<FormulaMapperConfig>(loadFormulaConfig);
  const [formulaInput, setFormulaInput] = useState(formulaConfig.formula);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [formulaSample, setFormulaSample] = useState<string | null>(null);
  const compiledFormulaRef = useRef<((x: number) => number) | null>(
    formulaConfig.enabled ? compileFormula(formulaConfig.formula) : null
  );

  // Single point selection & history
  const [selectedPoint, setSelectedPoint] = useState<[number, number] | null>(null);
  const pointHistoryRef = useRef<number[][]>([]);

  // Auto test state
  const [autoTestProgress, setAutoTestProgress] = useState<AutoTestProgress>(INITIAL_PROGRESS);
  const autoTestConfigRef = useRef<AutoTestConfig | null>(null);
  const autoTestPhaseRef = useRef<AutoTestProgress["phase"]>("idle");
  // Single point press detection state refs
  const currentPressStartRef = useRef<number>(0);
  const currentPressPointRef = useRef<[number, number] | null>(null);
  const currentPressFramesRef = useRef<number[][]>([]);
  const completedPressesRef = useRef<PressEvent[]>([]);
  // 稳定检测相关ref
  const stabilityWindowRef = useRef<number[]>([]); // 滑动窗口存储最近N帧的目标点ADC值
  const isStabilizedRef = useRef<boolean>(false); // 是否已稳定
  const stabilizeStartRef = useRef<number>(0); // 稳定开始时间
  const stabilityTimeoutMs = 10000; // 稳定超时时间（10秒）
  const stabilityWindowSize = 8; // 稳定判定窗口大小（帧数）
  const stabilityMaxFluctuation = 15; // 稳定判定：窗口内最大值-最小值 <= 此值

  // Report modal state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportResult, setReportResult] = useState<import("@/lib/auto-test").PointComparisonResult | null>(null);
  const [reportTestType, setReportTestType] = useState<import("@/lib/auto-test").AcceptanceTestType>("consistency");
  const [reportStartTime, setReportStartTime] = useState<Date | null>(null);

  // Multi-device state
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  // Track matrix data frames for point trend (only when a point is selected)
  useEffect(() => {
    if (matrixData.length > 0 && (isConnected || isDemo) && selectedPoint) {
      pointHistoryRef.current.push([...matrixData]);
      if (pointHistoryRef.current.length > MAX_POINT_HISTORY) {
        pointHistoryRef.current.shift();
      }
    }
  }, [matrixData, isConnected, isDemo, selectedPoint]);

  // Record frames when recording
  useEffect(() => {
    if (recorder.state === "recording" && isConnected && matrixData.length > 0) {
      recorder.recordFrame(matrixData);
    }
  }, [matrixData, recorder.state, isConnected]);

  // Auto test: frame processing logic (v5 - repeatability uses point-by-point traversal)
  useEffect(() => {
    if (matrixData.length === 0 || !isConnected) return;
    const phase = autoTestPhaseRef.current;
    const cfg = autoTestConfigRef.current;
    if (!cfg) return;
    if (phase !== "monitoring" && phase !== "pressing" && phase !== "waiting") return;

    const now = Date.now();
    const curDim = matrixSize === "5x5" ? 5 : matrixSize === "10x10" ? 10 : matrixSize === "16x16" ? 16 : 32;
    const testType = autoTestTypeRef.current;

    // 计算映射后的显示数据（与mappedDisplayData相同逻辑），用于正确检测按压点位
    let mappedData = matrixData;
    if (matrixSize === "5x5") {
      // 先应用公式映射
      let formulaApplied = matrixData;
      if (formulaConfig.enabled && compiledFormulaRef.current) {
        const fn = compiledFormulaRef.current;
        formulaApplied = matrixData.map(v => fn(v));
      }
      // 再应用行列偏移和镜像
      const rows = 5, cols = 5;
      const rowShift = ((formulaConfig.rowShift % rows) + rows) % rows;
      const colShift = ((formulaConfig.colShift % cols) + cols) % cols;
      const colMirror = formulaConfig.colMirror;
      if (rowShift !== 0 || colShift !== 0 || colMirror) {
        const shifted = new Array(rows * cols);
        for (let r = 0; r < rows; r++) {
          const srcRow = (r + rowShift) % rows;
          for (let c = 0; c < cols; c++) {
            const srcCol = (c + colShift) % cols;
            shifted[r * cols + c] = formulaApplied[srcRow * cols + srcCol];
          }
        }
        if (colMirror) {
          for (let r = 0; r < rows; r++) {
            const base = r * cols;
            const tmp0 = shifted[base + 0]; shifted[base + 0] = shifted[base + 4]; shifted[base + 4] = tmp0;
            const tmp1 = shifted[base + 1]; shifted[base + 1] = shifted[base + 3]; shifted[base + 3] = tmp1;
          }
        }
        mappedData = shifted.map(v => Math.max(0, v - 50));
      } else {
        mappedData = formulaApplied.map(v => Math.max(0, v - 50));
      }
    } else {
      // 非5x5模式也需要减50处理
      let formulaApplied = matrixData;
      if (formulaConfig.enabled && compiledFormulaRef.current) {
        const fn = compiledFormulaRef.current;
        formulaApplied = matrixData.map(v => fn(v));
      }
      mappedData = formulaApplied.map(v => Math.max(0, v - 50));
    }

    // ========== 重复性验收：单点检测模式 ==========
    if (testType === "repeatability") {
      const subPhase = repeatSubPhaseRef.current;

      // ---- 新子阶段1: detect_point - 检测ADC值判断哪个点被压下 ----
      if (subPhase === "detect_point") {
        const detection = detectPressPoint(mappedData, curDim, cfg.pressThreshold);
        if (detection) {
          // 锁定该点位
          const [lockRow, lockCol] = detection.point;
          repeatTargetPointIndexRef.current = lockRow * curDim + lockCol;
          // 进入基线采集前的等待释放阶段
          repeatSubPhaseRef.current = "wait_release_for_baseline";
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "monitoring",
            targetPoint: [lockRow, lockCol],
            currentPoint: [lockRow, lockCol],
            currentValue: detection.value,
            message: `检测到点位(${lockRow},${lockCol}) ADC=${detection.value}，请先拿起砝码以记录基线值...`,
          }));
          toast.info(`已锁定点位(${lockRow},${lockCol})，请先拿起砝码`);
        } else {
          setAutoTestProgress(prev => ({
            ...prev,
            message: `等待检测按压... 请在任意点位放置砝码`,
          }));
        }
        return;
      }

      // 获取锁定点位的坐标
      const targetIdx = repeatTargetPointIndexRef.current;
      const displayRow = Math.floor(targetIdx / curDim);
      const displayCol = targetIdx % curDim;

      // 直接从映射后的数据中读取目标点位的ADC值（与显示一致）
      const targetVal = mappedData[targetIdx] ?? 0;

      // ---- 子阶段: wait_release_for_baseline - 等待用户释放砝码以记录基线 ----
      if (subPhase === "wait_release_for_baseline") {
        if (targetVal < cfg.pressThreshold) {
          // 已释放，开始采集基线
          repeatSubPhaseRef.current = "init_baseline";
          repeatBaselineFramesRef.current = [];
          setAutoTestProgress(prev => ({
            ...prev,
            currentPoint: null,
            currentValue: targetVal,
            message: `点位(${displayRow},${displayCol}) 正在记录基线值...`,
          }));
        } else {
          setAutoTestProgress(prev => ({
            ...prev,
            currentValue: targetVal,
            message: `请拿起砝码以记录点位(${displayRow},${displayCol})的基线值...`,
          }));
        }
        return;
      }

      // ---- 子阶段1: init_baseline - 记录初始ADC值（无压力值）----
      if (subPhase === "init_baseline") {
        repeatBaselineFramesRef.current.push(targetVal);
        // 采集10帧作为基线
        if (repeatBaselineFramesRef.current.length >= 10) {
          const avg = repeatBaselineFramesRef.current.reduce((s, v) => s + v, 0) / repeatBaselineFramesRef.current.length;
          repeatBaselineRef.current = avg;
          repeatSubPhaseRef.current = "waiting_press";
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "monitoring",
            currentValue: targetVal,
            message: `点位(${displayRow},${displayCol}) 初始ADC=${avg.toFixed(0)}，等待按压...`,
          }));
        } else {
          setAutoTestProgress(prev => ({
            ...prev,
            currentValue: targetVal,
            message: `正在记录点位(${displayRow},${displayCol})的初始ADC值... (${repeatBaselineFramesRef.current.length}/10)`,
          }));
        }
        return;
      }

      // ---- 子阶段2a: waiting_release - 等待用户释放砝码 ----
      if (subPhase === "waiting_release") {
        const diff = Math.abs(targetVal - repeatBaselineRef.current);
        if (diff <= 15) {
          // 用户已释放砝码，进入等待按压
          repeatSubPhaseRef.current = "waiting_press";
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "monitoring",
            currentPoint: null,
            currentValue: targetVal,
            message: `点位(${displayRow},${displayCol}) 请重新放下砝码... (已完成${repeatPointPressCountRef.current}次)`,
          }));
        } else {
          setAutoTestProgress(prev => ({
            ...prev,
            currentValue: targetVal,
            message: `点位(${displayRow},${displayCol}) 请先拿起砝码... (已完成${repeatPointPressCountRef.current}次)`,
          }));
        }
        return;
      }

      // ---- 子阶段2b: waiting_press - 等待按压（绝对值变化>15）----
      if (subPhase === "waiting_press") {
        // 检测偏置警告是否应该清除（用户释放了砝码）
        if (repeatBiasDetectedRef.current) {
          const diff = Math.abs(targetVal - repeatBaselineRef.current);
          if (diff <= 15) {
            repeatBiasDetectedRef.current = false;
            setAutoTestProgress(prev => ({ ...prev, biasWarning: null, message: `点位(${displayRow},${displayCol}) 等待按压... (已完成${repeatPointPressCountRef.current}次)` }));
          }
          return;
        }

        const diff = Math.abs(targetVal - repeatBaselineRef.current);
        if (diff > 15) {
          // 触发按压，进入延迟阶段
          repeatPressStartTimeRef.current = now;
          repeatSubPhaseRef.current = "press_delay";
          autoTestPhaseRef.current = "pressing";
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "pressing",
            currentPoint: [displayRow, displayCol],
            currentValue: targetVal,
            message: `检测到按压 ADC=${targetVal}，等待0.5s后开始稳定检测...`,
          }));
        } else {
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "monitoring",
            currentValue: targetVal,
            message: `点位(${displayRow},${displayCol}) 等待按压... 基线=${repeatBaselineRef.current.toFixed(0)} 当前=${targetVal} (已完成${repeatPointPressCountRef.current}次)`,
          }));
        }
        return;
      }

      // ---- 子阶段3: press_delay - 已按压，等待0.5s ----
      if (subPhase === "press_delay") {
        // 检查是否释放（回到基线附近）
        const diff = Math.abs(targetVal - repeatBaselineRef.current);
        if (diff <= 15) {
          // 用户释放了，回到等待按压
          repeatSubPhaseRef.current = "waiting_press";
          autoTestPhaseRef.current = "monitoring";
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "monitoring",
            currentPoint: null,
            currentValue: targetVal,
            message: `按压过早释放，请重新在点位(${displayRow},${displayCol})上按压并保持...`,
          }));
          return;
        }
        // 检查是否已过0.5s
        if (now - repeatPressStartTimeRef.current >= 500) {
          // 进入稳定检测阶段
          repeatStabilityWindowRef.current = [targetVal];
          repeatStabilityStartRef.current = now;
          repeatSubPhaseRef.current = "stabilizing";
          setAutoTestProgress(prev => ({
            ...prev,
            currentValue: targetVal,
            message: `点位(${displayRow},${displayCol}) 开始稳定检测 ADC=${targetVal}...`,
          }));
        } else {
          const elapsed = ((now - repeatPressStartTimeRef.current) / 1000).toFixed(1);
          setAutoTestProgress(prev => ({
            ...prev,
            currentValue: targetVal,
            message: `已按压 ${elapsed}s/0.5s，等待中... ADC=${targetVal}`,
          }));
        }
        return;
      }

      // ---- 子阶段4: stabilizing - 检测1s窗口内ADC抱动均<5 ----
      if (subPhase === "stabilizing") {
        // 检查是否释放
        const diff = Math.abs(targetVal - repeatBaselineRef.current);
        if (diff <= 15) {
          // 用户释放了，回到等待按压
          repeatSubPhaseRef.current = "waiting_press";
          autoTestPhaseRef.current = "monitoring";
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "monitoring",
            currentPoint: null,
            currentValue: targetVal,
            message: `稳定检测中释放，请重新在点位(${displayRow},${displayCol})上按压并保持...`,
          }));
          return;
        }

        repeatStabilityWindowRef.current.push(targetVal);
        const windowDuration = (now - repeatStabilityStartRef.current) / 1000;

        // 检查1s窗口内的数据
        if (windowDuration >= 1.0) {
          const windowData = repeatStabilityWindowRef.current;
          const windowMax = Math.max(...windowData);
          const windowMin = Math.min(...windowData);
          const fluctuation = windowMax - windowMin;

          if (fluctuation < 5) {
            // 稳定！记录当前ADC值
            const recordedValue = targetVal;

            // 偏移纠错检测：第二次起，对比与第一次的记录值
            const pressCount = repeatPointPressCountRef.current;
            if (pressCount > 0 && repeatFirstValueRef.current > 0) {
              const firstVal = repeatFirstValueRef.current;
              const deviationSmall = (firstVal - recordedValue) / firstVal; // 正值表示本次偏小
              const deviationLarge = (recordedValue - firstVal) / firstVal; // 正值表示本次偏大

              if (deviationSmall > 0.05) {
                // 本次比第一次小太多：砝码可能放偏，本次作废
                repeatBiasDetectedRef.current = true;
                repeatSubPhaseRef.current = "waiting_press";
                autoTestPhaseRef.current = "monitoring";
                setAutoTestProgress(prev => ({
                  ...prev,
                  phase: "monitoring",
                  currentPoint: null,
                  currentValue: targetVal,
                  biasWarning: `砝码放偏提示！本次ADC=${recordedValue}远小于第一次${firstVal.toFixed(0)}，本次记录作废，请释放后重新对准点位(${displayRow},${displayCol})放置`,
                  message: `砝码放偏，本次数据已丢弃。请释放后重新在点位(${displayRow},${displayCol})上准确放置砝码...`,
                }));
                toast.warning(`本次ADC=${recordedValue}偏小，数据作废，请重新放置`);
                return;
              }

              if (deviationLarge > 0.05) {
                // 本次比第一次大太多：前一次可能放偏，删除前一次数据，本次作为新的第一次
                // 删除前一次的数据
                repeatPointValuesRef.current = [];
                repeatPointPressCountRef.current = 0;
                // 同时删除completedPresses中当前点位的最后一条记录
                const lastEvtIdx = completedPressesRef.current.length - 1;
                if (lastEvtIdx >= 0) {
                  completedPressesRef.current.splice(lastEvtIdx, 1);
                }
                // 本次作为新的第一次
                repeatFirstValueRef.current = recordedValue;
                repeatPointValuesRef.current.push(recordedValue);
                repeatPointPressCountRef.current = 1;

                const biasSeriesData = [...repeatStabilityWindowRef.current];
                const biasN = biasSeriesData.length;
                const biasMean = biasSeriesData.reduce((s, v) => s + v, 0) / biasN;
                const biasVariance = biasSeriesData.reduce((s, v) => s + (v - biasMean) ** 2, 0) / biasN;
                const biasStd = Math.sqrt(biasVariance);
                const evt: PressEvent = {
                  index: completedPressesRef.current.length + 1,
                  position: [displayRow, displayCol],
                  startTime: repeatPressStartTimeRef.current,
                  endTime: now,
                  duration: (now - repeatPressStartTimeRef.current) / 1000,
                  valueSeries: biasSeriesData,
                  meanValue: biasMean,
                  stdValue: biasStd,
                  maxValue: Math.max(...biasSeriesData),
                  minValue: Math.min(...biasSeriesData),
                  frameCount: biasN,
                };
                completedPressesRef.current.push(evt);

                repeatSubPhaseRef.current = "waiting_release";
                autoTestPhaseRef.current = "monitoring";
                setAutoTestProgress(prev => ({
                  ...prev,
                  phase: "monitoring",
                  pressCount: completedPressesRef.current.length,
                  completedPresses: [...completedPressesRef.current],
                  currentPointPressCount: 1,
                  currentPoint: null,
                  currentValue: targetVal,
                  biasWarning: `前一次放置可能偏差！本次ADC=${recordedValue}远大于前一次${firstVal.toFixed(0)}，已删除前一次数据，本次作为新的第1次记录`,
                  message: `前一次数据已删除，本次ADC=${recordedValue}作为第1次记录。请先拿起砝码...`,
                }));
                toast.warning(`前一次可能放偏（ADC=${firstVal.toFixed(0)}），已删除并重新开始`);
                return;
              }
            }

            // 有效数据，记录
            if (pressCount === 0) {
              repeatFirstValueRef.current = recordedValue;
            }
            repeatPointValuesRef.current.push(recordedValue);
            repeatPointPressCountRef.current = pressCount + 1;
            const newPressCount = pressCount + 1;

            // 构建PressEvent用于显示和分析（使用窗口数据）
            const seriesData = [...repeatStabilityWindowRef.current];
            const seriesN = seriesData.length;
            const seriesMean = seriesData.reduce((s, v) => s + v, 0) / seriesN;
            const seriesVariance = seriesData.reduce((s, v) => s + (v - seriesMean) ** 2, 0) / seriesN;
            const seriesStd = Math.sqrt(seriesVariance);
            const evt: PressEvent = {
              index: completedPressesRef.current.length + 1,
              position: [displayRow, displayCol],
              startTime: repeatPressStartTimeRef.current,
              endTime: now,
              duration: (now - repeatPressStartTimeRef.current) / 1000,
              valueSeries: seriesData,
              meanValue: seriesMean,
              stdValue: seriesStd,
              maxValue: Math.max(...seriesData),
              minValue: Math.min(...seriesData),
              frameCount: seriesN,
            };
            completedPressesRef.current.push(evt);

            // 计算实时评分（≥2次按压后）
            let liveScore: number | null = null;
            let liveGrade: string | null = null;
            if (newPressCount >= 2) {
              const liveResult = analyzePointComparison(completedPressesRef.current, "repeatability");
              liveScore = liveResult.repeatabilityScore ?? liveResult.consistencyScore;
              liveGrade = liveResult.repeatabilityGrade ?? liveResult.consistencyGrade;
            }

            toast.success(`点位(${displayRow},${displayCol}) 第${newPressCount}次 记录完成: ADC=${seriesMean.toFixed(1)}${liveScore !== null ? ` · 重复性 ${liveScore.toFixed(0)}分` : ''}`);

            // 不再自动完成，保持运行状态等待用户手动结束
            // 进入等待释放状态，继续下一次按压
            repeatSubPhaseRef.current = "waiting_release";
            autoTestPhaseRef.current = "monitoring";
            setAutoTestProgress(prev => ({
              ...prev,
              phase: "monitoring",
              pressCount: completedPressesRef.current.length,
              completedPresses: [...completedPressesRef.current],
              currentPointPressCount: newPressCount,
              currentPoint: null,
              currentValue: targetVal,
              biasWarning: null,
              liveScore,
              liveGrade,
              message: newPressCount < 2
                ? `点位(${displayRow},${displayCol}) 第${newPressCount}次完成，请先拿起砝码... (至少需2次)`
                : `点位(${displayRow},${displayCol}) 第${newPressCount}次完成，重复性评分: ${liveScore?.toFixed(0) ?? '-'}。请先拿起砝码...`,
            }));
          } else {
            // 窗口内抱动超过5，重置窗口重新开始计时
            repeatStabilityWindowRef.current = [targetVal];
            repeatStabilityStartRef.current = now;
            setAutoTestProgress(prev => ({
              ...prev,
              currentValue: targetVal,
              message: `点位(${displayRow},${displayCol}) 抱动过大(${fluctuation}>≤5)，重新等待稳定... ADC=${targetVal}`,
            }));
          }
        } else {
          // 窗口时间不足1s，继续采集
          setAutoTestProgress(prev => ({
            ...prev,
            currentValue: targetVal,
            currentDuration: windowDuration,
            message: `稳定检测中... 点位(${displayRow},${displayCol}) ADC=${targetVal} (${windowDuration.toFixed(1)}s/1.0s)`,
          }));
        }
        return;
      }

      return;
    }

    // ========== 一致性验收：与重复性相同的按压判断逻辑 ==========
    // 使用子阶段状态机：detect_point → press_delay → stabilizing → record → waiting_release
    const conSubPhase = repeatSubPhaseRef.current; // 复用重复性的子阶段ref

    // ---- 子阶段: detect_point / waiting_press - 检测ADC值判断哪个点被压下 ----
    if (conSubPhase === "detect_point" || conSubPhase === "waiting_press") {
      // 检测偏置警告是否应该清除（用户释放了砝码）
      if (conBiasDetectedRef.current) {
        const detection = detectPressPoint(mappedData, curDim, cfg.pressThreshold);
        if (!detection) {
          conBiasDetectedRef.current = false;
          const count = completedPressesRef.current.length;
          setAutoTestProgress(prev => ({ ...prev, biasWarning: null, message: count > 0 ? `已采集${count}个点位。请在其他位置按压...` : `等待按压... 请在任意点位放置砝码` }));
        }
        return;
      }

      const detection = detectPressPoint(mappedData, curDim, cfg.pressThreshold);
      if (detection) {
        const [row, col] = detection.point;
        currentPressPointRef.current = [row, col];
        repeatPressStartTimeRef.current = now;
        repeatSubPhaseRef.current = "press_delay";
        autoTestPhaseRef.current = "pressing";
        setAutoTestProgress(prev => ({
          ...prev,
          phase: "pressing",
          currentPoint: [row, col],
          currentValue: detection.value,
          biasWarning: null,
          message: `检测到按压点位(${row},${col}) ADC=${detection.value}，等待0.5s后开始稳定检测...`,
        }));
      } else {
        const count = completedPressesRef.current.length;
        setAutoTestProgress(prev => ({
          ...prev,
          phase: "monitoring",
          message: count > 0
            ? `已采集${count}个点位。请在其他位置按压，或点击“结束验收”...`
            : `等待按压... 请在任意点位放置砝码`,
        }));
      }
      return;
    }

    // ---- 子阶段: waiting_release - 等待用户释放砝码（一致性中每次按压不同点位）----
    if (conSubPhase === "waiting_release") {
      // 检测所有点位是否都释放了
      const detection = detectPressPoint(mappedData, curDim, cfg.pressThreshold);
      if (!detection) {
        // 已释放，进入等待下一次按压
        repeatSubPhaseRef.current = "waiting_press";
        autoTestPhaseRef.current = "monitoring";
        const count = completedPressesRef.current.length;
        setAutoTestProgress(prev => ({
          ...prev,
          phase: "monitoring",
          currentPoint: null,
          currentValue: 0,
          message: count < 2
            ? `已采集${count}个点位，至少需要2个。请移到另一个位置按压...`
            : `已采集${count}个点位。继续按压或点击"结束验收"`,
        }));
      } else {
        setAutoTestProgress(prev => ({
          ...prev,
          message: `请拿起砝码... (已采集${completedPressesRef.current.length}个点位)`,
        }));
      }
      return;
    }

    // ---- 子阶段: press_delay - 已按压，等待0.5s ----
    if (conSubPhase === "press_delay") {
      const pt = currentPressPointRef.current;
      if (!pt) return;
      const val = mappedData[pt[0] * curDim + pt[1]] ?? 0;

      // 检查是否释放
      if (val < cfg.pressThreshold) {
        repeatSubPhaseRef.current = "waiting_press";
        autoTestPhaseRef.current = "monitoring";
        currentPressPointRef.current = null;
        setAutoTestProgress(prev => ({
          ...prev,
          phase: "monitoring",
          currentPoint: null,
          currentValue: 0,
          message: `按压过早释放，请重新按压并保持...`,
        }));
        return;
      }

      // 检查是否已过0.5s
      if (now - repeatPressStartTimeRef.current >= 500) {
        repeatStabilityWindowRef.current = [val];
        repeatStabilityStartRef.current = now;
        repeatSubPhaseRef.current = "stabilizing";
        setAutoTestProgress(prev => ({
          ...prev,
          currentValue: val,
          message: `点位(${pt[0]},${pt[1]}) 开始稳定检测 ADC=${val}...`,
        }));
      } else {
        const elapsed = ((now - repeatPressStartTimeRef.current) / 1000).toFixed(1);
        setAutoTestProgress(prev => ({
          ...prev,
          currentValue: val,
          message: `已按压 ${elapsed}s/0.5s，等待中... ADC=${val}`,
        }));
      }
      return;
    }

    // ---- 子阶段: stabilizing - 检测1s窗口内ADC波动<5 ----
    if (conSubPhase === "stabilizing") {
      const pt = currentPressPointRef.current;
      if (!pt) return;
      const val = mappedData[pt[0] * curDim + pt[1]] ?? 0;

      // 检查是否释放
      if (val < cfg.pressThreshold) {
        repeatSubPhaseRef.current = "waiting_press";
        autoTestPhaseRef.current = "monitoring";
        currentPressPointRef.current = null;
        setAutoTestProgress(prev => ({
          ...prev,
          phase: "monitoring",
          currentPoint: null,
          currentValue: 0,
          message: `稳定检测中释放，请重新按压并保持...`,
        }));
        return;
      }

      repeatStabilityWindowRef.current.push(val);
      const windowDuration = (now - repeatStabilityStartRef.current) / 1000;

      if (windowDuration >= 1.0) {
        const windowData = repeatStabilityWindowRef.current;
        const windowMax = Math.max(...windowData);
        const windowMin = Math.min(...windowData);
        const fluctuation = windowMax - windowMin;

        if (fluctuation < 5) {
          // 稳定！使用窗口数据计算该点位的统计值
          const seriesData = [...windowData];
          const n = seriesData.length;
          const mean = seriesData.reduce((s, v) => s + v, 0) / n;
          const variance = seriesData.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
          const std = Math.sqrt(variance);
          const recordedValue = mean;

          // ======== 放偏纠正检测：对比点间差别（与重复性逻辑一致） ========
          const conPressCount = completedPressesRef.current.length;
          if (conPressCount > 0 && conFirstValueRef.current > 0) {
            const firstVal = conFirstValueRef.current;
            const deviationSmall = (firstVal - recordedValue) / firstVal; // 正值表示本次偏小
            const deviationLarge = (recordedValue - firstVal) / firstVal; // 正值表示本次偏大

            if (deviationSmall > 0.05) {
              // 本次比第一次小太多：砝码可能放偏，本次作废
              conBiasDetectedRef.current = true;
              repeatSubPhaseRef.current = "waiting_press";
              autoTestPhaseRef.current = "monitoring";
              currentPressPointRef.current = null;
              setAutoTestProgress(prev => ({
                ...prev,
                phase: "monitoring",
                currentPoint: null,
                currentValue: val,
                biasWarning: `砝码放偏提示！本次点位(${pt[0]},${pt[1]}) ADC=${recordedValue.toFixed(0)}远小于第一个点位${firstVal.toFixed(0)}，本次记录作废，请释放后重新对准点位(${pt[0]},${pt[1]})放置`,
                message: `砝码放偏，本次数据已丢弃。请释放后重新在点位(${pt[0]},${pt[1]})上准确放置砝码...`,
              }));
              toast.warning(`本次ADC=${recordedValue.toFixed(0)}偏小，数据作废，请重新放置`);
              return;
            }

            if (deviationLarge > 0.05) {
              // 本次比基准大太多：之前所有低于本次值的点位可能放偏，全部删除
              // 筛选出所有低于当前值（超过5%偏差）的已采集点位并删除
              const threshold = recordedValue * 0.95; // 低于当前值95%的视为偏低
              const removedPoints = completedPressesRef.current.filter(p => p.meanValue < threshold);
              const keptPoints = completedPressesRef.current.filter(p => p.meanValue >= threshold);
              const removedCount = removedPoints.length;

              // 用保留的点位替换
              completedPressesRef.current = keptPoints;

              // 本次作为新的基准
              conFirstValueRef.current = recordedValue;

              const biasEvt: PressEvent = {
                index: completedPressesRef.current.length + 1,
                position: [pt[0], pt[1]],
                startTime: repeatPressStartTimeRef.current,
                endTime: now,
                duration: (now - repeatPressStartTimeRef.current) / 1000,
                valueSeries: seriesData,
                meanValue: mean,
                stdValue: std,
                maxValue: Math.max(...seriesData),
                minValue: Math.min(...seriesData),
                frameCount: n,
              };
              completedPressesRef.current.push(biasEvt);

              // 重新编号
              completedPressesRef.current.forEach((p, i) => { p.index = i + 1; });

              repeatSubPhaseRef.current = "waiting_release";
              autoTestPhaseRef.current = "monitoring";
              currentPressPointRef.current = null;
              setAutoTestProgress(prev => ({
                ...prev,
                phase: "monitoring",
                pressCount: completedPressesRef.current.length,
                completedPresses: [...completedPressesRef.current],
                currentPoint: null,
                currentValue: val,
                biasWarning: `检测到偏高点位！本次(${pt[0]},${pt[1]}) ADC=${recordedValue.toFixed(0)}远大于基准${firstVal.toFixed(0)}，已删除${removedCount}个偏低点位数据，需重新采集`,
                message: `已删除${removedCount}个偏低点位，本次ADC=${recordedValue.toFixed(0)}作为新基准。当前剩余${completedPressesRef.current.length}个有效点位。请先拿起砝码...`,
              }));
              toast.warning(`检测到偏高，已删除${removedCount}个偏低点位，需重新采集`);
              return;
            }
          }

          // 有效数据，记录第一个点的值作为基准
          if (conPressCount === 0) {
            conFirstValueRef.current = recordedValue;
          }

          // 构建PressEvent（包含完整窗口数据）
          const evt: PressEvent = {
            index: completedPressesRef.current.length + 1,
            position: [pt[0], pt[1]],
            startTime: repeatPressStartTimeRef.current,
            endTime: now,
            duration: (now - repeatPressStartTimeRef.current) / 1000,
            valueSeries: seriesData,
            meanValue: mean,
            stdValue: std,
            maxValue: Math.max(...seriesData),
            minValue: Math.min(...seriesData),
            frameCount: n,
          };
          completedPressesRef.current.push(evt);
          const count = completedPressesRef.current.length;

          // 实时计算一致性评分（>=2个点位后）
          let liveScore: number | null = null;
          let liveGrade: string | null = null;
          if (count >= 2) {
            const liveResult = analyzePointComparison(completedPressesRef.current, "consistency");
            liveScore = liveResult.consistencyScore;
            liveGrade = liveResult.consistencyGrade;
          }

          toast.success(`点位 #${count} (${pt[0]},${pt[1]}) 采集完成: ADC=${recordedValue.toFixed(1)}${liveScore !== null ? ` · 一致性 ${liveScore.toFixed(0)}分` : ''}`);

          // 进入等待释放状态
          repeatSubPhaseRef.current = "waiting_release";
          autoTestPhaseRef.current = "monitoring";
          currentPressPointRef.current = null;
          setAutoTestProgress(prev => ({
            ...prev,
            phase: "monitoring",
            pressCount: count,
            completedPresses: [...completedPressesRef.current],
            currentPoint: null,
            currentValue: 0,
            liveScore,
            liveGrade,
            biasWarning: null,
            message: count < 2
              ? `已采集${count}个点位，至少需要2个。请先拿起砝码...`
              : `已采集${count}个点位，一致性评分: ${liveScore?.toFixed(0) ?? '-'}。请先拿起砝码...`,
          }));
        } else {
          // 波动过大，重置窗口
          repeatStabilityWindowRef.current = [val];
          repeatStabilityStartRef.current = now;
          setAutoTestProgress(prev => ({
            ...prev,
            currentValue: val,
            message: `点位(${pt[0]},${pt[1]}) 波动过大(${fluctuation}>5)，重新等待稳定... ADC=${val}`,
          }));
        }
      } else {
        setAutoTestProgress(prev => ({
          ...prev,
          currentValue: val,
          currentDuration: windowDuration,
          message: `稳定检测中... 点位(${pt[0]},${pt[1]}) ADC=${val} (${windowDuration.toFixed(1)}s/1.0s)`,
        }));
      }
      return;
    }
  }, [matrixData, isConnected, matrixSize]);

  // Clock update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Determine display data: live or playback
  const isPlayingBack = recorder.state === "playing" || recorder.state === "paused";
  const displayData = isPlayingBack && recorder.currentFrame
    ? recorder.currentFrame.data
    : matrixData;

  // Apply formula mapping for display only (does not affect analysis)
  const formulaMappedData = useMemo(() => {
    if (!formulaConfig.enabled || !compiledFormulaRef.current) return displayData;
    return applyFormulaToMatrix(displayData, compiledFormulaRef.current);
  }, [displayData, formulaConfig.enabled]);

  // For 5x5 matrix: circular shift rows/columns and optional column mirror
  const mappedDisplayData = useMemo(() => {
    if (formulaMappedData.length === 0) return formulaMappedData;
    // 非5x5模式也需要减50处理
    if (matrixSize !== "5x5") return formulaMappedData.map(v => Math.max(0, v - 50));
    const cols = 5;
    const rows = 5;
    const rowShift = ((formulaConfig.rowShift % rows) + rows) % rows;
    const colShift = ((formulaConfig.colShift % cols) + cols) % cols;
    const colMirror = formulaConfig.colMirror;
    if (rowShift === 0 && colShift === 0 && !colMirror) return formulaMappedData.map(v => Math.max(0, v - 50));
    const result = new Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      const srcRow = (r + rowShift) % rows;
      for (let c = 0; c < cols; c++) {
        const srcCol = (c + colShift) % cols;
        result[r * cols + c] = formulaMappedData[srcRow * cols + srcCol];
      }
    }
    // Column mirror: swap col 0↔4, col 1↔3 (center col 2 stays)
    if (colMirror) {
      for (let r = 0; r < rows; r++) {
        const base = r * cols;
        // Swap column 0 and column 4
        const tmp0 = result[base + 0];
        result[base + 0] = result[base + 4];
        result[base + 4] = tmp0;
        // Swap column 1 and column 3
        const tmp1 = result[base + 1];
        result[base + 1] = result[base + 3];
        result[base + 3] = tmp1;
      }
    }
    // 所有ADC值减50，负数显示为0
    return result.map(v => Math.max(0, v - 50));
  }, [formulaMappedData, matrixSize, formulaConfig.rowShift, formulaConfig.colShift, formulaConfig.colMirror]);


  // Handle threshold input change
  const handleThresholdInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setThresholdInput(e.target.value);
  }, []);

  const handleThresholdInputConfirm = useCallback(() => {
    const val = parseInt(thresholdInput, 10);
    if (!isNaN(val) && val >= 0 && val <= 254) {
      updateAdcThreshold(val);
      toast.success(`ADC过滤阈值已设为 ${val}`);
    } else {
      setThresholdInput(String(adcThreshold));
      toast.error("请输入 0-254 之间的整数");
    }
  }, [thresholdInput, adcThreshold, updateAdcThreshold]);

  const handleThresholdSlider = useCallback((values: number[]) => {
    const val = values[0];
    setThresholdInput(String(val));
    updateAdcThreshold(val);
  }, [updateAdcThreshold]);

  // Formula mapping handlers
  const handleFormulaToggle = useCallback((enabled: boolean) => {
    const newConfig = { ...formulaConfig, enabled };
    if (enabled) {
      const fn = compileFormula(formulaInput);
      if (fn) {
        compiledFormulaRef.current = fn;
        setFormulaError(null);
      } else {
        setFormulaError("公式无效，请检查语法");
        return; // 不启用
      }
    } else {
      compiledFormulaRef.current = null;
      setFormulaError(null);
    }
    setFormulaConfig(newConfig);
    saveFormulaConfig(newConfig);
  }, [formulaConfig, formulaInput]);

  const handleFormulaConfirm = useCallback(() => {
    const result = validateFormula(formulaInput);
    if (result.valid) {
      const fn = compileFormula(formulaInput);
      compiledFormulaRef.current = formulaConfig.enabled ? fn : null;
      setFormulaError(null);
      setFormulaSample(result.sample || null);
      const newConfig = { ...formulaConfig, formula: formulaInput };
      setFormulaConfig(newConfig);
      saveFormulaConfig(newConfig);
      toast.success("公式已更新");
    } else {
      setFormulaError(result.error || "公式无效");
      setFormulaSample(null);
    }
  }, [formulaInput, formulaConfig]);

  // Point click handler
  const handlePointClick = useCallback((row: number, col: number) => {
    setSelectedPoint((prev) => {
      if (prev && prev[0] === row && prev[1] === col) return null;
      return [row, col];
    });
  }, []);

  // Export current frame data as CSV
  const handleExportCSV = useCallback(() => {
    if (displayData.length === 0) {
      toast.error("暂无数据可导出");
      return;
    }

    const rows: string[] = [];
    rows.push(`矩侨工业 压力传感器数据导出`);
    rows.push(`时间: ${new Date().toLocaleString("zh-CN")}`);
    rows.push(`矩阵规格: ${matrixSize}`);
    rows.push(`波特率: ${config.baudRate}`);
    rows.push(`ADC过滤阈值: ${adcThreshold}`);
    rows.push("");

    const colHeaders = Array.from({ length: dim }, (_, i) => `C${i}`);
    rows.push("," + colHeaders.join(","));

    for (let row = 0; row < dim; row++) {
      const rowData = [];
      for (let col = 0; col < dim; col++) {
        rowData.push(displayData[row * dim + col] ?? 0);
      }
      rows.push(`R${row},${rowData.join(",")}`);
    }

    rows.push("");
    rows.push("统计数据 (仅计算ADC>" + adcThreshold + "的点位)");
    rows.push(`最小值,${stats.min}`);
    rows.push(`最大值,${stats.max}`);
    rows.push(`均值,${stats.mean.toFixed(2)}`);
    rows.push(`标准差,${stats.std.toFixed(2)}`);
    rows.push(`重复性误差eR,${repeatability.errorFSO.toFixed(2)}%FSO`);
    rows.push(`一致性评分,${consistency.score.toFixed(2)}`);

    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `JQ_Sensor_${matrixSize}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("数据已导出");
  }, [displayData, matrixSize, dim, config.baudRate, adcThreshold, stats, consistency, repeatability]);


  // Recording start time for elapsed display
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

  // Single frame capture handler
  const handleCaptureFrame = useCallback(() => {
    if (displayData.length === 0) {
      toast.error("暂无数据可采集");
      return;
    }
    const rows: string[] = [];
    rows.push(`矩侨工业 压力传感器单帧采集`);
    rows.push(`时间: ${new Date().toLocaleString("zh-CN")}`);
    rows.push(`矩阵规格: ${matrixSize}`);
    rows.push(`ADC过滤阈值: ${adcThreshold}`);
    rows.push("");
    const colHeaders = Array.from({ length: dim }, (_, i) => `C${i}`);
    rows.push("," + colHeaders.join(","));
    for (let row = 0; row < dim; row++) {
      const rowData = [];
      for (let col = 0; col < dim; col++) {
        rowData.push(displayData[row * dim + col] ?? 0);
      }
      rows.push(`R${row},${rowData.join(",")}`);
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `JQ_Snapshot_${matrixSize}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("单帧数据已采集导出");
  }, [displayData, matrixSize, dim, adcThreshold]);

  // Recorder handlers
  const handleStartRecording = useCallback(() => {
    recorder.startRecording(matrixSize);
    setRecordingStartTime(Date.now());
    toast.success("开始多帧采集");
  }, [recorder, matrixSize]);

  const handleStopRecording = useCallback(() => {
    setRecordingStartTime(null);
    const session = recorder.stopRecording();
    if (session) {
      toast.success(`录制完成: ${session.frameCount} 帧`);
    }
  }, [recorder]);

  const handleImportSession = useCallback(async () => {
    const session = await recorder.importSession();
    if (session) {
      toast.success(`已导入: ${session.name} (${session.frameCount}帧)`);
    }
  }, [recorder]);

  // ===== Auto Test Handlers =====
  const autoTestTypeRef = useRef<"consistency" | "repeatability">("consistency");
  // 重复性逐点遍历的状态refs
  const repeatTargetPointIndexRef = useRef<number>(0); // 当前目标点位索引
  const repeatPointPressCountRef = useRef<number>(0); // 当前点已完成次数
  const repeatFirstValueRef = useRef<number>(0); // 当前点第一次的记录值
  const repeatPointValuesRef = useRef<number[]>([]); // 当前点所有有效记录值
  const repeatAllPointResultsRef = useRef<{point: [number, number]; values: number[]}[]>([]); // 所有点的结果
  const repeatBiasDetectedRef = useRef<boolean>(false); // 是否检测到偏置
  const repeatBaselineRef = useRef<number>(0); // 当前点初始ADC值（无压力值）
  // 重复性新状态机子阶段: "init_baseline" | "waiting_press" | "press_delay" | "stabilizing"
  const repeatSubPhaseRef = useRef<string>("init_baseline");
  const repeatBaselineFramesRef = useRef<number[]>([]); // 用于记录初始基线的帧
  const repeatPressStartTimeRef = useRef<number>(0); // 按压开始时间（用于0.5s延迟）
  const repeatStabilityWindowRef = useRef<number[]>([]); // 1s稳定窗口
  const repeatStabilityStartRef = useRef<number>(0); // 稳定窗口开始时间
  // 一致性测试放偏纠正refs
  const conFirstValueRef = useRef<number>(0); // 一致性测试第一个点的记录值
  const conBiasDetectedRef = useRef<boolean>(false); // 一致性测试是否检测到偏置

  const handleStartAutoTest = useCallback((testConfig: AutoTestConfig, testType: "consistency" | "repeatability") => {
    autoTestConfigRef.current = testConfig;
    autoTestTypeRef.current = testType;
    completedPressesRef.current = [];
    currentPressPointRef.current = null;
    currentPressFramesRef.current = [];
    stabilityWindowRef.current = [];
    isStabilizedRef.current = false;

    if (testType === "repeatability") {
      // 重复性验收：单点检测模式 - 自动检测压下的第一个点
      repeatTargetPointIndexRef.current = -1; // -1表示尚未锁定点位
      repeatPointPressCountRef.current = 0;
      repeatFirstValueRef.current = 0;
      repeatPointValuesRef.current = [];
      repeatAllPointResultsRef.current = [];
      repeatBiasDetectedRef.current = false;
      repeatBaselineRef.current = 0;
      repeatSubPhaseRef.current = "detect_point"; // 新子阶段：等待检测压下点
      repeatBaselineFramesRef.current = [];
      repeatPressStartTimeRef.current = 0;
      repeatStabilityWindowRef.current = [];
      repeatStabilityStartRef.current = 0;

      autoTestPhaseRef.current = "monitoring";
      setAutoTestProgress({
        ...INITIAL_PROGRESS,
        phase: "monitoring",
        startTime: new Date(),
        targetPoint: null,
        totalPoints: 1,
        completedPointCount: 0,
        currentPointPressCount: 0,
        repeatTarget: 0, // 不限制次数，用户手动结束
        message: `重复性验收已开始，请在任意点位放置砝码...`,
      });
      toast.info("重复性验收已开始，请在任意点位放置砝码");
    } else {
      // 一致性验收：与重复性相同的ADC检测+稳定判定流程
      repeatSubPhaseRef.current = "detect_point";
      repeatStabilityWindowRef.current = [];
      repeatStabilityStartRef.current = 0;
      repeatPressStartTimeRef.current = 0;
      conFirstValueRef.current = 0;
      conBiasDetectedRef.current = false;
      autoTestPhaseRef.current = "monitoring";
      setAutoTestProgress({
        ...INITIAL_PROGRESS,
        phase: "monitoring",
        startTime: new Date(),
        message: "一致性验收已开始，请在任意点位放置砝码并保持至数据稳定...",
      });
      toast.info("一致性验收已开始，请按压不同点位");
    }
  }, [dim]);
  const handleResetAutoTest = useCallback(() => {
    completedPressesRef.current = [];
    currentPressPointRef.current = null;
    currentPressFramesRef.current = [];
    stabilityWindowRef.current = [];
    isStabilizedRef.current = false;
    repeatTargetPointIndexRef.current = 0;
    repeatPointPressCountRef.current = 0;
    repeatFirstValueRef.current = 0;
    repeatPointValuesRef.current = [];
    repeatAllPointResultsRef.current = [];
    repeatBiasDetectedRef.current = false;
    repeatBaselineRef.current = 0;
    conFirstValueRef.current = 0;
    conBiasDetectedRef.current = false;
    repeatSubPhaseRef.current = "init_baseline";
    repeatBaselineFramesRef.current = [];
    repeatPressStartTimeRef.current = 0;
    repeatStabilityWindowRef.current = [];
    repeatStabilityStartRef.current = 0;
    autoTestPhaseRef.current = "idle";
    setAutoTestProgress(INITIAL_PROGRESS);
    toast.info("已重置验收数据，可重新开始测试");
  }, []);
  const handleStopAutoTest = useCallback(() => {
    const presses = completedPressesRef.current;
    if (presses.length >= 2) {
      // Enough points, analyze
      autoTestPhaseRef.current = "analyzing";
      setAutoTestProgress(prev => ({
        ...prev,
        phase: "analyzing",
        message: `正在分析${presses.length}个点位的数据...`,
      }));
      const result = analyzePointComparison(presses, autoTestTypeRef.current);
      const cfg = autoTestConfigRef.current;
      const isRepeat = autoTestTypeRef.current === "repeatability";

      // 释放采集帧数据内存（分析完成后不再需要原始帧）
      currentPressFramesRef.current = [];

      autoTestPhaseRef.current = "completed";
      setAutoTestProgress(prev => ({
        ...prev,
        phase: "completed",
        result,
        completedPresses: [...presses],
        pressCount: presses.length,
        message: isRepeat
          ? `重复性验收完成: ${presses.length}次按压`
          : `一致性验收完成: ${presses.length}个点位`,
      }));
      toast.success(isRepeat ? `重复性验收完成: ${presses.length}次按压` : `一致性验收完成: ${presses.length}个点位`);
      // 自动弹出测试报告
      setReportResult(result);
      setReportTestType(autoTestTypeRef.current);
      setReportStartTime(autoTestProgress.startTime);
      setTimeout(() => setReportModalOpen(true), 600);

    } else if (presses.length <= 1) {
      // 0或1个点位，直接取消不生成报告
      autoTestConfigRef.current = null;
      completedPressesRef.current = [];
      autoTestPhaseRef.current = "idle";
      setAutoTestProgress(INITIAL_PROGRESS);
      toast.info("验收测试已取消");
      return;
    }
  }, [matrixSize, adcThreshold, stats, matrixData]);

  // 重新选择点位（重置当前测试，重新检测压下点）
  const handleSkipPoint = useCallback(() => {
    repeatTargetPointIndexRef.current = -1;
    repeatPointPressCountRef.current = 0;
    repeatFirstValueRef.current = 0;
    repeatPointValuesRef.current = [];
    repeatBaselineRef.current = 0;
    repeatSubPhaseRef.current = "detect_point";
    repeatBaselineFramesRef.current = [];
    repeatStabilityWindowRef.current = [];
    repeatBiasDetectedRef.current = false;
    completedPressesRef.current = [];
    autoTestPhaseRef.current = "monitoring";
    setAutoTestProgress(prev => ({
      ...prev,
      phase: "monitoring",
      targetPoint: null,
      currentPoint: null,
      currentValue: 0,
      currentPointPressCount: 0,
      pressCount: 0,
      completedPresses: [],
      biasWarning: null,
      message: `已重置，请在新的点位放置砝码...`,
    }));
    toast.info("已重置，请在新的点位放置砝码");
  }, []);

  // 立即结束验收
  const handleFinishNow = useCallback(() => {
    const presses = completedPressesRef.current;
    if (presses.length >= 2) {
      const result = analyzePointComparison(presses, "repeatability");
      autoTestPhaseRef.current = "completed";
      setAutoTestProgress(prev => ({
        ...prev,
        phase: "completed",
        result,
        targetPoint: null,
        biasWarning: null,
        message: `验收提前结束: ${presses.length}次记录`,
      }));
      toast.success(`重复性验收提前结束: ${presses.length}次记录`);
      // 自动弹出测试报告
      setReportResult(result);
      setReportTestType("repeatability");
      setReportStartTime(autoTestProgress.startTime);
      setTimeout(() => setReportModalOpen(true), 600);

    } else {
      autoTestPhaseRef.current = "idle";
      setAutoTestProgress(INITIAL_PROGRESS);
      toast.warning("数据不足（至少需要2次记录），验收已取消");
    }
  }, [matrixSize, adcThreshold, stats, matrixData]);

  // ===== Multi-Device Handlers =====
  const handleAddDevice = useCallback(async () => {
    try {
      // This will trigger the serial port picker
      const newDevice = createDeviceInfo({
        name: `串口设备 ${devices.length + 1}`,
        type: "serial",
        baudRate: config.baudRate,
        matrixSize: config.matrixSize,
      });
      setDevices((prev) => [...prev, newDevice]);
      setActiveDeviceId(newDevice.id);
      toast.success(`已添加设备: ${newDevice.name}`);
    } catch {
      toast.error("添加设备失败");
    }
  }, [devices.length, config]);

  const handleRemoveDevice = useCallback((id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    if (activeDeviceId === id) {
      setActiveDeviceId(null);
    }
    toast.info("设备已移除");
  }, [activeDeviceId]);

  const handleConnectDevice = useCallback(async (id: string) => {
    const device = devices.find((d) => d.id === id);
    if (!device) return;

    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: "connecting" as const } : d))
    );

    try {
      // For now, use the main connection. In a full implementation,
      // each device would have its own SerialService instance
      await connectSerial();
      setDevices((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: "connected" as const, lastActiveTime: new Date() }
            : d
        )
      );
      setActiveDeviceId(id);
      toast.success(`${device.name} 已连接`);
    } catch {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === id ? { ...d, status: "error" as const, error: "连接失败" } : d
        )
      );
      toast.error(`${device.name} 连接失败`);
    }
  }, [devices, connectSerial]);

  const handleDisconnectDevice = useCallback(async (id: string) => {
    const device = devices.find((d) => d.id === id);
    if (!device) return;

    await disconnect();
    setDevices((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, status: "disconnected" as const } : d
      )
    );
    toast.info(`${device.name} 已断开`);
  }, [devices, disconnect]);

  const handleSelectDevice = useCallback((id: string) => {
    setActiveDeviceId(id);
  }, []);

  const handleConnectDemoDevice = useCallback(async () => {
    const newDevice = createDeviceInfo({
      name: `模拟设备 ${devices.filter((d) => d.isDemo).length + 1}`,
      type: "serial",
      isDemo: true,
      baudRate: config.baudRate,
      matrixSize: config.matrixSize,
    });
    setDevices((prev) => [...prev, newDevice]);
    setActiveDeviceId(newDevice.id);

    try {
      await connectDemo();
      setDevices((prev) =>
        prev.map((d) =>
          d.id === newDevice.id
            ? { ...d, status: "connected" as const, lastActiveTime: new Date() }
            : d
        )
      );
      toast.success(`${newDevice.name} 已连接`);
    } catch {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === newDevice.id
            ? { ...d, status: "error" as const, error: "连接失败" }
            : d
        )
      );
    }
  }, [devices, config, connectDemo]);

  // Update active device FPS/frameCount
  useEffect(() => {
    if (activeDeviceId && isConnected) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === activeDeviceId
            ? {
                ...d,
                fps: connectionStatus.fps,
                frameCount: connectionStatus.framesReceived,
                currentData: matrixData,
                lastActiveTime: new Date(),
              }
            : d
        )
      );
    }
  }, [connectionStatus.fps, connectionStatus.framesReceived, activeDeviceId, isConnected]);

  const hasData = (isConnected && displayData.length > 0) || isPlayingBack;

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden bg-background"
      style={{
        backgroundImage: theme === "dark" ? `url(${CIRCUIT_BG})` : "none",
        backgroundSize: "400px",
        backgroundRepeat: "repeat",
      }}
    >
      {/* Top Status Bar */}
      <header className="h-11 border-b border-border bg-card/95 backdrop-blur-sm flex items-center px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src={JQ_ICON_BASE64} alt="JQ" className="w-6 h-6 rounded" />
            <span className="text-sm font-semibold tracking-wide">矩侨工业</span>
            <span className="text-[10px] text-muted-foreground font-mono">|</span>
            <span className="text-xs text-muted-foreground">压力传感器验收分析系统</span>
            <span className="text-[9px] text-muted-foreground/40 font-mono ml-1">v2.0</span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Status indicators */}
        <div className="flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
          {/* Auto test indicator */}
          {autoTestProgress.phase !== "idle" && autoTestProgress.phase !== "completed" && autoTestProgress.phase !== "error" && (
            <div className="flex items-center gap-1.5 animate-pulse">
              <Circle className="w-3 h-3 text-jq-blue fill-jq-blue" />
              <span className="text-jq-blue-bright">自动验收 已采集{autoTestProgress.pressCount}个点位</span>
            </div>
          )}

          {/* Recording indicator */}
          {recorder.state === "recording" && (
            <div className="flex items-center gap-1.5 animate-pulse">
              <Circle className="w-3 h-3 text-red-500 fill-red-500" />
              <span className="text-red-500">REC {recorder.frameCount}</span>
            </div>
          )}

          {/* Playback indicator */}
          {isPlayingBack && (
            <div className="flex items-center gap-1.5">
              <span className="text-jq-blue-bright">
                回放 {recorder.currentFrameIndex + 1}/{recorder.frameCount}
              </span>
            </div>
          )}

          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-400 status-pulse" : "bg-red-400/50"}`}
            />
            <span className={`${isConnected ? "text-green-400" : "text-red-400/70"}`}>
              {isConnected ? (isDemo ? "DEMO" : "ONLINE") : "OFFLINE"}
            </span>
          </div>

          {/* ADC Threshold indicator */}
          {adcThreshold > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-amber-400" />
              <span className="text-amber-400">ADC&gt;{adcThreshold}</span>
            </div>
          )}

          {/* Multi-device count */}
          {devices.filter((d) => d.status === "connected").length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-green-400">
                {devices.filter((d) => d.status === "connected").length} 设备在线
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Grid3X3 className="w-3 h-3" />
            <span>{matrixSize}</span>
            <span className="text-foreground/30">({dim * dim}点)</span>
          </div>

          {isConnected && !isPlayingBack && (
            <>
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-green-400" />
                <span className="text-green-400">{connectionStatus.fps} FPS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-cyan-glow">#{connectionStatus.framesReceived.toLocaleString()}</span>
              </div>
            </>
          )}

          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>
              {currentTime.toLocaleTimeString("zh-CN", { hour12: false })}
            </span>
          </div>

          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              >
                {theme === "dark" ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-jq-blue" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Connection & Controls (ScrollArea) */}
        <aside className="w-64 border-r border-border bg-card/90 backdrop-blur-sm shrink-0 flex flex-col overflow-hidden">
          <ScrollArea className="h-full flex-1">
            <div className="p-3 space-y-3">
              {/* Single Device Connection */}
              <ConnectionPanel
                config={config}
                status={connectionStatus}
                isConnected={isConnected}
                isDemo={isDemo}
                serialSupported={serialSupported}
                onConnect={connectSerial}
                onConnectDemo={connectDemo}
                onDisconnect={disconnect}
                onConfigChange={updateConfig}
              />

              {/* ADC Threshold Filter Settings */}
              <div className="industrial-panel rounded-md overflow-hidden">
                <div className="industrial-panel-header flex items-center gap-2">
                  <Settings2 className="w-3 h-3" />
                  <span>过滤设置</span>
                </div>
                <div className="p-3 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <Filter className="w-3 h-3" />
                        ADC过滤阈值
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-[9px] text-jq-blue hover:text-jq-blue-bright underline underline-offset-2 cursor-pointer">
                            说明
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="right" className="w-64 text-[10px] leading-relaxed bg-card border-border">
                          <p className="font-semibold mb-1">ADC过滤阈值</p>
                          <p className="text-muted-foreground">
                            低于此阈值的点位将不显示数值（在矩阵中显示为空），
                            同时重复性、一致性等所有分析指标将只计算
                            ADC值大于此阈值的有效传感点位。
                          </p>
                          <p className="text-muted-foreground mt-1.5">
                            默认值为5，可根据实际传感器底噪水平调整。
                          </p>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Slider */}
                    <Slider
                      value={[adcThreshold]}
                      onValueChange={handleThresholdSlider}
                      min={0}
                      max={254}
                      step={1}
                      className="w-full"
                    />

                    {/* Value input */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={254}
                        value={thresholdInput}
                        onChange={handleThresholdInputChange}
                        onBlur={handleThresholdInputConfirm}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleThresholdInputConfirm();
                        }}
                        className="flex-1 h-7 bg-background/50 border border-border rounded px-2 text-xs font-mono text-foreground focus:border-jq-blue focus:outline-none transition-colors"
                      />
                      <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0">
                        / 255
                      </span>
                    </div>

                    {/* Quick presets */}
                    <div className="flex gap-1">
                      {[0, 5, 10, 20, 50].map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            updateAdcThreshold(preset);
                            setThresholdInput(String(preset));
                          }}
                          className={`flex-1 h-6 text-[9px] font-mono rounded border transition-colors ${
                            adcThreshold === preset
                              ? "bg-jq-blue/20 border-jq-blue/50 text-jq-blue-bright"
                              : "bg-background/30 border-border/50 text-muted-foreground hover:border-jq-blue/30"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {/* Active points info - collapsed */}
                  </div>
                </div>
              </div>

              {/* Formula Mapping Panel - hidden from UI but functionality preserved */}
              <div className="industrial-panel rounded-md overflow-hidden hidden">
                <div className="industrial-panel-header flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-3 h-3" />
                    <span>数值映射</span>
                  </div>
                  <Switch
                    checked={formulaConfig.enabled}
                    onCheckedChange={handleFormulaToggle}
                  />
                </div>
                <div className="p-3 space-y-2">
                  <div className="text-[9px] text-muted-foreground/60">
                    输入公式将原始ADC值映射为显示值，自变量为 x
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-jq-blue font-mono shrink-0">f(x) =</span>
                    <input
                      type="text"
                      value={formulaInput}
                      onChange={(e) => {
                        setFormulaInput(e.target.value);
                        setFormulaError(null);
                        setFormulaSample(null);
                      }}
                      onBlur={handleFormulaConfirm}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFormulaConfirm();
                      }}
                      placeholder="例: x * 0.5 + 10"
                      className={`flex-1 h-7 bg-background/50 border rounded px-2 text-xs font-mono text-foreground focus:outline-none transition-colors ${
                        formulaError
                          ? "border-amber-500/60 focus:border-amber-500"
                          : "border-border focus:border-jq-blue"
                      }`}
                    />
                  </div>
                  {formulaError && (
                    <div className="text-[9px] text-amber-400/80">
                      {formulaError}
                    </div>
                  )}
                  {formulaSample && !formulaError && (
                    <div className="text-[9px] text-muted-foreground/50 font-mono break-all">
                      {formulaSample}
                    </div>
                  )}
                  <div className="text-[8px] text-muted-foreground/40 leading-relaxed">
                    支持: +, -, *, /, **, (, ), abs, sqrt, pow, round, floor, ceil, log, min, max
                  </div>
                  {/* 5x5 Row Shift Setting */}
                  <div className="pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/70">5×5 行偏移量</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={4}
                          value={formulaConfig.rowShift}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(4, parseInt(e.target.value) || 0));
                            const newConfig = { ...formulaConfig, rowShift: val };
                            setFormulaConfig(newConfig);
                            saveFormulaConfig(newConfig);
                          }}
                          className="w-12 h-6 bg-background/50 border border-border rounded px-1.5 text-xs text-center font-mono text-foreground focus:outline-none focus:border-jq-blue transition-colors"
                        />
                        <span className="text-[9px] text-muted-foreground/50">行</span>
                      </div>
                    </div>
                    <div className="text-[8px] text-muted-foreground/40 mt-1">
                      5×5模式下显示行循环向上滚动的行数（0=不滚动）
                    </div>
                  </div>
                  {/* 5x5 Column Shift Setting */}
                  <div className="pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/70">5×5 列偏移量</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={4}
                          value={formulaConfig.colShift}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(4, parseInt(e.target.value) || 0));
                            const newConfig = { ...formulaConfig, colShift: val };
                            setFormulaConfig(newConfig);
                            saveFormulaConfig(newConfig);
                          }}
                          className="w-12 h-6 bg-background/50 border border-border rounded px-1.5 text-xs text-center font-mono text-foreground focus:outline-none focus:border-jq-blue transition-colors"
                        />
                        <span className="text-[9px] text-muted-foreground/50">列</span>
                      </div>
                    </div>
                    <div className="text-[8px] text-muted-foreground/40 mt-1">
                      5×5模式下显示列循环向左滚动的列数（0=不滚动）
                    </div>
                  </div>
                  {/* 5x5 Column Mirror Setting */}
                  <div className="pt-2 border-t border-border/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground/70">5×5 列镜像对调</span>
                      <button
                        onClick={() => {
                          const newConfig = { ...formulaConfig, colMirror: !formulaConfig.colMirror };
                          setFormulaConfig(newConfig);
                          saveFormulaConfig(newConfig);
                        }}
                        className={`relative w-8 h-4 rounded-full transition-colors ${
                          formulaConfig.colMirror ? "bg-jq-blue" : "bg-muted-foreground/30"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                            formulaConfig.colMirror ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                    <div className="text-[8px] text-muted-foreground/40 mt-1">
                      5×5模式下对调第1列↔5列、第2列↔4列（仅影响显示）
                    </div>
                  </div>
                </div>
              </div>



              {/* Recorder Panel */}
              <RecorderPanel
                state={recorder.state}
                frameCount={recorder.frameCount}
                currentFrameIndex={recorder.currentFrameIndex}
                playbackSpeed={recorder.playbackSpeed}
                sessions={recorder.sessions}
                activeSession={recorder.activeSession}
                isConnected={isConnected}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onStartPlayback={recorder.startPlayback}
                onPausePlayback={recorder.pausePlayback}
                onStopPlayback={recorder.stopPlayback}
                onSeekToFrame={recorder.seekToFrame}
                onSetPlaybackSpeed={recorder.setPlaybackSpeed}
                onLoadSession={recorder.loadSession}
                onExportSession={recorder.exportSession}
                onImportSession={handleImportSession}
                onDeleteSession={recorder.deleteSession}
                onCaptureFrame={handleCaptureFrame}
                recordingStartTime={recordingStartTime}
              />

              {/* Multi-Device Management (moved to bottom) */}
              <MultiDevicePanel
                devices={devices}
                activeDeviceId={activeDeviceId}
                onAddDevice={handleAddDevice}
                onRemoveDevice={handleRemoveDevice}
                onConnectDevice={handleConnectDevice}
                onDisconnectDevice={handleDisconnectDevice}
                onSelectDevice={handleSelectDevice}
                onConnectDemoDevice={handleConnectDemoDevice}
                serialSupported={serialSupported}
              />

              {/* CAN Bus Interface Placeholder */}
              {(() => {
                const [canExpanded, setCanExpanded] = useState(false);
                return (
                  <div className="industrial-panel rounded-md overflow-hidden opacity-50">
                    <button
                      onClick={() => setCanExpanded(!canExpanded)}
                      className="industrial-panel-header flex items-center gap-2 w-full cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <Wifi className="w-3 h-3" />
                      <span>CAN 总线</span>
                      <span className="ml-1 text-[9px] bg-warning-orange/20 text-warning-orange px-1.5 py-0.5 rounded">
                        预留
                      </span>
                      <div className="flex-1" />
                      {canExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {canExpanded && (
                      <div className="p-3">
                        <p className="text-[10px] text-muted-foreground text-center">
                          CAN 协议接口已预留，后续版本将支持 CAN 设备连接
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}


            </div>
          </ScrollArea>
        </aside>

        {/* Center - Pressure Matrix Display */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Matrix Header */}
          <div className="h-9 border-b border-border bg-card/60 backdrop-blur-sm flex items-center px-4 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <Maximize2 className="w-3 h-3 text-jq-blue" />
              <span className="font-mono text-muted-foreground uppercase tracking-wider text-[10px]">
                压力矩阵 · ADC数值点阵
              </span>
            </div>
            <div className="flex-1" />
            {hasData && (
              <div className="flex items-center gap-2">
                {selectedPoint && (
                  <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                    选中: [{selectedPoint[0]},{selectedPoint[1]}]
                  </span>
                )}
                {adcThreshold > 0 && (
                  <span className="text-[9px] font-mono bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20">
                    过滤: ADC&gt;{adcThreshold}
                  </span>
                )}
                {isPlayingBack && (
                  <span className="text-[9px] font-mono bg-jq-blue/15 text-jq-blue-bright px-2 py-0.5 rounded border border-jq-blue/20">
                    回放模式
                  </span>
                )}
                {isDemo && !isPlayingBack && (
                  <span className="text-[9px] font-mono bg-warning-orange/15 text-warning-orange px-2 py-0.5 rounded">
                    DEMO MODE
                  </span>
                )}
                {isConnected && !isPlayingBack && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 status-pulse" style={{ color: "#4ade80" }} />
                    <span className="text-[10px] font-mono text-green-400">LIVE</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Matrix Grid */}
          <div className="flex-1 overflow-hidden">
            {hasData && displayData.length > 0 ? (
              <PressureMatrix
                data={mappedDisplayData}
                matrixSize={matrixSize}
                adcThreshold={adcThreshold}
                selectedPoint={selectedPoint}
                highlightPoint={autoTestProgress.targetPoint}
                onPointClick={handlePointClick}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-5 text-muted-foreground">
                <div className="relative">
                  <div className="w-36 h-36 border border-border/30 rounded-lg flex items-center justify-center bg-card/30">
                    <Grid3X3 className="w-16 h-16 opacity-15" />
                  </div>
                  <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-jq-blue/50 rounded-tl-sm" />
                  <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-jq-blue/50 rounded-tr-sm" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-jq-blue/50 rounded-bl-sm" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-jq-blue/50 rounded-br-sm" />
                </div>
                <div className="text-center space-y-1.5">
                  <p className="text-sm font-medium">等待设备连接</p>
                  <p className="text-[11px] text-muted-foreground/50 max-w-[260px] leading-relaxed">
                    请在左侧面板连接串口设备（Type-C转USB），或点击"模拟数据演示"查看效果
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Right Panel - Acceptance Test */}
        <aside className="w-80 border-l border-border bg-card/90 backdrop-blur-sm shrink-0 overflow-hidden">
          <AcceptanceTestPanel
            isConnected={isConnected || isPlayingBack}
            progress={autoTestProgress}
            onStartTest={handleStartAutoTest}
            onStopTest={handleStopAutoTest}
            onReset={handleResetAutoTest}
            onSkipPoint={handleSkipPoint}
            onFinishNow={handleFinishNow}
            onGenerateReport={() => setReportModalOpen(true)}
          />
        </aside>
      </div>

      {/* 测试报告弹窗 */}
      <TestReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        result={reportResult}
        testType={reportTestType}
        config={autoTestConfigRef.current}
        matrixSize={matrixSize}
        startTime={reportStartTime}
      />
    </div>
  );
}
