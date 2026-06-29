/**
 * 矩侨工业 - 柔性压力传感器核心性能指标分析工具
 * 
 * 基于学术文献和行业标准，实现三大核心指标：
 * 1. 均匀性 (Uniformity) - 空间维度 (Spatial)
 * 2. 重复性 (Repeatability) - 时间维度 (Temporal)  
 * 3. 一致性 (Consistency) - 综合维度 (Overall)
 */

// ============================================================
// 类型定义
// ============================================================

/** 基本统计量 */
export interface BasicStats {
  min: number;
  max: number;
  mean: number;
  std: number;
  median: number;
  range: number;
  /** 有效点数 (压力值 > 阈值的点) */
  activePoints: number;
  /** 总点数 */
  totalPoints: number;
  /** 活跃率 (%) */
  activeRate: number;
}

/**
 * 均匀性分析结果 (Uniformity) - 空间维度
 * 
 * 定义: 传感器阵列中不同空间位置的传感单元在受到相同压力时，
 * 其输出响应信号的差异程度。
 * 
 * 量化方法: RSD = S / X̄ × 100%
 * RSD越小越好，优秀阵列 RSD < 5%
 */
export interface UniformityResult {
  /** 相对标准偏差 RSD (%) - 值越小越好 */
  rsd: number;
  /** 变异系数 CV (%) - 等同于RSD */
  cv: number;
  /** 均匀性评分 (0-100) - 值越高越好, 100 - RSD */
  score: number;
  /** 均匀性等级 */
  grade: "优秀" | "良好" | "异常";
  /** 所有活跃点的标准偏差 S */
  stdDev: number;
  /** 所有活跃点的平均值 X̄ */
  mean: number;
  /** 行均值分布 */
  rowMeans: number[];
  /** 列均值分布 */
  colMeans: number[];
  /** 最大值点位 [row, col, value] */
  maxPoint: [number, number, number];
  /** 最小值点位 (活跃点中) [row, col, value] */
  minPoint: [number, number, number];
}

/**
 * 重复性分析结果 (Repeatability) - 时间维度
 * 
 * 定义: 单个传感单元在相同条件下，对同一压力连续多次加载卸载时，
 * 其输出响应结果的一致程度。
 * 
 * 量化方法: eR = ±(Δymax / YFSO) × 100%
 * 重复性误差越小越好
 */
export interface RepeatabilityResult {
  /** 重复性误差 eR (% FSO) - 值越小越好 */
  errorFSO: number;
  /** 重复性评分 (0-100) - 值越高越好, 100 - errorFSO */
  score: number;
  /** 重复性等级 */
  grade: "优秀" | "良好" | "异常";
  /** 各点位的标准差 */
  pointStdDevs: number[];
  /** 各点位的最大偏差 Δymax */
  pointMaxDevs: number[];
  /** 平均标准差 */
  meanStdDev: number;
  /** 全局最大偏差 Δymax */
  maxDeviation: number;
  /** 满量程输出 YFSO (取255) */
  fso: number;
  /** 采样帧数 */
  sampleCount: number;
  /** 增益重复性 (消除基线漂移后) */
  gainRepeatability: number;
  /** 基线漂移量 */
  baselineDrift: number;
}

/**
 * 一致性分析结果 (Consistency) - 综合维度
 * 
 * 定义: 传感器阵列在空间、时间及批次间提供稳定结果的整体能力。
 * 包含均匀性(空间一致性) + 重复性(时间一致性)
 * 
 * 是衡量传感器阵列整体可靠性和制造工艺成熟度的最高指标。
 */
export interface ConsistencyResult {
  /** 一致性综合评分 (0-100) */
  score: number;
  /** 一致性等级 */
  grade: "优秀" | "良好" | "异常";
  /** 空间一致性分项 (来自均匀性) */
  spatialScore: number;
  /** 时间一致性分项 (来自重复性) */
  temporalScore: number;
  /** 行间变异系数 (%) */
  rowCV: number;
  /** 列间变异系数 (%) */
  colCV: number;
}

// 保留旧接口兼容性
export type MatrixStats = BasicStats;

// ============================================================
// 常量
// ============================================================

export const DEFAULT_ACTIVE_THRESHOLD = 5;
const FSO = 255; // 满量程输出 (8-bit ADC)

// ============================================================
// 基本统计
// ============================================================

