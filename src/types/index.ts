/**
 * Airbag zone type - 10 个独立气囊
 *
 * 靠背区域:
 *   1: shoulderL  - 肩部左
 *   2: shoulderR  - 肩部右
 *   3: sideWingL  - 腰部侧翼左
 *   4: sideWingR  - 腰部侧翼右
 *   5: lumbarUp   - 腰部中间上
 *   6: lumbarDown - 腰部中间下
 *
 * 坐垫区域:
 *   7: cushionFL  - 坐垫前左
 *   8: cushionFR  - 坐垫前右
 *   9: cushionRL  - 坐垫后左
 *  10: cushionRR  - 坐垫后右
 */
export type AirbagZone =
  | 'shoulderL'
  | 'shoulderR'
  | 'sideWingL'
  | 'sideWingR'
  | 'lumbarUp'
  | 'lumbarDown'
  | 'cushionFL'
  | 'cushionFR'
  | 'cushionRL'
  | 'cushionRR';

/** 所有气囊 zone 的有序列表（1-10） */
export const ALL_AIRBAG_ZONES: AirbagZone[] = [
  'shoulderL',
  'shoulderR',
  'sideWingL',
  'sideWingR',
  'lumbarUp',
  'lumbarDown',
  'cushionFL',
  'cushionFR',
  'cushionRL',
  'cushionRR',
];

/**
 * Airbag zone config
 */
export interface AirbagZoneConfig {
  key: AirbagZone;
  label: string;
  side: 'left' | 'right';
}

/**
 * Airbag values (0-10)
 */
export type AirbagValues = Record<AirbagZone, number>;

/** 默认气囊值（全部为 0） */
export const DEFAULT_AIRBAG_VALUES: AirbagValues = {
  shoulderL: 0,
  shoulderR: 0,
  sideWingL: 0,
  sideWingR: 0,
  lumbarUp: 0,
  lumbarDown: 0,
  cushionFL: 0,
  cushionFR: 0,
  cushionRL: 0,
  cushionRR: 0,
};

/**
 * 气囊指令状态
 *   0 = 空闲（无背景、无箭头）
 *   3 = 充气（蓝色背景 + 向上箭头）
 *   4 = 放气（蓝色背景 + 向下箭头）
 */
export type AirbagCommandState = 0 | 3 | 4;

/** 10 个气囊的指令状态 */
export type AirbagCommandStates = Record<AirbagZone, AirbagCommandState>;

/** 默认气囊指令状态（全部空闲） */
export const DEFAULT_AIRBAG_COMMAND_STATES: AirbagCommandStates = {
  shoulderL: 0,
  shoulderR: 0,
  sideWingL: 0,
  sideWingR: 0,
  lumbarUp: 0,
  lumbarDown: 0,
  cushionFL: 0,
  cushionFR: 0,
  cushionRL: 0,
  cushionRR: 0,
};

/**
 * 解析 airbag_command 的 command 数组（55 字节）
 *
 * 数据格式：
 *   [0]      : 帧头（忽略）
 *   [1..48]  : 24 组 [索引, 指令] 交替排列
 *   [49..54] : 校验/尾部（忽略）
 *
 * 前 10 组 [索引, 指令] 对应页面上的 10 个气囊。
 * 索引从 1 开始，与 ALL_AIRBAG_ZONES 的顺序一一对应。
 *
 * 指令值：
 *   0 = 空闲
 *   3 = 充气
 *   4 = 放气
 */
export function parseAirbagCommand(
  command: number[] | null | undefined,
): AirbagCommandStates {
  const states: AirbagCommandStates = {...DEFAULT_AIRBAG_COMMAND_STATES};

  if (!command || command.length < 21) {
    return states;
  }

  // 跳过帧头 [0]，从 [1] 开始，每 2 个元素为一组 [索引, 指令]
  for (let i = 0; i < 10; i++) {
    const offset = 1 + i * 2; // 帧头后偏移
    // const index = command[offset];     // 索引（1-10）
    const cmd = command[offset + 1]; // 指令值

    const zone = ALL_AIRBAG_ZONES[i];
    if (zone && (cmd === 0 || cmd === 3 || cmd === 4)) {
      states[zone] = cmd as AirbagCommandState;
    }
  }

  return states;
}

/**
 * Seat status
 */
export type SeatStatus = 'seated' | 'away';

/**
 * Connection status
 */
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error';

/**
 * Modal type
 */
export type ModalType =
  | 'confirmSave'
  | 'confirmRestore'
  | 'saving'
  | 'connectionError'
  | null;

/**
 * Toast type
 */
export interface ToastConfig {
  visible: boolean;
  message: string;
  type: 'success' | 'info' | 'error';
}

/**
 * Body type (大人/小孩 二分类)
 */
export type BodyType = '大人' | '小孩' | '静物' | '未判断';

/**
 * Body shape (瘦小/中等/高大 三分类)
 */
export type BodyShape = '瘦小' | '中等' | '高大' | '';

/**
 * Body shape classifier state
 */
export type BodyShapeState =
  | 'IDLE'
  | 'COLLECTING'
  | 'CLASSIFYING'
  | 'COMPLETED'
  | 'DISABLED';

/**
 * Seat state machine state (from algorithm)
 */
export type SeatMachineState =
  | 'OFF_SEAT'
  | 'CUSHION_ONLY'
  | 'ADAPTIVE_LOCKED'
  | 'RESETTING';

// ─── 新算法 process_frame 三个核心输出字段 ─────────────────────

/**
 * seat_status - 离座状态
 */
export interface AlgoSeatStatus {
  state: SeatMachineState;
  is_off_seat: boolean;
  is_seated: boolean;
  is_resetting: boolean;
}

/**
 * body_shape_info.preference - 品味记忆状态
 */
export interface PreferenceInfo {
  active_body_shape: string | null;
  using_preference: boolean;
  is_recording: boolean;
  recording_progress: {
    target_shape: string;
    current_frames: number;
    total_frames: number;
    progress_pct: number;
  } | null;
}

/**
 * body_shape_info - 体型相关信息
 */
export interface AlgoBodyShapeInfo {
  body_shape: BodyShape;
  body_shape_state: BodyShapeState;
  confidence: number;
  probabilities: Record<string, number>;
  preference: PreferenceInfo;
}

/**
 * airbag_command - 气囊指令
 */
export interface AlgoAirbagCommand {
  command: number[] | null;
  is_new_command: boolean;
}

/**
 * 完整的算法输出结果
 */
export interface AlgoResult {
  // 三个核心字段
  seat_status: AlgoSeatStatus;
  body_shape_info: AlgoBodyShapeInfo;
  airbag_command: AlgoAirbagCommand;

  // 兼容字段
  control_command: number[] | null;
  is_new_command: boolean;
  living_status: string;
  body_type: BodyType;
  seat_state: SeatMachineState;
  cushion_sum: number;
  backrest_sum: number;
  living_confidence: number;
  body_features: Record<string, unknown>;
  frame_count: number;
}
