/**
 * 多设备管理模块
 * 
 * 支持同时连接多个串口/CAN设备进行并行测试
 */

export type DeviceType = "serial" | "can";
export type DeviceStatus = "disconnected" | "connecting" | "connected" | "error";

export interface DeviceInfo {
  /** 唯一标识 */
  id: string;
  /** 设备名称 */
  name: string;
  /** 设备类型 */
  type: DeviceType;
  /** 连接状态 */
  status: DeviceStatus;
  /** 串口端口（如果是串口设备） */
  port?: SerialPort;
  /** 波特率 */
  baudRate: number;
  /** 矩阵规格 */
  matrixSize: string;
  /** 最后活跃时间 */
  lastActiveTime: Date | null;
  /** 接收帧数 */
  frameCount: number;
  /** 帧率 */
  fps: number;
  /** 当前帧数据 */
  currentData: number[];
  /** 是否为Demo设备 */
  isDemo: boolean;
  /** 错误信息 */
  error?: string;
}

/** 生成设备ID */
export function generateDeviceId(): string {
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 创建新设备信息 */
export function createDeviceInfo(overrides?: Partial<DeviceInfo>): DeviceInfo {
  return {
    id: generateDeviceId(),
    name: "新设备",
    type: "serial",
    status: "disconnected",
    baudRate: 1000000,
    matrixSize: "32x32",
    lastActiveTime: null,
    frameCount: 0,
    fps: 0,
    currentData: [],
    isDemo: false,
    ...overrides,
  };
}

/** 获取设备状态颜色 */
export function getDeviceStatusColor(status: DeviceStatus): string {
  switch (status) {
    case "connected": return "#4ade80";
    case "connecting": return "#f59e0b";
    case "error": return "#ef4444";
    default: return "#6b7280";
  }
}

/** 获取设备状态标签 */
export function getDeviceStatusLabel(status: DeviceStatus): string {
  switch (status) {
    case "connected": return "已连接";
    case "connecting": return "连接中";
    case "error": return "异常";
    default: return "未连接";
  }
}
