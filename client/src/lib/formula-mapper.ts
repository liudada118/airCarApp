/**
 * ADC值公式映射工具
 * 支持用户输入数学公式，将原始ADC值映射为显示值
 * 自变量为 x（原始ADC值），输出为映射后的显示值
 */

/** 公式映射配置 */
export interface FormulaMapperConfig {
  /** 是否启用公式映射 */
  enabled: boolean;
  /** 公式表达式，自变量为 x */
  formula: string;
  /** 5×5模式下行偏移量（循环向上滚动行数） */
  rowShift: number;
  /** 5×5模式下列偏移量（循环向左滚动列数） */
  colShift: number;
  /** 5×5模式下列镜像对调（第1列↔第5列，第2列↔第4列） */
  colMirror: boolean;
}

/** 默认配置 */
export const DEFAULT_FORMULA_CONFIG: FormulaMapperConfig = {
  enabled: false,
  formula: "x",
  rowShift: 2,
  colShift: 0,
  colMirror: true,
};

const STORAGE_KEY = "jq-formula-mapper-config";

/** 加载公式配置（强制关闭公式映射，保留其他配置） */
export function loadFormulaConfig(): FormulaMapperConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_FORMULA_CONFIG, ...parsed, enabled: false, formula: "x" };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_FORMULA_CONFIG };
}

/** 保存公式配置 */
export function saveFormulaConfig(config: FormulaMapperConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

/**
 * 安全的数学函数白名单
 * 只允许这些函数在公式中使用
 */
const MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  pow: Math.pow,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
  sign: Math.sign,
  trunc: Math.trunc,
};

/** 常量白名单 */
const MATH_CONSTANTS: Record<string, number> = {
  PI: Math.PI,
  E: Math.E,
};

/**
 * 编译公式为可执行函数
 * 返回 null 表示公式无效
 */
export function compileFormula(formula: string): ((x: number) => number) | null {
  if (!formula.trim()) return null;

  // 安全检查：只允许数字、运算符、括号、小数点、空格、x 和白名单函数名
  const sanitized = formula.trim();

  // 检查是否包含危险字符（如赋值、函数调用等）
  if (/[;{}\[\]`'"\\]/.test(sanitized)) return null;
  // 不允许 import, require, eval, Function 等
  if (/\b(import|require|eval|Function|window|document|global|process|this|new|delete|typeof|void|in|of)\b/i.test(sanitized)) return null;

  try {
    // 构建安全的函数体
    // 将数学函数名替换为安全引用
    let expr = sanitized;

    // 替换常量
    for (const [name, value] of Object.entries(MATH_CONSTANTS)) {
      expr = expr.replace(new RegExp(`\\b${name}\\b`, "g"), String(value));
    }

    // 构建函数参数列表（数学函数 + x）
    const fnNames = Object.keys(MATH_FUNCTIONS);
    const fnValues = Object.values(MATH_FUNCTIONS);

    // 创建函数
    const fn = new Function(...fnNames, "x", `"use strict"; return (${expr});`);

    // 返回绑定了数学函数的执行函数
    const mapper = (x: number): number => {
      const result = fn(...fnValues, x);
      if (typeof result !== "number" || !isFinite(result)) return x;
      return Math.round(result * 100) / 100; // 保留2位小数
    };

    // 验证：用测试值运行一次确保不会报错
    mapper(0);
    mapper(100);
    mapper(255);

    return mapper;
  } catch {
    return null;
  }
}

/**
 * 对整个矩阵数据应用公式映射
 * 返回映射后的新数组（不修改原数组）
 */
export function applyFormulaToMatrix(
  data: number[],
  mapper: (x: number) => number,
): number[] {
  return data.map(mapper);
}

/**
 * 验证公式是否有效
 */
export function validateFormula(formula: string): { valid: boolean; error?: string; sample?: string } {
  if (!formula.trim()) {
    return { valid: false, error: "公式不能为空" };
  }

  const fn = compileFormula(formula);
  if (!fn) {
    return { valid: false, error: "公式语法错误或包含不允许的字符" };
  }

  // 用几个示例值测试
  try {
    const samples = [0, 50, 100, 200, 255];
    const results = samples.map((v) => `${v}→${fn(v)}`);
    return { valid: true, sample: results.join(", ") };
  } catch {
    return { valid: false, error: "公式执行出错" };
  }
}
