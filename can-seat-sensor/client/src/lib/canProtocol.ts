/**
 * 汽车座椅CAN通信协议解析模块
 * 
 * 协议规格：
 * - 通信波特率：500,000 bps
 * - 单帧数据发送时间：72ms
 * - 单个压力值范围：0~255
 * - 靠背 CAN ID：0x460
 * - 坐垫 CAN ID：0x461
 * - 每个CAN报文：byte0=子ID, byte1~byte7=7个测试点值
 * - 传感器编号：Sensor{行}{列}，行列均为十六进制(1-A)
 * - 总共100个传感器点（10x10矩阵）
 */

// ─── CAN ID 定义 ────────────────────────────────────────
export const CAN_ID_BACKREST = 0x460;
export const CAN_ID_CUSHION = 0x461;

// ─── 数据帧常量 ─────────────────────────────────────────
export const FRAME_DELIMITER = [0xaa, 0x55, 0x03, 0x99] as const;
export const DATA_LENGTH = 1028;
export const DATA_DOMAIN_LENGTH = 1024;
export const FRAME_SEND_TIME_MS = 72;
export const PRESSURE_MIN = 0;
export const PRESSURE_MAX = 255;
export const CAN_BAUD_RATE = 500000;

// ─── 波特率选项 ─────────────────────────────────────────
export const BAUD_RATE_OPTIONS = [
  125000, 250000, 500000, 800000, 1000000,
];

// ─── 串口配置 ───────────────────────────────────────────
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

// ─── 传感器映射表 ───────────────────────────────────────
// 子ID -> 7个传感器编号的映射
// 传感器编号格式：{行}{列}，十六进制
// 例如 0x11 = 第1行第1列, 0x3A = 第3行第A列
export interface SensorMapping {
  subId: number;
  sensors: (number | null)[]; // 7个传感器编号，null表示无效
}

export const SENSOR_MAP: SensorMapping[] = [
  { subId: 0x01, sensors: [0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17] },
  { subId: 0x02, sensors: [0x18, 0x19, 0x1A, 0x21, 0x22, 0x23, 0x24] },
  { subId: 0x03, sensors: [0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x31] },
  { subId: 0x04, sensors: [0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38] },
  { subId: 0x05, sensors: [0x39, 0x3A, 0x41, 0x42, 0x43, 0x44, 0x45] },
  { subId: 0x06, sensors: [0x46, 0x47, 0x48, 0x49, 0x4A, 0x51, 0x52] },
  { subId: 0x07, sensors: [0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59] },
  { subId: 0x08, sensors: [0x5A, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66] },
  { subId: 0x09, sensors: [0x67, 0x68, 0x69, 0x6A, 0x71, 0x72, 0x73] },
  { subId: 0x0A, sensors: [0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A] },
  { subId: 0x11, sensors: [0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87] },
  { subId: 0x12, sensors: [0x88, 0x89, 0x8A, 0x91, 0x92, 0x93, 0x94] },
  { subId: 0x13, sensors: [0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA1] },
  { subId: 0x14, sensors: [0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8] },
  { subId: 0x15, sensors: [0xA9, 0xAA, null, null, null, null, null] },
];

// 总传感器数量（10x10矩阵中的有效传感器点）
export const TOTAL_SENSOR_COUNT = 100;

// ─── 传感器矩阵定义 ─────────────────────────────────────
// 行：1-A (十六进制)，列：1-A (十六进制)
// 实际矩阵为10x10，100个传感器点
export const MATRIX_ROWS = 10; // 行1-A
export const MATRIX_COLS = 10; // 列1-A

/** 获取传感器在矩阵中的行列位置 (0-indexed) */
export function getSensorPosition(sensorId: number): { row: number; col: number } | null {
  const row = (sensorId >> 4) & 0x0F; // 高4位为行
  const col = sensorId & 0x0F;         // 低4位为列
  if (row < 1 || row > 10 || col < 1 || col > 10) return null;
  return { row: row - 1, col: col - 1 };
}

/** 获取传感器编号的可读字符串 */
export function sensorIdToString(id: number): string {
  const row = ((id >> 4) & 0x0F).toString(16).toUpperCase();
  const col = (id & 0x0F).toString(16).toUpperCase();
  return `S${row}${col}`;
}

/** 构建完整的传感器ID列表（有效的72个） */
export function buildValidSensorIds(): number[] {
  const ids: number[] = [];
  for (const mapping of SENSOR_MAP) {
    for (const sensor of mapping.sensors) {
      if (sensor !== null) ids.push(sensor);
    }
  }
  return ids;
}

/** 检查某个矩阵位置是否有有效传感器 */
export function isValidSensorPosition(row: number, col: number): boolean {
  const validIds = buildValidSensorIds();
  const sensorId = ((row + 1) << 4) | (col + 1);
  return validIds.includes(sensorId);
}

