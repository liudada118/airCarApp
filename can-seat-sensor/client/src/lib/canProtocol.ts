/**
 * 汽车座椅CAN通信协议解析模块
 *
 * 协议规格：
 * - 通信波特率：500,000 bps
 * - 单帧数据发送时间：72ms
 * - 单个压力值范围：0~255
 * - 靠背 CAN ID：0x460，坐垫 CAN ID：0x461
 * - 每个CAN报文：byte0=子ID, byte1~byte7=7个测试点值
 * - 传感器编号：Sensor{行}{列}，行列均为十六进制(1-A)
 * - 最大支持10×10=100个传感器点
 * - 通信数据域固定1024字节，不足部分填充0
 *
 * 传感器编号规则：
 *   Sensor{x}{y} — x为行号(hex), y为列号(hex)
 *   例如 Sensor34 = 第3行第4列，对应十进制值 0x34 = 52
 */

// ─── CAN ID ────────────────────────────────────────────────
export const CAN_ID_BACKREST = 0x460;
export const CAN_ID_CUSHION = 0x461;

// ─── 帧常量 ────────────────────────────────────────────────
export const FRAME_DELIMITER = [0xaa, 0x55, 0x03, 0x99] as const;
export const DATA_LENGTH = 1028; // 4字节分隔符 + 1024字节数据域
export const DATA_DOMAIN_LENGTH = 1024; // 固定1024字节，不足填0
export const FRAME_SEND_TIME_MS = 72;
export const PRESSURE_MIN = 0;
export const PRESSURE_MAX = 255;
export const CAN_BAUD_RATE = 500000;

// ─── 波特率选项 ────────────────────────────────────────────
export const BAUD_RATE_OPTIONS = [125000, 250000, 500000, 800000, 1000000];

// ─── 串口配置 ──────────────────────────────────────────────
export interface SerialConfig {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
}

export const DEFAULT_SERIAL_CONFIG: SerialConfig = {
  baudRate: CAN_BAUD_RATE,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
};

// ─── 完整子ID→传感器映射表 ──────────────────────────────────
// 每条记录：subId → 7个传感器编号（十六进制），null表示无数据
//
// 重要说明：协议文档中后5帧子ID写为 0x11~0x15，但实际设备
// 发送的是 0x0B~0x0F（连续编号）。以下映射以实际设备为准。
// 传感器编号仍沿用 SensorXY 十六进制格式（X=行, Y=列）。
export interface SensorMapping {
  subId: number;
  sensors: (number | null)[]; // 长度固定为7
}
export const SENSOR_MAP: SensorMapping[] = [
  { subId: 0x01, sensors: [0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17] },
  { subId: 0x02, sensors: [0x18, 0x19, 0x1a, 0x21, 0x22, 0x23, 0x24] },
  { subId: 0x03, sensors: [0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x31] },
  { subId: 0x04, sensors: [0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38] },
  { subId: 0x05, sensors: [0x39, 0x3a, 0x41, 0x42, 0x43, 0x44, 0x45] },
  { subId: 0x06, sensors: [0x46, 0x47, 0x48, 0x49, 0x4a, 0x51, 0x52] },
  { subId: 0x07, sensors: [0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59] },
  { subId: 0x08, sensors: [0x5a, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66] },
  { subId: 0x09, sensors: [0x67, 0x68, 0x69, 0x6a, 0x71, 0x72, 0x73] },
  { subId: 0x0a, sensors: [0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a] },
  { subId: 0x0b, sensors: [0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87] },
  { subId: 0x0c, sensors: [0x88, 0x89, 0x8a, 0x91, 0x92, 0x93, 0x94] },
  { subId: 0x0d, sensors: [0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa1] },
  { subId: 0x0e, sensors: [0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8] },
  { subId: 0x0f, sensors: [0xa9, 0xaa, null, null, null, null, null] },
];

// ─── 矩阵常量 ──────────────────────────────────────────────
// 协议最大支持10×10，但实际连接的传感器可能是子集（如5×5）
export const MAX_MATRIX_ROWS = 10;
export const MAX_MATRIX_COLS = 10;
export const MAX_SENSOR_COUNT = 100;

// ─── 传感器编号工具函数 ────────────────────────────────────

