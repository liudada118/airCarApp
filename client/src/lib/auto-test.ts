/**
 * 自动化验收测试核心逻辑 (v4 - 单点按压模式)
 *
 * 测试流程：
 * 1. 用户选择验收类型（一致性 或 重复性），两者不能同时验收
 * 2. 用户点击"开始验收"，系统进入监测模式
 * 3. 用户用砝码按压传感垫上某个点位，保持至数据稳定（波动<5）
 *    系统自动检测压力最大的点位，等待稳定后开始采集数据
 * 4. 用户移开砝码，系统记录该次按压的稳定均值
 * 5. 重复步骤3-4共x次（x≥2）
 *    - 一致性验收：每次按压不同点位，比较各点位之间的输出一致性
 *    - 重复性验收：每次按压同一个点位，比较同一点位多次按压的输出偏差
 * 6. 用户点击"结束验收"
 * 7. 系统汇总数据，根据验收类型计算结果
 * 8. 生成验收报告
 */
// ============================================================
// 类型定义
// ============================================================
/** 测试阶段 */
export type AutoTestPhase =
  | "idle"          // 空闲
  | "monitoring"    // 监测中，等待按压
  | "pressing"      // 检测到按压，正在采集稳定数据
  | "waiting"       // 等待下一次按压（砝码已移开）
  | "analyzing"     // 分析中
  | "completed"     // 完成
  | "error";        // 错误