/** 计算矩阵基本统计量 */
export function computeBasicStats(data: number[], threshold = DEFAULT_ACTIVE_THRESHOLD): BasicStats {
  if (data.length === 0) {
    return {
      min: 0, max: 0, mean: 0, std: 0, median: 0, range: 0,
      activePoints: 0, totalPoints: 0, activeRate: 0,
    };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const n = data.length;
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  const mean = data.reduce((s, v) => s + v, 0) / n;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const activePoints = data.filter(v => v > threshold).length;
  const activeRate = (activePoints / n) * 100;

  return { min, max, mean, std, median, range, activePoints, totalPoints: n, activeRate };
}

/** 计算活跃区域的统计量 */
export function computeActiveStats(data: number[], threshold = DEFAULT_ACTIVE_THRESHOLD): BasicStats {
  const activeData = data.filter(v => v > threshold);
  if (activeData.length === 0) return computeBasicStats(data, threshold);
  const stats = computeBasicStats(activeData, threshold);
  stats.totalPoints = data.length;
  stats.activePoints = activeData.length;
  stats.activeRate = (activeData.length / data.length) * 100;
  return stats;
}

// ============================================================
// 1. 均匀性 (Uniformity) - 空间维度
// ============================================================

/**
 * 计算均匀性
 * RSD = S / X̄ × 100%
 * 评估阵列中不同传感点对相同压力的响应差异
 */
export function computeUniformity(data: number[], dim: number, threshold = DEFAULT_ACTIVE_THRESHOLD): UniformityResult {
  const activeData: number[] = [];
  const activePositions: [number, number][] = [];
  
  // 收集活跃点数据和位置
  for (let row = 0; row < dim; row++) {
    for (let col = 0; col < dim; col++) {
      const val = data[row * dim + col];
      if (val > threshold) {
        activeData.push(val);
        activePositions.push([row, col]);
      }
    }
  }

  if (activeData.length === 0) {
    return {
      rsd: 0, cv: 0, score: 0, grade: "异常",
      stdDev: 0, mean: 0,
      rowMeans: new Array(dim).fill(0),
      colMeans: new Array(dim).fill(0),
      maxPoint: [0, 0, 0], minPoint: [0, 0, 0],
    };
  }

  // 计算平均值 X̄ 和标准偏差 S
  const mean = activeData.reduce((s, v) => s + v, 0) / activeData.length;
  const variance = activeData.reduce((s, v) => s + (v - mean) ** 2, 0) / activeData.length;
  const stdDev = Math.sqrt(variance);

  // RSD = S / X̄ × 100%
  const rsd = mean > 0 ? (stdDev / mean) * 100 : 0;
  const cv = rsd;

  // 均匀性评分: 100 - RSD (clamped to 0-100)
  const score = Math.max(0, Math.min(100, 100 - rsd));

  // 等级判定
  let grade: UniformityResult["grade"];
  if (rsd < 5) grade = "优秀";
  else if (rsd < 15) grade = "良好";
  else grade = "异常";

  // 行列均值
  const rowMeans: number[] = [];
  const colSums: number[] = new Array(dim).fill(0);
  const colCounts: number[] = new Array(dim).fill(0);

  for (let row = 0; row < dim; row++) {
    let rowSum = 0;
    let rowCount = 0;
    for (let col = 0; col < dim; col++) {
      const val = data[row * dim + col];
      if (val > threshold) {
        rowSum += val;
        rowCount++;
        colSums[col] += val;
        colCounts[col]++
      }
    }
    rowMeans.push(rowCount > 0 ? rowSum / rowCount : 0);
  }

  const colMeans = colSums.map((sum, i) => colCounts[i] > 0 ? sum / colCounts[i] : 0);

  // 最大/最小值点位
  let maxVal = -1, minVal = Infinity;
  let maxPos: [number, number] = [0, 0], minPos: [number, number] = [0, 0];
  activeData.forEach((val, i) => {
    if (val > maxVal) { maxVal = val; maxPos = activePositions[i]; }
    if (val < minVal) { minVal = val; minPos = activePositions[i]; }
  });

  return {
    rsd, cv, score, grade, stdDev, mean,
    rowMeans, colMeans,
    maxPoint: [maxPos[0], maxPos[1], maxVal],
    minPoint: [minPos[0], minPos[1], minVal < Infinity ? minVal : 0],
  };
}

// ============================================================
// 2. 重复性 (Repeatability) - 时间维度
// ============================================================

/**
 * 计算重复性
 * eR = ±(Δymax / YFSO) × 100%
 * 评估同一传感点多次测量的输出稳定性
 */
export function computeRepeatability(frames: number[][], threshold = DEFAULT_ACTIVE_THRESHOLD): RepeatabilityResult {
  const emptyResult: RepeatabilityResult = {
    errorFSO: 0, score: 0, grade: "异常",
    pointStdDevs: [], pointMaxDevs: [],
    meanStdDev: 0, maxDeviation: 0, fso: FSO,
    sampleCount: frames.length,
    gainRepeatability: 0, baselineDrift: 0,
  };

  if (frames.length < 2) return emptyResult;

  const pointCount = frames[0].length;
  const pointStdDevs: number[] = new Array(pointCount).fill(0);
  const pointMaxDevs: number[] = new Array(pointCount).fill(0);
  let totalStd = 0;
  let globalMaxDev = 0;

  // 计算基线漂移 (第一帧和最后一帧的均值差)
  const firstFrameMean = frames[0].reduce((s, v) => s + v, 0) / pointCount;
  const lastFrameMean = frames[frames.length - 1].reduce((s, v) => s + v, 0) / pointCount;
  const baselineDrift = Math.abs(lastFrameMean - firstFrameMean);

  // 只对活跃点进行分析
  let activeCount = 0;
  for (let i = 0; i < pointCount; i++) {
    const values = frames.map(f => f[i]);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    
    // 跳过低于阈值的点位（平均值低于阈值视为非活跃点）
    if (mean <= threshold) {
      pointStdDevs[i] = 0;
      pointMaxDevs[i] = 0;
      continue;
    }
    activeCount++;
    
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const std = Math.sqrt(variance);
    pointStdDevs[i] = std;
    totalStd += std;

    // Δymax: 同一输入压力点上多次测量输出值的最大偏差
    const maxDev = Math.max(...values.map(v => Math.abs(v - mean)));
    pointMaxDevs[i] = maxDev;
    if (maxDev > globalMaxDev) globalMaxDev = maxDev;
  }

  const effectiveCount = activeCount > 0 ? activeCount : 1;
  const meanStdDev = totalStd / effectiveCount;

  // eR = ±(Δymax / YFSO) × 100%
  const errorFSO = (globalMaxDev / FSO) * 100;

  // 重复性评分: 100 - errorFSO (clamped)
  const score = Math.max(0, Math.min(100, 100 - errorFSO));

  // 等级判定
  let grade: RepeatabilityResult["grade"];
  if (errorFSO < 5) grade = "优秀";
  else if (errorFSO < 15) grade = "良好";
  else grade = "异常";

  // 增益重复性 (消除基线漂移后的变异)
  const gainRepeatability = Math.max(0, 100 - ((meanStdDev / FSO) * 100));

  return {
    errorFSO, score, grade,
    pointStdDevs, pointMaxDevs,
    meanStdDev, maxDeviation: globalMaxDev, fso: FSO,
    sampleCount: frames.length,
    gainRepeatability, baselineDrift,
  };
}

// ============================================================
// 3. 一致性 (Consistency) - 综合维度
// ============================================================

/**
 * 计算一致性
 * 综合均匀性(空间一致性)和重复性(时间一致性)
 * 是衡量传感器阵列整体可靠性的最高指标
 */
export function computeConsistency(
  uniformity: UniformityResult,
  repeatability: RepeatabilityResult,
): ConsistencyResult {
  const spatialScore = uniformity.score;
  const temporalScore = repeatability.score;

  // 行列CV
  const activeRowMeans = uniformity.rowMeans.filter(v => v > 0);
  const activeColMeans = uniformity.colMeans.filter(v => v > 0);
  const rowCV = computeCV(activeRowMeans);
  const colCV = computeCV(activeColMeans);

  // 综合评分: 空间60% + 时间40% (空间均匀性在验收中权重更高)
  const score = spatialScore * 0.6 + temporalScore * 0.4;

  // 等级判定
  let grade: ConsistencyResult["grade"];
  if (score >= 85) grade = "优秀";
  else if (score >= 60) grade = "良好";
  else grade = "异常";

  return { score, grade, spatialScore, temporalScore, rowCV, colCV };
}

// ============================================================
// 辅助函数
// ============================================================

function computeCV(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return (std / mean) * 100;
}

/**
 * 获取压力值对应的颜色 (热力图)
 * 从深蓝 -> 蓝 -> 青 -> 绿 -> 黄 -> 红
 */
export function pressureToColor(value: number, maxValue = 255): string {
  const ratio = Math.max(0, Math.min(1, value / maxValue));

  if (ratio < 0.02) {
    return `rgba(8, 12, 30, 0.9)`;
  }

  const stops = [
    { pos: 0.0, r: 10, g: 20, b: 60 },
    { pos: 0.15, r: 20, g: 60, b: 180 },
    { pos: 0.3, r: 30, g: 140, b: 220 },
    { pos: 0.45, r: 0, g: 210, b: 200 },
    { pos: 0.6, r: 50, g: 220, b: 80 },
    { pos: 0.75, r: 220, g: 220, b: 30 },
    { pos: 0.9, r: 255, g: 120, b: 20 },
    { pos: 1.0, r: 255, g: 40, b: 40 },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (ratio >= stops[i].pos && ratio <= stops[i + 1].pos) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const t = (ratio - lower.pos) / (upper.pos - lower.pos);
  const r = Math.round(lower.r + (upper.r - lower.r) * t);
  const g = Math.round(lower.g + (upper.g - lower.g) * t);
  const b = Math.round(lower.b + (upper.b - lower.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 获取压力等级标签
 */
export function getPressureLevel(value: number): { label: string; color: string } {
  if (value < 10) return { label: "无压力", color: "#1a2040" };
  if (value < 50) return { label: "轻压", color: "#1e6fd9" };
  if (value < 100) return { label: "中压", color: "#00d4c8" };
  if (value < 180) return { label: "重压", color: "#dcdc1e" };
  return { label: "超压", color: "#ff2828" };
}