/** 从传感器编号提取行列（1-indexed） */
export function sensorIdToRowCol(sensorId: number): { row: number; col: number } | null {
  const row = (sensorId >> 4) & 0x0f;
  const col = sensorId & 0x0f;
  if (row < 1 || row > 10 || col < 1 || col > 10) return null;
  return { row, col };
}

/** 从行列（1-indexed）构造传感器编号 */
export function rowColToSensorId(row: number, col: number): number {
  return (row << 4) | col;
}

/** 传感器编号转可读字符串 */
export function sensorIdToString(id: number): string {
  const row = ((id >> 4) & 0x0f).toString(16).toUpperCase();
  const col = (id & 0x0f).toString(16).toUpperCase();
  return `S${row}${col}`;
}

/** 构建所有有效传感器ID列表 */
export function buildValidSensorIds(): number[] {
  const ids: number[] = [];
  for (const mapping of SENSOR_MAP) {
    for (const sensor of mapping.sensors) {
      if (sensor !== null) ids.push(sensor);
    }
  }
  return ids;
}

// 预计算：subId快速查找表
const SUB_ID_LOOKUP = new Map<number, SensorMapping>();
for (const m of SENSOR_MAP) {
  SUB_ID_LOOKUP.set(m.subId, m);
}

// ─── CAN报文类型 ───────────────────────────────────────────
export interface CANMessage {
  canId: number;
  subId: number;
  data: number[];
  timestamp: number;
}

export interface CANFrame {
  canId: number;
  rawBytes: Uint8Array; // 8字节：[subId, d1, d2, d3, d4, d5, d6, d7]
  timestamp: number;
}

// ─── 传感器数据 ────────────────────────────────────────────
export interface SensorData {
  /**
   * 10×10矩阵的压力值（0-indexed: matrix[row][col]）
   * row/col 范围 0-9，对应传感器行列 1-A
   * -1 表示该位置无传感器
   */
  matrix: number[][];
  lastUpdate: number;
  frameCount: number;
}

export function createEmptySensorData(): SensorData {
  const allValid = new Set(buildValidSensorIds());
  const matrix: number[][] = [];
  for (let r = 0; r < MAX_MATRIX_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < MAX_MATRIX_COLS; c++) {
      const sid = rowColToSensorId(r + 1, c + 1);
      row.push(allValid.has(sid) ? 0 : -1);
    }
    matrix.push(row);
  }
  return { matrix, lastUpdate: 0, frameCount: 0 };
}

// ─── CAN报文解析 ──────────────────────────────────────────
/** 解析单个CAN报文，更新传感器矩阵 */
export function parseCANMessage(frame: CANFrame, currentData: SensorData): SensorData {
  const bytes = frame.rawBytes;
  if (bytes.length < 2) return currentData; // 至少需要subId + 1个数据字节

  const subId = bytes[0];
  const mapping = SUB_ID_LOOKUP.get(subId);
  if (!mapping) return currentData;

  const newMatrix = currentData.matrix.map((row) => [...row]);
  let updated = false;

  for (let i = 0; i < 7; i++) {
    const sensorId = mapping.sensors[i];
    if (sensorId === null) continue;
    if (i + 1 >= bytes.length) break; // 防止越界

    const pos = sensorIdToRowCol(sensorId);
    if (!pos) continue;

    newMatrix[pos.row - 1][pos.col - 1] = bytes[i + 1];
    updated = true;
  }

  if (!updated) return currentData;

  return {
    matrix: newMatrix,
    lastUpdate: frame.timestamp,
    frameCount: currentData.frameCount + 1,
  };
}

// ─── 有效传感器位置累积追踪器 ─────────────────────────────
/**
 * ActiveSensorTracker：通过累积记忆非零值位置来自动识别有效传感器区域
 *
 * 核心逻辑：
 * - 未按压时：所有位置值为0，无法区分有效传感器和空位置
 * - 按压时：有效传感器值>0，空位置保持0
 * - 因此：一旦某位置出现过非零值，就永久标记为"有效传感器"
 * - 有效区域 = 所有被标记位置的最小包围矩形
 *
 * 使用方式：
 * - 每次收到新的矩阵数据时调用 update(matrix)
 * - 通过 getRegion() 获取当前识别到的有效区域
 * - 通过 reset() 清除累积记忆（断开连接时调用）
 */
