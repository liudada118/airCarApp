/**
 * Airbag_Y 数据帧解析 (协议 v1.0)
 *
 * 新板子通过串口发送固定 1376 字节的帧：
 *   [ 1372 字节数据区 (343 × float32 小端) ][ 帧尾 AA 55 03 99 ]
 * 原生层 (SerialModule) 在识别到 1372 字节数据区后，通过 onAirbagFullFrame 事件
 * 把数据区的原始字节（CSV，每个 0~255）发给 JS，这里负责按偏移解析成各字段。
 *
 * 任一标量字段的字节偏移 = 前面所有 float 的个数 × 4；数组元素 i 的偏移 = 起始偏移 + i×4。
 */

export const AIRBAG_FRAME_DATA_LEN = 1372; // 数据区字节数（不含 4 字节帧尾）

export type FieldKind = 'float' | 'int' | 'bool';

export interface ScalarField {
  offset: number;
  key: string;
  label: string;
  kind: FieldKind;
  /** 备注（阈值回显、固定值等） */
  note?: string;
}

export interface ScalarSection {
  title: string;
  fields: ScalarField[];
}

/** 标量字段分组（严格按协议偏移表） */
export const SCALAR_SECTIONS: ScalarSection[] = [
  {
    title: '侧翼控制',
    fields: [
      {offset: 480, key: 'leftPressure', label: '左侧区域压力', kind: 'float'},
      {offset: 484, key: 'rightPressure', label: '右侧区域压力', kind: 'float'},
      {offset: 488, key: 'leftRightRatio', label: '左右压力比', kind: 'float'},
      {offset: 492, key: 'backMeanTotal_wing', label: '侧翼用靠背总压力', kind: 'float'},
      {offset: 496, key: 'ratioInflateLeft_out', label: '充气阈值回显', kind: 'float', note: '阈值回显'},
      {offset: 500, key: 'ratioDeflateLeft_out', label: '放气阈值回显', kind: 'float', note: '阈值回显'},
    ],
  },
  {
    title: '腰托控制',
    fields: [
      {offset: 504, key: 'backTotalThreshold_out', label: '靠背总压阈值', kind: 'float', note: '阈值回显'},
      {offset: 508, key: 'upperMean', label: '上背区平均压力', kind: 'float'},
      {offset: 512, key: 'lowerMean', label: '下背区平均压力', kind: 'float'},
      {offset: 516, key: 'backMeanTotal_lumbar', label: '腰托用靠背总压力', kind: 'float'},
      {offset: 520, key: 'ratio', label: '上/下区压力比', kind: 'float'},
      {offset: 524, key: 'thresholdPassed', label: '是否达门限', kind: 'bool'},
      {offset: 528, key: 'ratioInflate_out', label: '充气阈值回显', kind: 'float', note: '阈值回显'},
      {offset: 532, key: 'ratioDeflate_out', label: '放气阈值回显', kind: 'float', note: '固定 0.35'},
    ],
  },
  {
    title: '腿托控制',
    fields: [
      {offset: 536, key: 'leftButtMean', label: '左臀平均压力', kind: 'float'},
      {offset: 540, key: 'leftLegMean', label: '左腿平均压力', kind: 'float'},
      {offset: 544, key: 'leftRatio', label: '左腿/左臀比', kind: 'float'},
      {offset: 548, key: 'rightButtMean', label: '右臀平均压力', kind: 'float'},
      {offset: 552, key: 'rightLegMean', label: '右腿平均压力', kind: 'float'},
      {offset: 556, key: 'rightRatio', label: '右腿/右臀比', kind: 'float'},
      {offset: 560, key: 'leftInflateThreshold_out', label: '左腿充气阈值', kind: 'float', note: '阈值回显'},
      {offset: 564, key: 'leftDeflateThreshold_out', label: '左腿放气阈值', kind: 'float', note: '固定 0.9'},
      {offset: 568, key: 'rightInflateThreshold_out', label: '右腿充气阈值', kind: 'float', note: '固定 0.75'},
      {offset: 572, key: 'rightDeflateThreshold_out', label: '右腿放气阈值', kind: 'float', note: '固定 0.9'},
    ],
  },
  {
    title: '入座状态机',
    fields: [
      {offset: 576, key: 'stateChanged', label: '状态是否变化', kind: 'bool'},
      {offset: 580, key: 'isOccupied', label: '是否入座', kind: 'bool'},
      {offset: 584, key: 'isFullSeat', label: '是否全座', kind: 'bool'},
      {offset: 588, key: 'cushionSum', label: '坐垫压力和', kind: 'float'},
      {offset: 592, key: 'backrestSum', label: '靠背压力和', kind: 'float'},
      {offset: 596, key: 'offCounter', label: '离座防抖计数', kind: 'int'},
      {offset: 600, key: 'resetCounter', label: '复位过渡计数', kind: 'int'},
      {offset: 604, key: 'backrestLostCounter', label: '靠背丢失计数', kind: 'int'},
      {offset: 608, key: 'reasonCode', label: '状态变化原因码', kind: 'int', note: '0~8'},
    ],
  },
  {
    title: '活体检测',
    fields: [
      {offset: 612, key: 'statusCode', label: '活体状态码', kind: 'int', note: '-1~3'},
      {offset: 616, key: 'isLivingRaw', label: '原始活体判断', kind: 'bool'},
      {offset: 620, key: 'confidence', label: '置信度', kind: 'float'},
      {offset: 624, key: 'sadEnergy', label: 'SAD能量', kind: 'float'},
      {offset: 628, key: 'sadCushion', label: '坐垫SAD', kind: 'float'},
      {offset: 632, key: 'sadBackrest', label: '靠背SAD', kind: 'float'},
      {offset: 636, key: 'sadScore', label: 'SAD归一化分数', kind: 'float'},
      {offset: 640, key: 'detectionTriggered', label: '本周期是否触发', kind: 'bool'},
      {offset: 644, key: 'queueLength', label: '检测队列长度', kind: 'int'},
      {offset: 648, key: 'adaptiveUnlocked', label: '自适应解锁', kind: 'bool'},
    ],
  },
  {
    title: '开关与时序回显',
    fields: [
      {offset: 872, key: 'detectorEnabled_out', label: '活体开关回显', kind: 'bool'},
      {offset: 1356, key: 'inflation_time_out', label: '充气时序', kind: 'int', note: '时序回显'},
      {offset: 1360, key: 'inflation_time1_out', label: '充气时序1', kind: 'int', note: '时序回显'},
      {offset: 1364, key: 'holding_time_out', label: '保压时序', kind: 'int', note: '时序回显'},
      {offset: 1368, key: 'deflation_time_out', label: '放气时序', kind: 'int', note: '时序回显'},
    ],
  },
];

