/**
 * candleLight USB-CAN 适配器 WebUSB 驱动
 * 
 * 实现 gs_usb 协议，支持以下设备：
 * - candleLight (VID:0x1209, PID:0x606F)
 * - gs_usb (VID:0x1D50, PID:0x606F)
 * - cesCanExtFd (VID:0x1CD2, PID:0x606F)
 * - CANable (VID:0x16D0, PID:0x10B8)
 * 
 * CAN帧格式 (20字节):
 *   [0-3]   echo_id   (uint32 LE) - 0xFFFFFFFF 表示接收帧
 *   [4-7]   can_id    (uint32 LE) - CAN ID + 标志位
 *   [8]     can_dlc   (uint8)     - 数据长度
 *   [9]     channel   (uint8)
 *   [10]    flags     (uint8)
 *   [11]    reserved  (uint8)
 *   [12-19] data      (8 bytes)   - CAN 数据负载
 */

// ─── 设备过滤器 ─────────────────────────────────────────
export const GS_USB_FILTERS: USBDeviceFilter[] = [
  { vendorId: 0x1d50, productId: 0x606f }, // gs_usb
  { vendorId: 0x1209, productId: 0x606f }, // candleLight
  { vendorId: 0x1cd2, productId: 0x606f }, // cesCanExtFd
  { vendorId: 0x16d0, productId: 0x10b8 }, // CANable / abeCanDebuggerFd
];

// ─── 常量 ───────────────────────────────────────────────
const ENDPOINT_IN = 1;
const ENDPOINT_OUT = 2;
const CAN_FRAME_SIZE = 20;

// gs_usb 控制请求
const GS_USB_BREQ = {
  HOST_FORMAT: 0,
  BITTIMING: 1,
  MODE: 2,
  BERR: 3,
  BT_CONST: 4,
  DEVICE_CONFIG: 5,
  TIMESTAMP: 6,
  IDENTIFY: 7,
} as const;

// CAN ID 标志
const CAN_EFF_FLAG = 0x80000000;
const CAN_RTR_FLAG = 0x40000000;
const CAN_ERR_FLAG = 0x20000000;
const CAN_SFF_MASK = 0x000007ff;
const CAN_EFF_MASK = 0x1fffffff;

// ─── 类型定义 ───────────────────────────────────────────
export interface CANFrameRaw {
  canId: number;      // 11-bit or 29-bit CAN ID (without flags)
  isExtended: boolean;
  isRTR: boolean;
  isError: boolean;
  dlc: number;
  data: Uint8Array;   // 8 bytes max
  channel: number;
  timestamp: number;
}

export interface DeviceCapabilities {
  features: number;
  fclk_can: number;
  tseg1_min: number;
  tseg1_max: number;
  tseg2_min: number;
  tseg2_max: number;
  sjw_max: number;
  brp_min: number;
  brp_max: number;
  brp_inc: number;
}

export interface DeviceInfo {
  icount: number;
  fw_version: number;
  hw_version: number;
}

export type CandleLightStatus = "disconnected" | "connecting" | "connected" | "error";

export interface CandleLightEvents {
  frame: (frame: CANFrameRaw) => void;
  error: (error: Error) => void;
  statusChange: (status: CandleLightStatus) => void;
}

// ─── 波特率配置 ─────────────────────────────────────────
interface BitTiming {
  prop_seg: number;
  phase_seg1: number;
  phase_seg2: number;
  sjw: number;
  brp: number;
}

function getBitTiming48MHz(bitrate: number): BitTiming | null {
  const base: BitTiming = { prop_seg: 1, phase_seg1: 12, phase_seg2: 2, sjw: 2, brp: 6 };
  const brpMap: Record<number, number> = {
    10000: 300, 20000: 150, 50000: 60, 83333: 36,
    100000: 30, 125000: 24, 250000: 12, 500000: 6, 1000000: 3,
  };
  if (brpMap[bitrate] !== undefined) {
    return { ...base, brp: brpMap[bitrate] };
  }
  return null;
}

