/**
 * CAN数据模拟器
 * 用于在没有真实CAN设备时模拟传感器数据
 */

import {
  SENSOR_MAP,
  CAN_ID_BACKREST,
  CAN_ID_CUSHION,
  FRAME_SEND_TIME_MS,
  type CANFrame,
  type SensorData,
  parseCANMessage,
  createEmptySensorData,
  MATRIX_ROWS,
  MATRIX_COLS,
  isValidSensorPosition,
} from "./canProtocol";

export type SimulationMode = "static" | "wave" | "random" | "seated" | "gradient";

export interface SimulatorConfig {
  mode: SimulationMode;
  interval: number; // ms
  noiseLevel: number; // 0-50
}

export const DEFAULT_SIMULATOR_CONFIG: SimulatorConfig = {
  mode: "seated",
  interval: FRAME_SEND_TIME_MS,
  noiseLevel: 10,
};

/** 生成模拟的传感器矩阵数据 */
function generateSimulatedMatrix(
  mode: SimulationMode,
  tick: number,
  noiseLevel: number
): number[][] {
  const matrix: number[][] = [];
  const noise = () => Math.floor(Math.random() * noiseLevel * 2) - noiseLevel;

  for (let r = 0; r < MATRIX_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < MATRIX_COLS; c++) {
      if (!isValidSensorPosition(r, c)) {
        row.push(-1);
        continue;
      }

      let value = 0;

      switch (mode) {
        case "static":
          value = 128;
          break;

        case "wave": {
          const phase = (tick * 0.05) + (r * 0.3) + (c * 0.3);
          value = Math.round(128 + 100 * Math.sin(phase));
          break;
        }

        case "random":
          value = Math.floor(Math.random() * 256);
          break;

        case "seated": {
          // 模拟人坐在座椅上的压力分布
          const centerR = 4.5;
          const centerC = 4.5;
          const distR = Math.abs(r - centerR);
          const distC = Math.abs(c - centerC);
          const dist = Math.sqrt(distR * distR + distC * distC);

          // 中心区域压力最大
          const basePressure = Math.max(0, 220 - dist * 35);

          // 添加臀部双峰
          const leftPeak = Math.exp(-((r - 3.5) ** 2 + (c - 3) ** 2) / 4) * 180;
          const rightPeak = Math.exp(-((r - 3.5) ** 2 + (c - 6) ** 2) / 4) * 180;

          // 大腿区域
          const thighLeft = Math.exp(-((r - 6) ** 2 + (c - 3) ** 2) / 6) * 120;
          const thighRight = Math.exp(-((r - 6) ** 2 + (c - 6) ** 2) / 6) * 120;

          value = Math.round(
            Math.min(255, basePressure + leftPeak + rightPeak + thighLeft + thighRight)
          );

          // 添加呼吸效果
          const breathe = Math.sin(tick * 0.02) * 8;
          value = Math.round(Math.max(0, value + breathe));
          break;
        }

        case "gradient": {
          const ratio = (r * MATRIX_COLS + c) / (MATRIX_ROWS * MATRIX_COLS);
          value = Math.round(ratio * 255);
          break;
        }
      }

      // 添加噪声
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
      const row = ((sensorId >> 4) & 0x0F) - 1;
      const col = (sensorId & 0x0F) - 1;
      if (row >= 0 && row < MATRIX_ROWS && col >= 0 && col < MATRIX_COLS) {
        const val = matrix[row][col];
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

    this.timer = setInterval(() => {
      this.tick++;
      const timestamp = Date.now();
      const matrix = generateSimulatedMatrix(
        this.config.mode,
        this.tick,
        this.config.noiseLevel
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

    this.timer = setInterval(() => {
      this.tick++;
      const timestamp = Date.now();

      // 靠背数据
      const backrestMatrix = generateSimulatedMatrix(
        this.config.mode,
        this.tick,
        this.config.noiseLevel
      );
      const backrestFrames = matrixToCANFrames(backrestMatrix, CAN_ID_BACKREST, timestamp);
      let backrestData = createEmptySensorData();
      for (const frame of backrestFrames) {
        backrestData = parseCANMessage(frame, backrestData);
      }
      backrestData.lastUpdate = timestamp;
      backrestData.frameCount = this.tick;
      this.onData(CAN_ID_BACKREST, backrestData);

      // 坐垫数据（稍有不同的模式）
      const cushionMatrix = generateSimulatedMatrix(
        this.config.mode,
        this.tick + 50, // 相位偏移
        this.config.noiseLevel
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
