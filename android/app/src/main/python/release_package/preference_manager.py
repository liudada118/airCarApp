"""
体型品味记忆管理模块 (Preference Manager)

功能：
    - 为三种体型（瘦小/中等/高大）记录和管理个性化调节品味
    - 记录用户手动调节后的压力比例
    - 基于充放气次数构建置信区间，过滤异常采集帧（截断/卡尔曼融合两种模式）
    - 基于记录的比例自动生成调节区间（保持区间）
    - 持久化到JSON文件，重启后自动加载
    - 后续识别到该体型时自动应用品味调节

鲁棒品味记录原理：
    1. 用户手动调节气囊前，各区域比例值落在当前自适应保持区间内
    2. 用户充气/放气若干次后，比例值应从保持区间中心向对应方向偏移
    3. 偏移量 = 保持区间中心 × (1 + step_factor)^net_count（乘法因子，非线性）
    4. 以预期比例为中心 ± tolerance 构建置信区间
    5. 采集时逐帧过滤：
       - 截断模式(clamp)：超出置信区间的帧按上下限截断
       - 卡尔曼融合模式(kalman)：观测值越偏离预测，权重越低

作者: Manus AI
日期: 2026-03-05
"""

import json
import math
import os
import time
import copy
from typing import Dict, Optional, Tuple
import numpy as np