/** reasonCode 含义 */
export const REASON_CODE_LABELS: Record<number, string> = {
  0: '无变化',
  1: '进入仅坐垫入座',
  2: '进入全座入座',
  3: '坐垫→全座',
  4: '离座/过渡',
  5: '离座/过渡',
  6: '离座/过渡',
  7: '离座/过渡',
  8: '离座/过渡',
};

/** statusCode 含义 */
export const STATUS_CODE_LABELS: Record<number, string> = {
  [-1]: '活体检测未启用',
  0: '离座/无对象',
  1: '检测中',
  2: '静物',
  3: '活体',
};

/** 气囊编号 → 名称（协议 §4） */
export const AIRBAG_ID_NAMES: Record<number, string> = {
  1: '右侧翼上',
  2: '左侧翼上',
  3: '右侧翼下',
  4: '左侧翼下',
  5: '腰托1',
  6: '腰托2',
  7: '臀托1',
  8: '臀托2',
  9: '右腿托',
  10: '左腿托',
};

/** 档位含义 */
export function gearLabel(gear: number): string {
  switch (gear) {
    case 0:
      return '关闭/保持';
    case 3:
      return '充气';
    case 4:
      return '放气';
    default:
      return `未知(${gear})`;
  }
}

export interface DecodedAirbag {
  index: number; // 1~24
  id: number;
  gear: number;
}

