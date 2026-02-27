/**
 * 模拟串口数据模块
 *
 * 模拟 release_package 中 IntegratedSeatSystem.process_frame 的输出数据，
 * 以及串口传感器的原始 144 点数据帧。
 *
 * 输出格式遵循 OUTPUT_FIELDS.md 定义的三个核心字段：
 *   seat_status, body_shape_info, airbag_command
 *
 * 用于在没有真实硬件时进行 UI 开发和调试。
 */

import type {AlgoResult} from '../types';

// ─── 原始传感器数据帧（144 个 uint8 值）───────────────────────────
// 结构：[0-71] 靠背传感器，[72-143] 坐垫传感器
// 每部分：[0-5] 左侧小矩形，[6-11] 右侧小矩形，[12-71] 中间大矩阵 (10x6)

/** 空帧 - 离座状态 */
export const EMPTY_SENSOR_FRAME: number[] = new Array(144).fill(0);

/** 模拟在座传感器数据帧 - 正常坐姿 */
export const SEATED_SENSOR_FRAME: number[] = [
  // 靠背 [0-71]
  // 左侧小矩形 [0-5]
  12, 15, 18, 20, 16, 10,
  // 右侧小矩形 [6-11]
  14, 17, 19, 22, 18, 11,
  // 中间大矩阵 [12-71] (10行x6列)
  5, 8, 12, 14, 10, 6,     // row 0 (肩部上)
  10, 18, 25, 28, 20, 12,  // row 1 (肩部)
  15, 28, 42, 45, 30, 16,  // row 2 (上背)
  20, 35, 55, 58, 38, 22,  // row 3 (上背)
  25, 42, 68, 72, 48, 28,  // row 4 (中背)
  30, 48, 78, 82, 55, 32,  // row 5 (中背)
  35, 55, 85, 90, 62, 38,  // row 6 (腰部)
  40, 60, 92, 95, 68, 42,  // row 7 (腰部)
  30, 45, 70, 75, 50, 30,  // row 8 (下背)
  15, 25, 40, 42, 28, 15,  // row 9 (下背)
  // 坐垫 [72-143]
  // 左侧小矩形 [72-77]
  20, 25, 30, 28, 22, 15,
  // 右侧小矩形 [78-83]
  22, 28, 32, 30, 24, 16,
  // 中间大矩阵 [84-143] (10行x6列)
  10, 15, 20, 22, 16, 10,  // row 0 (前缘)
  18, 30, 45, 48, 35, 20,  // row 1
  25, 45, 68, 72, 50, 28,  // row 2 (大腿前)
  35, 58, 85, 90, 65, 38,  // row 3 (大腿)
  45, 70, 98, 105, 78, 48, // row 4 (大腿中)
  55, 82, 115, 120, 88, 55,// row 5 (臀部)
  60, 90, 125, 130, 95, 62,// row 6 (臀部中心)
  55, 85, 118, 122, 90, 58,// row 7 (臀部)
  40, 65, 90, 95, 70, 42,  // row 8 (臀部后)
  20, 35, 50, 52, 38, 22,  // row 9 (后缘)
];

// ─── 新算法 process_frame 输出的模拟数据 ─────────────────────────

/** 模拟算法结果 - 离座状态 */
export const MOCK_RESULT_OFF_SEAT: AlgoResult = {
  // 三个核心字段
  seat_status: {
    state: 'OFF_SEAT',
    is_off_seat: true,
    is_seated: false,
    is_resetting: false,
  },
  body_shape_info: {
    body_shape: '',
    body_shape_state: 'IDLE',
    confidence: 0.0,
    probabilities: {},
    preference: {
      active_body_shape: null,
      using_preference: false,
      is_recording: false,
      recording_progress: null,
    },
  },
  airbag_command: {
    command: null,
    is_new_command: false,
  },
  // 兼容字段
  control_command: null,
  is_new_command: false,
  living_status: '离座',
  body_type: '未判断',
  seat_state: 'OFF_SEAT',
  cushion_sum: 0,
  backrest_sum: 0,
  living_confidence: 0.0,
  body_features: {},
  frame_count: 1,
};

