"""
体型品味记忆管理模块 (Preference Manager)

功能：
    - 为三种体型（瘦小/中等/高大）记录和管理个性化调节品味
    - 记录用户手动调节后的压力比例
    - 基于记录的比例自动生成调节区间（保持区间）
    - 持久化到JSON文件，重启后自动加载
    - 后续识别到该体型时自动应用品味调节

工作流程：
    1. 体型三分类识别完成 → 获得当前体型（瘦小/中等/高大）
    2. 用户手动调节气囊至舒适位置
    3. 上层软件下发"记录品味"指令
    4. 系统采集当前压力比例（腰托/侧翼/腿托）
    5. 基于比例 ± margin 生成新的调节区间
    6. 持久化存储，后续该体型自动使用品味区间

作者: Manus AI
日期: 2026-02-27
"""

import json
import os
import time
import copy
from typing import Dict, Optional, Tuple
import numpy as np


class PreferenceManager:
    """体型品味记忆管理器"""

    # 支持的体型列表
    BODY_SHAPES = ['瘦小', '中等', '高大']

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

        # 从文件加载已有品味
        self._load_from_file()

        print(f"[品味管理] 初始化完成 | 持久化文件: {self.preference_file}")
        if self.preferences:
            for shape, pref in self.preferences.items():
                print(f"[品味管理] 已加载品味: {shape} (记录于 {pref.get('timestamp', '未知')})")
        else:
            print(f"[品味管理] 无已保存的品味数据")

    def _load_config(self):
        """从配置文件加载品味相关参数"""
        # 记录品味时的采样帧数（采集多帧取平均，消除噪声）
        self.record_sample_frames = self.config.get('preference.record_sample_frames', 30)

        # 调节区间的margin（比例 ± margin 形成保持区间）
        self.lumbar_margin = self.config.get('preference.lumbar_margin', 0.3)
        self.side_wing_margin = self.config.get('preference.side_wing_margin', 0.2)
        self.leg_support_margin = self.config.get('preference.leg_support_margin', 0.2)

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
                'left_inflate': self.config.get('leg_support.left_leg_butt_ratio_inflate', 0.7),
                'left_deflate': self.config.get('leg_support.left_leg_butt_ratio_deflate', 1.3),
                'right_inflate': self.config.get('leg_support.right_leg_butt_ratio_inflate', 0.7),
                'right_deflate': self.config.get('leg_support.right_leg_butt_ratio_deflate', 1.3),
            }
        }

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
                print(f"[品味管理] 体型已清除: {old_shape} → None")
        elif body_shape in self.BODY_SHAPES:
            old_shape = self.active_body_shape
            self.active_body_shape = body_shape
            if old_shape != body_shape:
                has_pref = body_shape in self.preferences
                print(f"[品味管理] 体型切换: {old_shape} → {body_shape} | "
                      f"品味数据: {'已加载' if has_pref else '使用默认区间'}")
        else:
            print(f"[品味管理] 警告: 未知体型 '{body_shape}'，忽略")

    def start_recording(self, body_shape: Optional[str] = None) -> Dict:
        """
        开始记录品味（外部触发）

        必须先识别到体型才能触发。如果未指定体型，使用当前激活的体型。

        Args:
            body_shape: 指定体型（可选，默认使用当前激活体型）

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

        print(f"[品味管理] 开始记录品味 | 体型: {target_shape} | "
              f"需采集 {self.record_sample_frames} 帧")

        return {
            'success': True,
            'message': f'开始记录品味，目标体型: {target_shape}，'
                       f'请保持当前坐姿约{self.record_sample_frames / 13:.1f}秒',
            'state': 'RECORDING',
            'target_shape': target_shape,
            'total_frames': self.record_sample_frames
        }

    def feed_frame(self, regions: Dict) -> Optional[Dict]:
        """
        喂入一帧区域压力数据（在process_frame中调用）

        仅在记录状态下有效。采集够帧数后自动完成记录。

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
        self.recording_frames.append(frame_ratios)

        current_count = len(self.recording_frames)

        # 每10帧打印一次进度
        if current_count % 10 == 0:
            print(f"[品味管理] 记录进度: {current_count}/{self.record_sample_frames}")

        # 检查是否采集够帧数
        if current_count >= self.record_sample_frames:
            return self._finalize_recording()

        return None

    def _compute_ratios(self, regions: Dict) -> Dict:
        """
        计算一帧的各区域压力比例

        与 _lumbar_control / _side_wing_control / _leg_support_control 中的
        比例计算逻辑完全一致，确保记录的比例和调节时使用的比例是同一套。

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

        # 左腿托比例: left_leg_mean / left_butt_mean
        left_butt = regions['cushion_butt_left']
        left_leg = regions['cushion_leg_left']
        left_butt_mean = float(np.mean(left_butt))
        left_leg_mean = float(np.mean(left_leg))
        left_leg_ratio = left_leg_mean / left_butt_mean if left_butt_mean > 0 else 0.0

        # 右腿托比例: right_leg_mean / right_butt_mean
        right_butt = regions['cushion_butt_right']
        right_leg = regions['cushion_leg_right']
        right_butt_mean = float(np.mean(right_butt))
        right_leg_mean = float(np.mean(right_leg))
        right_leg_ratio = right_leg_mean / right_butt_mean if right_butt_mean > 0 else 0.0

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
                'left_butt_mean': left_butt_mean,
                'left_leg_mean': left_leg_mean,
                'right_butt_mean': right_butt_mean,
                'right_leg_mean': right_leg_mean,
            }
        }

    def _finalize_recording(self) -> Dict:
        """
        完成品味记录：计算平均比例，生成调节区间，持久化存储

        Returns:
            记录完成的结果字典
        """
        target_shape = self.recording_target_shape
        frames = self.recording_frames

        # 计算各比例的平均值
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
        }

        # 存储品味
        self.preferences[target_shape] = preference_data

        # 持久化
        self._save_to_file()

        # 重置记录状态
        self.is_recording = False
        self.recording_frames = []
        self.recording_target_shape = None

        print(f"[品味管理] 品味记录完成 | 体型: {target_shape}")
        print(f"  腰托比例: {avg_ratios['lumbar_ratio']:.3f} → "
              f"区间 [{thresholds['lumbar']['deflate']:.3f}, {thresholds['lumbar']['inflate']:.3f}]")
        print(f"  侧翼比例: {avg_ratios['wing_ratio']:.3f} → "
              f"区间 [{thresholds['side_wings']['inflate_left']:.3f}, {thresholds['side_wings']['deflate_left']:.3f}]")
        print(f"  左腿托比例: {avg_ratios['left_leg_ratio']:.3f} → "
              f"区间 [{thresholds['leg_support']['left_inflate']:.3f}, {thresholds['leg_support']['left_deflate']:.3f}]")
        print(f"  右腿托比例: {avg_ratios['right_leg_ratio']:.3f} → "
              f"区间 [{thresholds['leg_support']['right_inflate']:.3f}, {thresholds['leg_support']['right_deflate']:.3f}]")

        return {
            'success': True,
            'message': f'品味记录完成，体型: {target_shape}',
            'state': 'COMPLETED',
            'body_shape': target_shape,
            'ratios': preference_data['ratios'],
            'thresholds': preference_data['thresholds'],
            'timestamp': preference_data['timestamp']
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
            print(f"[品味管理] 已清除所有品味数据（共{count}条）")
            return {
                'success': True,
                'message': f'已清除所有品味数据（共{count}条）',
                'cleared_count': count
            }

        if body_shape in self.preferences:
            del self.preferences[body_shape]
            self._save_to_file()
            print(f"[品味管理] 已清除体型 '{body_shape}' 的品味数据")
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
                    'sample_frames': pref.get('sample_frames', 0)
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
                'progress_pct': len(self.recording_frames) / self.record_sample_frames * 100
                                if self.is_recording else 0
            } if self.is_recording else None,
            'active_thresholds': active_thresholds,
            'using_preference': is_preference,
            'shapes': shapes_status,
            'config': {
                'record_sample_frames': self.record_sample_frames,
                'lumbar_margin': self.lumbar_margin,
                'side_wing_margin': self.side_wing_margin,
                'leg_support_margin': self.leg_support_margin,
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
            'remaining_seconds': (self.record_sample_frames - len(self.recording_frames)) / 13.0
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

        print(f"[品味管理] 品味记录已取消 | 体型: {target}")
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
        print(f"[品味管理] 状态已重置（品味数据保留）")

    def _save_to_file(self):
        """将品味数据持久化到JSON文件"""
        try:
            data = {
                'version': '1.0',
                'preferences': self.preferences
            }
            with open(self.preference_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"[品味管理] 品味数据已保存到 {self.preference_file}")
        except Exception as e:
            print(f"[品味管理] 保存品味数据失败: {e}")

    def _load_from_file(self):
        """从JSON文件加载品味数据"""
        if not os.path.exists(self.preference_file):
            return

        try:
            with open(self.preference_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if 'preferences' in data:
                self.preferences = data['preferences']
                print(f"[品味管理] 从 {self.preference_file} 加载了 {len(self.preferences)} 条品味数据")
            else:
                print(f"[品味管理] 品味文件格式不正确，跳过加载")
        except Exception as e:
            print(f"[品味管理] 加载品味数据失败: {e}")