export class ActiveSensorTracker {
  /** 累积记忆：曾经出现过非零值的位置 */
  private seenNonZero: boolean[][];
  /** 是否已锁定区域（收到足够数据后锁定，避免频繁变化） */
  private locked: boolean;
  /** 锁定的区域 */
  private lockedRegion: ActiveRegion | null;
  /** 连续稳定帧计数（用于判断何时锁定） */
  private stableCount: number;
  /** 上一次的区域签名（用于判断稳定性） */
  private lastSignature: string;

  constructor() {
    this.seenNonZero = Array.from({ length: MAX_MATRIX_ROWS }, () =>
      Array(MAX_MATRIX_COLS).fill(false)
    );
    this.locked = false;
    this.lockedRegion = null;
    this.stableCount = 0;
    this.lastSignature = "";
  }

  /** 用新的矩阵数据更新累积记忆 */
  update(matrix: number[][]): void {
    let hasNewDiscovery = false;
    for (let r = 0; r < MAX_MATRIX_ROWS; r++) {
      for (let c = 0; c < MAX_MATRIX_COLS; c++) {
        const val = matrix[r]?.[c];
        if (val !== undefined && val > 0 && !this.seenNonZero[r][c]) {
          this.seenNonZero[r][c] = true;
          hasNewDiscovery = true;
        }
      }
    }

    // 如果有新发现，解锁以重新计算
    if (hasNewDiscovery) {
      this.locked = false;
      this.lockedRegion = null;
      this.stableCount = 0;
    }

    // 稳定性检测：连续10帧区域不变则锁定
    if (!this.locked) {
      const sig = this.computeSignature();
      if (sig === this.lastSignature && sig !== "") {
        this.stableCount++;
        if (this.stableCount >= 10) {
          this.locked = true;
          this.lockedRegion = this.computeRegion();
        }
      } else {
        this.stableCount = 0;
        this.lastSignature = sig;
      }
    }
  }

  /** 获取当前识别到的有效区域 */
  getRegion(): ActiveRegion {
    if (this.locked && this.lockedRegion) {
      return this.lockedRegion;
    }
    return this.computeRegion();
  }

  /** 是否已经发现了有效传感器 */
  hasDiscoveredSensors(): boolean {
    for (let r = 0; r < MAX_MATRIX_ROWS; r++) {
      for (let c = 0; c < MAX_MATRIX_COLS; c++) {
        if (this.seenNonZero[r][c]) return true;
      }
    }
    return false;
  }

  /** 获取累积记忆的有效位置掩码（用于UI高亮） */
  getActiveMask(): boolean[][] {
    return this.seenNonZero.map(row => [...row]);
  }

  /** 重置累积记忆 */
  reset(): void {
    this.seenNonZero = Array.from({ length: MAX_MATRIX_ROWS }, () =>
      Array(MAX_MATRIX_COLS).fill(false)
    );
    this.locked = false;
    this.lockedRegion = null;
    this.stableCount = 0;
    this.lastSignature = "";
  }

  /** 计算区域签名（用于稳定性检测） */
  private computeSignature(): string {
    const bits: string[] = [];
    for (let r = 0; r < MAX_MATRIX_ROWS; r++) {
      for (let c = 0; c < MAX_MATRIX_COLS; c++) {
        if (this.seenNonZero[r][c]) bits.push(`${r},${c}`);
      }
    }
    return bits.join("|");
  }

  /** 根据累积记忆计算有效区域 */
  private computeRegion(): ActiveRegion {
    let minRow = MAX_MATRIX_ROWS, maxRow = -1;
    let minCol = MAX_MATRIX_COLS, maxCol = -1;
    let totalActive = 0;

    for (let r = 0; r < MAX_MATRIX_ROWS; r++) {
      for (let c = 0; c < MAX_MATRIX_COLS; c++) {
        if (this.seenNonZero[r][c]) {
          totalActive++;
          if (r < minRow) minRow = r;
          if (r > maxRow) maxRow = r;
          if (c < minCol) minCol = c;
          if (c > maxCol) maxCol = c;
        }
      }
    }

    // 没有发现任何有效传感器时，返回全矩阵
    if (maxRow < 0) {
      return {
        rows: MAX_MATRIX_ROWS,
        cols: MAX_MATRIX_COLS,
        startRow: 0,
        startCol: 0,
        totalActive: 0,
        totalValid: MAX_SENSOR_COUNT,
      };
    }

    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;

    return {
      rows,
      cols,
      startRow: minRow,
      startCol: minCol,
      totalActive,
      totalValid: rows * cols,
    };
  }
}