/** 单次按压事件记录（单点） */
export interface PressEvent {
  /** 按压序号（从1开始） */
  index: number;
  /** 按压点位坐标 [row, col] */
  position: [number, number];
  /** 按压开始时间 */
  startTime: number;
  /** 按压结束时间 */
  endTime: number;
  /** 按压持续时间（秒） */
  duration: number;
  /** 该点位在按压期间的ADC值序列（稳定后采集的） */
  valueSeries: number[];
  /** ADC均值（稳定后的平均值，作为该次按压的代表值） */
  meanValue: number;
  /** ADC标准差（时间维度稳定性） */
  stdValue: number;
  /** ADC最大值 */
  maxValue: number;
  /** ADC最小值 */
  minValue: number;
  /** 采集帧数 */
  frameCount: number;
}
/** 验收类型 */
export type AcceptanceTestType = "consistency" | "repeatability";
/** 多点对比分析结果 */
export interface PointComparisonResult {
  /** 验收类型 */
  testType: AcceptanceTestType;
  /** 参与对比的按压次数 */
  pressCount: number;
  /** 各次按压事件 */
  pressEvents: PressEvent[];
  // === 一致性 (各点间ADC均值是否一致) ===
  /** 各点ADC均值的平均值 */
  interPointMean: number;
  /** 各点ADC均值的标准差 */
  interPointStd: number;
  /** 一致性 RSD (%) - 各点均值的变异系数 */
  consistencyRSD: number;
  /** 一致性评分 (0-100) */
  consistencyScore: number;
  /** 一致性等级 */
  consistencyGrade: string;
  // === 重复性 (同一点位多次按压的偏差) ===
  /** 各次按压代表值（稳定后均值）的平均值 */
  repeatMean: number;
  /** 各次按压代表值的标准差 */
  repeatStd: number;
  /** 重复性变异系数 CV (%) */
  repeatabilityCV: number;
  /** 重复性最大偏差 (%FSO) = (max均值 - min均值) / FSO * 100 */
  repeatabilityER: number;
  /** 重复性评分 (0-100) */
  repeatabilityScore: number;
  /** 重复性等级 */
  repeatabilityGrade: string;
  // === 综合判定（基于选择的验收类型） ===
  /** 综合评分 */
  overallScore: number;
  /** 综合等级 */
  overallGrade: string;
  /** 验收结论 */
  verdict: string;
}
/** 验收测试配置 */
export interface AutoTestConfig {
  /** 按压检测阈值（ADC值超过此值视为有按压） */
  pressThreshold: number;
  /** 按压释放阈值（ADC值低于此值视为砝码移开） */
  releaseThreshold: number;
  /** 最小稳定时间（毫秒），按压后需稳定多久才开始记录 */
  minStableTime: number;
  /** 最小采集时间（毫秒），每个点至少采集多久 */
  minSampleTime: number;
  /** 稳定判定窗口大小（帧数） */
  stableWindowSize: number;
  /** 稳定判定标准差阈值 */
  stableStdThreshold: number;
  /** 重复性验收每个点位重复次数 */
  repeatCount: number;
  /** 样品编号 */
  sampleId: string;
  /** 测试备注 */
  notes: string;
  /** 砝码重量 (g) */
  weightGrams: string;
  /** 环境温度 (°C) */
  temperature: string;
  /** 测试人员 */
  operator: string;
  /** 完成后自动生成报告 */
  autoReport: boolean;
  /** 完成后自动保存批次记录 */
  autoSaveBatch: boolean;
}
/** 验收测试进度 */
export interface AutoTestProgress {
  /** 当前阶段 */
  phase: AutoTestPhase;
  /** 已采集的按压次数 */
  pressCount: number;
  /** 当前按压点位坐标 */
  currentPoint: [number, number] | null;
  /** 当前按压的ADC值 */
  currentValue: number;
  /** 所有已完成的按压事件 */
  completedPresses: PressEvent[];
  /** 提示消息 */
  message: string;
  /** 开始时间 */
  startTime: Date | null;
  /** 当前按压的采集帧数 */
  currentFrameCount: number;
  /** 当前按压的持续时间（秒） */
  currentDuration: number;
  /** 分析结果 */
  result: PointComparisonResult | null;
  /** 错误信息 */
  error?: string;
  // === 重复性逐点遍历相关 ===
  /** 当前验收目标点位 (屏幕显示坐标) */
  targetPoint: [number, number] | null;
  /** 总点位数 */
  totalPoints: number;
  /** 已完成点位数 */
  completedPointCount: number;
  /** 当前点已完成的按压次数 */
  currentPointPressCount: number;
  /** 每点目标重复次数 */
  repeatTarget: number;
  /** 偏置警告信息 */
  biasWarning: string | null;
  /** 实时评分（一致性测试中每次按压后更新） */
  liveScore: number | null;
  /** 实时等级 */
  liveGrade: string | null;
}
// ============================================================
// 默认配置 & 常量
// ============================================================
export const DEFAULT_AUTO_TEST_CONFIG: AutoTestConfig = {
  pressThreshold: 60,
  releaseThreshold: 15,
  minStableTime: 500,
  minSampleTime: 2000,
  stableWindowSize: 10,
  stableStdThreshold: 8,
  repeatCount: 3,
  sampleId: "",
  notes: "",
  weightGrams: "",
  temperature: "",
  operator: "",
  autoReport: true,
  autoSaveBatch: false,
};
export const INITIAL_PROGRESS: AutoTestProgress = {
  phase: "idle",
  pressCount: 0,
  currentPoint: null,
  currentValue: 0,
  completedPresses: [],
  message: "",
  startTime: null,
  currentFrameCount: 0,
  currentDuration: 0,
  result: null,
  targetPoint: null,
  totalPoints: 0,
  completedPointCount: 0,
  currentPointPressCount: 0,
  repeatTarget: 3,
  biasWarning: null,
  liveScore: null,
  liveGrade: null,
};
const FSO = 255;
// ============================================================
// 辅助函数
// ============================================================
export function generateSampleId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `JQ-${date}-${time}-${rand}`;
}
/** 从localStorage加载配置 */
export function loadAutoTestConfig(): AutoTestConfig {
  try {
    const saved = localStorage.getItem("jq-auto-test-config-v4");
    if (saved) {
      return { ...DEFAULT_AUTO_TEST_CONFIG, ...JSON.parse(saved) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_AUTO_TEST_CONFIG, sampleId: generateSampleId() };
}
/** 保存配置到localStorage */
export function saveAutoTestConfig(config: AutoTestConfig): void {
  try {
    localStorage.setItem("jq-auto-test-config-v4", JSON.stringify(config));
  } catch { /* ignore */ }
}
// ============================================================
// 单点按压检测算法
// ============================================================
/**
 * 从矩阵数据中检测压力最大的单个点位
 * 返回该点的坐标和ADC值；如果没有超过阈值的点则返回null
 */
export function detectPressPoint(
  data: number[],
  dim: number,
  threshold: number,
): { point: [number, number]; value: number } | null {
  let maxVal = 0;
  let maxRow = 0;
  let maxCol = 0;
  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const val = data[row * dim + col] ?? 0;
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
        maxCol = col;
      }
    }
  }
  if (maxVal < threshold) return null;
  return { point: [maxRow, maxCol], value: maxVal };
}
/**
 * 检测某个点位是否已释放（ADC值低于释放阈值）
 */
export function isPointReleased(
  data: number[],
  dim: number,
  point: [number, number],
  releaseThreshold: number,
): boolean {
  const [row, col] = point;
  const val = data[row * dim + col] ?? 0;
  return val < releaseThreshold;
}
/**
 * 从多帧数据中提取某个点位的ADC值序列
 */