class PreferenceManager:
    """体型品味记忆管理器"""

    # 支持的体型列表
    BODY_SHAPES = ['瘦小', '中等', '高大']

    # 区域名称到比例键的映射
    # airbag_ops 字典中的区域名 → _compute_ratios 返回的比例键
    REGION_RATIO_MAP = {
        'lumbar': ['lumbar_ratio'],
        'side_wings_left': ['wing_ratio'],   # 左侧翼充气 → wing_ratio升高
        'side_wings_right': ['wing_ratio'],  # 右侧翼充气 → wing_ratio降低（反向）
        'leg_left': ['left_leg_ratio'],
        'leg_right': ['right_leg_ratio'],
    }

    # 充气对比例值的影响方向（+1=充气使比例升高，-1=充气使比例降低）
    # 这取决于各区域的物理含义
    INFLATE_DIRECTION = {
        'lumbar': {
            'lumbar_ratio': -1,       # 腰托充气 → 下部被撑起 → upper/lower比降低
        },
        'side_wings_left': {
            'wing_ratio': +1,         # 左侧翼充气 → 左侧压力升高 → left/right比升高
        },
        'side_wings_right': {
            'wing_ratio': -1,         # 右侧翼充气 → 右侧压力升高 → left/right比降低
        },
        'leg_left': {
            'left_leg_ratio': +1,     # 左腿托充气 → 前端被撑起 → front/rear比升高
        },
        'leg_right': {
            'right_leg_ratio': +1,    # 右腿托充气 → 前端被撑起 → front/rear比升高
        },
    }

    def __init__(self, config, preference_file: str = 'preferences.json'):
        """
        初始化品味管理器

        Args:
            config: 配置对象（SeatConfig实例），用于读取默认区间和品味相关配置
            preference_file: 品味数据持久化文件路径
        """
        self.config = config
        self.preference_file = preference_file

        # 品味相关配置
        self._load_config()

        # 品味数据存储: {体型: {ratios: {...}, thresholds: {...}, timestamp: ...}}
        self.preferences: Dict[str, Dict] = {}

        # 当前激活的体型（由体型三分类器设置）
        self.active_body_shape: Optional[str] = None

        # 记录状态
        self.is_recording = False
        self.recording_frames: list = []
        self.recording_target_shape: Optional[str] = None
        self.recording_airbag_ops: Optional[Dict] = None  # 充放气次数字典
        self.recording_confidence_intervals: Optional[Dict] = None  # 各比例的置信区间

        # 卡尔曼融合状态（仅kalman模式使用）
        self._kalman_state: Optional[Dict] = None

        # 重心标定值（由集成系统设置，用于品味采集时的前3后3比计算）
        self._centroid: Optional[float] = None

        # 从文件加载已有品味
        self._load_from_file()

        # print(f"[品味管理] 初始化完成 | 持久化文件: {self.preference_file}")
        if self.preferences:
            for shape, pref in self.preferences.items():
                pass
                # print(f"[品味管理] 已加载品味: {shape} (记录于 {pref.get('timestamp', '未知')})")
        else:
            # print(f"[品味管理] 无已保存的品味数据")
            pass

    def _load_config(self):
        """从配置文件加载品味相关参数"""
        # 记录品味时的采样帧数（采集多帧取平均，消除噪声）
        self.record_sample_frames = self.config.get('preference.record_sample_frames', 30)

        # 调节区间的margin（比例 ± margin 形成保持区间）
        self.lumbar_margin = self.config.get('preference.lumbar_margin', 0.3)
        self.side_wing_margin = self.config.get('preference.side_wing_margin', 0.2)
        self.leg_support_margin = self.config.get('preference.leg_support_margin', 0.2)

        # === 鲁棒品味记录配置 ===
        # 过滤模式: 'clamp'=截断模式, 'kalman'=卡尔曼融合模式
        self.robust_filter_mode = self.config.get('preference.robust_filter_mode', 'kalman')
        # 每次充/放气操作对比例值的乘法因子（非线性偏移）
        # 预期比例 = 基线中心 × (1 + step_factor)^net_count
        self.step_factor = self.config.get('preference.step_factor', 0.05)
        # 置信区间容差（乘法容差，置信区间 = [预期 × (1-tolerance), 预期 × (1+tolerance)]）
        self.confidence_tolerance = self.config.get('preference.confidence_tolerance', 0.3)
        # 卡尔曼融合参数
        self.kalman_process_variance = self.config.get('preference.kalman_process_variance', 0.01)
        self.kalman_base_measure_variance = self.config.get('preference.kalman_base_measure_variance', 0.02)
        # 观测值偏离预测时的方差放大系数（偏离越大，方差越大，权重越低）
        self.kalman_outlier_scale = self.config.get('preference.kalman_outlier_scale', 5.0)

        # 默认调节区间（从配置文件读取，作为无品味时的回退值）
        self.default_thresholds = {
            'lumbar': {
                'inflate': self.config.get('lumbar.upper_lower_ratio_inflate', 1.5),
                'deflate': self.config.get('lumbar.upper_lower_ratio_deflate', 0.7),
            },
            'side_wings': {
                'inflate_left': self.config.get('side_wings.left_right_ratio_inflate_left', 0.7),
                'deflate_left': self.config.get('side_wings.left_right_ratio_deflate_left', 1.3),
            },
            'leg_support': {
                'left_inflate': self.config.get('leg_support.left_f3r3_inflate', 0.48),
                'left_deflate': self.config.get('leg_support.left_f3r3_deflate', 0.70),
                'right_inflate': self.config.get('leg_support.right_f3r3_inflate', 0.64),
                'right_deflate': self.config.get('leg_support.right_f3r3_deflate', 0.96),
            }
        }

    def set_centroid(self, centroid: Optional[float]):
        """
        设置列方向重心值（由集成系统在标定完成后调用）

        Args:
            centroid: 列方向重心值（0~5之间的浮点数），或None表示重置
        """
        self._centroid = centroid

    def set_active_body_shape(self, body_shape):
        """
        设置当前激活的体型（由体型三分类器结果触发）

        Args:
            body_shape: 体型名称（'瘦小'/'中等'/'高大'），传入None清除激活状态
        """
        if body_shape is None:
            # 清除激活状态（离座/复位时调用）
            old_shape = self.active_body_shape
            self.active_body_shape = None
            if old_shape is not None:
                # print(f"[品味管理] 体型已清除: {old_shape} → None")
                pass
        elif body_shape in self.BODY_SHAPES:
            old_shape = self.active_body_shape
            self.active_body_shape = body_shape
            if old_shape != body_shape:
                has_pref = body_shape in self.preferences
                # print(f"[品味管理] 体型切换: {old_shape} → {body_shape} | "
                      # f"品味数据: {'已加载' if has_pref else '使用默认区间'}")
        else:
            # print(f"[品味管理] 警告: 未知体型 '{body_shape}'，忽略")
            pass

    # ========================================
    # 鲁棒品味记录核心逻辑
    # ========================================

    def _compute_baseline_centers(self) -> Dict[str, float]:
        """
        计算各比例的基线中心值（当前保持区间的中点）

        基线中心 = (inflate阈值 + deflate阈值) / 2
        这是用户调节前各比例值应该落在的位置。

        Returns:
            各比例键对应的基线中心值
        """
        thresholds, _ = self.get_active_thresholds()

        # 腰托: 保持区间 = [deflate, inflate]
        lumbar_center = (thresholds['lumbar']['inflate'] + thresholds['lumbar']['deflate']) / 2.0

        # 侧翼: 保持区间 = [inflate_left, deflate_left]
        wing_center = (thresholds['side_wings']['inflate_left'] + thresholds['side_wings']['deflate_left']) / 2.0

        # 左腿托: 保持区间 = [inflate, deflate]
        left_leg_center = (thresholds['leg_support']['left_inflate'] + thresholds['leg_support']['left_deflate']) / 2.0

        # 右腿托: 保持区间 = [inflate, deflate]
        right_leg_center = (thresholds['leg_support']['right_inflate'] + thresholds['leg_support']['right_deflate']) / 2.0

        return {
            'lumbar_ratio': lumbar_center,
            'wing_ratio': wing_center,
            'left_leg_ratio': left_leg_center,
            'right_leg_ratio': right_leg_center,
        }

    def _compute_expected_ratios(self, baseline_centers: Dict[str, float],
                                  airbag_ops: Dict) -> Dict[str, float]:
        """
        基于充放气次数计算各比例的预期值（乘法因子模型）

        预期比例 = 基线中心 × (1 + step_factor)^(direction × net_count)
        其中 net_count = inflate_count - deflate_count

        Args:
            baseline_centers: 各比例的基线中心值
            airbag_ops: 充放气次数字典，格式如:
                {
                    'lumbar': {'inflate': 3, 'deflate': 0},
                    'side_wings_left': {'inflate': 1, 'deflate': 0},
                    'side_wings_right': {'inflate': 0, 'deflate': 0},
                    'leg_left': {'inflate': 0, 'deflate': 2},
                    'leg_right': {'inflate': 0, 'deflate': 1},
                }

        Returns:
            各比例键对应的预期值
        """
        expected = dict(baseline_centers)  # 从基线开始

        for region, ops in airbag_ops.items():
            if region not in self.INFLATE_DIRECTION:
                continue

            inflate_count = ops.get('inflate', 0)
            deflate_count = ops.get('deflate', 0)
            net_count = inflate_count - deflate_count

            if net_count == 0:
                continue

            # 对该区域影响的所有比例键应用乘法偏移
            for ratio_key, direction in self.INFLATE_DIRECTION[region].items():
                if ratio_key in expected:
                    # 乘法因子模型：非线性偏移
                    factor = math.pow(1.0 + self.step_factor, direction * net_count)
                    expected[ratio_key] *= factor

        return expected

    def _build_confidence_intervals(self, expected_ratios: Dict[str, float]) -> Dict[str, Tuple[float, float]]:
        """
        基于预期比例构建置信区间

        置信区间 = [预期 × (1 - tolerance), 预期 × (1 + tolerance)]
        使用乘法容差，保证对大小比例值都有合理的区间宽度。

        Args:
            expected_ratios: 各比例的预期值

        Returns:
            各比例键对应的 (lower, upper) 置信区间
        """
        intervals = {}
        for key, expected in expected_ratios.items():
            lower = expected * (1.0 - self.confidence_tolerance)
            upper = expected * (1.0 + self.confidence_tolerance)
            # 确保下限不低于0
            lower = max(0.0, lower)
            intervals[key] = (lower, upper)
        return intervals

    def _clamp_ratios(self, frame_ratios: Dict, confidence_intervals: Dict[str, Tuple[float, float]]) -> Dict:
        """
        截断模式：将超出置信区间的比例值截断到上下限

        Args:
            frame_ratios: 一帧的原始比例值
            confidence_intervals: 各比例的置信区间

        Returns:
            截断后的比例值字典（保留raw字段不变）
        """
        clamped = dict(frame_ratios)
        for key, (lower, upper) in confidence_intervals.items():
            if key in clamped:
                original = clamped[key]
                clamped[key] = max(lower, min(upper, original))
                if clamped[key] != original:
                    # print(f"[品味管理] 截断: {key} {original:.4f} → {clamped[key]:.4f} "
                          # f"(置信区间 [{lower:.4f}, {upper:.4f}])")
                    pass
        return clamped

    def _kalman_update(self, frame_ratios: Dict, confidence_intervals: Dict[str, Tuple[float, float]]) -> Dict:
        """
        卡尔曼融合模式：用预测值和观测值做加权融合

        核心公式：
            K = P_pred / (P_pred + R)
            x_fused = x_pred + K × (z - x_pred)
            P_fused = (1 - K) × P_pred

        其中观测噪声 R 随偏离程度动态调整：
            - 观测值在置信区间内 → R = base_measure_variance
            - 观测值偏离置信区间 → R = base_measure_variance × (1 + outlier_scale × 归一化偏离距离²)

        Args:
            frame_ratios: 一帧的原始比例值
            confidence_intervals: 各比例的置信区间

        Returns:
            融合后的比例值字典
        """
        fused = dict(frame_ratios)

        for key in ['lumbar_ratio', 'wing_ratio', 'left_leg_ratio', 'right_leg_ratio']:
            if key not in self._kalman_state or key not in fused:
                continue

            state = self._kalman_state[key]
            z = fused[key]  # 观测值

            # 预测步（状态不变，方差增加过程噪声）
            x_pred = state['x']
            P_pred = state['P'] + self.kalman_process_variance

            # 计算观测噪声（根据偏离程度动态调整）
            lower, upper = confidence_intervals.get(key, (0, float('inf')))
            interval_width = upper - lower
            R = self.kalman_base_measure_variance

            if interval_width > 0:
                if z < lower:
                    deviation = (lower - z) / interval_width
                    R *= (1.0 + self.kalman_outlier_scale * deviation * deviation)
                elif z > upper:
                    deviation = (z - upper) / interval_width
                    R *= (1.0 + self.kalman_outlier_scale * deviation * deviation)
                # 在区间内 → R不变，信任观测

            # 更新步
            K = P_pred / (P_pred + R)
            x_fused = x_pred + K * (z - x_pred)
            P_fused = (1.0 - K) * P_pred

            # 更新状态
            state['x'] = x_fused
            state['P'] = P_fused

            if abs(z - x_fused) > 0.01:
                # print(f"[品味管理] 卡尔曼融合: {key} 观测={z:.4f} → 融合={x_fused:.4f} "
                      # f"(K={K:.3f}, R={R:.4f})")
                pass

            fused[key] = x_fused

        return fused

    def _init_kalman_state(self, expected_ratios: Dict[str, float]):
        """
        初始化卡尔曼滤波器状态

        以预期比例值为初始状态，初始方差设为较大值（表示不确定性高）。

        Args:
            expected_ratios: 各比例的预期值（作为初始估计）
        """
        self._kalman_state = {}
        for key, expected in expected_ratios.items():
            self._kalman_state[key] = {
                'x': expected,  # 状态估计（初始为预期值）
                'P': 0.1,       # 估计方差（初始较大，表示不确定）
            }

    # ========================================
    # 品味记录主流程
    # ========================================

    def start_recording(self, body_shape: Optional[str] = None,
                        airbag_ops: Optional[Dict] = None) -> Dict:
        """
        开始记录品味（外部触发）

        必须先识别到体型才能触发。如果未指定体型，使用当前激活的体型。
        传入充放气次数字典后，系统会构建置信区间进行鲁棒采集。

        Args:
            body_shape: 指定体型（可选，默认使用当前激活体型）
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
            操作结果字典 {'success': bool, 'message': str, ...}
        """
        target_shape = body_shape or self.active_body_shape

        # 检查前置条件
        if target_shape is None:
            return {
                'success': False,
                'message': '尚未识别到体型，请先触发体型三分类识别',
                'state': 'ERROR'
            }

        if target_shape not in self.BODY_SHAPES:
            return {
                'success': False,
                'message': f'无效的体型: {target_shape}，支持的体型: {self.BODY_SHAPES}',
                'state': 'ERROR'
            }

        if self.is_recording:
            return {
                'success': False,
                'message': f'正在记录中（目标体型: {self.recording_target_shape}），请等待完成',
                'state': 'RECORDING'
            }

        # 开始记录
        self.is_recording = True
        self.recording_frames = []
        self.recording_target_shape = target_shape
        self.recording_airbag_ops = airbag_ops

        # 构建置信区间（如果提供了充放气次数）
        if airbag_ops is not None:
            baseline_centers = self._compute_baseline_centers()
            expected_ratios = self._compute_expected_ratios(baseline_centers, airbag_ops)
            self.recording_confidence_intervals = self._build_confidence_intervals(expected_ratios)

            # 初始化卡尔曼状态（kalman模式使用）
            if self.robust_filter_mode == 'kalman':
                self._init_kalman_state(expected_ratios)

            # print(f"[品味管理] 鲁棒品味记录 | 模式: {self.robust_filter_mode}")
            # print(f"  充放气操作: {airbag_ops}")
            # print(f"  基线中心: { {k: f'{v:.3f}' for k, v in baseline_centers.items()} }")
            # print(f"  预期比例: { {k: f'{v:.3f}' for k, v in expected_ratios.items()} }")
            for key, (lo, hi) in self.recording_confidence_intervals.items():
                pass
                # print(f"  置信区间 {key}: [{lo:.3f}, {hi:.3f}]")
        else:
            self.recording_confidence_intervals = None
            self._kalman_state = None
            # print(f"[品味管理] 普通品味记录（无充放气信息，不过滤）")

        # print(f"[品味管理] 开始记录品味 | 体型: {target_shape} | "
              # f"需采集 {self.record_sample_frames} 帧")

        return {
            'success': True,
            'message': f'开始记录品味，目标体型: {target_shape}，'
                       f'请保持当前坐姿约{self.record_sample_frames / 13:.1f}秒',
            'state': 'RECORDING',
            'target_shape': target_shape,
            'total_frames': self.record_sample_frames,
            'filter_mode': self.robust_filter_mode if airbag_ops else 'none',
            'confidence_intervals': {
                k: {'lower': v[0], 'upper': v[1]}
                for k, v in self.recording_confidence_intervals.items()
            } if self.recording_confidence_intervals else None,
        }

    def feed_frame(self, regions: Dict) -> Optional[Dict]:
        """
        喂入一帧区域压力数据（在process_frame中调用）

        仅在记录状态下有效。采集够帧数后自动完成记录。
        如果有置信区间，会对每帧进行鲁棒过滤。

        Args:
            regions: 压力区域字典（与_extract_regions返回格式一致）

        Returns:
            None — 仍在采集中
            Dict — 记录完成的结果
        """
        if not self.is_recording:
            return None

        # 计算本帧的各区域压力比例
        frame_ratios = self._compute_ratios(regions)

        # 鲁棒过滤（如果有置信区间）
        if self.recording_confidence_intervals is not None:
            if self.robust_filter_mode == 'clamp':
                frame_ratios = self._clamp_ratios(frame_ratios, self.recording_confidence_intervals)
            elif self.robust_filter_mode == 'kalman':
                frame_ratios = self._kalman_update(frame_ratios, self.recording_confidence_intervals)

        self.recording_frames.append(frame_ratios)

        current_count = len(self.recording_frames)

        # 每10帧打印一次进度
        if current_count % 10 == 0:
            # print(f"[品味管理] 记录进度: {current_count}/{self.record_sample_frames}")
            pass

        # 检查是否采集够帧数
        if current_count >= self.record_sample_frames:
            return self._finalize_recording()

        return None

    def _compute_ratios(self, regions: Dict) -> Dict:
        """
        计算一帧的各区域压力比例

        与 _lumbar_control / _side_wing_control / _leg_support_control 中的
        比例计算逻辑完全一致，确保记录的比例和调节时使用的比例是同一套。

        腿托比例已改为前3后3比方案（基于重心划分左右腿）。

        Args:
            regions: 压力区域字典

        Returns:
            各区域压力比例字典
        """
        # 腰托比例: upper_mean / lower_mean
        upper = regions['backrest_upper']
        lower = regions['backrest_lower']
        upper_mean = float(np.mean(upper))
        lower_mean = float(np.mean(lower))
        lumbar_ratio = upper_mean / lower_mean if lower_mean > 0 else 0.0

        # 侧翼比例: left_total / right_total
        left = regions['backrest_left']
        right = regions['backrest_right']
        left_total = float(np.sum(left))
        right_total = float(np.sum(right))
        wing_ratio = left_total / right_total if right_total > 0 else 0.0

        # 腿托比例: 前3后3比方案（基于重心划分左右腿）
        front3 = regions['cushion_front3']
        rear3 = regions['cushion_rear3']
        cushion_total = regions['cushion_total']

        # 使用已标定的重心（通过centroid_info传入）或实时计算
        centroid = self._centroid
        if centroid is None:
            col_sums = np.sum(cushion_total, axis=0)
            total = np.sum(col_sums)
            if total > 0:
                centroid = float(np.sum(np.arange(cushion_total.shape[1]) * col_sums) / total)
            else:
                centroid = cushion_total.shape[1] / 2.0

        cols = front3.shape[1]
        left_weights = np.zeros(cols)
        for c in range(cols):
            if c + 0.5 <= centroid:
                left_weights[c] = 1.0
            elif c - 0.5 >= centroid:
                left_weights[c] = 0.0
            else:
                left_weights[c] = centroid - (c - 0.5)
        right_weights = 1.0 - left_weights

        left_f3 = float(np.sum(front3 * left_weights[np.newaxis, :]))
        left_r3 = float(np.sum(rear3 * left_weights[np.newaxis, :]))
        left_leg_ratio = left_f3 / left_r3 if left_r3 > 1 else 0.0

        right_f3 = float(np.sum(front3 * right_weights[np.newaxis, :]))
        right_r3 = float(np.sum(rear3 * right_weights[np.newaxis, :]))
        right_leg_ratio = right_f3 / right_r3 if right_r3 > 1 else 0.0

        return {
            'lumbar_ratio': lumbar_ratio,
            'wing_ratio': wing_ratio,
            'left_leg_ratio': left_leg_ratio,
            'right_leg_ratio': right_leg_ratio,
            # 保留原始压力值用于调试
            'raw': {
                'upper_mean': upper_mean,
                'lower_mean': lower_mean,
                'left_total': left_total,
                'right_total': right_total,
                'left_f3': left_f3,
                'left_r3': left_r3,
                'right_f3': right_f3,
                'right_r3': right_r3,
            }
        }

    def _finalize_recording(self) -> Dict:
        """
        完成品味记录：计算平均比例，生成调节区间，持久化存储

        对于卡尔曼模式，最终比例取最后一帧的融合值（收敛值）。
        对于截断模式和普通模式，取所有帧的平均值。

        Returns:
            记录完成的结果字典
        """
        target_shape = self.recording_target_shape
        frames = self.recording_frames

        # 计算各比例的最终值
        if self.robust_filter_mode == 'kalman' and self._kalman_state is not None:
            # 卡尔曼模式：使用最终收敛的状态估计
            avg_ratios = {
                'lumbar_ratio': self._kalman_state['lumbar_ratio']['x'],
                'wing_ratio': self._kalman_state['wing_ratio']['x'],
                'left_leg_ratio': self._kalman_state['left_leg_ratio']['x'],
                'right_leg_ratio': self._kalman_state['right_leg_ratio']['x'],
            }
            # print(f"[品味管理] 卡尔曼最终收敛值:")
            for key in ['lumbar_ratio', 'wing_ratio', 'left_leg_ratio', 'right_leg_ratio']:
                state = self._kalman_state[key]
                # print(f"  {key}: {state['x']:.4f} (方差: {state['P']:.6f})")
        else:
            # 截断模式或普通模式：取平均值
            avg_ratios = {
                'lumbar_ratio': np.mean([f['lumbar_ratio'] for f in frames]),
                'wing_ratio': np.mean([f['wing_ratio'] for f in frames]),
                'left_leg_ratio': np.mean([f['left_leg_ratio'] for f in frames]),
                'right_leg_ratio': np.mean([f['right_leg_ratio'] for f in frames]),
            }

        # 生成调节区间
        thresholds = self._generate_thresholds(avg_ratios)

        # 构建品味数据
        preference_data = {
            'ratios': {k: float(v) for k, v in avg_ratios.items()},
            'thresholds': thresholds,
            'sample_frames': len(frames),
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
            'filter_mode': self.robust_filter_mode if self.recording_airbag_ops else 'none',
            'airbag_ops': self.recording_airbag_ops,
        }

        # 存储品味
        self.preferences[target_shape] = preference_data

        # 持久化
        self._save_to_file()

        # 重置记录状态
        self.is_recording = False
        self.recording_frames = []
        self.recording_target_shape = None
        self.recording_airbag_ops = None
        self.recording_confidence_intervals = None
        self._kalman_state = None

        # print(f"[品味管理] 品味记录完成 | 体型: {target_shape}")
        # print(f"  腰托比例: {avg_ratios['lumbar_ratio']:.3f} → "
              # f"区间 [{thresholds['lumbar']['deflate']:.3f}, {thresholds['lumbar']['inflate']:.3f}]")
        # print(f"  侧翼比例: {avg_ratios['wing_ratio']:.3f} → "
              # f"区间 [{thresholds['side_wings']['inflate_left']:.3f}, {thresholds['side_wings']['deflate_left']:.3f}]")
        # print(f"  左腿托比例: {avg_ratios['left_leg_ratio']:.3f} → "
              # f"区间 [{thresholds['leg_support']['left_inflate']:.3f}, {thresholds['leg_support']['left_deflate']:.3f}]")
        # print(f"  右腿托比例: {avg_ratios['right_leg_ratio']:.3f} → "
              # f"区间 [{thresholds['leg_support']['right_inflate']:.3f}, {thresholds['leg_support']['right_deflate']:.3f}]")

        return {
            'success': True,
            'message': f'品味记录完成，体型: {target_shape}',
            'state': 'COMPLETED',
            'body_shape': target_shape,
            'ratios': preference_data['ratios'],
            'thresholds': preference_data['thresholds'],
            'timestamp': preference_data['timestamp'],
            'filter_mode': preference_data['filter_mode'],
        }

    def _generate_thresholds(self, avg_ratios: Dict) -> Dict:
        """
        基于记录的平均压力比例生成调节区间

        核心逻辑：以记录的比例为中心，上下拓展 margin 形成保持区间。
        - 比例 + margin = inflate阈值（超过此值才充气）
        - 比例 - margin = deflate阈值（低于此值才放气）
        - 两者之间为保持区间

        与现有逻辑保持一致：
        - 腰托: ratio > inflate → 充气, ratio < deflate → 放气
        - 侧翼: ratio > deflate_left → 左充右放, ratio < inflate_left → 右充左放
        - 腿托: ratio < inflate → 充气, ratio > deflate → 放气

        Args:
            avg_ratios: 平均压力比例字典

        Returns:
            调节区间字典
        """
        # 腰托区间
        lumbar_center = avg_ratios['lumbar_ratio']
        lumbar_inflate = lumbar_center + self.lumbar_margin
        lumbar_deflate = max(0.1, lumbar_center - self.lumbar_margin)  # 不低于0.1

        # 侧翼区间
        # 侧翼逻辑: ratio > deflate_left → 左充右放
        #           ratio < inflate_left → 右充左放
        # 所以 inflate_left < center < deflate_left
        wing_center = avg_ratios['wing_ratio']
        wing_inflate_left = max(0.1, wing_center - self.side_wing_margin)
        wing_deflate_left = wing_center + self.side_wing_margin

        # 左腿托区间
        # 腿托逻辑: ratio < inflate → 充气, ratio > deflate → 放气
        left_leg_center = avg_ratios['left_leg_ratio']
        left_leg_inflate = max(0.1, left_leg_center - self.leg_support_margin)
        left_leg_deflate = left_leg_center + self.leg_support_margin

        # 右腿托区间
        right_leg_center = avg_ratios['right_leg_ratio']
        right_leg_inflate = max(0.1, right_leg_center - self.leg_support_margin)
        right_leg_deflate = right_leg_center + self.leg_support_margin

        return {
            'lumbar': {
                'inflate': float(lumbar_inflate),
                'deflate': float(lumbar_deflate),
            },
            'side_wings': {
                'inflate_left': float(wing_inflate_left),
                'deflate_left': float(wing_deflate_left),
            },
            'leg_support': {
                'left_inflate': float(left_leg_inflate),
                'left_deflate': float(left_leg_deflate),
                'right_inflate': float(right_leg_inflate),
                'right_deflate': float(right_leg_deflate),
            }
        }

    # ========================================
    # 品味查询和管理接口
    # ========================================

    def get_active_thresholds(self) -> Tuple[Dict, bool]:
        """
        获取当前生效的调节区间

        如果当前体型有品味数据，返回品味区间；否则返回默认区间。

        Returns:
            (thresholds_dict, is_preference) 元组
            - thresholds_dict: 调节区间字典
            - is_preference: 是否为品味区间（True=品味, False=默认）
        """
        if self.active_body_shape and self.active_body_shape in self.preferences:
            return self.preferences[self.active_body_shape]['thresholds'], True
        return copy.deepcopy(self.default_thresholds), False

    def get_thresholds_for_shape(self, body_shape: str) -> Tuple[Dict, bool]:
        """
        获取指定体型的调节区间

        Args:
            body_shape: 体型名称

        Returns:
            (thresholds_dict, is_preference) 元组
        """
        if body_shape in self.preferences:
            return self.preferences[body_shape]['thresholds'], True
        return copy.deepcopy(self.default_thresholds), False

    def has_preference(self, body_shape: Optional[str] = None) -> bool:
        """
        检查指定体型是否有品味数据

        Args:
            body_shape: 体型名称（可选，默认使用当前激活体型）

        Returns:
            是否有品味数据
        """
        shape = body_shape or self.active_body_shape
        return shape is not None and shape in self.preferences

    def clear_preference(self, body_shape: Optional[str] = None) -> Dict:
        """
        清除指定体型的品味数据

        Args:
            body_shape: 体型名称（可选，None则清除所有）

        Returns:
            操作结果字典
        """
        if body_shape is None:
            # 清除所有
            count = len(self.preferences)
            self.preferences.clear()
            self._save_to_file()
            # print(f"[品味管理] 已清除所有品味数据（共{count}条）")
            return {
                'success': True,
                'message': f'已清除所有品味数据（共{count}条）',
                'cleared_count': count
            }

        if body_shape in self.preferences:
            del self.preferences[body_shape]
            self._save_to_file()
            # print(f"[品味管理] 已清除体型 '{body_shape}' 的品味数据")
            return {
                'success': True,
                'message': f'已清除体型 "{body_shape}" 的品味数据',
                'body_shape': body_shape
            }
        else:
            return {
                'success': False,
                'message': f'体型 "{body_shape}" 无品味数据',
                'body_shape': body_shape
            }

    def get_status(self) -> Dict:
        """
        获取品味管理器的完整状态

        Returns:
            状态字典（用于API返回和GUI显示）
        """
        # 各体型的品味状态
        shapes_status = {}
        for shape in self.BODY_SHAPES:
            if shape in self.preferences:
                pref = self.preferences[shape]
                shapes_status[shape] = {
                    'has_preference': True,
                    'ratios': pref['ratios'],
                    'thresholds': pref['thresholds'],
                    'timestamp': pref['timestamp'],
                    'sample_frames': pref.get('sample_frames', 0),
                    'filter_mode': pref.get('filter_mode', 'none'),
                }
            else:
                shapes_status[shape] = {
                    'has_preference': False,
                    'thresholds': copy.deepcopy(self.default_thresholds),
                    'using': 'default'
                }

        # 当前激活的区间
        active_thresholds, is_preference = self.get_active_thresholds()

        return {
            'active_body_shape': self.active_body_shape,
            'is_recording': self.is_recording,
            'recording_progress': {
                'target_shape': self.recording_target_shape,
                'current_frames': len(self.recording_frames),
                'total_frames': self.record_sample_frames,
                'progress_pct': len(self.recording_frames) / self.record_sample_frames * 100,
                'filter_mode': self.robust_filter_mode if self.recording_airbag_ops else 'none',
                'confidence_intervals': {
                    k: {'lower': v[0], 'upper': v[1]}
                    for k, v in self.recording_confidence_intervals.items()
                } if self.recording_confidence_intervals else None,
            } if self.is_recording else None,
            'active_thresholds': active_thresholds,
            'using_preference': is_preference,
            'shapes': shapes_status,
            'config': {
                'record_sample_frames': self.record_sample_frames,
                'lumbar_margin': self.lumbar_margin,
                'side_wing_margin': self.side_wing_margin,
                'leg_support_margin': self.leg_support_margin,
                'robust_filter_mode': self.robust_filter_mode,
                'step_factor': self.step_factor,
                'confidence_tolerance': self.confidence_tolerance,
            }
        }

    def get_recording_progress(self) -> Optional[Dict]:
        """
        获取记录进度（仅在记录中有效）

        Returns:
            进度字典或None
        """
        if not self.is_recording:
            return None

        return {
            'target_shape': self.recording_target_shape,
            'current_frames': len(self.recording_frames),
            'total_frames': self.record_sample_frames,
            'progress_pct': len(self.recording_frames) / self.record_sample_frames * 100,
            'remaining_seconds': (self.record_sample_frames - len(self.recording_frames)) / 13.0,
            'filter_mode': self.robust_filter_mode if self.recording_airbag_ops else 'none',
        }

    def cancel_recording(self) -> Dict:
        """
        取消正在进行的品味记录

        Returns:
            操作结果字典
        """
        if not self.is_recording:
            return {
                'success': False,
                'message': '当前没有正在进行的品味记录'
            }

        target = self.recording_target_shape
        self.is_recording = False
        self.recording_frames = []
        self.recording_target_shape = None
        self.recording_airbag_ops = None
        self.recording_confidence_intervals = None
        self._kalman_state = None

        # print(f"[品味管理] 品味记录已取消 | 体型: {target}")
        return {
            'success': True,
            'message': f'品味记录已取消，体型: {target}',
            'body_shape': target
        }

    def reset(self):
        """重置品味管理器状态（不清除已保存的品味数据）"""
        self.active_body_shape = None
        self.is_recording = False
        self.recording_frames = []
        self.recording_target_shape = None
        self.recording_airbag_ops = None
        self.recording_confidence_intervals = None
        self._kalman_state = None
        # print(f"[品味管理] 状态已重置（品味数据保留）")

    # ========================================
    # 持久化
    # ========================================

    def _save_to_file(self):
        """将品味数据持久化到JSON文件"""
        try:
            data = {
                'version': '1.1',
                'preferences': self.preferences
            }
            with open(self.preference_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            # print(f"[品味管理] 品味数据已保存到 {self.preference_file}")
        except Exception as e:
            # print(f"[品味管理] 保存品味数据失败: {e}")
            pass

    def _load_from_file(self):
        """从JSON文件加载品味数据"""
        if not os.path.exists(self.preference_file):
            return

        try:
            with open(self.preference_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if 'preferences' in data:
                self.preferences = data['preferences']
                # print(f"[品味管理] 从 {self.preference_file} 加载了 {len(self.preferences)} 条品味数据")
            else:
                # print(f"[品味管理] 品味文件格式不正确，跳过加载")
                pass
        except Exception as e:
            pass
            # print(f"[品味管理] 加载品味数据失败: {e}")