// ─── 自动识别有效矩阵区域（即时版，不依赖累积记忆） ──────
/**
 * 扫描矩阵数据，找出当前帧中有非零数据的行列范围
 * 用于不需要累积记忆的场景（如模拟器、统计计算）
 */
export interface ActiveRegion {
  rows: number;
  cols: number;
  startRow: number; // 0-indexed
  startCol: number; // 0-indexed
  totalActive: number; // 有非零值的传感器数
  totalValid: number;  // 有效位置总数（含零值）
}

export function detectActiveRegion(data: SensorData): ActiveRegion {
  let minRow = MAX_MATRIX_ROWS, maxRow = -1;
  let minCol = MAX_MATRIX_COLS, maxCol = -1;
  let totalActive = 0;
  let totalValid = 0;

  for (let r = 0; r < MAX_MATRIX_ROWS; r++) {
    for (let c = 0; c < MAX_MATRIX_COLS; c++) {
      const val = data.matrix[r][c];
      if (val < 0) continue; // 无效位置跳过
      totalValid++;
      if (val > 0) {
        totalActive++;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
      }
    }
  }

  // 没有任何活跃数据时，返回全矩阵
  if (maxRow < 0) {
    return {
      rows: MAX_MATRIX_ROWS,
      cols: MAX_MATRIX_COLS,
      startRow: 0,
      startCol: 0,
      totalActive: 0,
      totalValid,
    };
  }

  return {
    rows: maxRow - minRow + 1,
    cols: maxCol - minCol + 1,
    startRow: minRow,
    startCol: minCol,
    totalActive,
    totalValid,
  };
}

/**
 * 提取有效区域的子矩阵
 * 当检测到实际传感器为5×5时，只返回5×5的数据
 */
export function extractSubMatrix(
  data: SensorData,
  region: ActiveRegion
): number[][] {
  const sub: number[][] = [];
  for (let r = region.startRow; r < region.startRow + region.rows; r++) {
    const row: number[] = [];
    for (let c = region.startCol; c < region.startCol + region.cols; c++) {
      if (r < MAX_MATRIX_ROWS && c < MAX_MATRIX_COLS) {
        row.push(data.matrix[r][c]);
      } else {
        row.push(-1);
      }
    }
    sub.push(row);
  }
  return sub;
}

// ─── 数据统计 ──────────────────────────────────────────────
export interface SensorStats {
  min: number;
  max: number;
  avg: number;
  activeCount: number;
  totalCount: number;
  zeroCount: number;
  sum: number;
  stdDev: number;
}

