/**
 * 矩侨工业 - 纤维压力传感器串口通信服务
 * 基于 Web Serial API 实现串口数据采集
 *
 * === 协议A: 1000000bps 设备 ===
 * 帧格式: [AA 55 03 99] + [1024字节数据]
 * 总帧长: 1028字节
 * 矩阵: 32x32(全量) / 16x16(前256) / 10x10(前100)
 *
 * === 协议B: 921600bps 设备（触觉手套/5×5传感矩阵）===
 * 帧格式: [AA 55 03 99] + [包顺序1B] + [传感器类型1B] + [数据]
 * 第一包(包顺序=0x01): 帧头4 + 包顺序1 + 类型1 + 128字节数据 = 134字节
 * 第二包(包顺序=0x02): 帧头4 + 包顺序1 + 类型1 + 128字节数据 + 16字节陀螺仪 = 150字节
 * 两包合并: 128+128 = 256字节压力数据(16×16矩阵)
 * 再按线序映射提取5×5传感矩阵
 */

import { extract5x5FromRaw256 } from "./wire-mapping";

// 帧头标识（两种协议共用）
const FRAME_HEADER = new Uint8Array([0xaa, 0x55, 0x03, 0x99]);
const FRAME_HEADER_LEN = 4;

// 协议A (1000000bps) 常量
const PROTO_A_DATA_LEN = 1024;
const PROTO_A_FRAME_LEN = FRAME_HEADER_LEN + PROTO_A_DATA_LEN; // 1028

// 协议B (921600bps) 常量
const PROTO_B_PKT1_DATA_LEN = 128;
const PROTO_B_PKT2_DATA_LEN = 128 + 16; // 128压力 + 16陀螺仪
const PROTO_B_PKT1_LEN = FRAME_HEADER_LEN + 1 + 1 + PROTO_B_PKT1_DATA_LEN; // 134
const PROTO_B_PKT2_LEN = FRAME_HEADER_LEN + 1 + 1 + PROTO_B_PKT2_DATA_LEN; // 150
const PROTO_B_PKT_SEQ_OFFSET = FRAME_HEADER_LEN; // 包顺序在帧头后第1字节
const PROTO_B_PKT_TYPE_OFFSET = FRAME_HEADER_LEN + 1; // 传感器类型在帧头后第2字节
const PROTO_B_PKT_DATA_OFFSET = FRAME_HEADER_LEN + 2; // 数据从帧头后第3字节开始

export type MatrixSize = "5x5" | "10x10" | "16x16" | "32x32";

export interface SerialConfig {
  baudRate: number;
  matrixSize: MatrixSize;
}

export interface ConnectionStatus {
  connected: boolean;
  portName: string;
  baudRate: number;
  framesReceived: number;
  fps: number;
  lastFrameTime: number;
}

export type DataCallback = (data: number[], matrixSize: MatrixSize) => void;
export type StatusCallback = (status: ConnectionStatus) => void;

/**
 * 传感器内部走线数据转换算法 (jqbed)
 * 仅适用于32x32矩阵的传感器走线重排
 */
function jqbed(arr: number[]): number[] {
  const wsPointData = [...arr];
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 32; j++) {
      const idx1 = i * 32 + j;
      const idx2 = (14 - i) * 32 + j;
      [wsPointData[idx1], wsPointData[idx2]] = [wsPointData[idx2], wsPointData[idx1]];
    }
  }
  const b = wsPointData.splice(0, 15 * 32);
  return wsPointData.concat(b);
}

/**
 * 协议A: 从1024字节原始数据中提取矩阵数据
 */
function extractMatrixDataProtoA(rawData: number[], size: MatrixSize): number[] {
  if (size === "32x32") {
    return jqbed(rawData);
  }
  const dim = size === "16x16" ? 16 : 10;
  return rawData.slice(0, dim * dim);
}

/**
 * 判断当前配置是否使用协议B (921600bps分包协议)
 */