function getBitTiming80MHz(bitrate: number): BitTiming | null {
  const base: BitTiming = { prop_seg: 1, phase_seg1: 12, phase_seg2: 2, sjw: 1, brp: 10 };
  const brpMap: Record<number, number> = {
    10000: 500, 20000: 250, 50000: 100, 83333: 60,
    100000: 50, 125000: 40, 250000: 20, 500000: 10, 1000000: 5,
  };
  if (brpMap[bitrate] !== undefined) {
    return { ...base, brp: brpMap[bitrate] };
  }
  return null;
}

// ─── CandleLight 驱动类 ─────────────────────────────────
export class CandleLightDevice {
  private device: USBDevice | null = null;
  private capabilities: DeviceCapabilities | null = null;
  private reading = false;
  private status: CandleLightStatus = "disconnected";
  private listeners: Partial<{ [K in keyof CandleLightEvents]: CandleLightEvents[K][] }> = {};

  // ── 事件 ────────────────────────────────────────────
  on<K extends keyof CandleLightEvents>(event: K, fn: CandleLightEvents[K]) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(fn);
  }

  off<K extends keyof CandleLightEvents>(event: K, fn: CandleLightEvents[K]) {
    const arr = this.listeners[event];
    if (arr) {
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  private emit<K extends keyof CandleLightEvents>(event: K, ...args: Parameters<CandleLightEvents[K]>) {
    const arr = this.listeners[event];
    if (arr) {
      for (const fn of arr) {
        try { (fn as any)(...args); } catch (e) { console.error("Event handler error:", e); }
      }
    }
  }

  private setStatus(s: CandleLightStatus) {
    this.status = s;
    this.emit("statusChange", s);
  }

  getStatus(): CandleLightStatus { return this.status; }
  getDevice(): USBDevice | null { return this.device; }
  getCapabilities(): DeviceCapabilities | null { return this.capabilities; }

  // ── WebUSB 可用性检查 ────────────────────────────────
  static isAvailable(): boolean {
    return typeof navigator !== "undefined" && "usb" in navigator;
  }

  // ── 请求设备 ────────────────────────────────────────
  async requestDevice(): Promise<USBDevice | null> {
    if (!CandleLightDevice.isAvailable()) return null;
    try {
      const device = await navigator.usb.requestDevice({ filters: GS_USB_FILTERS });
      return device;
    } catch (e: any) {
      if (e.name === "NotFoundError") return null; // 用户取消
      throw e;
    }
  }

  // ── 获取已授权设备 ──────────────────────────────────
  async getDevices(): Promise<USBDevice[]> {
    if (!CandleLightDevice.isAvailable()) return [];
    try {
      return await navigator.usb.getDevices();
    } catch {
      return [];
    }
  }

  // ── 连接并启动 ──────────────────────────────────────
  async connect(device: USBDevice, bitrate: number): Promise<void> {
    this.setStatus("connecting");
    try {
      this.device = device;

      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);

      // 读取设备能力
      this.capabilities = await this.readCapabilities();
      if (!this.capabilities) {
        throw new Error("无法读取设备能力信息");
      }

      // 设置波特率
      const timing = this.calculateBitTiming(bitrate);
      if (!timing) {
        throw new Error(`不支持的波特率: ${bitrate}。设备时钟: ${this.capabilities.fclk_can}Hz`);
      }
      await this.setBitTiming(timing);

      // 启动 CAN 接口
      await this.startCAN();

      this.setStatus("connected");

      // 开始读取数据
      this.startReading();
    } catch (e: any) {
      this.setStatus("error");
      this.emit("error", e instanceof Error ? e : new Error(String(e)));
      // 尝试清理
      try { await this.cleanup(); } catch { /* ignore */ }
      throw e;
    }
  }

  // ── 断开连接 ────────────────────────────────────────
  async disconnect(): Promise<void> {
    this.reading = false;

    try {
      // 停止 CAN 硬件
      if (this.device && this.device.opened) {
        await this.stopCAN();
        // 等待一下让 transferIn 超时完成
        await new Promise(r => setTimeout(r, 200));
        try { await this.device.releaseInterface(0); } catch { /* ignore */ }
        try { await this.device.close(); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error("Disconnect error:", e);
    }

    this.device = null;
    this.capabilities = null;
    this.setStatus("disconnected");
  }

  // ── 控制传输 ────────────────────────────────────────
  private async controlRead(request: number, length: number): Promise<DataView | null> {
    if (!this.device) return null;
    try {
      const result = await this.device.controlTransferIn(
        { requestType: "vendor", recipient: "interface", request, value: 0, index: 0 },
        length
      );
      if (result.status === "ok" && result.data) return result.data;
    } catch (e) {
      console.error(`controlRead(${request}) failed:`, e);
    }
    return null;
  }

  private async controlWrite(request: number, data: BufferSource): Promise<boolean> {
    if (!this.device) return false;
    try {
      const result = await this.device.controlTransferOut(
        { requestType: "vendor", recipient: "interface", request, value: 0, index: 0 },
        data
      );
      return result.status === "ok";
    } catch (e) {
      console.error(`controlWrite(${request}) failed:`, e);
      return false;
    }
  }

  // ── 读取设备能力 ────────────────────────────────────
  private async readCapabilities(): Promise<DeviceCapabilities | null> {
    const data = await this.controlRead(GS_USB_BREQ.BT_CONST, 40);
    if (!data) return null;
    return {
      features: data.getUint32(0, true),
      fclk_can: data.getUint32(4, true),
      tseg1_min: data.getUint32(8, true),
      tseg1_max: data.getUint32(12, true),
      tseg2_min: data.getUint32(16, true),
      tseg2_max: data.getUint32(20, true),
      sjw_max: data.getUint32(24, true),
      brp_min: data.getUint32(28, true),
      brp_max: data.getUint32(32, true),
      brp_inc: data.getUint32(36, true),
    };
  }

  // ── 读取设备信息 ────────────────────────────────────
  async readDeviceInfo(): Promise<DeviceInfo | null> {
    const data = await this.controlRead(GS_USB_BREQ.DEVICE_CONFIG, 12);
    if (!data) return null;
    return {
      icount: data.getUint8(3),
      fw_version: data.getUint32(4, true),
      hw_version: data.getUint32(8, true),
    };
  }

  // ── 计算波特率定时参数 ──────────────────────────────
  private calculateBitTiming(bitrate: number): BitTiming | null {
    if (!this.capabilities) return null;
    const fclk = this.capabilities.fclk_can;
    if (fclk === 48000000) return getBitTiming48MHz(bitrate);
    if (fclk === 80000000) return getBitTiming80MHz(bitrate);
    
    // 通用计算: 尝试 87.5% 采样点
    const tq_count = 16; // 1 + prop_seg + phase_seg1 + phase_seg2
    const brp = Math.round(fclk / (bitrate * tq_count));
    if (brp < this.capabilities.brp_min || brp > this.capabilities.brp_max) return null;
    return { prop_seg: 1, phase_seg1: 12, phase_seg2: 2, sjw: 2, brp };
  }

  // ── 设置波特率 ──────────────────────────────────────
  private async setBitTiming(timing: BitTiming): Promise<void> {
    const buf = new ArrayBuffer(20);
    const dv = new DataView(buf);
    dv.setUint32(0, timing.prop_seg, true);
    dv.setUint32(4, timing.phase_seg1, true);
    dv.setUint32(8, timing.phase_seg2, true);
    dv.setUint32(12, timing.sjw, true);
    dv.setUint32(16, timing.brp, true);
    const ok = await this.controlWrite(GS_USB_BREQ.BITTIMING, buf);
    if (!ok) throw new Error("设置波特率失败");
  }

  // ── 启动 CAN ────────────────────────────────────────
  private async startCAN(): Promise<void> {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x01, true); // GS_CAN_MODE_START
    dv.setUint32(4, 0x00, true); // flags (no listen-only, no loopback)
    const ok = await this.controlWrite(GS_USB_BREQ.MODE, buf);
    if (!ok) throw new Error("启动 CAN 接口失败");
  }

  // ── 停止 CAN ────────────────────────────────────────
  private async stopCAN(): Promise<void> {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x00, true); // GS_CAN_MODE_RESET
    dv.setUint32(4, 0x00, true);
    await this.controlWrite(GS_USB_BREQ.MODE, buf);
  }

  // ── 数据读取循环 ────────────────────────────────────
  private startReading() {
    this.reading = true;
    this.readLoop();
  }

  private async readLoop() {
    while (this.reading && this.device && this.device.opened) {
      try {
        const result = await this.device.transferIn(ENDPOINT_IN, CAN_FRAME_SIZE);
        if (result.status === "ok" && result.data && result.data.byteLength >= CAN_FRAME_SIZE) {
          const frame = this.parseFrame(result.data);
          if (frame) {
            this.emit("frame", frame);
          }
        } else if (result.status === "stall") {
          // 清除 stall 状态
          try { await this.device.clearHalt("in", ENDPOINT_IN); } catch { /* ignore */ }
        }
      } catch (e: any) {
        if (!this.reading) break; // 正常断开
        // 传输超时或设备断开
        if (e.message?.includes("transfer") || e.message?.includes("device")) {
          // 短暂等待后重试
          await new Promise(r => setTimeout(r, 50));
          continue;
        }
        this.emit("error", e instanceof Error ? e : new Error(String(e)));
        break;
      }
    }
    
    if (this.reading) {
      // 非正常退出
      this.reading = false;
      this.setStatus("error");
    }
  }

  // ── 解析 CAN 帧 ────────────────────────────────────
  private parseFrame(data: DataView): CANFrameRaw | null {
    const echo_id = data.getUint32(0, true);
    // echo_id != 0xFFFFFFFF 表示是回显帧，忽略
    if (echo_id !== 0xffffffff) return null;

    const raw_can_id = data.getUint32(4, true);
    const can_dlc = data.getUint8(8);
    const channel = data.getUint8(9);

    const isExtended = (raw_can_id & CAN_EFF_FLAG) !== 0;
    const isRTR = (raw_can_id & CAN_RTR_FLAG) !== 0;
    const isError = (raw_can_id & CAN_ERR_FLAG) !== 0;

    // 提取实际 CAN ID
    const canId = isExtended
      ? (raw_can_id & CAN_EFF_MASK)
      : (raw_can_id & CAN_SFF_MASK);

    // 跳过错误帧
    if (isError) return null;

    // 提取数据
    const frameData = new Uint8Array(8);
    for (let i = 0; i < 8; i++) {
      frameData[i] = data.getUint8(12 + i);
    }

    return {
      canId,
      isExtended,
      isRTR,
      isError,
      dlc: can_dlc,
      data: frameData,
      channel,
      timestamp: Date.now(),
    };
  }

  // ── 发送 CAN 帧 ────────────────────────────────────
  async sendFrame(canId: number, data: Uint8Array, extended = false): Promise<boolean> {
    if (!this.device || !this.device.opened) return false;

    const buf = new ArrayBuffer(CAN_FRAME_SIZE);
    const dv = new DataView(buf);
    
    let rawId = canId;
    if (extended) rawId |= CAN_EFF_FLAG;
    
    dv.setUint32(0, 0x00000000, true); // echo_id = 0 for sending
    dv.setUint32(4, rawId, true);
    dv.setUint8(8, Math.min(data.length, 8)); // dlc
    dv.setUint8(9, 0); // channel
    dv.setUint8(10, 0); // flags
    dv.setUint8(11, 0); // reserved
    for (let i = 0; i < 8; i++) {
      dv.setUint8(12 + i, i < data.length ? data[i] : 0);
    }

    try {
      const result = await this.device.transferOut(ENDPOINT_OUT, buf);
      return result.status === "ok";
    } catch (e) {
      console.error("Send frame failed:", e);
      return false;
    }
  }

  // ── 清理 ────────────────────────────────────────────
  private async cleanup() {
    try {
      if (this.device && this.device.opened) {
        try { await this.device.releaseInterface(0); } catch { /* ignore */ }
        try { await this.device.close(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    this.device = null;
  }
}

// ─── 单例实例 ───────────────────────────────────────────
export const candleLightDevice = new CandleLightDevice();
