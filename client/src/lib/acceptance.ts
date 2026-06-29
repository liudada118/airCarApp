/**
 * 验收合格判定规则模块
 * 
 * 允许用户自定义各指标的合格阈值，
 * 自动给出"合格/测试过程异常"结论
 */

// ============================================================
// 类型定义
// ============================================================

/** 单项指标的阈值规则 */
export interface ThresholdRule {
  /** 规则名称 */
  name: string;
  /** 指标键名 */
  key: string;
  /** 优秀阈值 */
  excellent: number;
  /** 良好阈值 */
  good: number;
  /** 一般阈值 */
  fair: number;
  /** 单位 */
  unit: string;
  /** 是否反向（值越小越好，如RSD、eR） */
  inverted: boolean;
  /** 描述 */
  description: string;
}

/** 验收规则配置 */
export interface AcceptanceConfig {
  /** 重复性评分阈值 (0-100) - 值越大越好 */
  repeatabilityScore: ThresholdRule;
  /** 一致性评分阈值 (0-100) - 值越大越好 */
  consistencyScore: ThresholdRule;
    /** 最低合格标准：至少达到“良好”的指标数量 */
  minPassCount: number;
  /** 是否启用严格模式（所有指标必须达标） */
  strictMode: boolean;
}

/** 单项指标判定结果 */
export interface IndicatorResult {
  key: string;
  name: string;
  value: number;
  unit: string;
  grade: "优秀" | "良好" | "异常";
  passed: boolean;
  color: string;
}

/** 验收判定总结果 */
export interface AcceptanceResult {
  /** 总体结论 */
  verdict: "合格" | "测试过程异常" | "待定";
  /** 总体颜色 */
  verdictColor: string;
  /** 各项指标结果 */
  indicators: IndicatorResult[];
  /** 通过的指标数 */
  passedCount: number;
  /** 总指标数 */
  totalCount: number;
  /** 判定说明 */
  summary: string;
  /** 时间戳 */
  timestamp: Date;
}

// ============================================================
// 默认配置
// ============================================================

export const DEFAULT_ACCEPTANCE_CONFIG: AcceptanceConfig = {
  repeatabilityScore: {
    name: "重复性评分",
    key: "repeatabilityScore",
    excellent: 90,
    good: 75,
    fair: 60,
    unit: "分",
    inverted: false,
    description: "重复性评分，值越大越好",
  },
  consistencyScore: {
    name: "一致性评分",
    key: "consistencyScore",
    excellent: 90,
    good: 75,
    fair: 60,
    unit: "分",
    inverted: false,
    description: "综合一致性评分，值越大越好",
  },
  minPassCount: 2,
  strictMode: false,
};

// ============================================================
// 判定逻辑
// ============================================================

/** 根据阈值规则判定单项指标等级 */
function gradeIndicator(value: number, rule: ThresholdRule): { grade: IndicatorResult["grade"]; passed: boolean; color: string } {
  if (rule.inverted) {
    // 值越小越好 (RSD, eR)
    if (value <= rule.excellent) return { grade: "优秀", passed: true, color: "#4ade80" };
    if (value <= rule.good) return { grade: "良好", passed: true, color: "#3b82f6" };
    return { grade: "异常", passed: false, color: "#ef4444" };
  } else {
    // 值越大越好 (一致性评分)
    if (value >= rule.excellent) return { grade: "优秀", passed: true, color: "#4ade80" };
    if (value >= rule.good) return { grade: "良好", passed: true, color: "#3b82f6" };
    return { grade: "异常", passed: false, color: "#ef4444" };
  }
}

/** 执行验收判定 */
export function evaluateAcceptance(
  config: AcceptanceConfig,
  values: {
    repeatabilityScore: number;
    consistencyScore: number;
  },
): AcceptanceResult {
  const rules = [
    config.repeatabilityScore,
    config.consistencyScore,
  ];

  const valueMap: Record<string, number> = {
    repeatabilityScore: values.repeatabilityScore,
    consistencyScore: values.consistencyScore,
  };

  const indicators: IndicatorResult[] = rules.map((rule) => {
    const val = valueMap[rule.key];
    const { grade, passed, color } = gradeIndicator(val, rule);
    return {
      key: rule.key,
      name: rule.name,
      value: val,
      unit: rule.unit,
      grade,
      passed,
      color,
    };
  });

  const passedCount = indicators.filter((i) => i.passed).length;
  const totalCount = indicators.length;

  let verdict: AcceptanceResult["verdict"];
  let verdictColor: string;
  let summary: string;

  if (config.strictMode) {
    // 严格模式：所有指标必须达标
    if (passedCount === totalCount) {
      verdict = "合格";
      verdictColor = "#4ade80";
      summary = `所有 ${totalCount} 项指标均达标，传感器通过验收`;
    } else {
      verdict = "测试过程异常";
      verdictColor = "#ef4444";
      const failedNames = indicators.filter((i) => !i.passed).map((i) => i.name).join("、");
      summary = `${failedNames} 未达标，传感器未通过验收`;
    }
  } else {
    // 宽松模式：达到最低通过数量即可
    if (passedCount >= config.minPassCount) {
      verdict = "合格";
      verdictColor = "#4ade80";
      summary = `${passedCount}/${totalCount} 项指标达标（要求≥${config.minPassCount}），传感器通过验收`;
    } else if (passedCount > 0) {
      verdict = "测试过程异常";
      verdictColor = "#ef4444";
      summary = `仅 ${passedCount}/${totalCount} 项达标（要求≥${config.minPassCount}），传感器未通过验收`;
    } else {
      verdict = "测试过程异常";
      verdictColor = "#ef4444";
      summary = `所有指标均未达标，传感器未通过验收`;
    }
  }

  return {
    verdict,
    verdictColor,
    indicators,
    passedCount,
    totalCount,
    summary,
    timestamp: new Date(),
  };
}

/** 从 localStorage 加载验收配置 */
export function loadAcceptanceConfig(): AcceptanceConfig {
  try {
    const saved = localStorage.getItem("jq-acceptance-config");
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_ACCEPTANCE_CONFIG, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_ACCEPTANCE_CONFIG };
}

/** 保存验收配置到 localStorage */
export function saveAcceptanceConfig(config: AcceptanceConfig): void {
  try {
    localStorage.setItem("jq-acceptance-config", JSON.stringify(config));
  } catch {
    // ignore
  }
}