export function extractPointSeries(
  frames: number[][],
  dim: number,
  point: [number, number],
): number[] {
  const [row, col] = point;
  return frames.map(frame => frame[row * dim + col] ?? 0);
}
/**
 * 构建单次按压事件
 */
export function buildPressEvent(
  index: number,
  startTime: number,
  endTime: number,
  frames: number[][],
  dim: number,
  point: [number, number],
): PressEvent {
  const duration = (endTime - startTime) / 1000;
  const valueSeries = extractPointSeries(frames, dim, point);
  const n = valueSeries.length;
  const mean = n > 0 ? valueSeries.reduce((s, v) => s + v, 0) / n : 0;
  const variance = n > 0 ? valueSeries.reduce((s, v) => s + (v - mean) ** 2, 0) / n : 0;
  const std = Math.sqrt(variance);
  return {
    index,
    position: point,
    startTime,
    endTime,
    duration,
    valueSeries,
    meanValue: mean,
    stdValue: std,
    maxValue: n > 0 ? Math.max(...valueSeries) : 0,
    minValue: n > 0 ? Math.min(...valueSeries) : 0,
    frameCount: n,
  };
}
// ============================================================
// 多点对比分析
// ============================================================
function gradeFromScore(score: number): string {
  if (score >= 85) return "优秀";
  if (score >= 60) return "良好";
  return "异常";
}
/**
 * 对比分析多个单点按压的一致性或重复性（根据验收类型）
 *
 * 一致性验收：多次按压不同点位，比较各点位稳定后均值的一致程度
 *   - 指标：RSD (变异系数)，评分 = 100 - RSD
 *
 * 重复性验收：多次按压同一点位，比较每次按压稳定后均值的偏差
 *   - 指标：最大偏差 %FSO = (max均值 - min均值) / FSO * 100
 *   - 指标：CV% = 标准差 / 平均值 * 100
 *   - 评分 = 100 - %FSO (clamped 0-100)
 */
export function analyzePointComparison(pressEvents: PressEvent[], testType: AcceptanceTestType): PointComparisonResult {
  const x = pressEvents.length;
  if (x < 2) {
    return {
      testType,
      pressCount: x,
      pressEvents,
      interPointMean: 0, interPointStd: 0,
      consistencyRSD: 0, consistencyScore: 0, consistencyGrade: "待定",
      repeatMean: 0, repeatStd: 0,
      repeatabilityCV: 0, repeatabilityER: 0,
      repeatabilityScore: 0, repeatabilityGrade: "待定",
      overallScore: 0, overallGrade: "待定", verdict: "待定",
    };
  }

  // 各次按压的代表值（稳定后均值）
  const pressMeans = pressEvents.map(evt => evt.meanValue);
  const globalMean = pressMeans.reduce((s, v) => s + v, 0) / x;
  const globalVariance = pressMeans.reduce((s, v) => s + (v - globalMean) ** 2, 0) / x;
  const globalStd = Math.sqrt(globalVariance);

  // === 一致性分析（各点间ADC均值是否一致）===
  const consistencyRSD = globalMean > 0 ? (globalStd / globalMean) * 100 : 0;
  // 评分 = 100 - RSD
  const consistencyScore = Math.max(0, Math.min(100, 100 - consistencyRSD));
  const consistencyGrade = gradeFromScore(consistencyScore);

  // === 重复性分析（同一点位多次按压的偏差）===
  // 最大偏差 %FSO = (max均值 - min均值) / FSO * 100
  const maxMean = Math.max(...pressMeans);
  const minMean = Math.min(...pressMeans);
  const repeatabilityER = ((maxMean - minMean) / FSO) * 100;
  // CV% = 标准差 / 平均值 * 100
  const repeatabilityCV = globalMean > 0 ? (globalStd / globalMean) * 100 : 0;
  // 评分 = 100 - %FSO
  const repeatabilityScore = Math.max(0, Math.min(100, 100 - repeatabilityER));
  const repeatabilityGrade = gradeFromScore(repeatabilityScore);

  // === 综合评分（基于选择的验收类型）===
  const overallScore = testType === "consistency" ? consistencyScore : repeatabilityScore;
  const overallGrade = gradeFromScore(overallScore);
  const verdict = overallScore >= 60 ? "合格" : "测试过程异常";

  return {
    testType,
    pressCount: x,
    pressEvents,
    interPointMean: globalMean, interPointStd: globalStd,
    consistencyRSD, consistencyScore, consistencyGrade,
    repeatMean: globalMean, repeatStd: globalStd,
    repeatabilityCV, repeatabilityER,
    repeatabilityScore, repeatabilityGrade,
    overallScore, overallGrade, verdict,
  };
}
