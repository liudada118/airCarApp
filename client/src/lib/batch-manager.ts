/**
 * 批次管理模块
 * 为每个传感器样品建立独立的测试记录
 * 支持多个样品之间的横向对比分析
 */

// ============================================================
// 类型定义
// ============================================================

/** 样品测试记录 */
export interface SampleRecord {
  /** 唯一ID */
  id: string;
  /** 样品名称 */
  name: string;
  /** 批次号 */
  batchId: string;
  /** 矩阵规格 */
  matrixSize: string;
  /** 创建时间 */
  createdAt: string;
  /** 测试时间 */
  testedAt: string;
  /** 重复性 eR (%FSO) */
  repeatabilityER: number;
  /** 重复性评分 */
  repeatabilityScore: number;
  /** 重复性等级 */
  repeatabilityGrade: string;
  /** 一致性评分 */
  consistencyScore: number;
  /** 一致性等级 */
  consistencyGrade: string;
  /** 活跃点比率 */
  activeRate: number;
  /** 平均值 */
  mean: number;
  /** 标准差 */
  std: number;
  /** 验收结论 */
  verdict: "合格" | "异常" | "测试过程异常" | "待定";
  /** 备注 */
  notes: string;
}

/** 批次信息 */
export interface BatchInfo {
  id: string;
  name: string;
  createdAt: string;
  sampleCount: number;
}

// ============================================================
// 存储操作
// ============================================================

const STORAGE_KEY = "jq-batch-samples";

/** 加载所有样品记录 */
export function loadSamples(): SampleRecord[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return [];
}

/** 保存样品记录列表 */
export function saveSamples(samples: SampleRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // ignore
  }
}

/** 添加样品记录 */
export function addSample(sample: SampleRecord): SampleRecord[] {
  const samples = loadSamples();
  samples.unshift(sample);
  saveSamples(samples);
  return samples;
}

/** 删除样品记录 */
export function deleteSample(id: string): SampleRecord[] {
  const samples = loadSamples().filter((s) => s.id !== id);
  saveSamples(samples);
  return samples;
}

/** 更新样品备注 */
export function updateSampleNotes(id: string, notes: string): SampleRecord[] {
  const samples = loadSamples();
  const sample = samples.find((s) => s.id === id);
  if (sample) sample.notes = notes;
  saveSamples(samples);
  return samples;
}

/** 获取所有批次 */
export function getBatches(samples: SampleRecord[]): BatchInfo[] {
  const batchMap = new Map<string, { name: string; createdAt: string; count: number }>();
  for (const s of samples) {
    const existing = batchMap.get(s.batchId);
    if (existing) {
      existing.count++;
    } else {
      batchMap.set(s.batchId, { name: s.batchId, createdAt: s.createdAt, count: 1 });
    }
  }
  return Array.from(batchMap.entries()).map(([id, info]) => ({
    id,
    name: info.name,
    createdAt: info.createdAt,
    sampleCount: info.count,
  }));
}

/** 导出样品数据为CSV */
export function exportSamplesCSV(samples: SampleRecord[]): string {
  const headers = [
    "样品名称", "批次号", "矩阵规格", "测试时间",
    "重复性eR(%FSO)", "重复性评分", "重复性等级",
    "一致性评分", "一致性等级",
    "活跃点比率(%)", "平均值", "标准差",
    "验收结论", "备注",
  ];
  const rows = samples.map((s) => [
    s.name, s.batchId, s.matrixSize, s.testedAt,
    s.repeatabilityER.toFixed(2), s.repeatabilityScore.toFixed(1), s.repeatabilityGrade,
    s.consistencyScore.toFixed(1), s.consistencyGrade,
    s.activeRate.toFixed(1), s.mean.toFixed(1), s.std.toFixed(2),
    s.verdict, s.notes,
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/** 生成唯一ID */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
