/**
 * 北汽项目气囊通信协议
 * 帧结构：55字节
 * [帧头1B] [24个气囊×2B=48B] [工作模式1B] [方向标识1B] [帧尾4B]
 */

// ─── 常量 ───────────────────────────────────────────────
export const FRAME_HEAD = 0x1f;
export const FRAME_TAIL = [0xaa, 0x55, 0x03, 0x99] as const;
export const FRAME_LENGTH = 55;
export const AIRBAG_COUNT = 24;

export interface SerialConfig {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: string;
}

export const DEFAULT_SERIAL_OPTIONS: SerialConfig = {
  baudRate: 1000000,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
};

export const BAUD_RATE_OPTIONS = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 500000, 921600, 1000000,
];

// ─── 枚举 ───────────────────────────────────────────────
export enum GearLevel {
  Stop = 0x00, // 停止/保压
  Gear1 = 0x01, // 1档
  Gear2 = 0x02, // 2档
  Gear3 = 0x03, // 3档
  Gear0 = 0x04, // 0档（全部放完气）
}

export enum WorkMode {
  Auto = 0x00,
  Manual = 0x01,
}

export enum DataDirection {
  Send = 0x00, // 主机→从机
  Receive = 0x01, // 从机→主机
}

export const GEAR_LABELS: Record<GearLevel, string> = {
  [GearLevel.Stop]: "保压/停止",
  [GearLevel.Gear1]: "1档",
  [GearLevel.Gear2]: "2档",
  [GearLevel.Gear3]: "3档",
  [GearLevel.Gear0]: "0档(放气)",
};

export const GEAR_COLORS: Record<GearLevel, string> = {
  [GearLevel.Stop]: "#64748b",   // slate
  [GearLevel.Gear1]: "#10b981",  // emerald
  [GearLevel.Gear2]: "#06b6d4",  // cyan
  [GearLevel.Gear3]: "#f59e0b",  // amber
  [GearLevel.Gear0]: "#ef4444",  // red
};

// ─── 类型 ───────────────────────────────────────────────
export interface AirbagState {
  id: number;       // 1-24
  gear: GearLevel;  // 当前档位
}

export interface FrameData {
  airbags: AirbagState[];
  workMode: WorkMode;
  direction: DataDirection;
}

export interface SavedCommand {
  id: string;
  name: string;
  frame: FrameData;
  rawHex: string;
  createdAt: number;
}

export interface CommandCombo {
  id: string;
  name: string;
  steps: CommandStep[];
  createdAt: number;
}

export interface CommandStep {
  commandId: string;
  delayAfterMs: number; // 执行后延迟(ms)
}

export interface SendOptions {
  repeat: boolean;
  intervalMs: number; // 重复发送间隔(ms)
  count: number;      // 重复次数, 0=无限
}

export interface LogEntry {
  id: string;
  timestamp: number;
  direction: "send" | "receive";
  rawHex: string;
  parsed: FrameData | null;
  error?: string;
}

// ─── 座椅气囊布局定义 ─────────────────────────────────────
export interface AirbagPosition {
  id: number;
  name: string;
  zone: string;
  x: number;      // SVG坐标百分比
  y: number;
  width: number;
  height: number;
}

export const AIRBAG_LAYOUT: AirbagPosition[] = [
  // 靠背上部
  { id: 1,  name: "靠背左上",  zone: "靠背", x: 18, y: 8,  width: 28, height: 12 },
  { id: 2,  name: "靠背右上",  zone: "靠背", x: 54, y: 8,  width: 28, height: 12 },
  // 靠背中部
  { id: 3,  name: "靠背左侧",  zone: "靠背", x: 10, y: 26, width: 16, height: 18 },
  { id: 4,  name: "靠背右侧",  zone: "靠背", x: 74, y: 26, width: 16, height: 18 },
  { id: 5,  name: "腰托上",    zone: "腰托", x: 32, y: 26, width: 36, height: 10 },
  { id: 6,  name: "腰托下",    zone: "腰托", x: 32, y: 37, width: 36, height: 10 },
  // 座垫
  { id: 7,  name: "座垫左前",  zone: "座垫", x: 22, y: 56, width: 24, height: 12 },
  { id: 8,  name: "座垫右前",  zone: "座垫", x: 54, y: 56, width: 24, height: 12 },
  { id: 9,  name: "座垫左后",  zone: "座垫", x: 18, y: 72, width: 28, height: 12 },
  { id: 10, name: "座垫右后",  zone: "座垫", x: 54, y: 72, width: 28, height: 12 },
  // 扩展气囊 11-24（预留）
  ...Array.from({ length: 14 }, (_, i) => ({
    id: i + 11,
    name: `气囊${i + 11}`,
    zone: "扩展",
    x: 0, y: 0, width: 0, height: 0,
  })),
];

// ─── 编码/解码函数 ─────────────────────────────────────────

/** 将 FrameData 编码为 55 字节的 Uint8Array */
export function encodeFrame(data: FrameData): Uint8Array {
  const buf = new Uint8Array(FRAME_LENGTH);
  buf[0] = FRAME_HEAD;

  for (let i = 0; i < AIRBAG_COUNT; i++) {
    const ab = data.airbags[i];
    buf[1 + i * 2] = ab?.id ?? (i + 1);
    buf[2 + i * 2] = ab?.gear ?? GearLevel.Stop;
  }

  buf[49] = data.workMode;
  buf[50] = data.direction;
  buf[51] = FRAME_TAIL[0];
  buf[52] = FRAME_TAIL[1];
  buf[53] = FRAME_TAIL[2];
  buf[54] = FRAME_TAIL[3];

  return buf;
}

/** 将 55 字节的 Uint8Array 解码为 FrameData，失败返回 null */
export function decodeFrame(buf: Uint8Array): FrameData | null {
  if (buf.length < FRAME_LENGTH) return null;
  if (buf[0] !== FRAME_HEAD) return null;
  if (
    buf[51] !== FRAME_TAIL[0] ||
    buf[52] !== FRAME_TAIL[1] ||
    buf[53] !== FRAME_TAIL[2] ||
    buf[54] !== FRAME_TAIL[3]
  ) return null;

  const airbags: AirbagState[] = [];
  for (let i = 0; i < AIRBAG_COUNT; i++) {
    airbags.push({
      id: buf[1 + i * 2],
      gear: buf[2 + i * 2] as GearLevel,
    });
  }

  return {
    airbags,
    workMode: buf[49] as WorkMode,
    direction: buf[50] as DataDirection,
  };
}

/** Uint8Array 转十六进制字符串 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
}

/** 十六进制字符串转 Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** 创建默认帧数据（所有气囊保压） */
export function createDefaultFrame(): FrameData {
  return {
    airbags: Array.from({ length: AIRBAG_COUNT }, (_, i) => ({
      id: i + 1,
      gear: GearLevel.Stop,
    })),
    workMode: WorkMode.Auto,
    direction: DataDirection.Send,
  };
}

/** 格式化解析结果为可读文本 */
export function formatParsedFrame(data: FrameData): string {
  const dir = data.direction === DataDirection.Send ? "下发(主机→从机)" : "上传(从机→主机)";
  const mode = data.workMode === WorkMode.Auto ? "自动模式" : "手动模式";
  const activeAirbags = data.airbags
    .filter((a) => a.gear !== GearLevel.Stop)
    .map((a) => `气囊${a.id}:${GEAR_LABELS[a.gear]}`)
    .join(", ");

  return `[${dir}] [${mode}] ${activeAirbags || "全部保压"}`;
}