export interface AirbagFullFrame {
  /** 处理后坐垫 60 点（10×6） */
  cushionData: number[];
  /** 处理后靠背 60 点（10×6） */
  backrestData: number[];
  /** 所有标量字段：key → 数值 */
  scalars: Record<string, number>;
  /** 气囊协议帧 frame[55] 原始值（0~255） */
  airbagFrameRaw: number[];
  /** 解码后的 24 组气囊 [编号, 档位] */
  airbagDecoded: DecodedAirbag[];
  /** 气囊帧头（应为 31） */
  airbagHeader: number;
  /** 气囊帧尾（应为 170,85,3,153） */
  airbagTail: number[];
  /** 输入 120 点回显 */
  frameDataOut: number[];
}

const CUSHION_OFFSET = 0;
const BACKREST_OFFSET = 240;
const AIRBAG_FRAME_OFFSET = 652; // frame[55]
const FRAME_DATA_OUT_OFFSET = 876; // frame_data_out[120]

/**
 * 把原生传来的 CSV（1372 个 0~255 字节）解析成结构化字段。
 * 解析失败（长度不对/非数字）返回 null。
 */
export function parseAirbagFullFrame(csv: string): AirbagFullFrame | null {
  if (!csv) return null;

  const parts = csv.split(',');
  if (parts.length !== AIRBAG_FRAME_DATA_LEN) {
    return null;
  }

  const bytes = new Uint8Array(AIRBAG_FRAME_DATA_LEN);
  for (let i = 0; i < AIRBAG_FRAME_DATA_LEN; i += 1) {
    const v = Number(parts[i]);
    if (Number.isNaN(v)) return null;
    bytes[i] = v & 0xff;
  }

  const dv = new DataView(bytes.buffer);
  const f = (offset: number): number => dv.getFloat32(offset, true); // 小端

  const cushionData: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    cushionData.push(f(CUSHION_OFFSET + i * 4));
  }

  const backrestData: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    backrestData.push(f(BACKREST_OFFSET + i * 4));
  }

  const scalars: Record<string, number> = {};
  for (const section of SCALAR_SECTIONS) {
    for (const field of section.fields) {
      scalars[field.key] = f(field.offset);
    }
  }

  // 气囊协议帧 frame[55]：每个 float 都是 0~255 的协议字节值，读出后四舍五入
  const airbagFrameRaw: number[] = [];
  for (let i = 0; i < 55; i += 1) {
    airbagFrameRaw.push(Math.round(f(AIRBAG_FRAME_OFFSET + i * 4)));
  }

  const airbagHeader = airbagFrameRaw[0];
  const airbagDecoded: DecodedAirbag[] = [];
  for (let n = 1; n <= 24; n += 1) {
    // 第 n 个气囊：编号在 [1+(n-1)*2]、档位在 [2+(n-1)*2]
    const id = airbagFrameRaw[1 + (n - 1) * 2];
    const gear = airbagFrameRaw[2 + (n - 1) * 2];
    airbagDecoded.push({index: n, id, gear});
  }
  const airbagTail = airbagFrameRaw.slice(51, 55);

  const frameDataOut: number[] = [];
  for (let i = 0; i < 120; i += 1) {
    frameDataOut.push(f(FRAME_DATA_OUT_OFFSET + i * 4));
  }

  return {
    cushionData,
    backrestData,
    scalars,
    airbagFrameRaw,
    airbagDecoded,
    airbagHeader,
    airbagTail,
    frameDataOut,
  };
}

/** 按字段类型格式化显示 */
export function formatFieldValue(value: number, kind: FieldKind): string {
  if (value == null || Number.isNaN(value)) return '--';
  switch (kind) {
    case 'bool':
      return Math.round(value) === 1 ? '是 (1)' : '否 (0)';
    case 'int':
      return String(Math.round(value));
    case 'float':
    default:
      return value.toFixed(2);
  }
}
