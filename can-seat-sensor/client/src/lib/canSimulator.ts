/**
 * CAN数据模拟器
 * 用于在没有真实CAN设备时模拟传感器数据
 * 支持全矩阵(10×10)和子矩阵(如5×5)模拟
 */

import {
  SENSOR_MAP,
  CAN_ID_BACKREST,
  CAN_ID_CUSHION,
  FRAME_SEND_TIME_MS,
  MAX_MATRIX_ROWS,
  MAX_MATRIX_COLS,
  sensorIdToRowCol,
  type CANFrame,
  type SensorData,
  parseCANMessage,
  createEmptySensorData,
  buildValidSensorIds,
} from "./canProtocol";

export type SimulationMode = "static" | "wave" | "random" | "seated" | "gradient";

export interface SimulatorConfig {
  mode: SimulationMode;
  interval: number;
  noiseLevel: number;
  /** 模拟的矩阵行数（1-10），0表示自动使用全矩阵 */
  simulateRows: number;
  /** 模拟的矩阵列数（1-10），0表示自动使用全矩阵 */
  simulateCols: number;
}

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  mode: "seated",
  interval: FRAME_SEND_TIME_MS,
  noiseLevel: 10,
  simulateRows: 5,  // 默认模拟5×5
  simulateCols: 5,
};

// 预计算有效传感器位置集合
const VALID_SENSOR_SET = new Set(buildValidSensorIds());

/** 检查矩阵位置是否有效（0-indexed） */
function isValidPosition(row: number, col: number): boolean {
  const sensorId = ((row + 1) << 4) | (col + 1);
  return VALID_SENSOR_SET.has(sensorId);
}

/** 生成模拟的传感器矩阵数据 */
function generateSimulatedMatrix(
  mode: SimulationMode,
  tick: number,
  noiseLevel: number,
  activeRows: number,
  activeCols: number
): number[][] {
  const matrix: number[][] = [];
  const noise = () =>
    noiseLevel > 0
      ? Math.floor(Math.random() * noiseLevel * 2) - noiseLevel
      : 0;

  for (let r = 0; r < MAX_MATRIX_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < MAX_MATRIX_COLS; c++) {
      if (!isValidPosition(r, c)) {
        row.push(-1);
        continue;
      }

      // 超出模拟范围的传感器填0
      if (r >= activeRows || c >= activeCols) {
        row.push(0);
        continue;
      }

      let value = 0;

      switch (mode) {
        case "static":
          value = 128;
          break;

        case "wave": {
          const phase = tick * 0.05 + r * 0.4 + c * 0.4;
          value = Math.round(128 + 100 * Math.sin(phase));
          break;
        }

        case "random":
          value = Math.floor(Math.random() * 256);
          break;

        case "seated": {
          // 根据实际矩阵大小调整中心点
          const centerR = (activeRows - 1) / 2;
          const centerC = (activeCols - 1) / 2;
          const distR = Math.abs(r - centerR);
          const distC = Math.abs(c - centerC);
          const dist = Math.sqrt(distR * distR + distC * distC);
          const maxDist = Math.sqrt(centerR * centerR + centerC * centerC);

          // 中心区域压力最大，边缘递减
          const basePressure = Math.max(0, 200 * (1 - dist / (maxDist * 1.2)));

          // 双峰模拟（臀部两侧）
          const peakOffset = Math.max(1, activeCols * 0.2);
          const leftPeak =
            Math.exp(
              -((r - centerR * 0.7) ** 2 + (c - (centerC - peakOffset)) ** 2) /
                Math.max(1, activeRows * 0.4)
            ) * 160;
          const rightPeak =
            Math.exp(
              -((r - centerR * 0.7) ** 2 + (c - (centerC + peakOffset)) ** 2) /
                Math.max(1, activeRows * 0.4)
            ) * 160;

          value = Math.round(Math.min(255, basePressure + leftPeak + rightPeak));

          // 呼吸效果
          const breathe = Math.sin(tick * 0.02) * 6;
          value = Math.round(Math.max(0, value + breathe));
          break;
        }

        case "gradient": {
          const ratio = (r * activeCols + c) / (activeRows * activeCols);
          value = Math.round(ratio * 255);
          break;
        }
      }

      value = Math.max(0, Math.min(255, value + noise()));
      row.push(value);
    }
    matrix.push(row);
  }

  return matrix;
}

