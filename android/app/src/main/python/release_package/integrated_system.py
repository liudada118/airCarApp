"""
集成座椅控制系统

整合三个核心功能：
1. 离座检测
2. 活体检测
3. 体型检测

实现复杂的状态机逻辑和自适应调节锁机制
"""

import os
import numpy as np
import queue
from enum import Enum
from typing import Optional, Dict, Any, Tuple, List
from collections import deque
from config import Config
from control import LivingDetector, BodyTypeDetector, ControlAction
from body_shape_classifier import BodyShapeClassifier, ClassifierState
from preference_manager import PreferenceManager
from version import __version__


class IntegratedState(Enum):
    """集成系统状态枚举"""
    OFF_SEAT = 0           # 离座
    CUSHION_ONLY = 1       # 仅坐垫有压力（进行活体+体型检测）
    ADAPTIVE_LOCKED = 2    # 自适应锁已开启（可调节气囊）
    RESETTING = 3          # 离座复位中


class IntegratedSeatSystem:
    """
    集成座椅控制系统

    整合离座检测、活体检测、体型检测和气囊自适应调节

    状态转换逻辑：
    OFF_SEAT → CUSHION_ONLY → ADAPTIVE_LOCKED → RESETTING → OFF_SEAT
    """

    def __init__(self, config_path: str):
        """
        初始化集成系统

        Args:
            config_path: 配置文件路径
        """
        # 加载配置
        self.config = Config(config_path)

        # 集成系统参数
        self.cushion_sum_threshold = self.config.get('integrated_system.cushion_sum_threshold', 500)
        self.backrest_sum_threshold = self.config.get('integrated_system.backrest_sum_threshold', 300)
        self.off_seat_frames_threshold = self.config.get('integrated_system.off_seat_frames_threshold', 65)
        self.reset_frames_threshold = self.config.get('integrated_system.reset_frames_threshold', 65)
        self.reset_deflate_frames = self.config.get('integrated_system.reset_deflate_frames', 32)  # 复位放气阶段时长
        self.use_filtered_sum = self.config.get('integrated_system.use_filtered_sum', True)

        # 初始化检测器
        if self.config.get('living_detection.enabled', True):
            self.living_detector = LivingDetector(self.config)
        else:
            self.living_detector = None

        if self.config.get('body_type_detection.enabled', True):
            self.body_type_detector = BodyTypeDetector(self.config)
        else:
            self.body_type_detector = None

        # 初始化体型三分类器
        if self.config.get('body_shape_classification.enabled', False):
            model_path = self.config.get('body_shape_classification.model_path', None)
            print(f"[集成系统] 体型三分类配置: enabled=True, model_path(raw)={model_path}")
            if model_path and not os.path.isabs(model_path):
                # 相对路径转为绝对路径（相对于配置文件所在目录）
                model_path = os.path.join(os.path.dirname(os.path.abspath(config_path)), model_path)
            print(f"[集成系统] 体型三分类模型路径(abs): {model_path}")
            print(f"[集成系统] 模型文件存在: {os.path.exists(model_path)}")
            self.body_shape_classifier = BodyShapeClassifier(self.config, model_path)
        else:
            print(f"[集成系统] 体型三分类未启用 (enabled={self.config.get('body_shape_classification.enabled', 'NOT_FOUND')})")
            self.body_shape_classifier = None

        # 体型三分类自动触发配置（方案C：自动触发+外部触发双模式）
        self.auto_trigger_body_shape = self.config.get(
            'body_shape_classification.auto_trigger', True
        )
        self._body_shape_auto_triggered = False  # 本次入座是否已自动触发

        # 初始化品味管理器
        preference_file = self.config.get('preference.storage_file', 'preferences.json')
        if not os.path.isabs(preference_file):
            preference_file = os.path.join(os.path.dirname(os.path.abspath(config_path)), preference_file)
        self.preference_manager = PreferenceManager(self.config, preference_file)

        # 初始化拍打按摩检测器
        if self.config.get('tap_massage.enabled', False):
            from tap_massage import TapMassageDetector
            self.tap_massage_detector = TapMassageDetector(self.config)
        else:
            self.tap_massage_detector = None

        # 状态机
        self.state = IntegratedState.OFF_SEAT
        self.frame_count = 0

        # 状态计数器
        self.off_counter = 0          # 离座计数
        self.reset_counter = 0        # 复位计数
        self.backrest_lost_counter = 0  # 靠背消失计数（用于ADAPTIVE_LOCKED的缓冲）

        # 缓冲时间参数
        self.backrest_buffer_frames = self.config.get('integrated_system.backrest_buffer_frames', 13)  # 1秒缓冲

        # 活体检测状态机队列（新增）
        self.living_queue_size = self.config.get('living_detection.queue_size', 3)
        self.living_result_queue = deque(maxlen=self.living_queue_size)  # 存储bool值：True=活体，False=静物
        self.living_queue_enabled_states = [IntegratedState.CUSHION_ONLY, IntegratedState.ADAPTIVE_LOCKED]
        self.adaptive_control_unlocked = False  # 自适应控制解锁标志（首次确认活体后才允许调节）

        # 体型检测状态机队列（新增）
        self.body_type_queue_size = self.config.get('body_type_detection.queue_size', 2)
        self.body_type_result_queue = deque(maxlen=self.body_type_queue_size)  # 存储str值："大人"/"小孩"
        self.body_type_queue_enabled_states = [IntegratedState.CUSHION_ONLY, IntegratedState.ADAPTIVE_LOCKED]
        self.body_type_locked = False  # 体型是否已锁定
        self.locked_body_type = "未判断"  # 锁定的体型值

        # 初始化充气相关配置
        self.init_inflate_enabled = self.config.get('integrated_system.init_inflate.enabled', True)
        self.init_inflate_cycles = self.config.get('integrated_system.init_inflate.cycles', 6)  # 充气周期数
        self.init_inflate_airbags = self.config.get('integrated_system.init_inflate.airbags', [5, 6, 7, 8])  # 默认腰托(5,6)和臀托(7,8)
        self.is_init_inflating = False  # 是否在初始化充气阶段
        self.init_inflate_counter = 0  # 初始化充气计数器
        self.init_inflate_done = False  # 标记这次会话是否已完成初始化充气

        # 放气冷却锁配置（按气囊组独立锁定）
        self.deflate_cooldown_enabled = self.config.get('integrated_system.deflate_cooldown.enabled', True)
        self.deflate_cooldown_max_commands = self.config.get('integrated_system.deflate_cooldown.max_continuous_commands', 16)  # 约5秒（每4帧1条指令）
        self.deflate_cooldown_reset_on_no_deflate = self.config.get('integrated_system.deflate_cooldown.reset_on_no_deflate', True)

        # 最新的检测结果（用于控制逻辑和sum值计算）
        self.latest_living_result = None
        self.latest_body_result = None  # 保存最新的体型检测结果

        # 分压矫正配置
        self.voltage_divider_enabled = self.config.get('matrix.voltage_divider_correction.enabled', False)
        self.voltage_divider_value = self.config.get('matrix.voltage_divider_correction.value', 682.67)

        # 预处理矫正配置（对靠背和坐垫都应用）
        self.pre_correction_enabled = self.config.get('matrix.pre_correction.enabled', False)
        self.pre_correction_value = self.config.get('matrix.pre_correction.value', 1365.33)
        self.pre_correction_multiplier = self.config.get('matrix.pre_correction.multiplier', 0.5)

        # 控制检查间隔（每N帧检查一次）
        self.control_check_interval = self.config.get('control.check_interval_frames', 4)

        # 气囊配置
        self.lumbar_airbags = self.config.get('lumbar.airbags', [5, 6])
        self.left_wing_airbags = self.config.get('side_wings.left_airbags', [2, 4])
        self.right_wing_airbags = self.config.get('side_wings.right_airbags', [1, 3])
        self.left_leg_airbags = self.config.get('leg_support.left_airbags', [9])
        self.right_leg_airbags = self.config.get('leg_support.right_airbags', [10])

        # 气囊组定义（用于冷却锁，侧翼和腿托均左右独立）
        self.airbag_groups = {
            'lumbar': self.lumbar_airbags,  # [5, 6]
            'left_side_wing': self.left_wing_airbags,  # [2, 4]
            'right_side_wing': self.right_wing_airbags,  # [1, 3]
            'left_leg': self.left_leg_airbags,  # [9]
            'right_leg': self.right_leg_airbags  # [10]
        }

        # 按组独立的冷却锁状态
        self.deflate_cooldown_state = {
            'lumbar': {'counter': 0, 'locked': False},
            'left_side_wing': {'counter': 0, 'locked': False},
            'right_side_wing': {'counter': 0, 'locked': False},
            'left_leg': {'counter': 0, 'locked': False},
            'right_leg': {'counter': 0, 'locked': False}
        }

        # 按摩气囊配置
        self.backrest_massage_airbags = self.config.get('tap_massage.backrest_airbags',
                                                         [11, 12, 13, 14, 15, 16, 17, 18])
        self.cushion_massage_airbags = self.config.get('tap_massage.cushion_airbags',
                                                        [19, 20, 21, 22, 23, 24])

        # 协议参数
        self.frame_header = self.config.get('protocol.frame_header', 0x1F)
        self.frame_tail = self.config.get('protocol.frame_tail', [0xAA, 0x55, 0x03, 0x99])
        self.mode_auto = self.config.get('protocol.mode_auto', 0x00)
        self.direction_download = self.config.get('protocol.direction_download', 0x00)
        self.gear_stop = self.config.get('protocol.gear_stop', 0x00)
        self.gear_inflate = self.config.get('protocol.gear_3', 0x03)
        self.gear_deflate = self.config.get('protocol.gear_initial', 0x04)

        # 指令计数器
        self.command_count = 0

        # 指令队列（用于 visualizer 获取所有指令，避免漏掉）
        self.command_queue: queue.Queue = queue.Queue()

        # 最新控制指令缓存（非控制帧时延续上一帧的指令）
        self.latest_control_command: Optional[list] = None
        self.is_new_command = False  # 标记本帧是否有新指令

        # 最新结果缓存
        self.latest_result: Optional[Dict] = None

        # 腿托前3后3比配置
        self.leg_front_rows = self.config.get('leg_support.front_rows', [0, 3])  # 前3行范围
        self.leg_rear_rows = self.config.get('leg_support.rear_rows', [7, 10])   # 后3行范围

        # 重心标定状态（入座稳定后标定一次列方向重心，用于划分左右腿）
        self.cushion_col_centroid = None  # 标定后的列重心值（0~5之间的浮点数）
        self.centroid_calibrated = False  # 是否已标定

        # 阶跃下降检测配置
        self.step_drop_enabled = self.config.get('integrated_system.step_drop_detection.enabled', False)
        self.step_drop_window_frames = self.config.get('integrated_system.step_drop_detection.window_frames', 26)
        self.step_drop_history_gap_frames = self.config.get('integrated_system.step_drop_detection.history_gap_frames', 26)
        self.step_drop_pressure_threshold = self.config.get('integrated_system.step_drop_detection.pressure_threshold', 6000.0)
        self.step_drop_ratio = self.config.get('integrated_system.step_drop_detection.drop_ratio', 0.6)
        self.step_drop_confirm_cycles = self.config.get('integrated_system.step_drop_detection.confirm_cycles', 2)
        self.step_drop_deflate_cycles = self.config.get('integrated_system.step_drop_detection.deflate_cycles', 6)
        self.step_drop_deflate_airbags = self.config.get('integrated_system.step_drop_detection.deflate_airbags',
                                                          list(range(1, 25)))

        # 阶跃下降检测状态
        # 历史窗口需要保存 window_frames + history_gap_frames 帧数据
        self.step_drop_total_frames = self.step_drop_window_frames + self.step_drop_history_gap_frames
        self.step_drop_pressure_history = deque(maxlen=self.step_drop_total_frames)  # 压力历史窗口
        self.step_drop_confirm_counter = 0  # 确认计数器
        self.step_drop_triggered = False  # 是否已触发阶跃
        self.step_drop_deflate_counter = 0  # 放气周期计数器

        print(f"[集成系统] v{__version__} 初始化完成")
        print(f"  - 坐垫阈值: {self.cushion_sum_threshold}")
        print(f"  - 靠背阈值: {self.backrest_sum_threshold}")
        print(f"  - 离座帧数: {self.off_seat_frames_threshold}")
        print(f"  - 复位总帧数: {self.reset_frames_threshold} | 放气阶段: {self.reset_deflate_frames}帧")
        print(f"  - 使用滤波sum: {self.use_filtered_sum}")
        if self.init_inflate_enabled:
            print(f"  - 初始化充气: 启用 | 周期数={self.init_inflate_cycles} | 气囊={self.init_inflate_airbags}")
        if self.deflate_cooldown_enabled:
            print(f"  - 放气冷却锁: 启用（按组独立） | 最大连续指令数={self.deflate_cooldown_max_commands} | 组=[lumbar, left_side_wing, right_side_wing, left_leg, right_leg]")
        if self.body_shape_classifier:
            print(f"  - 体型三分类: 启用 | 自动触发={'开启' if self.auto_trigger_body_shape else '关闭'}")
        if self.step_drop_enabled:
            print(f"  - 阶跃下降检测: 启用 | 窗口={self.step_drop_window_frames}帧 | 间隔={self.step_drop_history_gap_frames}帧 | 阈值={self.step_drop_pressure_threshold} | 比例={self.step_drop_ratio} | 确认={self.step_drop_confirm_cycles}周期 | 放气={self.step_drop_deflate_cycles}周期")

    def process_frame(self, sensor_data: np.ndarray) -> Dict:
        """
        处理一帧传感器数据（核心接口）

        Args:
            sensor_data: np.ndarray - 传感器输入数据
                形状: (1, 144) 或 (144,)
                数据类型: 任意数值类型（内部会自动转换）
                数据范围: 0-255（推荐uint8，表示压力传感器值）

                【数据结构】144个元素的排列方式：
                ┌─────────────────────────────────────┐
                │ 元素[0-71]: 靠背传感器（72个）       │
                │   [0-5]:   左侧小矩形（6个）         │
                │   [6-11]:  右侧小矩形（6个）         │
                │   [12-71]: 中间大矩阵（60个=10行×6列）│
                ├─────────────────────────────────────┤
                │ 元素[72-143]: 坐垫传感器（72个）     │
                │   [72-77]:  左侧小矩形（6个）        │
                │   [78-83]:  右侧小矩形（6个）        │
                │   [84-143]: 中间大矩阵（60个=10行×6列)│
                └─────────────────────────────────────┘

        Returns:
            Dict - 统一输出格式的字典，包含以下字段：

            【核心输出字段】
            'control_command': list[int] | None
                - 55个10进制整数的列表（协议帧）
                - None表示本帧无需发送指令
                - 列表结构: [帧头(1个), 气囊数据(48个), 模式(1个), 方向(1个), 帧尾(4个)]
                - 示例: [31, 1, 0, 2, 0, ..., 5, 3, 6, 3, ..., 0, 0, 170, 85, 3, 153] (共55个元素)

            'living_status': str
                活体检测状态，可能的值：
                - "活体": 确认为活体（人）
                - "静物": 确认为静物（箱子、包裹等）
                - "检测中": 正在检测，尚未得出结论
                - "离座": 座椅上无人（压力不足）
                - "未启用": 活体检测功能已禁用

            'body_type': str
                体型分类，可能的值：
                - "大人": 成人体型（仅当 living_status="活体" 时）
                - "小孩": 儿童体型（仅当 living_status="活体" 时）
                - "静物": 静物（仅当 living_status="静物" 时）
                - "未判断": 无法判断、检测中、离座或未启用时

            'seat_state': str
                座椅状态机当前状态，可能的值：
                - "OFF_SEAT": 离座状态
                - "CUSHION_ONLY": 仅坐垫有压力（活体+体型检测阶段）
                - "ADAPTIVE_LOCKED": 自适应锁已开启（可调节气囊）
                - "RESETTING": 离座复位中（气囊复位阶段）

            【传感器统计字段】
            'cushion_sum': float
                坐垫中间矩阵的压力总和（滤波后或原始值，由配置决定）

            'backrest_sum': float
                靠背中间矩阵的压力总和（滤波后或原始值，由配置决定）

            【置信度字段】
            'living_confidence': float
                活体检测的置信度，范围 [0.0, 1.0]
                值越大表示判断结果越可靠

            【详细特征数据】
            'body_features': dict
                体型检测的详细特征数据（如果体型检测已启用）：
                {
                    'cushion': {
                        'original_sum': float,      # 原始压力总和
                        'filtered_sum': float,      # 滤波后压力总和
                        'max_value': int,           # 最大压力值
                        'center_of_mass': (row, col) # 质心坐标
                    },
                    'backrest': { ... },            # 结构同上
                    'body_size_type': str,          # "大人"/"小孩"/"未判断"
                    'body_size_raw': float          # 体型评分原始值
                }
                如果体型检测未启用，则为空字典 {}

            'control_decision_data': dict
                控制决策的详细数据（用于调试和GUI显示）：
                {
                    'lumbar': {                     # 腰托控制
                        'upper_pressure': float,    # 靠背上部压力
                        'lower_pressure': float,    # 靠背下部压力
                        'ratio': float,             # 上下部压力比值
                        'threshold_passed': bool,   # 是否超过总压力阈值
                        'action': str               # 'INFLATE'/'DEFLATE'/'HOLD'
                    },
                    'side_wings': {                 # 侧翼控制
                        'left_pressure': float,     # 左侧压力
                        'right_pressure': float,    # 右侧压力
                        'ratio': float,             # 左右压力比值
                        'left_action': str,         # 左侧翼动作
                        'right_action': str         # 右侧翼动作
                    },
                    'leg_support': {                # 腿托控制
                        'butt_pressure': float,     # 臀部区域压力
                        'leg_pressure': float,      # 腿部区域压力
                        'ratio': float,             # 腿臀压力比值
                        'action': str               # 控制动作
                    }
                }

            'living_detection_data': dict
                活体检测决策的详细数据（用于调试和GUI显示）：
                {
                    'enabled': bool,                        # 活体检测是否启用
                    'status': str,                          # 最终状态："活体"/"静物"/"检测中"/"离座"/"未启用"
                    'in_enabled_state': bool,               # 是否在检测启用状态（CUSHION_ONLY/ADAPTIVE_LOCKED）
                    'queue': {                              # 状态机队列信息
                        'size': int,                        # 队列大小（配置的n值）
                        'current_length': int,              # 当前队列长度
                        'is_full': bool,                    # 队列是否已满
                        'values': [bool, ...],              # 队列原始值 [True, False, ...]
                        'values_display': [str, ...]        # 队列显示值 ["活体", "静物", ...]
                    },
                    'control_lock': {                       # 自适应控制锁信息
                        'adaptive_control_unlocked': bool,  # 是否已解锁
                        'message': str                      # 锁状态描述
                    },
                    'current_detection': {                  # 当前帧检测结果（如果本帧触发了检测）
                        'is_living': bool,                  # 原始判定结果
                        'confidence': float,                # 置信度 [0.0-1.0]
                        'threshold': float,                 # 判定阈值
                        'passed_threshold': bool,           # 是否通过阈值
                        'sad_score': float,                 # SAD归一化分数
                        'sad_energy': float,                # SAD能量（最大值）
                        'sad_cushion': float,               # 坐垫SAD能量
                        'sad_backrest': float,              # 靠背SAD能量
                        'detection_count': int              # 检测次数计数
                    }
                }

            【帧计数】
            'frame_count': int
                当前帧计数，从1开始累加（调用reset()后归零）

        使用示例:
            >>> system = IntegratedSeatSystem('config.yaml')
            >>> sensor_data = np.random.randint(0, 255, (1, 144), dtype=np.uint8)
            >>> result = system.process_frame(sensor_data)
            >>> print(result['living_status'])  # 输出: "检测中"
            >>> if result['control_command']:
            >>>     print(result['control_command'])  # 输出: [31, 1, 0, 2, 0, ..., 170, 85, 3, 153]
            >>>     send_to_hardware(result['control_command'])  # 发送10进制数组给硬件
        """
        self.frame_count += 1

        # 拆分和重塑矩阵
        backrest_data, cushion_data = self._split_matrices(sensor_data)

        # === 新增：提取右侧小矩形（在reshape之前）===
        # 用于拍打检测
        backrest_right_rect = backrest_data[6:12]  # 原始数据[6-11]
        cushion_right_rect = cushion_data[6:12]    # cushion_data的[6-11]对应原始[78-83]

        # 运行拍打检测
        tap_result = None
        if self.tap_massage_detector:
            tap_result = self.tap_massage_detector.update(
                backrest_right_rect,
                cushion_right_rect,
                self.frame_count
            )

        backrest_matrix = self._reshape_matrix(backrest_data, is_cushion=False)
        cushion_matrix = self._reshape_matrix(cushion_data, is_cushion=True)

        # 提取压力区域
        regions = self._extract_regions(backrest_matrix, cushion_matrix)

        # 运行检测器
        living_result = None
        body_result = None

        if self.living_detector:
            living_result = self.living_detector.update(cushion_matrix, backrest_matrix)

        if self.body_type_detector:
            body_result = self.body_type_detector.update(cushion_matrix, backrest_matrix)
            # 保存最新的体型检测结果（如果本帧有检测）
            # 注意：RESETTING状态时不更新，避免残留压力导致误判"重新入座"
            if body_result is not None and self.state != IntegratedState.RESETTING:
                self.latest_body_result = body_result

        # 保存最新的活体检测结果（用于控制逻辑中的静物判断）
        self.latest_living_result = living_result

        # 【新增】状态机队列管理
        if living_result is not None and self.state in self.living_queue_enabled_states:
            self.living_result_queue.append(living_result['is_living'])
            if self.frame_count % 20 == 0:  # 减少日志输出
                print(f"[活体队列] 推入结果: {'活体' if living_result['is_living'] else '静物'}, "
                      f"队列长度: {len(self.living_result_queue)}/{self.living_queue_size}")

        # 【新增】体型检测队列管理
        if body_result is not None and self.state in self.body_type_queue_enabled_states and not self.body_type_locked:
            body_type = body_result.get('body_size_type', '未判断')
            # 只推入"大人"或"小孩"，不推入"未判断"
            if body_type in ["大人", "小孩"]:
                self.body_type_result_queue.append(body_type)
                if self.frame_count % 20 == 0:  # 减少日志输出
                    print(f"[体型队列] 推入结果: {body_type}, "
                          f"队列长度: {len(self.body_type_result_queue)}/{self.body_type_queue_size}")

                # 检查是否可以锁定体型（队列满且值一致）
                if len(self.body_type_result_queue) >= self.body_type_queue_size:
                    if len(set(self.body_type_result_queue)) == 1:  # 所有值一致
                        self.body_type_locked = True
                        self.locked_body_type = self.body_type_result_queue[0]
                        print(f"[集成系统] 体型已锁定: {self.locked_body_type}（帧{self.frame_count}）")

        # 获取坐垫和靠背的sum值（用于状态判定）
        # RESETTING状态时使用当前帧结果（检测重新入座），其他状态使用缓存结果（避免13帧间隔导致的0值闪烁）
        if self.state == IntegratedState.RESETTING:
            cushion_sum, backrest_sum = self._get_sum_values(body_result)
        else:
            cushion_sum, backrest_sum = self._get_sum_values(self.latest_body_result)

        # 更新状态机
        self._update_state(cushion_sum, backrest_sum)

        # 阶跃下降检测（每帧更新历史窗口）
        step_drop_data = None
        if self.step_drop_enabled and self.state in [IntegratedState.CUSHION_ONLY, IntegratedState.ADAPTIVE_LOCKED]:
            step_drop_data = self._update_step_drop_detection(cushion_sum, backrest_sum)

        # 【新增】检查是否首次确认活体，解锁自适应控制
        if not self.adaptive_control_unlocked and self.state in self.living_queue_enabled_states:
            living_status = self._get_living_status(living_result)
            if living_status == "活体":
                self.adaptive_control_unlocked = True
                print(f"[集成系统] 首次确认活体，解锁自适应控制（帧{self.frame_count}）")

                # 在ADAPTIVE_LOCKED状态且首次确认活体时，启动初始化充气
                if self.state == IntegratedState.ADAPTIVE_LOCKED and self.init_inflate_enabled and not self.init_inflate_done:
                    self.is_init_inflating = True
                    self.init_inflate_counter = 0
                    print(f"[集成系统] 启动初始化充气（帧{self.frame_count}）")

        # 根据状态生成控制指令和决策数据
        control_command, control_decision_data = self._generate_control_command(regions, tap_result)

        # 更新指令缓存和标记
        if control_command is not None:
            self.latest_control_command = control_command
            self.is_new_command = True
            # 将新指令推入队列（供 visualizer 获取，确保不漏掉）
            command_info = {
                'command': control_command,
                'frame_count': self.frame_count,
                'command_count': self.command_count,
                'state': self.state.name,
                'decision_data': control_decision_data
            }
            self.command_queue.put(command_info)
        else:
            self.is_new_command = False
            # 非控制帧：延续上一帧的指令（如果有）
            control_command = self.latest_control_command

        # 更新初始化充气计数器
        if self.is_init_inflating and control_command is not None:
            self.init_inflate_counter += 1
            if self.init_inflate_counter >= self.init_inflate_cycles:
                # 初始化充气完成，退出初始化充气阶段
                self.is_init_inflating = False
                self.init_inflate_counter = 0
                self.init_inflate_done = True  # 标记已完成初始化充气
                print(f"[集成系统] 初始化充气完成，进入正常自适应控制阶段（帧{self.frame_count}）")

        # 阶跃下降覆盖检查（仅在控制帧检查）
        step_drop_override = False
        if step_drop_data is not None and self.is_new_command:
            if self._check_step_drop_trigger(step_drop_data):
                # 触发阶跃放气，覆盖原有指令
                control_command = self._generate_step_drop_deflate_command()
                step_drop_override = True
                # 更新缓存和队列
                self.latest_control_command = control_command
                command_info = {
                    'command': control_command,
                    'frame_count': self.frame_count,
                    'command_count': self.command_count,
                    'state': self.state.name,
                    'decision_data': control_decision_data,
                    'step_drop_override': True
                }
                self.command_queue.put(command_info)

        # 更新阶跃检测数据中的最新状态
        if step_drop_data is not None:
            step_drop_data['triggered'] = self.step_drop_triggered
            step_drop_data['deflate_counter'] = self.step_drop_deflate_counter
            step_drop_data['confirm_counter'] = self.step_drop_confirm_counter
            step_drop_data['override_active'] = step_drop_override

        # 生成活体状态输出
        living_status = self._get_living_status(living_result)

        # 生成体型输出（使用最新保存的结果）
        body_type = self._get_body_type(living_status, self.latest_body_result)

        # 生成活体检测决策数据
        living_detection_data = self._generate_living_detection_data(living_result, living_status)

        # 生成体型检测决策数据（传入本帧检测结果用于显示current_detection）
        body_type_detection_data = self._generate_body_type_detection_data(body_result, body_type)

        # 更新体型三分类器（如果正在采集，喂入原始144点数据）
        body_shape_result = None
        if self.body_shape_classifier is not None:
            body_shape_result = self.body_shape_classifier.update(sensor_data)
            # 体型三分类完成后，自动设置品味管理器的激活体型
            if body_shape_result is not None and body_shape_result.get('status') == 'COMPLETED':
                classified_shape = body_shape_result.get('body_shape')
                if classified_shape:
                    self.preference_manager.set_active_body_shape(classified_shape)
                    # 检查该体型是否有品味数据，有则自动应用
                    if self.preference_manager.has_preference(classified_shape):
                        print(f"[集成系统] 体型 '{classified_shape}' 已识别，自动应用品味调节区间")
                    else:
                        print(f"[集成系统] 体型 '{classified_shape}' 已识别，使用默认调节区间")

                    # 体型分类完成时标定列方向重心（此时入座已稳定）
                    if not self.centroid_calibrated:
                        cushion_total = regions['cushion_total']
                        self._calibrate_col_centroid(cushion_total)

        # 品味管理器喂入帧数据（仅在ADAPTIVE_LOCKED状态且正在记录品味时）
        preference_record_result = None
        if self.preference_manager.is_recording and self.state == IntegratedState.ADAPTIVE_LOCKED:
            preference_record_result = self.preference_manager.feed_frame(regions)

        # 生成体型三分类状态输出
        body_shape_status = self._get_body_shape_status()

        # 获取品味管理器状态
        preference_status = self.preference_manager.get_status()

        # ==================== 精简输出：三个独立字段 ====================

        # ① 离座状态
        seat_status = {
            'state': self.state.name,                                    # OFF_SEAT/CUSHION_ONLY/ADAPTIVE_LOCKED/RESETTING
            'is_off_seat': self.state == IntegratedState.OFF_SEAT,       # True=无人
            'is_seated': self.state in [
                IntegratedState.CUSHION_ONLY,
                IntegratedState.ADAPTIVE_LOCKED
            ],                                                           # True=有人坐着
            'is_resetting': self.state == IntegratedState.RESETTING,     # True=复位中
        }

        # ② 体型相关信息
        body_shape_info = {
            # 体型三分类结果
            'body_shape': body_shape_status.get('body_shape', ''),       # 瘦小/中等/高大/''(未识别)
            'body_shape_state': body_shape_status.get('state', 'DISABLED'),  # IDLE/COLLECTING/CLASSIFYING/COMPLETED/DISABLED
            'confidence': body_shape_status.get('confidence', 0.0),      # 置信度 [0.0, 1.0]
            'probabilities': body_shape_status.get('probabilities', {}), # {瘦小: x, 中等: y, 高大: z}
            # 品味状态
            'preference': {
                'active_body_shape': preference_status.get('active_body_shape'),  # 当前激活的体型
                'using_preference': preference_status.get('using_preference', False),  # 是否正在使用品味区间
                'is_recording': preference_status.get('is_recording', False),  # 是否正在记录品味
                'recording_progress': preference_status.get('recording_progress'),  # 记录进度（仅记录中非空）
            },
        }

        # ③ 气囊指令
        airbag_command = {
            'command': control_command,                                  # list[int](55元素) 或 None
            'is_new_command': self.is_new_command,                       # True=本帧新生成，False=延续上一帧
        }

        # ==================== 完整输出（包含三字段 + 详细调试数据） ====================
        result = {
            # === 三个核心独立字段 ===
            'seat_status': seat_status,
            'body_shape_info': body_shape_info,
            'airbag_command': airbag_command,

            # === 兼容字段（保留原有字段，便于GUI和调试） ===
            'control_command': control_command,
            'is_new_command': self.is_new_command,
            'control_decision_data': control_decision_data,
            'living_status': living_status,
            'body_type': body_type,
            'body_shape': body_shape_status,
            'seat_state': self.state.name,
            'cushion_sum': cushion_sum,
            'backrest_sum': backrest_sum,
            'living_confidence': living_result['confidence'] if living_result else 0.0,
            'body_features': self.latest_body_result if self.latest_body_result else {},
            'living_detection_data': living_detection_data,
            'body_type_detection_data': body_type_detection_data,
            'tap_massage': tap_result,
            'deflate_cooldown': {
                'enabled': self.deflate_cooldown_enabled,
                'max_commands': self.deflate_cooldown_max_commands,
                'groups': {
                    group: {
                        'locked': state['locked'],
                        'counter': state['counter']
                    }
                    for group, state in self.deflate_cooldown_state.items()
                }
            },
            'step_drop_detection': step_drop_data,
            'preference': preference_status,
            'preference_record_result': preference_record_result,
            'frame_count': self.frame_count
        }

        self.latest_result = result
        return result

    def _try_auto_trigger_body_shape(self, trigger_source: str):
        """
        尝试自动触发体型三分类识别（方案C）

        触发条件：
        1. auto_trigger 配置开启
        2. 体型三分类器已初始化
        3. 本次入座尚未自动触发过
        4. 分类器当前处于 IDLE 状态

        Args:
            trigger_source: 触发来源描述（用于日志）
        """
        print(f"[集成系统] _try_auto_trigger_body_shape(来源={trigger_source}): "
              f"auto_trigger={self.auto_trigger_body_shape}, "
              f"classifier={'OK' if self.body_shape_classifier is not None else 'None'}, "
              f"model={'OK' if (self.body_shape_classifier and self.body_shape_classifier.model) else 'None'}, "
              f"already_triggered={self._body_shape_auto_triggered}, "
              f"state={self.body_shape_classifier.state.name if self.body_shape_classifier else 'N/A'}")
        if (self.auto_trigger_body_shape
                and self.body_shape_classifier is not None
                and not self._body_shape_auto_triggered
                and self.body_shape_classifier.state == ClassifierState.IDLE):
            result = self.body_shape_classifier.trigger()
            print(f"[集成系统] 体型三分类 trigger() 结果: {result}")
            if result.get('success'):
                self._body_shape_auto_triggered = True
                print(f"[集成系统] 自动触发体型三分类成功（{trigger_source}，帧{self.frame_count}）")
            else:
                print(f"[集成系统] 自动触发体型三分类失败: {result.get('message', 'unknown')}")
        else:
            # 条件不满足时不打印（避免日志刷屏）
            pass

    def _reset_body_shape_auto_trigger(self):
        """重置自动触发标志（离座时调用，下次入座可重新触发）"""
        self._body_shape_auto_triggered = False

    def _reset_body_shape_on_leave(self):
        """
        离座/复位时重置体型三分类结果和品味激活状态

        解决的问题：
            离座后体型三分类结果不清除，导致下次入座其他人员时
            仍使用上一个人的体型结果和品味区间。

        重置内容：
            1. body_shape_classifier → reset() 到 IDLE，清除分类结果
            2. preference_manager → 取消品味激活，取消进行中的记录
        """
        # 重置体型三分类器（清除结果，回到IDLE状态）
        if self.body_shape_classifier is not None:
            self.body_shape_classifier.reset()

        # 重置品味管理器（取消激活体型，取消进行中的记录）
        if self.preference_manager.is_recording:
            self.preference_manager.cancel_recording()
            print(f"[集成系统] 离座时取消了进行中的品味记录")
        self.preference_manager.set_active_body_shape(None)

        # 重置重心标定状态（下次入座重新标定）
        self.cushion_col_centroid = None
        self.centroid_calibrated = False
        self.preference_manager.set_centroid(None)

    def _split_matrices(self, sensor_data: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """拆分传感器数据为靠背和坐垫"""
        data = sensor_data.flatten()
        backrest_size = self.config.get('matrix.backrest_size', 72)
        backrest = data[:backrest_size]
        cushion = data[backrest_size:backrest_size * 2]
        return backrest, cushion

    def _reshape_matrix(self, data_72: np.ndarray, is_cushion: bool = False) -> np.ndarray:
        """重塑72元素数据为10x6矩阵

        Args:
            data_72: 72元素的原始数据
            is_cushion: 是否为坐垫数据（仅坐垫应用分压矫正）
        """
        side_size = self.config.get('matrix.side_rect_size', 6)
        rows = self.config.get('matrix.center_matrix_rows', 10)
        cols = self.config.get('matrix.center_matrix_cols', 6)

        left_rect = data_72[0:side_size]
        right_rect = data_72[side_size:side_size * 2]
        center_matrix = data_72[side_size * 2:].reshape(rows, cols)

        # 第一步：预处理矫正（对靠背和坐垫都应用）
        if self.pre_correction_enabled:
            center_matrix = self._apply_pre_correction(center_matrix)

        # 第二步：坐垫分压矫正（仅对坐垫应用）
        if self.voltage_divider_enabled and is_cushion:
            center_matrix = self._apply_voltage_divider_correction(center_matrix)

        return center_matrix

    def _apply_pre_correction(self, matrix: np.ndarray) -> np.ndarray:
        """
        对 10x6 矩阵应用预处理矫正（按列处理，对靠背和坐垫都应用）

        公式：
            den = itemValue + value - sumTotal
            if den <= 0: den = 1
            result = int(itemValue * value * multiplier / den)

        Args:
            matrix: 10x6 压力矩阵

        Returns:
            矫正后的 10x6 矩阵
        """
        rows, cols = matrix.shape
        corrected = np.zeros_like(matrix, dtype=np.float64)

        for col in range(cols):
            column_data = matrix[:, col].astype(np.float64)
            sum_total = np.sum(column_data)

            for row in range(rows):
                item_value = column_data[row]
                denominator = item_value + self.pre_correction_value - sum_total

                if denominator <= 0:
                    denominator = 1

                corrected[row, col] = int(item_value * self.pre_correction_value * self.pre_correction_multiplier / denominator)

        # 限制在 0-255 范围内
        corrected = np.clip(corrected, 0, 255).astype(np.uint8)
        return corrected

    def _apply_voltage_divider_correction(self, matrix: np.ndarray) -> np.ndarray:
        """
        对 10x6 矩阵应用分压矫正（按列处理）

        公式：
            den = itemValue + value - sumTotal
            if den <= 0: den = 1
            result = int(itemValue / den)

        Args:
            matrix: 10x6 压力矩阵

        Returns:
            矫正后的 10x6 矩阵
        """
        rows, cols = matrix.shape
        corrected = np.zeros_like(matrix, dtype=np.float64)

        for col in range(cols):
            column_data = matrix[:, col].astype(np.float64)
            sum_total = np.sum(column_data)

            for row in range(rows):
                item_value = column_data[row]
                denominator = item_value + self.voltage_divider_value - sum_total

                if denominator <= 0:
                    denominator = 1

                corrected[row, col] = int(item_value / denominator)

        # 限制在 0-255 范围内
        corrected = np.clip(corrected, 0, 255).astype(np.uint8)
        return corrected

    def _calibrate_col_centroid(self, cushion_matrix: np.ndarray):
        """
        标定列方向压力重心（入座稳定后调用一次）

        计算坐垫10x6矩阵的列方向压力重心（加权平均列索引），
        作为左右腿的分界线。

        Args:
            cushion_matrix: 10x6的坐垫压力矩阵
        """
        col_sums = np.sum(cushion_matrix, axis=0)  # 每列的压力总和
        total = np.sum(col_sums)
        if total <= 0:
            self.cushion_col_centroid = cushion_matrix.shape[1] / 2.0  # 默认中间
        else:
            col_indices = np.arange(cushion_matrix.shape[1])
            self.cushion_col_centroid = float(np.sum(col_indices * col_sums) / total)
        self.centroid_calibrated = True
        # 同步重心到品味管理器（确保品味采集时使用相同的重心）
        self.preference_manager.set_centroid(self.cushion_col_centroid)
        print(f"[集成系统] 列方向重心标定完成: {self.cushion_col_centroid:.3f}"
              f"（帧{self.frame_count}）")

    def _compute_f3r3_by_centroid(self, front3: np.ndarray, rear3: np.ndarray) -> dict:
        """
        基于重心划分左右腿，分别计算前3后3比

        重心左侧（含重心列）= 左腿，重心右侧 = 右腿
        使用连续权重分配：重心所在列按比例分配给左右两侧

        Args:
            front3: 前3行压力矩阵 (3, 6)
            rear3: 后3行压力矩阵 (3, 6)

        Returns:
            dict: left_f3r3, right_f3r3, left_weights, right_weights
        """
        centroid = self.cushion_col_centroid
        cols = front3.shape[1]

        # 计算每列属于左腿的权重
        left_weights = np.zeros(cols)
        for c in range(cols):
            if c + 0.5 <= centroid:
                left_weights[c] = 1.0
            elif c - 0.5 >= centroid:
                left_weights[c] = 0.0
            else:
                left_weights[c] = centroid - (c - 0.5)
        right_weights = 1.0 - left_weights

        # 左腿前3后3比
        left_f3 = float(np.sum(front3 * left_weights[np.newaxis, :]))
        left_r3 = float(np.sum(rear3 * left_weights[np.newaxis, :]))
        left_f3r3 = left_f3 / left_r3 if left_r3 > 1 else 0.0

        # 右腿前3后3比
        right_f3 = float(np.sum(front3 * right_weights[np.newaxis, :]))
        right_r3 = float(np.sum(rear3 * right_weights[np.newaxis, :]))
        right_f3r3 = right_f3 / right_r3 if right_r3 > 1 else 0.0

        return {
            'left_f3r3': left_f3r3,
            'right_f3r3': right_f3r3,
            'left_f3': left_f3,
            'left_r3': left_r3,
            'right_f3': right_f3,
            'right_r3': right_r3,
        }

    def _extract_regions(self, backrest_matrix: np.ndarray, cushion_matrix: np.ndarray) -> Dict:
        """提取压力区域"""
        backrest_upper_rows = self.config.get('matrix.backrest_upper_rows', [0, 5])
        backrest_lower_rows = self.config.get('matrix.backrest_lower_rows', [5, 10])
        cushion_butt_rows = self.config.get('matrix.cushion_butt_rows', [0, 4])
        cushion_leg_rows = self.config.get('matrix.cushion_leg_rows', [4, 7])

        # 中间列分界
        mid_col = cushion_matrix.shape[1] // 2  # 通常是3

        # 腿托前3后3行范围
        front_rows = self.leg_front_rows  # [0, 3]
        rear_rows = self.leg_rear_rows    # [7, 10]

        return {
            'backrest_upper': backrest_matrix[backrest_upper_rows[0]:backrest_upper_rows[1], :],
            'backrest_lower': backrest_matrix[backrest_lower_rows[0]:backrest_lower_rows[1], :],
            'backrest_left': backrest_matrix[:, :mid_col],
            'backrest_right': backrest_matrix[:, mid_col:],
            'cushion_butt': cushion_matrix[cushion_butt_rows[0]:cushion_butt_rows[1], :],
            'cushion_leg': cushion_matrix[cushion_leg_rows[0]:cushion_leg_rows[1], :],
            'cushion_butt_left': cushion_matrix[cushion_butt_rows[0]:cushion_butt_rows[1], :mid_col],
            'cushion_butt_right': cushion_matrix[cushion_butt_rows[0]:cushion_butt_rows[1], mid_col:],
            'cushion_leg_left': cushion_matrix[cushion_leg_rows[0]:cushion_leg_rows[1], :mid_col],
            'cushion_leg_right': cushion_matrix[cushion_leg_rows[0]:cushion_leg_rows[1], mid_col:],
            'cushion_total': cushion_matrix,
            'backrest_total': backrest_matrix,
            # 腿托前3后3行区域（用于重心划分+前3后3比方案）
            'cushion_front3': cushion_matrix[front_rows[0]:front_rows[1], :],
            'cushion_rear3': cushion_matrix[rear_rows[0]:rear_rows[1], :],
        }

    def _get_sum_values(self, body_result: Optional[Dict]) -> Tuple[float, float]:
        """获取坐垫和靠背的sum值"""
        if not body_result:
            return 0.0, 0.0

        if self.use_filtered_sum:
            cushion_sum = body_result['cushion']['filtered_sum']
            backrest_sum = body_result['backrest']['filtered_sum']
        else:
            cushion_sum = body_result['cushion']['original_sum']
            backrest_sum = body_result['backrest']['original_sum']

        return cushion_sum, backrest_sum

    def _update_state(self, cushion_sum: float, backrest_sum: float):
        """更新状态机"""
        if self.state == IntegratedState.OFF_SEAT:
            # 从离座检测到有人坐下 - 立即判定
            if cushion_sum >= self.cushion_sum_threshold:
                # 检查是只有坐垫还是全座都有压力
                if backrest_sum >= self.backrest_sum_threshold:
                    # 坐垫+靠背都有 → 直接进入ADAPTIVE_LOCKED
                    self.state = IntegratedState.ADAPTIVE_LOCKED
                    self.backrest_lost_counter = 0
                    self.living_result_queue.clear()  # 新增：清空活体队列
                    self.adaptive_control_unlocked = False  # 重置自适应控制锁
                    self.body_type_result_queue.clear()  # 新增：清空体型队列
                    self.body_type_locked = False  # 重置体型锁
                    self.locked_body_type = "未判断"  # 重置锁定值
                    self._reset_deflate_cooldown()  # 重置所有气囊组的放气冷却锁
                    print(f"[集成系统] 状态转换: OFF_SEAT → ADAPTIVE_LOCKED (全座有压力，帧{self.frame_count})，活体队列已清空")
                    self._try_auto_trigger_body_shape('OFF_SEAT→ADAPTIVE_LOCKED')
                else:
                    # 只有坐垫 → 进入CUSHION_ONLY
                    self.state = IntegratedState.CUSHION_ONLY
                    self.living_result_queue.clear()  # 新增：清空活体队列
                    self.adaptive_control_unlocked = False  # 重置自适应控制锁
                    self.body_type_result_queue.clear()  # 新增：清空体型队列
                    self.body_type_locked = False  # 重置体型锁
                    self.locked_body_type = "未判断"  # 重置锁定值，避免后续判断错误
                    self._reset_deflate_cooldown()  # 重置所有气囊组的放气冷却锁
                    print(f"[集成系统] 状态转换: OFF_SEAT → CUSHION_ONLY (仅坐垫有压力，帧{self.frame_count})，活体队列已清空")

        elif self.state == IntegratedState.CUSHION_ONLY:
            # 检查是否升级到全座
            if cushion_sum >= self.cushion_sum_threshold and backrest_sum >= self.backrest_sum_threshold:
                # 立即升级到ADAPTIVE_LOCKED
                self.state = IntegratedState.ADAPTIVE_LOCKED
                self.off_counter = 0
                self.backrest_lost_counter = 0
                # 不清空队列，保留已有的检测历史
                print(f"[集成系统] 状态转换: CUSHION_ONLY → ADAPTIVE_LOCKED (靠背压力出现，帧{self.frame_count})，保留活体队列")
                self._try_auto_trigger_body_shape('CUSHION_ONLY→ADAPTIVE_LOCKED')
            elif cushion_sum < self.cushion_sum_threshold:
                # 坐垫压力消失 - 准备离座，进入复位状态
                self.off_counter += 1
                if self.off_counter >= self.off_seat_frames_threshold:
                    self.state = IntegratedState.RESETTING
                    self.off_counter = 0
                    self.reset_counter = 0
                    self.init_inflate_done = False  # 重置初始化充气标志，下次坐下可以重新初始化
                    self.living_result_queue.clear()  # 新增：清空活体队列
                    self.body_type_result_queue.clear()  # 新增：清空体型队列
                    self.body_type_locked = False  # 重置体型锁
                    self.locked_body_type = "未判断"  # 重置锁定值
                    self.latest_body_result = None  # 清空最新体型检测结果
                    # 关闭按摩开关
                    if self.tap_massage_detector:
                        self.tap_massage_detector.backrest_massage_active = False
                        self.tap_massage_detector.cushion_massage_active = False
                    self._reset_step_drop_detection()  # 重置阶跃检测
                    self._reset_body_shape_auto_trigger()  # 重置自动触发标志
                    self._reset_body_shape_on_leave()  # 重置体型三分类结果和品味激活状态
                    print(f"[集成系统] 状态转换: CUSHION_ONLY → RESETTING (帧{self.frame_count})，按摩已关闭，活体队列已清空，体型已重置")
            else:
                # 坐垫满足但靠背不满足，保持CUSHION_ONLY
                self.off_counter = 0

        elif self.state == IntegratedState.ADAPTIVE_LOCKED:
            # 检查靠背压力是否消失（人离开靠背）
            if backrest_sum < self.backrest_sum_threshold:
                self.backrest_lost_counter += 1
                # 需要持续1秒（13帧）缓冲后才解锁
                if self.backrest_lost_counter >= self.backrest_buffer_frames:
                    # 靠背压力不足，解除自适应锁，回到CUSHION_ONLY
                    self.state = IntegratedState.CUSHION_ONLY
                    self.backrest_lost_counter = 0
                    self.off_counter = 0
                    # 不清空队列，保留检测历史
                    print(f"[集成系统] 状态转换: ADAPTIVE_LOCKED → CUSHION_ONLY (靠背压力不足超过1秒，帧{self.frame_count})，保留活体队列")
            else:
                # 靠背压力正常，重置缓冲计数
                self.backrest_lost_counter = 0

            # 检查是否离座
            if cushion_sum < self.cushion_sum_threshold:
                self.off_counter += 1
                if self.off_counter >= self.off_seat_frames_threshold:
                    self.state = IntegratedState.RESETTING
                    self.off_counter = 0
                    self.reset_counter = 0
                    self.init_inflate_done = False  # 重置初始化充气标志，下次坐下可以重新初始化
                    self.living_result_queue.clear()  # 新增：清空活体队列
                    self.body_type_result_queue.clear()  # 新增：清空体型队列
                    self.body_type_locked = False  # 重置体型锁
                    self.locked_body_type = "未判断"  # 重置锁定值
                    self.latest_body_result = None  # 清空最新体型检测结果
                    # 关闭按摩开关
                    if self.tap_massage_detector:
                        self.tap_massage_detector.backrest_massage_active = False
                        self.tap_massage_detector.cushion_massage_active = False
                    self._reset_step_drop_detection()  # 重置阶跃检测
                    self._reset_body_shape_auto_trigger()  # 重置自动触发标志
                    self._reset_body_shape_on_leave()  # 重置体型三分类结果和品味激活状态
                    print(f"[集成系统] 状态转换: ADAPTIVE_LOCKED → RESETTING (帧{self.frame_count})，按摩已关闭，活体队列已清空，体型已重置")
            else:
                self.off_counter = 0

        elif self.state == IntegratedState.RESETTING:
            # 复位中 - 检查是否重新入座
            if cushion_sum >= self.cushion_sum_threshold:
                # 检测到重新入座，立即中断复位流程
                if backrest_sum >= self.backrest_sum_threshold:
                    # 坐垫+靠背都有压力 → 直接进入ADAPTIVE_LOCKED
                    self.state = IntegratedState.ADAPTIVE_LOCKED
                    self.reset_counter = 0
                    self.backrest_lost_counter = 0
                    self.living_result_queue.clear()  # 新增：清空活体队列
                    self.adaptive_control_unlocked = False  # 重置自适应控制锁
                    self.body_type_result_queue.clear()  # 新增：清空体型队列
                    self.body_type_locked = False  # 重置体型锁
                    self.locked_body_type = "未判断"  # 重置锁定值
                    self._reset_deflate_cooldown()  # 重置所有气囊组的放气冷却锁
                    print(f"[集成系统] 状态转换: RESETTING → ADAPTIVE_LOCKED (复位期间重新入座，全座有压力，帧{self.frame_count})，活体队列已清空")
                    self._try_auto_trigger_body_shape('RESETTING→ADAPTIVE_LOCKED')
                else:
                    # 只有坐垫 → 进入CUSHION_ONLY
                    self.state = IntegratedState.CUSHION_ONLY
                    self.reset_counter = 0
                    self.living_result_queue.clear()  # 新增：清空活体队列
                    self.adaptive_control_unlocked = False  # 重置自适应控制锁
                    self.body_type_result_queue.clear()  # 新增：清空体型队列
                    self.body_type_locked = False  # 重置体型锁
                    self.locked_body_type = "未判断"  # 重置锁定值
                    self._reset_deflate_cooldown()  # 重置所有气囊组的放气冷却锁
                    print(f"[集成系统] 状态转换: RESETTING → CUSHION_ONLY (复位期间重新入座，仅坐垫有压力，帧{self.frame_count})，活体队列已清空")
            elif self.reset_counter >= self.reset_frames_threshold:
                # 复位完成，进入OFF_SEAT
                self.state = IntegratedState.OFF_SEAT
                self.reset_counter = 0
                self._reset_body_shape_auto_trigger()  # 重置自动触发标志
                print(f"[集成系统] 状态转换: RESETTING → OFF_SEAT (复位完成，帧{self.frame_count})")
            else:
                # 继续复位
                self.reset_counter += 1

    def _generate_control_command(self, regions: Dict, tap_result: Optional[Dict]) -> Tuple[Optional[list], Dict]:
        """
        生成控制指令和决策数据

        Args:
            regions: 压力区域字典
            tap_result: 拍打检测结果（可选）

        Returns:
            (control_command, control_decision_data) 元组
            control_command: list[int] | None - 55个10进制整数的列表
        """
        # 收集控制决策数据（无论什么状态都收集，用于GUI显示）
        control_decision_data = self._collect_control_decision_data(regions)

        # OFF_SEAT状态：不发送任何指令
        if self.state == IntegratedState.OFF_SEAT:
            return None, control_decision_data

        # RESETTING状态：分为放气阶段和保持阶段，每10帧发送一次指令
        # 注意：RESET过程不使用放气冷却锁（周期不同）
        if self.state == IntegratedState.RESETTING:
            # reset_counter从1开始（在_update_state中已递增），所以用(reset_counter-1)来对齐
            # 这样第1帧就发第一条，之后每10帧发一条
            if (self.reset_counter - 1) % 10 == 0:
                self.command_count += 1

                # 判断当前处于哪个阶段
                if self.reset_counter <= self.reset_deflate_frames:
                    # 放气阶段：发送全部气囊放气指令
                    command = self._generate_reset_command()
                    print(f"[控制指令] 帧{self.frame_count} | 指令#{self.command_count} | 复位-放气阶段({self.reset_counter}/{self.reset_deflate_frames}) | 全部放气(1-24号)")
                else:
                    # 保持阶段：发送全部气囊保持指令
                    command = self._generate_reset_hold_command()
                    print(f"[控制指令] 帧{self.frame_count} | 指令#{self.command_count} | 复位-保持阶段({self.reset_counter}/{self.reset_frames_threshold}) | 全部保持(1-24号)")

                return command, control_decision_data
            return None, control_decision_data

        # === CUSHION_ONLY状态：按摩气囊已屏蔽，发送保持指令 ===
        if self.state == IntegratedState.CUSHION_ONLY:
            # [屏蔽] 按摩气囊指令已屏蔽，所有按摩气囊发送保持
            # 原逻辑：检查拍打触发 → 按摩气囊充气/放气
            # 现逻辑：忽略按摩触发，统一发送保持指令

            # 每10帧发送保持指令
            if self.frame_count % 10 == 0:
                print(f"[控制] 帧{self.frame_count} | CUSHION_ONLY状态，发送保持指令（按摩已屏蔽）")
                return self._generate_hold_command(), control_decision_data

            return None, control_decision_data

        # === ADAPTIVE_LOCKED状态 ===
        if self.state == IntegratedState.ADAPTIVE_LOCKED:
            # 初始化充气阶段：也需要先确认活体（安全机制）
            if self.is_init_inflating:
                if self.frame_count % self.control_check_interval == 0:
                    # 首先检查自适应控制锁
                    if not self.adaptive_control_unlocked:
                        if self.frame_count % 20 == 0:
                            print(f"[集成系统] 等待首次确认活体，初始化充气已暂停，发送保持指令（帧{self.frame_count}）")
                        return self._generate_hold_command(), control_decision_data

                    # 已解锁，可以进行初始化充气
                    print(f"[控制] 帧{self.frame_count} | 初始化充气中 ({self.init_inflate_counter}/{self.init_inflate_cycles})")
                    return self._generate_init_inflate_command(), control_decision_data
                return None, control_decision_data

            # [屏蔽] 按摩气囊指令已屏蔽，所有按摩气囊发送保持
            # 原逻辑：拍打按摩指令（最高优先级）→ 按摩气囊充气/放气
            # 现逻辑：忽略按摩触发，直接进入正常控制逻辑

        # ADAPTIVE_LOCKED状态：每隔N帧检查一次控制逻辑
        # 只在特定帧数时才调用控制逻辑，避免每帧都发送
        if self.frame_count % self.control_check_interval == 0:
            # 🌟 首先检查自适应控制锁
            if not self.adaptive_control_unlocked:
                if self.frame_count % 20 == 0:  # 每20帧打印一次
                    print(f"[集成系统] 等待首次确认活体，自适应控制已锁定，发送保持指令（帧{self.frame_count}）")
                return self._generate_hold_command(), control_decision_data

            # 🌟 静物或检测中：暂停调节，发送保持指令
            living_status = self._get_living_status(self.latest_living_result)
            if living_status in ["静物", "检测中"]:
                if self.frame_count % 20 == 0:  # 每20帧打印一次（约1.5秒）
                    print(f"[集成系统] {living_status}，暂停气囊自适应调节，发送保持指令（帧{self.frame_count}）")
                # 发送保持指令
                return self._generate_hold_command(), control_decision_data

            # 正常控制逻辑（仅当解锁且确认为"活体"时）
            lumbar_action = self._lumbar_control(regions)
            left_wing_action, right_wing_action = self._side_wing_control(regions)
            left_leg_action, right_leg_action = self._leg_support_control(regions)

            # 调试：显示当前控制决策
            # print(f"[控制决策] 帧{self.frame_count} | "
            #       f"腰托={lumbar_action}, 左翼={left_wing_action}, "
            #       f"右翼={right_wing_action}, 左腿托={left_leg_action}, 右腿托={right_leg_action}")

            # === 收集支撑气囊指令（按摩关闭时） ===
            commands = self._collect_commands(
                lumbar_action, left_wing_action, right_wing_action,
                left_leg_action, right_leg_action
            )

            # 应用放气冷却锁
            commands = self._apply_deflate_cooldown(commands)

            # 如果有控制命令，直接发送
            if commands:
                # 打印发送的指令
                action_names = []
                for airbag, gear in commands.items():
                    if gear == self.gear_inflate:
                        action_names.append(f"{airbag}充")
                    elif gear == self.gear_deflate:
                        action_names.append(f"{airbag}放")
                    elif gear == self.gear_stop:
                        action_names.append(f"{airbag}保持")

                # print(f"[控制指令] 帧{self.frame_count} | 发送指令: {', '.join(action_names)}")

                # 生成协议帧
                return self._generate_protocol_frame(commands), control_decision_data

        return None, control_decision_data

    def _collect_control_decision_data(self, regions: Dict) -> Dict:
        """收集控制决策数据（用于GUI显示）"""
        # 腰托数据（使用平均值而非总和）
        upper = regions['backrest_upper']
        lower = regions['backrest_lower']
        upper_pressure = float(np.mean(upper))
        lower_pressure = float(np.mean(lower))
        back_total = upper_pressure + lower_pressure
        back_threshold = self.config.get('lumbar.back_total_threshold', 500)

        if lower_pressure > 0:
            lumbar_ratio = upper_pressure / lower_pressure
        else:
            lumbar_ratio = 0.0

        threshold_passed = back_total >= back_threshold

        # 腰托动作
        if back_total == 0:
            # 特殊情况：背部完全无压力时，充气腰托
            lumbar_action = 'INFLATE'
        elif not threshold_passed:
            lumbar_action = 'HOLD'
        else:
            inflate_threshold = self.config.get('lumbar.upper_lower_ratio_inflate', 1.5)
            deflate_threshold = self.config.get('lumbar.upper_lower_ratio_deflate', 0.7)

            if lumbar_ratio > inflate_threshold:
                lumbar_action = 'INFLATE'
            elif lumbar_ratio < deflate_threshold:
                lumbar_action = 'DEFLATE'
            else:
                lumbar_action = 'HOLD'

        # 侧翼数据
        left = regions['backrest_left']
        right = regions['backrest_right']
        left_pressure = float(np.sum(left))
        right_pressure = float(np.sum(right))

        if right_pressure > 0:
            wing_ratio = left_pressure / right_pressure
        else:
            wing_ratio = 0.0

        # 侧翼动作
        left_inflate_threshold = self.config.get('side_wings.left_right_ratio_inflate_left', 0.7)
        left_deflate_threshold = self.config.get('side_wings.left_right_ratio_deflate_left', 1.3)

        # 判断动作（新逻辑）
        if wing_ratio > left_deflate_threshold:
            # 左侧压力占比大（> 1.3）：左侧充气，右侧放气
            left_action = 'INFLATE'
            right_action = 'DEFLATE'
        elif wing_ratio < left_inflate_threshold:
            # 右侧压力占比大（< 0.7）：右侧充气，左侧放气
            left_action = 'DEFLATE'
            right_action = 'INFLATE'
        else:
            # 在合理区间（0.7 ~ 1.3）：左右都放气
            left_action = 'DEFLATE'
            right_action = 'DEFLATE'

        # 腿托数据（基于重心划分+前3后3比方案）
        front3 = regions['cushion_front3']
        rear3 = regions['cushion_rear3']

        # 若重心未标定，使用实时计算（回退）
        if not self.centroid_calibrated:
            cushion_total = regions['cushion_total']
            col_sums = np.sum(cushion_total, axis=0)
            total = np.sum(col_sums)
            if total > 0:
                temp_centroid = float(np.sum(np.arange(cushion_total.shape[1]) * col_sums) / total)
            else:
                temp_centroid = cushion_total.shape[1] / 2.0
            self.cushion_col_centroid = temp_centroid

        # 计算左右腿前3后3比
        if self.cushion_col_centroid is not None:
            f3r3 = self._compute_f3r3_by_centroid(front3, rear3)
            left_leg_ratio = f3r3['left_f3r3']
            right_leg_ratio = f3r3['right_f3r3']
            left_f3 = f3r3['left_f3']
            left_r3 = f3r3['left_r3']
            right_f3 = f3r3['right_f3']
            right_r3 = f3r3['right_r3']
        else:
            left_leg_ratio = 0.0
            right_leg_ratio = 0.0
            left_f3 = left_r3 = right_f3 = right_r3 = 0.0

        # 获取阈值
        left_inflate_threshold = self.config.get('leg_support.left_f3r3_inflate', 0.48)
        left_deflate_threshold = self.config.get('leg_support.left_f3r3_deflate', 0.70)
        right_inflate_threshold = self.config.get('leg_support.right_f3r3_inflate', 0.64)
        right_deflate_threshold = self.config.get('leg_support.right_f3r3_deflate', 0.96)

        # 整体动作（使用左右平均比值，保留用于兼容显示）
        avg_ratio = (left_leg_ratio + right_leg_ratio) / 2.0 if (left_leg_ratio + right_leg_ratio) > 0 else 0.0
        avg_inflate = (left_inflate_threshold + right_inflate_threshold) / 2.0
        avg_deflate = (left_deflate_threshold + right_deflate_threshold) / 2.0
        if avg_ratio < avg_inflate:
            leg_action = 'INFLATE'
        elif avg_ratio > avg_deflate:
            leg_action = 'DEFLATE'
        else:
            leg_action = 'HOLD'

        # 左侧动作
        if left_leg_ratio < left_inflate_threshold:
            left_leg_action = 'INFLATE'
        elif left_leg_ratio > left_deflate_threshold:
            left_leg_action = 'DEFLATE'
        else:
            left_leg_action = 'HOLD'

        # 右侧动作
        if right_leg_ratio < right_inflate_threshold:
            right_leg_action = 'INFLATE'
        elif right_leg_ratio > right_deflate_threshold:
            right_leg_action = 'DEFLATE'
        else:
            right_leg_action = 'HOLD'

        return {
            'lumbar': {
                'upper_pressure': upper_pressure,
                'lower_pressure': lower_pressure,
                'ratio': lumbar_ratio,
                'threshold_passed': threshold_passed,
                'action': lumbar_action
            },
            'side_wings': {
                'left_pressure': left_pressure,
                'right_pressure': right_pressure,
                'ratio': wing_ratio,
                'left_action': left_action,
                'right_action': right_action
            },
            'leg_support': {
                # 整体数据（兼容显示）
                'ratio': avg_ratio,
                'action': leg_action,
                # 重心标定状态
                'centroid': self.cushion_col_centroid,
                'centroid_calibrated': self.centroid_calibrated,
                # 左腿前3后3比数据
                'left_f3': left_f3,
                'left_r3': left_r3,
                'left_ratio': left_leg_ratio,
                'left_action': left_leg_action,
                # 右腿前3后3比数据
                'right_f3': right_f3,
                'right_r3': right_r3,
                'right_ratio': right_leg_ratio,
                'right_action': right_leg_action
            }
        }

    def _generate_hold_command(self) -> list:
        """生成保持指令（所有气囊保持）"""
        active_airbags = (
            self.lumbar_airbags +
            self.left_wing_airbags +
            self.right_wing_airbags +
            self.left_leg_airbags +
            self.right_leg_airbags
        )
        commands = {airbag: self.gear_stop for airbag in active_airbags}
        return self._generate_protocol_frame(commands)

    def _generate_reset_command(self) -> list:
        """生成复位放气指令（全部24个气囊放气）"""
        all_airbags = list(range(1, 25))
        commands = {airbag: self.gear_deflate for airbag in all_airbags}
        return self._generate_protocol_frame(commands)

    def _generate_reset_hold_command(self) -> list:
        """生成复位保持指令（全部24个气囊保持）"""
        all_airbags = list(range(1, 25))
        commands = {airbag: self.gear_stop for airbag in all_airbags}
        return self._generate_protocol_frame(commands)

    def _generate_init_inflate_command(self) -> list:
        """生成初始化充气指令"""
        commands = {airbag: self.gear_inflate for airbag in self.init_inflate_airbags}
        return self._generate_protocol_frame(commands)

    def _lumbar_control(self, regions: Dict) -> ControlAction:
        """腰托控制逻辑（使用平均值而非总和）

        支持品味区间覆盖：如果当前体型有品味数据，使用品味区间替代默认阈值
        """
        upper = regions['backrest_upper']
        lower = regions['backrest_lower']

        upper_mean = np.mean(upper)
        lower_mean = np.mean(lower)
        back_mean_total = upper_mean + lower_mean

        # 特殊情况：背部完全无压力时，充气腰托
        if back_mean_total == 0:
            return ControlAction.INFLATE

        back_threshold = self.config.get('lumbar.back_total_threshold', 500)

        if back_mean_total < back_threshold:
            return ControlAction.HOLD
        else:
            if lower_mean > 0:
                ratio = upper_mean / lower_mean
            else:
                ratio = 0

            # 获取调节阈值：优先使用品味区间，否则使用默认配置
            thresholds, is_preference = self.preference_manager.get_active_thresholds()
            if is_preference:
                inflate_threshold = thresholds['lumbar']['inflate']
                deflate_threshold = thresholds['lumbar']['deflate']
            else:
                inflate_threshold = self.config.get('lumbar.upper_lower_ratio_inflate', 1.5)
                deflate_threshold = self.config.get('lumbar.upper_lower_ratio_deflate', 0.7)

            if ratio > inflate_threshold:
                return ControlAction.INFLATE
            elif ratio < deflate_threshold:
                return ControlAction.DEFLATE
            else:
                return ControlAction.HOLD

    def _side_wing_control(self, regions: Dict) -> Tuple[ControlAction, ControlAction]:
        """
        侧翼控制逻辑

        逻辑说明：
        - 左侧压力占比大：左侧充气，右侧放气
        - 右侧压力占比大：右侧充气，左侧放气
        - 在合理区间：左右都放气

        支持品味区间覆盖：如果当前体型有品味数据，使用品味区间替代默认阈值
        """
        left = regions['backrest_left']
        right = regions['backrest_right']

        left_total = np.sum(left)
        right_total = np.sum(right)

        if right_total > 0:
            left_ratio = left_total / right_total
        else:
            left_ratio = 0

        # 获取调节阈值：优先使用品味区间，否则使用默认配置
        thresholds, is_preference = self.preference_manager.get_active_thresholds()
        if is_preference:
            left_inflate_threshold = thresholds['side_wings']['inflate_left']
            left_deflate_threshold = thresholds['side_wings']['deflate_left']
        else:
            left_inflate_threshold = self.config.get('side_wings.left_right_ratio_inflate_left', 0.7)
            left_deflate_threshold = self.config.get('side_wings.left_right_ratio_deflate_left', 1.3)

        # 判断动作
        if left_ratio > left_deflate_threshold:
            # 左侧压力占比大：左侧充气，右侧放气
            left_action = ControlAction.INFLATE
            right_action = ControlAction.DEFLATE
        elif left_ratio < left_inflate_threshold:
            # 右侧压力占比大：右侧充气，左侧放气
            left_action = ControlAction.DEFLATE
            right_action = ControlAction.INFLATE
        else:
            # 在合理区间：左右都放气
            left_action = ControlAction.DEFLATE
            right_action = ControlAction.DEFLATE

        return left_action, right_action

    def _leg_support_control(self, regions: Dict) -> Tuple[ControlAction, ControlAction]:
        """
        腿托控制逻辑（左右独立，基于重心划分+前3后3比）

        算法方案：
        1. 使用入座时标定的列方向重心划分左右腿
        2. 分别计算左右腿的前3行/后3行压力比
        3. 比值低 = 腿悬空（需充气），比值高 = 腿压实（需放气）

        回退机制：若重心未标定，使用固定列分界（列中点）

        支持品味区间覆盖：如果当前体型有品味数据，使用品味区间替代默认阈值
        """
        front3 = regions['cushion_front3']  # 前3行 (3, 6)
        rear3 = regions['cushion_rear3']    # 后3行 (3, 6)

        # 若重心未标定，使用当前帧的坐垫矩阵实时计算重心（回退方案）
        if not self.centroid_calibrated:
            cushion_total = regions['cushion_total']
            col_sums = np.sum(cushion_total, axis=0)
            total = np.sum(col_sums)
            if total > 0:
                self.cushion_col_centroid = float(
                    np.sum(np.arange(cushion_total.shape[1]) * col_sums) / total
                )
            else:
                self.cushion_col_centroid = cushion_total.shape[1] / 2.0

        # 基于重心计算左右腿前3后3比
        f3r3 = self._compute_f3r3_by_centroid(front3, rear3)
        left_ratio = f3r3['left_f3r3']
        right_ratio = f3r3['right_f3r3']

        # 获取调节阈值：优先使用品味区间，否则使用默认配置
        thresholds, is_preference = self.preference_manager.get_active_thresholds()
        if is_preference:
            left_inflate_threshold = thresholds['leg_support']['left_inflate']
            left_deflate_threshold = thresholds['leg_support']['left_deflate']
            right_inflate_threshold = thresholds['leg_support']['right_inflate']
            right_deflate_threshold = thresholds['leg_support']['right_deflate']
        else:
            left_inflate_threshold = self.config.get('leg_support.left_f3r3_inflate', 0.48)
            left_deflate_threshold = self.config.get('leg_support.left_f3r3_deflate', 0.70)
            right_inflate_threshold = self.config.get('leg_support.right_f3r3_inflate', 0.64)
            right_deflate_threshold = self.config.get('leg_support.right_f3r3_deflate', 0.96)

        # 判断左侧动作
        if left_ratio < left_inflate_threshold:
            left_action = ControlAction.INFLATE
        elif left_ratio > left_deflate_threshold:
            left_action = ControlAction.DEFLATE
        else:
            left_action = ControlAction.HOLD

        # 判断右侧动作
        if right_ratio < right_inflate_threshold:
            right_action = ControlAction.INFLATE
        elif right_ratio > right_deflate_threshold:
            right_action = ControlAction.DEFLATE
        else:
            right_action = ControlAction.HOLD

        return left_action, right_action

    def _collect_commands(self, lumbar_action, left_wing_action, right_wing_action, left_leg_action, right_leg_action) -> Dict[int, int]:
        """收集气囊指令（包括HOLD动作）"""
        commands = {}

        # 腰托
        if lumbar_action == ControlAction.INFLATE:
            for airbag in self.lumbar_airbags:
                commands[airbag] = self.gear_inflate
        elif lumbar_action == ControlAction.DEFLATE:
            for airbag in self.lumbar_airbags:
                commands[airbag] = self.gear_deflate
        elif lumbar_action == ControlAction.HOLD:
            for airbag in self.lumbar_airbags:
                commands[airbag] = self.gear_stop

        # 左侧翼
        if left_wing_action == ControlAction.INFLATE:
            for airbag in self.left_wing_airbags:
                commands[airbag] = self.gear_inflate
        elif left_wing_action == ControlAction.DEFLATE:
            for airbag in self.left_wing_airbags:
                commands[airbag] = self.gear_deflate
        elif left_wing_action == ControlAction.HOLD:
            for airbag in self.left_wing_airbags:
                commands[airbag] = self.gear_stop

        # 右侧翼
        if right_wing_action == ControlAction.INFLATE:
            for airbag in self.right_wing_airbags:
                commands[airbag] = self.gear_inflate
        elif right_wing_action == ControlAction.DEFLATE:
            for airbag in self.right_wing_airbags:
                commands[airbag] = self.gear_deflate
        elif right_wing_action == ControlAction.HOLD:
            for airbag in self.right_wing_airbags:
                commands[airbag] = self.gear_stop

        # 左腿托
        if left_leg_action == ControlAction.INFLATE:
            for airbag in self.left_leg_airbags:
                commands[airbag] = self.gear_inflate
        elif left_leg_action == ControlAction.DEFLATE:
            for airbag in self.left_leg_airbags:
                commands[airbag] = self.gear_deflate
        elif left_leg_action == ControlAction.HOLD:
            for airbag in self.left_leg_airbags:
                commands[airbag] = self.gear_stop

        # 右腿托
        if right_leg_action == ControlAction.INFLATE:
            for airbag in self.right_leg_airbags:
                commands[airbag] = self.gear_inflate
        elif right_leg_action == ControlAction.DEFLATE:
            for airbag in self.right_leg_airbags:
                commands[airbag] = self.gear_deflate
        elif right_leg_action == ControlAction.HOLD:
            for airbag in self.right_leg_airbags:
                commands[airbag] = self.gear_stop

        return commands

    def _reset_deflate_cooldown(self):
        """重置所有气囊组的放气冷却锁状态"""
        for group_name in self.deflate_cooldown_state:
            self.deflate_cooldown_state[group_name]['counter'] = 0
            self.deflate_cooldown_state[group_name]['locked'] = False

    def _apply_deflate_cooldown(self, commands: Dict[int, int]) -> Dict[int, int]:
        """
        应用放气冷却锁逻辑（按气囊组独立锁定）

        每个气囊组（腰托、侧翼、腿托）独立计数和锁定：
        - 某组连续放气达到阈值 → 该组锁定
        - 某组有充气动作 → 该组解锁
        - 其他组不受影响

        Args:
            commands: 原始气囊指令字典 {气囊编号: 档位}

        Returns:
            处理后的气囊指令字典（被锁定组的放气改为保持）
        """
        if not self.deflate_cooldown_enabled:
            return commands

        modified_commands = dict(commands)

        # 遍历每个气囊组
        for group_name, airbag_list in self.airbag_groups.items():
            group_state = self.deflate_cooldown_state[group_name]

            # 检查该组是否有充气或放气指令
            group_has_inflate = any(
                commands.get(airbag) == self.gear_inflate
                for airbag in airbag_list
            )
            group_has_deflate = any(
                commands.get(airbag) == self.gear_deflate
                for airbag in airbag_list
            )

            # 该组有充气动作时，解除该组的冷却锁并重置计数
            if group_has_inflate:
                if group_state['locked']:
                    group_state['locked'] = False
                    group_state['counter'] = 0
                    print(f"[放气冷却锁] 帧{self.frame_count} | {group_name}组：检测到充气动作，解除冷却锁")
                elif group_state['counter'] > 0:
                    group_state['counter'] = 0

            # 该组有放气动作时
            if group_has_deflate:
                if group_state['locked']:
                    # 该组冷却锁已触发，将该组的放气改为保持
                    for airbag in airbag_list:
                        if modified_commands.get(airbag) == self.gear_deflate:
                            modified_commands[airbag] = self.gear_stop

                    if self.frame_count % 20 == 0:  # 每20帧打印一次
                        print(f"[放气冷却锁] 帧{self.frame_count} | {group_name}组：冷却锁生效中，放气指令已转为保持")
                else:
                    # 该组冷却锁未触发，增加计数
                    group_state['counter'] += 1

                    # 检查是否达到阈值
                    if group_state['counter'] >= self.deflate_cooldown_max_commands:
                        group_state['locked'] = True
                        print(f"[放气冷却锁] 帧{self.frame_count} | {group_name}组：触发冷却锁！连续放气{group_state['counter']}条指令")

                        # 立即将该组本帧的放气改为保持
                        for airbag in airbag_list:
                            if modified_commands.get(airbag) == self.gear_deflate:
                                modified_commands[airbag] = self.gear_stop
            else:
                # 该组没有放气指令
                if self.deflate_cooldown_reset_on_no_deflate and not group_state['locked']:
                    # 重置该组的连续放气计数（仅在冷却锁未触发时）
                    if group_state['counter'] > 0:
                        group_state['counter'] = 0

        return modified_commands

    def _generate_protocol_frame(self, commands: Dict[int, int]) -> list:
        """生成55字节协议帧（返回10进制数组）"""
        frame = []

        # 帧头
        frame.append(self.frame_header)

        # 24个气囊 × 2字节
        for airbag_id in range(1, 25):
            frame.append(airbag_id)
            gear = commands.get(airbag_id, self.gear_stop)
            frame.append(gear)

        # 工作模式
        frame.append(self.mode_auto)

        # 方向标识
        frame.append(self.direction_download)

        # 帧尾
        for byte in self.frame_tail:
            frame.append(byte)

        return frame

    def _update_step_drop_detection(self, cushion_sum: float, backrest_sum: float) -> Dict:
        """
        更新阶跃下降检测

        历史窗口结构（以 window_frames=26, history_gap_frames=26 为例）：
        - 总共保存 52 帧数据
        - 历史窗口：[0:26]，即 2-4 秒前的数据，用于计算历史平均值
        - 间隔区间：[26:52]，即最近 2 秒的数据，不参与历史平均值计算
        - 当前压力：最新一帧（仅使用坐垫压力）

        Args:
            cushion_sum: 坐垫压力总和
            backrest_sum: 靠背压力总和（保留参数，暂未使用）

        Returns:
            阶跃检测状态字典（用于可视化）
        """
        # 仅使用坐垫压力判断离座（坐垫压力更能反映人是否离开）
        current_pressure = cushion_sum

        # 将当前压力加入历史窗口
        self.step_drop_pressure_history.append(current_pressure)

        # 需要窗口已满才能计算历史平均值
        if len(self.step_drop_pressure_history) < self.step_drop_total_frames:
            # 窗口未满，不检测
            return {
                'enabled': self.step_drop_enabled,
                'window_frames': self.step_drop_window_frames,
                'history_gap_frames': self.step_drop_history_gap_frames,
                'history_length': len(self.step_drop_pressure_history),
                'total_frames_needed': self.step_drop_total_frames,
                'history_avg': 0.0,
                'current_pressure': current_pressure,
                'pressure_threshold': self.step_drop_pressure_threshold,
                'drop_ratio': self.step_drop_ratio,
                'is_drop_detected': False,
                'confirm_counter': self.step_drop_confirm_counter,
                'confirm_cycles': self.step_drop_confirm_cycles,
                'triggered': self.step_drop_triggered,
                'deflate_counter': self.step_drop_deflate_counter,
                'deflate_cycles': self.step_drop_deflate_cycles
            }

        # 计算历史平均值（使用最早的 window_frames 帧，与当前间隔 history_gap_frames 帧）
        # 历史窗口：[0:window_frames]
        history_values = list(self.step_drop_pressure_history)[:self.step_drop_window_frames]
        history_avg = sum(history_values) / len(history_values) if history_values else 0.0

        # 检测条件
        is_drop_detected = False
        if history_avg >= self.step_drop_pressure_threshold:
            # 历史压力满足阈值
            drop_threshold = history_avg * self.step_drop_ratio
            if current_pressure < drop_threshold:
                is_drop_detected = True

        return {
            'enabled': self.step_drop_enabled,
            'window_frames': self.step_drop_window_frames,
            'history_gap_frames': self.step_drop_history_gap_frames,
            'history_length': len(self.step_drop_pressure_history),
            'total_frames_needed': self.step_drop_total_frames,
            'history_avg': history_avg,
            'current_pressure': current_pressure,
            'pressure_threshold': self.step_drop_pressure_threshold,
            'drop_ratio': self.step_drop_ratio,
            'drop_threshold': history_avg * self.step_drop_ratio if history_avg > 0 else 0.0,
            'is_drop_detected': is_drop_detected,
            'confirm_counter': self.step_drop_confirm_counter,
            'confirm_cycles': self.step_drop_confirm_cycles,
            'triggered': self.step_drop_triggered,
            'deflate_counter': self.step_drop_deflate_counter,
            'deflate_cycles': self.step_drop_deflate_cycles
        }

    def _check_step_drop_trigger(self, step_drop_data: Dict) -> bool:
        """
        检查是否触发阶跃下降放气

        仅在控制帧（每4帧）调用

        Args:
            step_drop_data: 阶跃检测状态数据

        Returns:
            是否应该执行阶跃放气覆盖
        """
        if not self.step_drop_enabled:
            return False

        # 如果已经触发，继续放气直到完成
        if self.step_drop_triggered:
            self.step_drop_deflate_counter += 1
            if self.step_drop_deflate_counter >= self.step_drop_deflate_cycles:
                # 放气完成，重置状态
                self.step_drop_triggered = False
                self.step_drop_deflate_counter = 0
                self.step_drop_confirm_counter = 0
                print(f"[阶跃检测] 帧{self.frame_count} | 放气完成，恢复正常控制")
                return False
            return True

        # 检测阶跃下降
        if step_drop_data['is_drop_detected']:
            self.step_drop_confirm_counter += 1
            if self.step_drop_confirm_counter >= self.step_drop_confirm_cycles:
                # 确认触发
                self.step_drop_triggered = True
                self.step_drop_deflate_counter = 0
                print(f"[阶跃检测] 帧{self.frame_count} | 检测到阶跃下降！历史平均={step_drop_data['history_avg']:.0f}, "
                      f"当前={step_drop_data['current_pressure']:.0f}, 开始放气")
                return True
        else:
            # 未检测到下降，重置确认计数
            self.step_drop_confirm_counter = 0

        return False

    def _generate_step_drop_deflate_command(self) -> list:
        """生成阶跃下降放气指令"""
        commands = {airbag: self.gear_deflate for airbag in self.step_drop_deflate_airbags}
        return self._generate_protocol_frame(commands)

    def _reset_step_drop_detection(self):
        """重置阶跃下降检测状态（状态转换时调用）"""
        self.step_drop_pressure_history.clear()
        self.step_drop_confirm_counter = 0
        self.step_drop_triggered = False
        self.step_drop_deflate_counter = 0

    def _get_living_status(self, living_result: Optional[Dict]) -> str:
        """
        获取活体状态输出（基于状态机队列）

        Args:
            living_result: 本帧的活体检测结果（可能为None）

        Returns:
            "活体" | "静物" | "检测中" | "离座" | "未启用"
        """
        # 1. 功能未启用
        if not self.living_detector:
            return "未启用"

        # 2. 离座状态
        if self.state not in self.living_queue_enabled_states:
            return "离座"

        # 3. 队列判定逻辑（核心）
        queue_len = len(self.living_result_queue)

        # 队列未满，返回"检测中"
        if queue_len < self.living_queue_size:
            return "检测中"

        # 队列已满，检查一致性
        if all(self.living_result_queue):
            return "活体"  # 全部为True
        elif not any(self.living_result_queue):
            return "静物"  # 全部为False
        else:
            return "检测中"  # 结果不一致

    def _get_body_type(self, living_status: str, body_result: Optional[Dict]) -> str:
        """
        获取体型输出（优先使用锁定值）

        Returns:
            "大人" | "小孩" | "静物" | "未判断"
        """
        # 1. 体型已锁定，直接返回锁定值（仅在活体时）
        if self.body_type_locked and living_status == "活体":
            return self.locked_body_type

        # 2. 活体但未锁定，使用当前检测结果
        if living_status == "活体":
            if body_result:
                return body_result.get('body_size_type', '未判断')
            return "未判断"

        # 3. 静物时输出"静物"
        elif living_status == "静物":
            return "静物"

        # 4. 其他状态（检测中、离座、未启用）输出"未判断"
        return "未判断"

    def _generate_living_detection_data(self, living_result: Optional[Dict], living_status: str) -> Dict:
        """
        生成活体检测决策数据（用于调试和GUI显示）

        Args:
            living_result: 本帧的活体检测结果（可能为None）
            living_status: 经过状态机队列处理后的活体状态

        Returns:
            活体检测决策数据字典
        """
        if not self.living_detector:
            return {
                'enabled': False,
                'status': living_status,
                'message': '活体检测功能未启用'
            }

        # 队列状态
        queue_data = {
            'size': self.living_queue_size,
            'current_length': len(self.living_result_queue),
            'is_full': len(self.living_result_queue) >= self.living_queue_size,
            'values': list(self.living_result_queue),  # [True, True, False, ...]
            'values_display': ['活体' if v else '静物' for v in self.living_result_queue]
        }

        # 控制锁状态
        control_lock_data = {
            'adaptive_control_unlocked': self.adaptive_control_unlocked,
            'message': '已解锁' if self.adaptive_control_unlocked else '等待首次确认活体'
        }

        # 当前帧检测结果（如果有）
        current_detection = {}
        if living_result:
            current_detection = {
                'is_living': living_result['is_living'],
                'confidence': living_result['confidence'],
                'threshold': living_result['threshold'],
                'passed_threshold': living_result['confidence'] >= living_result['threshold'],
                'sad_score': living_result['sad_score'],
                'sad_energy': living_result['sad_energy'],
                'sad_cushion': living_result['sad_cushion'],
                'sad_backrest': living_result['sad_backrest'],
                'detection_count': living_result['detection_count']
            }

        return {
            'enabled': True,
            'status': living_status,
            'queue': queue_data,
            'control_lock': control_lock_data,
            'current_detection': current_detection,
            'in_enabled_state': self.state in self.living_queue_enabled_states
        }

    def _generate_body_type_detection_data(self, body_result: Optional[Dict], body_type: str) -> Dict:
        """
        生成体型检测决策数据（用于调试和GUI显示）

        Args:
            body_result: 本帧的体型检测结果（可能为None）
            body_type: 经过锁定机制处理后的体型输出

        Returns:
            体型检测决策数据字典
        """
        if not self.body_type_detector:
            return {
                'enabled': False,
                'body_type': body_type,
                'message': '体型检测功能未启用'
            }

        # 队列状态
        queue_data = {
            'size': self.body_type_queue_size,
            'current_length': len(self.body_type_result_queue),
            'is_full': len(self.body_type_result_queue) >= self.body_type_queue_size,
            'values': list(self.body_type_result_queue),  # ["大人", "大人", ...]
        }

        # 锁定状态
        lock_data = {
            'locked': self.body_type_locked,
            'locked_value': self.locked_body_type,
            'message': f'已锁定为{self.locked_body_type}' if self.body_type_locked else '未锁定，等待2次连续一致结果'
        }

        # 当前帧检测结果（如果有）
        current_detection = {}
        if body_result:
            current_detection = {
                'body_size_type': body_result['body_size_type'],
                'body_size_raw': body_result['body_size_raw'],
                'cushion_filtered_sum': body_result['cushion']['filtered_sum'],
                'detection_count': body_result['detection_count']
            }

        return {
            'enabled': True,
            'body_type': body_type,
            'queue': queue_data,
            'lock': lock_data,
            'current_detection': current_detection,
            'in_enabled_state': self.state in self.body_type_queue_enabled_states
        }

    def get_latest_result(self) -> Optional[Dict]:
        """获取最新结果"""
        return self.latest_result

    # ========== 体型三分类接口 ==========

    def trigger_body_shape_classification(self) -> Dict:
        """
        触发体型三分类识别

        外部调用此方法启动体型识别流程：
        1. 开始缓冲传感器数据
        2. 采集指定帧数后自动分类
        3. 通过 get_body_shape_result() 获取结果

        Returns:
            Dict - 触发状态信息
        """
        if self.body_shape_classifier is None:
            return {
                'success': False,
                'message': '体型三分类功能未启用，请在配置中设置 body_shape_classification.enabled=true',
                'state': 'DISABLED'
            }
        return self.body_shape_classifier.trigger()

    def get_body_shape_result(self) -> Optional[Dict]:
        """
        获取体型三分类的最新结果

        Returns:
            Dict or None - 分类结果，包含：
                - label: int (0=瘦小, 1=中等, 2=高大)
                - body_shape: str ("瘦小"/"中等"/"高大")
                - confidence: float (0.0-1.0)
                - probabilities: dict ({"瘦小": 0.1, "中等": 0.3, "高大": 0.6})
        """
        if self.body_shape_classifier is None:
            return None
        return self.body_shape_classifier.get_result()

    def get_body_shape_status(self) -> Dict:
        """
        获取体型三分类器的当前状态

        Returns:
            Dict - 状态信息，包含 state, progress, result 等
        """
        if self.body_shape_classifier is None:
            return {'state': 'DISABLED', 'model_loaded': False}
        return self.body_shape_classifier.get_status()

    def _get_body_shape_status(self) -> Dict:
        """
        生成 process_frame 返回值中的 body_shape 字段

        Returns:
            Dict - 体型三分类状态摘要
        """
        if self.body_shape_classifier is None:
            return {'status': '未启用', 'state': 'DISABLED'}

        status = self.body_shape_classifier.get_status()
        state = status['state']

        result = {
            'status': {
                'IDLE': '空闲',
                'COLLECTING': '采集中',
                'CLASSIFYING': '分类中',
                'COMPLETED': '已完成',
            }.get(state, state),
            'state': state,
        }

        if state == 'COLLECTING':
            result['progress'] = status.get('progress', 0)
            result['remaining_sec'] = status.get('remaining_sec', 0)

        if state == 'COMPLETED' and 'result' in status:
            r = status['result']
            result['body_shape'] = r.get('body_shape', '')
            result['confidence'] = r.get('confidence', 0)
            result['probabilities'] = r.get('probabilities', {})

        return result

    # ==================== 品味管理接口 ====================

    def trigger_preference_recording(self, body_shape: str = None,
                                      airbag_ops: Dict = None) -> Dict:
        """
        触发品味记录（外部调用接口）

        必须先识别到体型才能触发。上层软件在用户手动调节完气囊、坐稳定后调用此接口。
        系统将采集一段时间的压力数据，记录当前压力比例并生成个性化调节区间。

        传入充放气次数字典后，系统会基于当前自适应阈值构建置信区间，
        对采集帧进行鲁棒过滤（截断或卡尔曼融合），避免用户乱动导致异常比例值。

        Args:
            body_shape: 指定体型（可选，默认使用体型三分类识别的结果）
            airbag_ops: 充放气次数字典（可选），格式如:
                {
                    'lumbar': {'inflate': 3, 'deflate': 0},
                    'side_wings_left': {'inflate': 1, 'deflate': 0},
                    'side_wings_right': {'inflate': 0, 'deflate': 0},
                    'leg_left': {'inflate': 0, 'deflate': 2},
                    'leg_right': {'inflate': 0, 'deflate': 1},
                }
                未传入时退化为原始无过滤采集。

        Returns:
            Dict - 操作结果
                'success': bool - 是否成功触发
                'message': str - 描述信息
                'state': str - 当前状态 ('RECORDING' / 'ERROR')
                'target_shape': str - 目标体型（仅成功时）
                'total_frames': int - 需采集的总帧数（仅成功时）
                'filter_mode': str - 过滤模式 ('none'/'clamp'/'kalman')（仅成功时）
                'confidence_intervals': Dict - 各比例的置信区间（仅成功时且有airbag_ops）
        """
        return self.preference_manager.start_recording(body_shape, airbag_ops)

    def cancel_preference_recording(self) -> Dict:
        """
        取消正在进行的品味记录

        Returns:
            Dict - 操作结果
                'success': bool - 是否成功取消
                'message': str - 描述信息
        """
        return self.preference_manager.cancel_recording()

    def get_preference_status(self) -> Dict:
        """
        获取品味管理器的完整状态

        Returns:
            Dict - 品味管理器状态，包含：
                'active_body_shape': str | None - 当前激活的体型
                'is_recording': bool - 是否正在记录
                'recording_progress': Dict | None - 记录进度
                'active_thresholds': Dict - 当前生效的调节区间
                'using_preference': bool - 是否使用品味区间
                'shapes': Dict - 各体型的品味状态
                'config': Dict - 配置参数
        """
        return self.preference_manager.get_status()

    def clear_preference(self, body_shape: str = None) -> Dict:
        """
        清除品味数据

        Args:
            body_shape: 指定体型（可选，None则清除所有体型的品味数据）

        Returns:
            Dict - 操作结果
                'success': bool - 是否成功
                'message': str - 描述信息
        """
        return self.preference_manager.clear_preference(body_shape)

    def get_pending_commands(self) -> List[Dict]:
        """
        获取队列中所有待处理的指令（非阻塞）

        Returns:
            List[Dict] - 指令信息列表，每个元素包含：
                - 'command': list[int] - 55个10进制整数的协议帧
                - 'frame_count': int - 生成该指令时的帧计数
                - 'command_count': int - 指令序号
                - 'state': str - 生成该指令时的状态机状态
                - 'decision_data': dict - 控制决策数据
        """
        commands = []
        while not self.command_queue.empty():
            try:
                cmd_info = self.command_queue.get_nowait()
                commands.append(cmd_info)
            except queue.Empty:
                break
        return commands

    def reset(self):
        """重置系统"""
        self.state = IntegratedState.OFF_SEAT
        self.frame_count = 0
        self.command_count = 0  # 重置指令计数
        self.off_counter = 0
        self.reset_counter = 0
        self.backrest_lost_counter = 0
        self.living_result_queue.clear()  # 清空活体队列
        self.adaptive_control_unlocked = False  # 重置自适应控制锁
        self.body_type_result_queue.clear()  # 清空体型队列
        self.body_type_locked = False  # 重置体型锁
        self.locked_body_type = "未判断"  # 重置锁定值
        self.latest_body_result = None  # 清空最新体型检测结果
        self.is_init_inflating = False
        self.init_inflate_counter = 0
        self.init_inflate_done = False
        self._reset_deflate_cooldown()  # 重置所有气囊组的放气冷却锁

        # 清空指令队列
        while not self.command_queue.empty():
            try:
                self.command_queue.get_nowait()
            except queue.Empty:
                break

        # 清空指令缓存
        self.latest_control_command = None
        self.is_new_command = False

        if self.living_detector:
            self.living_detector.reset()
        if self.body_type_detector:
            self.body_type_detector.reset()
        if self.tap_massage_detector:
            self.tap_massage_detector.reset()
        if self.body_shape_classifier:
            self.body_shape_classifier.reset()

        # 重置品味管理器（取消进行中的记录，但保留已存储的品味数据）
        if self.preference_manager.is_recording:
            self.preference_manager.cancel_recording()
        self.preference_manager.set_active_body_shape(None)

        self.latest_result = None
        print("[集成系统] 已重置")

    def reset_massage(self, clear_history: bool = False):
        """
        重置拍打按摩为关闭状态

        Args:
            clear_history: 是否同时清空拍打检测历史缓冲（默认False，仅关闭按摩）
        """
        if not self.tap_massage_detector:
            print("[集成系统] 拍打按摩检测器未启用")
            return

        # 关闭按摩状态
        self.tap_massage_detector.backrest_massage_active = False
        self.tap_massage_detector.cushion_massage_active = False

        if clear_history:
            # 清空拍打检测历史
            self.tap_massage_detector.backrest_right_history.clear()
            self.tap_massage_detector.backrest_frame_diff_history.clear()
            self.tap_massage_detector.cushion_right_history.clear()
            self.tap_massage_detector.cushion_frame_diff_history.clear()
            self.tap_massage_detector.backrest_tap_events.clear()
            self.tap_massage_detector.cushion_tap_events.clear()
            print("[集成系统] 拍打按摩已关闭，检测历史已清空")
        else:
            print("[集成系统] 拍打按摩已关闭")

    def _handle_tap_massage_commands(self, tap_result: Dict) -> Dict[int, int]:
        """
        处理拍打按摩触发指令

        Args:
            tap_result: 拍打检测结果字典

        Returns:
            {气囊编号: 档位} 字典
        """
        commands = {}

        # 靠背按摩触发
        if tap_result.get('backrest_tap_triggered'):
            if tap_result['backrest_command'] == 'TOGGLE_ON':
                # 开启：充气所有靠背按摩气囊（11-18）
                for airbag in self.backrest_massage_airbags:
                    commands[airbag] = self.gear_inflate
                print(f"[拍打按摩] 靠背按摩开启 (帧{self.frame_count})")
            elif tap_result['backrest_command'] == 'TOGGLE_OFF':
                # 关闭：放气
                for airbag in self.backrest_massage_airbags:
                    commands[airbag] = self.gear_deflate
                print(f"[拍打按摩] 靠背按摩关闭 (帧{self.frame_count})")

        # 坐垫按摩触发
        if tap_result.get('cushion_tap_triggered'):
            if tap_result['cushion_command'] == 'TOGGLE_ON':
                # 开启：充气所有坐垫按摩气囊（19-24）
                for airbag in self.cushion_massage_airbags:
                    commands[airbag] = self.gear_inflate
                print(f"[拍打按摩] 坐垫按摩开启 (帧{self.frame_count})")
            elif tap_result['cushion_command'] == 'TOGGLE_OFF':
                # 关闭：放气
                for airbag in self.cushion_massage_airbags:
                    commands[airbag] = self.gear_deflate
                print(f"[拍打按摩] 坐垫按摩关闭 (帧{self.frame_count})")

        # 修复：保持其他正在运行的按摩气囊充气状态
        # 当一个按摩被触发切换时，另一个正在运行的按摩不应被设置为保持档位
        if tap_result.get('backrest_massage_active') and not tap_result.get('backrest_tap_triggered'):
            # 靠背按摩正在运行且本帧未被触发，保持充气
            for airbag in self.backrest_massage_airbags:
                if airbag not in commands:  # 避免覆盖切换指令
                    commands[airbag] = self.gear_inflate

        if tap_result.get('cushion_massage_active') and not tap_result.get('cushion_tap_triggered'):
            # 坐垫按摩正在运行且本帧未被触发，保持充气
            for airbag in self.cushion_massage_airbags:
                if airbag not in commands:  # 避免覆盖切换指令
                    commands[airbag] = self.gear_inflate

        return commands

    def set_param(self, key: str, value: Any, auto_save: bool = True):
        """
        运行时修改参数 - 使用统一的参数映射机制

        Args:
            key: 参数名（简短形式）或配置路径（完整形式）
            value: 新值
            auto_save: 是否自动保存到文件

        Examples:
            >>> system.set_param('cushion_sum_threshold', 600)  # 简短形式
            >>> system.set_param('integrated_system.cushion_sum_threshold', 600)  # 完整路径（自动识别）
        """
        # 参数映射表：简短名称 -> (对象属性路径, 配置文件路径)
        param_mapping = {
            # 集成系统参数
            'cushion_sum_threshold': ('cushion_sum_threshold', 'integrated_system.cushion_sum_threshold'),
            'backrest_sum_threshold': ('backrest_sum_threshold', 'integrated_system.backrest_sum_threshold'),
            'off_seat_frames_threshold': ('off_seat_frames_threshold', 'integrated_system.off_seat_frames_threshold'),
            'reset_frames_threshold': ('reset_frames_threshold', 'integrated_system.reset_frames_threshold'),
            'use_filtered_sum': ('use_filtered_sum', 'integrated_system.use_filtered_sum'),
            'backrest_buffer_frames': ('backrest_buffer_frames', 'integrated_system.backrest_buffer_frames'),
            'control_check_interval': ('control_check_interval', 'control.check_interval_frames'),

            # 活体检测参数（需要同步到detector对象）
            'living_window_size': ('living_detector.window_size', 'living_detection.window_size_frames'),
            'living_detection_interval': ('living_detector.detection_interval', 'living_detection.detection_interval_frames'),
            'living_sad_threshold': ('living_detector.sad_threshold', 'living_detection.sad_threshold'),
            'living_queue_size': ('living_queue_size', 'living_detection.queue_size'),

            # 体型检测参数（需要同步到detector对象）
            'body_threshold': ('body_type_detector.threshold', 'body_type_detection.threshold'),
            'body_min_component': ('body_type_detector.min_component_size', 'body_type_detection.min_component_size'),
            'body_adult_threshold': ('body_type_detector.body_size_adult_threshold', 'body_type_detection.body_size_adult_threshold'),
            'body_child_threshold': ('body_type_detector.body_size_child_threshold', 'body_type_detection.body_size_child_threshold'),
        }

        # 反向映射：配置路径 -> 简短名称（用于GUI的完整路径查找）
        reverse_mapping = {config_path: short_name for short_name, (_, config_path) in param_mapping.items()}

        # 判断是简短名称还是完整配置路径
        if key in param_mapping:
            # 简短名称：直接使用
            short_name = key
        elif key in reverse_mapping:
            # 完整路径：反向查找简短名称
            short_name = reverse_mapping[key]
            print(f"[集成系统] 完整路径 {key} 映射到简短名称 {short_name}")
        else:
            # 未知参数：只更新配置文件，不更新实例变量
            self.config.set(key, value)
            print(f"[集成系统] 配置已更新（未映射参数）: {key} = {value}")
            if auto_save:
                try:
                    self.config.save_to_file()
                    print(f"[集成系统] 配置已保存到文件")
                except Exception as e:
                    print(f"[集成系统] 保存配置失败: {e}")
            return

        # 使用映射表更新
        obj_path, config_path = param_mapping[short_name]

        # 1. 更新对象属性
        self._set_nested_attr(obj_path, value)

        # 2. 更新配置
        self.config.set(config_path, value)

        print(f"[集成系统] 参数已更新: {short_name} = {value} (配置路径: {config_path})")

        # 特殊处理：队列大小变化时重建队列
        if short_name == 'living_queue_size':
            old_queue = list(self.living_result_queue)
            self.living_result_queue = deque(old_queue[-value:], maxlen=value)
            print(f"[集成系统] 活体队列大小已更新: maxlen={value}, 当前长度={len(self.living_result_queue)}")

        # 自动保存配置到文件
        if auto_save:
            try:
                self.config.save_to_file()
                print(f"[集成系统] 配置已保存到文件")
            except Exception as e:
                print(f"[集成系统] 保存配置失败: {e}")

    def _set_nested_attr(self, attr_path: str, value: Any):
        """
        设置嵌套对象属性

        Args:
            attr_path: 属性路径，如 'living_detector.window_size'
            value: 要设置的值
        """
        parts = attr_path.split('.')
        obj = self

        try:
            # 遍历到目标对象
            for part in parts[:-1]:
                obj = getattr(obj, part)
                if obj is None:
                    print(f"[警告] 对象属性路径 {attr_path} 中的 {part} 为 None，跳过设置")
                    return

            # 设置最终属性
            setattr(obj, parts[-1], value)
        except AttributeError as e:
            print(f"[警告] 设置属性 {attr_path} 失败: {e}")