/** 计算矩阵统计数据，可选只统计指定区域 */
export function calculateStats(
  data: SensorData,
  region?: ActiveRegion
): SensorStats {
  const startR = region?.startRow ?? 0;
  const endR = region ? startR + region.rows : MAX_MATRIX_ROWS;
  const startC = region?.startCol ?? 0;
  const endC = region ? startC + region.cols : MAX_MATRIX_COLS;

  let min = PRESSURE_MAX;
  let max = PRESSURE_MIN;
  let sum = 0;
  let activeCount = 0;
  let totalCount = 0;
  let zeroCount = 0;
  const values: number[] = [];

  for (let r = startR; r < endR; r++) {
    for (let c = startC; c < endC; c++) {
      const val = data.matrix[r]?.[c];
      if (val === undefined || val < 0) continue;
      totalCount++;
      if (val === 0) {
        zeroCount++;
        continue;
      }
      activeCount++;
      sum += val;
      values.push(val);
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  const avg = activeCount > 0 ? sum / activeCount : 0;

  // 标准差
  let variance = 0;
  if (activeCount > 1) {
    for (const v of values) {
      variance += (v - avg) * (v - avg);
    }
    variance /= activeCount;
  }

  return {
    min: activeCount > 0 ? min : 0,
    max: activeCount > 0 ? max : 0,
    avg: Math.round(avg * 10) / 10,
    activeCount,
    totalCount,
    zeroCount,
    sum,
    stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
  };
}

// ─── 压力值→颜色映射 ──────────────────────────────────────
/** 热力图颜色：深蓝→青→绿→黄→红 */
export function pressureToColor(value: number, adcThreshold: number = 0): string {
  if (value < 0) return "transparent";
  if (value <= adcThreshold) return "oklch(0.20 0.02 250)";

  const ratio = Math.min(value / 255, 1);

  if (ratio < 0.25) {
    const t = ratio / 0.25;
    return `oklch(${0.35 + t * 0.2} ${0.05 + t * 0.1} ${250 - t * 55})`;
  } else if (ratio < 0.5) {
    const t = (ratio - 0.25) / 0.25;
    return `oklch(${0.55 + t * 0.15} ${0.15 + t * 0.05} ${195 - t * 55})`;
  } else if (ratio < 0.75) {
    const t = (ratio - 0.5) / 0.25;
    return `oklch(${0.70 + t * 0.08} ${0.17 + t * 0.03} ${140 - t * 55})`;
  } else {
    const t = (ratio - 0.75) / 0.25;
    return `oklch(${0.65 - t * 0.1} ${0.20 + t * 0.05} ${85 - t * 60})`;
  }
}

/** RGB颜色（用于Canvas渲染） */
export function pressureToRGB(value: number, adcThreshold: number = 0): [number, number, number] {
  if (value < 0) return [0, 0, 0];
  if (value <= adcThreshold) return [20, 25, 40];

  const ratio = Math.min(value / 255, 1);

  if (ratio < 0.25) {
    const t = ratio / 0.25;
    return [Math.round(10 + t * 10), Math.round(30 + t * 80), Math.round(120 + t * 80)];
  } else if (ratio < 0.5) {
    const t = (ratio - 0.25) / 0.25;
    return [Math.round(20 + t * 10), Math.round(110 + t * 90), Math.round(200 - t * 40)];
  } else if (ratio < 0.75) {
    const t = (ratio - 0.5) / 0.25;
    return [Math.round(30 + t * 200), Math.round(200 - t * 20), Math.round(160 - t * 120)];
  } else {
    const t = (ratio - 0.75) / 0.25;
    return [Math.round(230 + t * 25), Math.round(180 - t * 130), Math.round(40 - t * 30)];
  }
}

/** 获取ADC值对应的文本颜色（确保在热力图背景上可读） */
export function getTextColorForValue(value: number, adcThreshold: number = 0): string {
  if (value < 0) return "transparent";
  if (value <= adcThreshold) return "rgba(255,255,255,0.3)";
  const ratio = Math.min(value / 255, 1);
  // 低值用浅色文字，高值用深色文字
  if (ratio < 0.5) return "rgba(255,255,255,0.9)";
  if (ratio < 0.7) return "rgba(0,0,0,0.7)";
  return "rgba(0,0,0,0.85)";
}

// ─── 日志类型 ──────────────────────────────────────────────
export interface LogEntry {
  id: string;
  timestamp: number;
  direction: "send" | "receive";
  canId: number;
  subId: number;
  rawHex: string;
  sensorValues?: { id: string; value: number }[];
}

// ─── 工具函数 ──────────────────────────────────────────────
export function bytesToHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function canIdToString(id: number): string {
  return "0x" + id.toString(16).toUpperCase().padStart(3, "0");
}

export function getDeviceName(canId: number): string {
  if (canId === CAN_ID_BACKREST) return "靠背";
  if (canId === CAN_ID_CUSHION) return "坐垫";
  return "未知设备";
}

/** 格式化矩阵尺寸显示 */
export function formatMatrixSize(region: ActiveRegion): string {
  return `${region.rows}×${region.cols}`;
}

/** 格式化传感器总数显示 */
export function formatSensorCount(region: ActiveRegion): string {
  return `${region.rows * region.cols}点`;
}