/** 模拟算法结果 - 检测中（坐垫有压力） */
export const MOCK_RESULT_CUSHION_ONLY: AlgoResult = {
  // 三个核心字段
  seat_status: {
    state: 'CUSHION_ONLY',
    is_off_seat: false,
    is_seated: true,
    is_resetting: false,
  },
  body_shape_info: {
    body_shape: '',
    body_shape_state: 'COLLECTING',
    confidence: 0.0,
    probabilities: {},
    preference: {
      active_body_shape: null,
      using_preference: false,
      is_recording: false,
      recording_progress: null,
    },
  },
  airbag_command: {
    command: null,
    is_new_command: false,
  },
  // 兼容字段
  control_command: null,
  is_new_command: false,
  living_status: '检测中',
  body_type: '未判断',
  seat_state: 'CUSHION_ONLY',
  cushion_sum: 3500.0,
  backrest_sum: 150.0,
  living_confidence: 0.45,
  body_features: {
    cushion: {
      original_sum: 3500.0,
      filtered_sum: 3480.0,
      max_value: 130,
      center_of_mass: [5.2, 2.8],
    },
    backrest: {
      original_sum: 150.0,
      filtered_sum: 145.0,
      max_value: 42,
      center_of_mass: [4.0, 3.0],
    },
    body_size_type: '未判断',
    body_size_raw: 0.0,
  },
  frame_count: 50,
};

/** 模拟算法结果 - 自适应锁定（正常在座，体型中等） */
export const MOCK_RESULT_ADAPTIVE_LOCKED: AlgoResult = {
  // 三个核心字段
  seat_status: {
    state: 'ADAPTIVE_LOCKED',
    is_off_seat: false,
    is_seated: true,
    is_resetting: false,
  },
  body_shape_info: {
    body_shape: '中等',
    body_shape_state: 'COMPLETED',
    confidence: 0.92,
    probabilities: {
      '瘦小': 0.05,
      '中等': 0.92,
      '高大': 0.03,
    },
    preference: {
      active_body_shape: '中等',
      using_preference: true,
      is_recording: false,
      recording_progress: null,
    },
  },
  airbag_command: {
    command: [
      31, 1, 0, 2, 0, 3, 0, 4, 0, 5, 3, 6, 3, 7, 0, 8, 0,
      9, 0, 10, 0, 11, 0, 12, 0, 13, 0, 14, 0, 15, 0, 16, 0,
      17, 0, 18, 0, 19, 0, 20, 0, 21, 0, 22, 0, 23, 0, 24, 0,
      0, 0, 170, 85, 3, 153,
    ],
    is_new_command: true,
  },
  // 兼容字段
  control_command: [
    31, 1, 0, 2, 0, 3, 0, 4, 0, 5, 3, 6, 3, 7, 0, 8, 0,
    9, 0, 10, 0, 11, 0, 12, 0, 13, 0, 14, 0, 15, 0, 16, 0,
    17, 0, 18, 0, 19, 0, 20, 0, 21, 0, 22, 0, 23, 0, 24, 0,
    0, 0, 170, 85, 3, 153,
  ],
  is_new_command: true,
  living_status: '活体',
  body_type: '大人',
  seat_state: 'ADAPTIVE_LOCKED',
  cushion_sum: 5200.0,
  backrest_sum: 2800.0,
  living_confidence: 0.92,
  body_features: {
    cushion: {
      original_sum: 5200.0,
      filtered_sum: 5180.0,
      max_value: 130,
      center_of_mass: [5.5, 3.0],
    },
    backrest: {
      original_sum: 2800.0,
      filtered_sum: 2780.0,
      max_value: 95,
      center_of_mass: [5.0, 3.0],
    },
    body_size_type: '大人',
    body_size_raw: 0.78,
  },
  frame_count: 200,
};