function isProtocolB(config: SerialConfig): boolean {
  return config.baudRate === 921600;
}

// ============================================================
// SerialService - 真实串口通信
// ============================================================

export class SerialService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer: Uint8Array = new Uint8Array(0);
  private running = false;
  private config: SerialConfig;
  private dataCallback: DataCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private frameCount = 0;
  private fpsCounter = 0;
  private fpsTimer: ReturnType<typeof setInterval> | null = null;
  private currentFps = 0;

  // 协议B分包状态
  private protoBPkt1Data: number[] | null = null;
  private protoBSensorType: number = 0;

  constructor(config: SerialConfig) {
    this.config = config;
  }

  static isSupported(): boolean {
    return "serial" in navigator;
  }

  setDataCallback(cb: DataCallback) {
    this.dataCallback = cb;
  }

  setStatusCallback(cb: StatusCallback) {
    this.statusCallback = cb;
  }

  updateConfig(config: Partial<SerialConfig>) {
    this.config = { ...this.config, ...config };
    // 切换协议时清空分包缓存
    this.protoBPkt1Data = null;
  }

  private emitStatus() {
    if (this.statusCallback) {
      this.statusCallback({
        connected: this.running && this.port !== null,
        portName: this.port ? "USB Serial" : "",
        baudRate: this.config.baudRate,
        framesReceived: this.frameCount,
        fps: this.currentFps,
        lastFrameTime: Date.now(),
      });
    }
  }

  async connect(): Promise<boolean> {
    if (!SerialService.isSupported()) {
      throw new Error("当前浏览器不支持 Web Serial API，请使用 Chrome 或 Edge 浏览器");
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({
        baudRate: this.config.baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      });

      this.running = true;
      this.frameCount = 0;
      this.fpsCounter = 0;
      this.currentFps = 0;
      this.buffer = new Uint8Array(0);
      this.protoBPkt1Data = null;

      this.fpsTimer = setInterval(() => {
        this.currentFps = this.fpsCounter;
        this.fpsCounter = 0;
        this.emitStatus();
      }, 1000);

      this.emitStatus();
      this.readLoop();
      return true;
    } catch (err) {
      console.error("串口连接失败:", err);
      this.running = false;
      this.emitStatus();
      throw err;
    }
  }

  async disconnect() {
    this.running = false;

    if (this.fpsTimer) {
      clearInterval(this.fpsTimer);
      this.fpsTimer = null;
    }

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }
    } catch (err) {
      console.error("断开连接时出错:", err);
    }

    this.protoBPkt1Data = null;
    this.emitStatus();
  }

  private async readLoop() {
    if (!this.port?.readable) return;

    try {
      this.reader = this.port.readable.getReader();

      while (this.running) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.processData(value);
        }
      }
    } catch (err) {
      if (this.running) {
        console.error("读取串口数据出错:", err);
      }
    } finally {
      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    }
  }

  private processData(newData: Uint8Array) {
    // 拼接缓冲区
    const combined = new Uint8Array(this.buffer.length + newData.length);
    combined.set(this.buffer);
    combined.set(newData, this.buffer.length);
    this.buffer = combined;

    if (isProtocolB(this.config)) {
      this.processProtocolB();
    } else {
      this.processProtocolA();
    }
  }

  /**
   * 协议A解析 (1000000bps): 固定1028字节帧
   */
  private processProtocolA() {
    while (this.buffer.length >= PROTO_A_FRAME_LEN) {
      const headerIdx = this.findHeader(this.buffer);

      if (headerIdx === -1) {
        this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - 3));
        break;
      }

      if (headerIdx > 0) {
        this.buffer = this.buffer.slice(headerIdx);
      }

      if (this.buffer.length < PROTO_A_FRAME_LEN) {
        break;
      }

      const rawData = Array.from(this.buffer.slice(FRAME_HEADER_LEN, PROTO_A_FRAME_LEN));
      this.buffer = this.buffer.slice(PROTO_A_FRAME_LEN);

      const matrixData = extractMatrixDataProtoA(rawData, this.config.matrixSize);

      this.frameCount++;
      this.fpsCounter++;

      if (this.dataCallback) {
        this.dataCallback(matrixData, this.config.matrixSize);
      }
    }
  }

  /**
   * 协议B解析 (921600bps): 分两包传输
   *
   * 第一包: [AA 55 03 99] [01] [类型] [128字节压力数据]  = 134字节
   * 第二包: [AA 55 03 99] [02] [类型] [128字节压力数据] [16字节陀螺仪] = 150字节
   */
  private processProtocolB() {
    // 最小包长度是第一包134字节
    while (this.buffer.length >= PROTO_B_PKT1_LEN) {
      const headerIdx = this.findHeader(this.buffer);

      if (headerIdx === -1) {
        this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - 3));
        break;
      }

      if (headerIdx > 0) {
        this.buffer = this.buffer.slice(headerIdx);
      }

      // 至少需要帧头+包顺序+类型 = 6字节来判断包类型
      if (this.buffer.length < FRAME_HEADER_LEN + 2) {
        break;
      }

      const pktSeq = this.buffer[PROTO_B_PKT_SEQ_OFFSET];
      const sensorType = this.buffer[PROTO_B_PKT_TYPE_OFFSET];

      if (pktSeq === 0x01) {
        // 第一包: 134字节
        if (this.buffer.length < PROTO_B_PKT1_LEN) {
          break; // 等待更多数据
        }

        // 提取128字节压力数据
        const pressureData = Array.from(
          this.buffer.slice(PROTO_B_PKT_DATA_OFFSET, PROTO_B_PKT_DATA_OFFSET + PROTO_B_PKT1_DATA_LEN)
        );
        this.protoBPkt1Data = pressureData;
        this.protoBSensorType = sensorType;
        this.buffer = this.buffer.slice(PROTO_B_PKT1_LEN);

      } else if (pktSeq === 0x02) {
        // 第二包: 150字节
        if (this.buffer.length < PROTO_B_PKT2_LEN) {
          break; // 等待更多数据
        }

        // 提取128字节压力数据（忽略16字节陀螺仪）
        const pressureData2 = Array.from(
          this.buffer.slice(PROTO_B_PKT_DATA_OFFSET, PROTO_B_PKT_DATA_OFFSET + 128)
        );
        this.buffer = this.buffer.slice(PROTO_B_PKT2_LEN);

        // 只有当第一包已接收时才合并
        if (this.protoBPkt1Data !== null) {
          // 合并两包: 128 + 128 = 256字节 (16×16矩阵)
          const raw256 = [...this.protoBPkt1Data, ...pressureData2];
          this.protoBPkt1Data = null;

          // 按线序映射提取5×5传感数据
          const matrixData = extract5x5FromRaw256(raw256);

          this.frameCount++;
          this.fpsCounter++;

          if (this.dataCallback) {
            this.dataCallback(matrixData, "5x5");
          }
        } else {
          // 没有第一包，丢弃第二包
          this.protoBPkt1Data = null;
        }

      } else {
        // 未知包顺序，跳过这个帧头继续搜索
        this.buffer = this.buffer.slice(FRAME_HEADER_LEN);
      }
    }
  }

  private findHeader(data: Uint8Array): number {
    for (let i = 0; i <= data.length - FRAME_HEADER_LEN; i++) {
      if (
        data[i] === FRAME_HEADER[0] &&
        data[i + 1] === FRAME_HEADER[1] &&
        data[i + 2] === FRAME_HEADER[2] &&
        data[i + 3] === FRAME_HEADER[3]
      ) {
        return i;
      }
    }
    return -1;
  }

  getStatus(): ConnectionStatus {
    return {
      connected: this.running && this.port !== null,
      portName: this.port ? "USB Serial" : "",
      baudRate: this.config.baudRate,
      framesReceived: this.frameCount,
      fps: this.currentFps,
      lastFrameTime: Date.now(),
    };
  }
}