/** 将矩阵数据转换为CAN帧序列 */
function matrixToCANFrames(
  matrix: number[][],
  canId: number,
  timestamp: number
): CANFrame[] {
  const frames: CANFrame[] = [];

  for (const mapping of SENSOR_MAP) {
    const rawBytes = new Uint8Array(8);
    rawBytes[0] = mapping.subId;

    for (let i = 0; i < 7; i++) {
      const sensorId = mapping.sensors[i];
      if (sensorId === null) {
        rawBytes[i + 1] = 0;
        continue;
      }
      const pos = sensorIdToRowCol(sensorId);
      if (pos && pos.row - 1 < MAX_MATRIX_ROWS && pos.col - 1 < MAX_MATRIX_COLS) {
        const val = matrix[pos.row - 1][pos.col - 1];
        rawBytes[i + 1] = val >= 0 ? val : 0;
      }
    }

    frames.push({ canId, rawBytes, timestamp });
  }

  return frames;
}

export class CANSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private config: SimulatorConfig;
  private onData: (canId: number, data: SensorData) => void;

  constructor(
    config: SimulatorConfig,
    onData: (canId: number, data: SensorData) => void
  ) {
    this.config = { ...config };
    this.onData = onData;
  }

  start(canId: number = CAN_ID_BACKREST) {
    this.stop();
    this.tick = 0;

    const rows = this.config.simulateRows || MAX_MATRIX_ROWS;
    const cols = this.config.simulateCols || MAX_MATRIX_COLS;

    this.timer = setInterval(() => {
      this.tick++;
      const timestamp = Date.now();
      const matrix = generateSimulatedMatrix(
        this.config.mode,
        this.tick,
        this.config.noiseLevel,
        rows,
        cols
      );

      const frames = matrixToCANFrames(matrix, canId, timestamp);
      let sensorData = createEmptySensorData();

      for (const frame of frames) {
        sensorData = parseCANMessage(frame, sensorData);
      }
      sensorData.lastUpdate = timestamp;
      sensorData.frameCount = this.tick;

      this.onData(canId, sensorData);
    }, this.config.interval);
  }

  startDual() {
    this.stop();
    this.tick = 0;

    const rows = this.config.simulateRows || MAX_MATRIX_ROWS;
    const cols = this.config.simulateCols || MAX_MATRIX_COLS;

    this.timer = setInterval(() => {
      this.tick++;
      const timestamp = Date.now();

      // 靠背
      const backrestMatrix = generateSimulatedMatrix(
        this.config.mode,
        this.tick,
        this.config.noiseLevel,
        rows,
        cols
      );
      const backrestFrames = matrixToCANFrames(backrestMatrix, CAN_ID_BACKREST, timestamp);
      let backrestData = createEmptySensorData();
      for (const frame of backrestFrames) {
        backrestData = parseCANMessage(frame, backrestData);
      }
      backrestData.lastUpdate = timestamp;
      backrestData.frameCount = this.tick;
      this.onData(CAN_ID_BACKREST, backrestData);

      // 坐垫
      const cushionMatrix = generateSimulatedMatrix(
        this.config.mode,
        this.tick + 50,
        this.config.noiseLevel,
        rows,
        cols
      );
      const cushionFrames = matrixToCANFrames(cushionMatrix, CAN_ID_CUSHION, timestamp);
      let cushionData = createEmptySensorData();
      for (const frame of cushionFrames) {
        cushionData = parseCANMessage(frame, cushionData);
      }
      cushionData.lastUpdate = timestamp;
      cushionData.frameCount = this.tick;
      this.onData(CAN_ID_CUSHION, cushionData);
    }, this.config.interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  updateConfig(config: Partial<SimulatorConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SimulatorConfig {
    return { ...this.config };
  }
}