// ─── CAN 报文类型 ───────────────────────────────────────
export interface CANMessage {
  canId: number;       // CAN ID (0x460 or 0x461)
  subId: number;       // 子ID (byte0)
  data: number[];      // 7个压力值 (byte1-byte7)
  timestamp: number;   // 接收时间戳
}

export interface CANFrame {
  canId: number;
  rawBytes: Uint8Array; // 8字节原始数据
  timestamp: number;
}

// ─── 传感器数据状态 ─────────────────────────────────────
export interface SensorData {
  /** 10x10矩阵的压力值，-1表示无效/无传感器 */
  matrix: number[][];
  /** 最后更新时间 */
  lastUpdate: number;
  /** 帧计数 */
  frameCount: number;
}

export function createEmptySensorData(): SensorData {
  const matrix: number[][] = [];
  for (let r = 0; r < MATRIX_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < MATRIX_COLS; c++) {
      row.push(isValidSensorPosition(r, c) ? 0 : -1);
    }
    matrix.push(row);
  }
  return { matrix, lastUpdate: 0, frameCount: 0 };
}

// ─── CAN 报文解析 ───────────────────────────────────────
/** 解析单个CAN报文，更新传感器矩阵 */
export function parseCANMessage(
  frame: CANFrame,
  currentData: SensorData
): SensorData {
  const bytes = frame.rawBytes;
  if (bytes.length < 8) return currentData;

  const subId = bytes[0];
  const mapping = SENSOR_MAP.find((m) => m.subId === subId);
  if (!mapping) return currentData;

  const newMatrix = currentData.matrix.map((row) => [...row]);

  for (let i = 0; i < 7; i++) {
    const sensorId = mapping.sensors[i];
    if (sensorId === null) continue;

    const pos = getSensorPosition(sensorId);
    if (!pos) continue;

    newMatrix[pos.row][pos.col] = bytes[i + 1];
  }

  return {
    matrix: newMatrix,
    lastUpdate: frame.timestamp,
    frameCount: currentData.frameCount + 1,
  };
}

// ─── 数据统计 ───────────────────────────────────────────
export interface SensorStats {
  min: number;
  max: number;
  avg: number;
  activeCount: number;
  totalCount: number;
  zeroCount: number;
}

export function calculateStats(data: SensorData): SensorStats {
  let min = PRESSURE_MAX;
  let max = PRESSURE_MIN;
  let sum = 0;
  let activeCount = 0;
  let totalCount = 0;
  let zeroCount = 0;

  for (let r = 0; r < MATRIX_ROWS; r++) {
    for (let c = 0; c < MATRIX_COLS; c++) {
      const val = data.matrix[r][c];
      if (val < 0) continue; // 无效位置
      totalCount++;
      if (val === 0) {
        zeroCount++;
        continue;
      }
      activeCount++;
      sum += val;
      if (val < min) min = val;
      if (val > max) max = val;
    }
  }

  return {
    min: activeCount > 0 ? min : 0,
    max: activeCount > 0 ? max : 0,
    avg: activeCount > 0 ? Math.round(sum / activeCount) : 0,
    activeCount,
    totalCount,
    zeroCount,
  };
}

// ─── 压力值到颜色映射 ───────────────────────────────────
/** 将压力值(0-255)映射为热力图颜色 */
export function pressureToColor(value: number, adcThreshold: number = 0): string {
  if (value < 0) return "transparent"; // 无效位置
  if (value <= adcThreshold) return "oklch(0.20 0.02 250)"; // 低于阈值，暗色

  const ratio = Math.min(value / 255, 1);

  // 颜色渐变：深蓝 -> 青 -> 绿 -> 黄 -> 红
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

/** 将压力值映射为RGB颜色（用于Canvas渲染） */
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

// ─── 日志类型 ───────────────────────────────────────────
export interface LogEntry {
  id: string;
  timestamp: number;
  direction: "send" | "receive";
  canId: number;
  subId: number;
  rawHex: string;
  sensorValues?: { id: string; value: number }[];
}

// ─── 工具函数 ───────────────────────────────────────────
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

// ─── 自动识别矩阵大小 ───────────────────────────────────
/** 根据有效传感器点自动计算实际使用的行列数 */
export function getActiveMatrixSize(data: SensorData): { rows: number; cols: number } {
  let maxRow = 0;
  let maxCol = 0;
  for (let r = 0; r < MATRIX_ROWS; r++) {
    for (let c = 0; c < MATRIX_COLS; c++) {
      if (data.matrix[r][c] >= 0) {
        if (r + 1 > maxRow) maxRow = r + 1;
        if (c + 1 > maxCol) maxCol = c + 1;
      }
    }
  }
  return { rows: maxRow || MATRIX_ROWS, cols: maxCol || MATRIX_COLS };
}