// ============================================================
// MockSerialService - 模拟数据生成器
// ============================================================

export class MockSerialService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: SerialConfig;
  private dataCallback: DataCallback | null = null;
  private statusCallback: StatusCallback | null = null;
  private frameCount = 0;
  private running = false;
  private time = 0;

  constructor(config: SerialConfig) {
    this.config = config;
  }

  static isSupported(): boolean {
    return true;
  }

  setDataCallback(cb: DataCallback) {
    this.dataCallback = cb;
  }

  setStatusCallback(cb: StatusCallback) {
    this.statusCallback = cb;
  }

  updateConfig(config: Partial<SerialConfig>) {
    this.config = { ...this.config, ...config };
  }

  private getDim(): number {
    switch (this.config.matrixSize) {
      case "5x5": return 5;
      case "10x10": return 10;
      case "16x16": return 16;
      case "32x32": return 32;
    }
  }

  private generateFrame(): number[] {
    const dim = this.getDim();
    const total = dim * dim;
    const data: number[] = new Array(total);
    this.time += 0.05;

    const cx = dim / 2 + Math.sin(this.time * 0.7) * dim * 0.2;
    const cy = dim / 2 + Math.cos(this.time * 0.5) * dim * 0.2;

    for (let row = 0; row < dim; row++) {
      for (let col = 0; col < dim; col++) {
        const dx = col - cx;
        const dy = row - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = dim * 0.4;

        let pressure = Math.exp(-(dist * dist) / (2 * maxDist * maxDist / 4)) * 200;
        pressure += Math.sin(dist * 0.5 - this.time * 2) * 20;
        pressure += (Math.random() - 0.5) * 15;

        const cx2 = dim * 0.3 + Math.cos(this.time * 1.2) * dim * 0.1;
        const cy2 = dim * 0.7 + Math.sin(this.time * 0.8) * dim * 0.1;
        const dx2 = col - cx2;
        const dy2 = row - cy2;
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        pressure += Math.exp(-(dist2 * dist2) / (2 * (maxDist * 0.5) * (maxDist * 0.5) / 4)) * 120;

        data[row * dim + col] = Math.max(0, Math.min(255, Math.round(pressure)));
      }
    }

    return data;
  }

  async connect(): Promise<boolean> {
    this.running = true;
    this.frameCount = 0;

    const interval = isProtocolB(this.config) ? 10 : 72; // 921600设备100Hz

    this.timer = setInterval(() => {
      if (!this.running) return;

      const data = this.generateFrame();
      this.frameCount++;

      if (this.dataCallback) {
        this.dataCallback(data, this.config.matrixSize);
      }

      if (this.statusCallback) {
        this.statusCallback({
          connected: true,
          portName: "模拟设备 (Demo)",
          baudRate: this.config.baudRate,
          framesReceived: this.frameCount,
          fps: Math.round(1000 / interval),
          lastFrameTime: Date.now(),
        });
      }
    }, interval);

    if (this.statusCallback) {
      this.statusCallback({
        connected: true,
        portName: "模拟设备 (Demo)",
        baudRate: this.config.baudRate,
        framesReceived: 0,
        fps: 0,
        lastFrameTime: Date.now(),
      });
    }

    return true;
  }

  async disconnect() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.statusCallback) {
      this.statusCallback({
        connected: false,
        portName: "",
        baudRate: this.config.baudRate,
        framesReceived: this.frameCount,
        fps: 0,
        lastFrameTime: Date.now(),
      });
    }
  }

  getStatus(): ConnectionStatus {
    return {
      connected: this.running,
      portName: this.running ? "模拟设备 (Demo)" : "",
      baudRate: this.config.baudRate,
      framesReceived: this.frameCount,
      fps: this.running ? Math.round(1000 / (isProtocolB(this.config) ? 10 : 72)) : 0,
      lastFrameTime: Date.now(),
    };
  }
}