/** 模拟算法结果 - 复位中 */
export const MOCK_RESULT_RESETTING: AlgoResult = {
  // 三个核心字段
  seat_status: {
    state: 'RESETTING',
    is_off_seat: false,
    is_seated: false,
    is_resetting: true,
  },
  body_shape_info: {
    body_shape: '',
    body_shape_state: 'IDLE',
    confidence: 0.0,
    probabilities: {},
    preference: {
      active_body_shape: null,
      using_preference: false,
      is_recording: false,
      recording_progress: null,
    },
  },
  airbag_command: {
    command: [
      31, 1, 4, 2, 4, 3, 4, 4, 4, 5, 4, 6, 4, 7, 4, 8, 4,
      9, 4, 10, 4, 11, 0, 12, 0, 13, 0, 14, 0, 15, 0, 16, 0,
      17, 0, 18, 0, 19, 0, 20, 0, 21, 0, 22, 0, 23, 0, 24, 0,
      0, 0, 170, 85, 3, 153,
    ],
    is_new_command: true,
  },
  // 兼容字段
  control_command: [
    31, 1, 4, 2, 4, 3, 4, 4, 4, 5, 4, 6, 4, 7, 4, 8, 4,
    9, 4, 10, 4, 11, 0, 12, 0, 13, 0, 14, 0, 15, 0, 16, 0,
    17, 0, 18, 0, 19, 0, 20, 0, 21, 0, 22, 0, 23, 0, 24, 0,
    0, 0, 170, 85, 3, 153,
  ],
  is_new_command: true,
  living_status: '离座',
  body_type: '未判断',
  seat_state: 'RESETTING',
  cushion_sum: 50.0,
  backrest_sum: 20.0,
  living_confidence: 0.0,
  body_features: {},
  frame_count: 350,
};

// ─── 模拟串口事件发射器 ──────────────────────────────────────────

export type MockScenario =
  | 'off_seat'
  | 'cushion_only'
  | 'adaptive_locked'
  | 'resetting';

const SCENARIO_RESULTS: Record<MockScenario, AlgoResult> = {
  off_seat: MOCK_RESULT_OFF_SEAT,
  cushion_only: MOCK_RESULT_CUSHION_ONLY,
  adaptive_locked: MOCK_RESULT_ADAPTIVE_LOCKED,
  resetting: MOCK_RESULT_RESETTING,
};

const SCENARIO_SENSOR_DATA: Record<MockScenario, number[]> = {
  off_seat: EMPTY_SENSOR_FRAME,
  cushion_only: SEATED_SENSOR_FRAME,
  adaptive_locked: SEATED_SENSOR_FRAME,
  resetting: EMPTY_SENSOR_FRAME,
};

type MockListener = (data: {
  data?: string;
  result?: string;
  error?: string;
}) => void;

/**
 * 模拟串口数据管理器
 *
 * 在没有真实硬件时，按指定场景周期性地发射模拟传感器数据和算法结果。
 */
export class MockSerialManager {
  private scenario: MockScenario = 'adaptive_locked';
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frameCount = 0;
  private dataListeners: MockListener[] = [];
  private resultListeners: MockListener[] = [];

  /** 设置当前模拟场景 */
  setScenario(scenario: MockScenario): void {
    this.scenario = scenario;
    this.frameCount = 0;
  }

  /** 获取当前场景 */
  getScenario(): MockScenario {
    return this.scenario;
  }

  /** 添加传感器数据监听器 */
  addDataListener(listener: MockListener): () => void {
    this.dataListeners.push(listener);
    return () => {
      this.dataListeners = this.dataListeners.filter(l => l !== listener);
    };
  }

  /** 添加算法结果监听器 */
  addResultListener(listener: MockListener): () => void {
    this.resultListeners.push(listener);
    return () => {
      this.resultListeners = this.resultListeners.filter(l => l !== listener);
    };
  }

  /** 启动模拟数据发射（每 ~77ms 一帧，约 13fps） */
  start(intervalMs: number = 77): void {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.frameCount += 1;

      // 添加微小随机扰动使数据更真实
      const sensorData = SCENARIO_SENSOR_DATA[this.scenario].map(v => {
        const noise = Math.floor(Math.random() * 5) - 2;
        return Math.max(0, Math.min(255, v + noise));
      });

      // 发射传感器数据
      const sensorPayload = sensorData.join(',');
      this.dataListeners.forEach(l => l({data: sensorPayload}));

      // 每 4 帧发射一次算法结果（模拟 control_check_interval = 4）
      if (this.frameCount % 4 === 0) {
        const result = {
          ...SCENARIO_RESULTS[this.scenario],
          frame_count: this.frameCount,
        };
        this.resultListeners.forEach(l => l({result: JSON.stringify(result)}));
      }
    }, intervalMs);
  }

  /** 停止模拟数据发射 */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** 获取当前场景的传感器数据快照 */
  getSensorSnapshot(): number[] {
    return [...SCENARIO_SENSOR_DATA[this.scenario]];
  }

  /** 获取当前场景的算法结果快照 */
  getResultSnapshot(): AlgoResult {
    return {...SCENARIO_RESULTS[this.scenario], frame_count: this.frameCount};
  }
}

/** 全局单例 */
export const mockSerial = new MockSerialManager();
