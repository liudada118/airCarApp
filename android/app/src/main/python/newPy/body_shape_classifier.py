# -*- coding: utf-8 -*-
"""
体型三分类检测器（集成到座椅控制系统）

外部触发式体型分类器，支持：
1. 外部触发启动采集
2. 自动入座检测 — 只缓冲有效入座帧（坐垫压力超过阈值）
3. 缓冲指定帧数的原始传感器数据
4. 滑动窗口特征提取 + KNN分类 + 概率软投票
5. 返回三分类结果（瘦小/中等/高大）

依赖 body_type_classifier 算法包中的 FeatureEngineer 和 BodyTypeClassifier。
"""

import os
import numpy as np
from typing import Optional, Dict, List
from enum import Enum

from config import Config


class ClassifierState(Enum):
    """分类器状态枚举"""
    IDLE = 0           # 空闲，等待触发
    COLLECTING = 1     # 数据采集中
    CLASSIFYING = 2    # 分类计算中
    COMPLETED = 3      # 分类完成，结果可用


class BodyShapeClassifier:
    """
    体型三分类检测器
    
    工作流程：
    1. 外部调用 trigger() 启动采集
    2. 每帧调用 update() 喂入原始144点传感器数据
    3. 自动入座检测：只缓冲坐垫压力超过阈值的帧
    4. 采集满足 collect_frames 个有效帧后，自动进行特征提取和分类
    5. 通过 get_result() 获取分类结果
    6. 调用 reset() 回到空闲状态，等待下次触发
    
    分类结果：
        - "瘦小" (Slim)   — label=0
        - "中等" (Medium)  — label=1
        - "高大" (Large)   — label=2
    
    注意：
        - 数据解析使用与 DataLoader 完全一致的路径（不做预处理矫正），
          确保推理时的特征分布与训练时一致。
    """
    
    LABEL_TO_CN = {0: '瘦小', 1: '中等', 2: '高大'}
    LABEL_TO_EN = {0: 'Slim', 1: 'Medium', 2: 'Large'}
    
    # DataLoader 一致的传感器索引
    BACKREST_LARGE_SLICE = slice(12, 72)
    CUSHION_LARGE_SLICE = slice(84, 144)
    BACK_LEFT_SLICE = slice(0, 6)
    BACK_RIGHT_SLICE = slice(6, 12)
    CUSH_LEFT_SLICE = slice(72, 78)
    CUSH_RIGHT_SLICE = slice(78, 84)
    
    MATRIX_ROWS = 10
    MATRIX_COLS = 6
    
    def __init__(self, config: Config, model_path: Optional[str] = None):
        """
        初始化体型三分类检测器
        
        Args:
            config: 系统配置对象
            model_path: 预训练模型文件路径（.pkl），如果为None则使用默认路径
        """
        self.config = config
        
        # 从配置读取参数
        self.collect_frames = config.get(
            'body_shape_classification.collect_frames', 30
        )
        self.hz = config.get('system.hz', 13)
        self.collect_time_sec = self.collect_frames / self.hz
        
        # 入座检测参数
        self.seated_threshold = config.get(
            'body_shape_classification.seated_threshold', 2000
        )
        self.seated_threshold_ratio = config.get(
            'body_shape_classification.seated_threshold_ratio', 0.3
        )
        self.baseline_frames = config.get(
            'body_shape_classification.baseline_frames', 10
        )
        self.timeout_frames = config.get(
            'body_shape_classification.timeout_frames', 
            self.collect_frames * 10  # 默认超时为所需帧数的10倍
        )
        self.stable_frames = config.get(
            'body_shape_classification.stable_frames', 5
        )  # 连续超过阈值的帧数才认为稳定入座，跳过过渡帧
        
        # 自适应阈值状态
        self._pressure_history: List[float] = []  # 所有帧的坐垫压力历史
        self._adaptive_threshold: Optional[float] = None  # 自适应阈值
        self._consecutive_seated: int = 0  # 连续入座帧计数
        self._is_stable: bool = False  # 是否已稳定入座
        
        # 状态
        self.state = ClassifierState.IDLE
        self.frame_buffer: List[np.ndarray] = []  # 有效入座帧缓冲
        self.collected_count = 0       # 有效帧计数
        self.total_frame_count = 0     # 总帧计数（含非入座帧）
        self.skipped_count = 0         # 跳过的非入座帧计数
        self.latest_result: Optional[Dict] = None
        self.classification_count = 0
        
        # 加载模型
        self.model = None
        self.feature_engineer = None
        self._load_model(model_path)
        
        # print(f"[体型三分类器] 初始化完成")
        # print(f"  - 采集帧数: {self.collect_frames} ({self.collect_time_sec:.1f}秒 @{self.hz}Hz)")
        # print(f"  - 入座阈值: {self.seated_threshold}")
        # print(f"  - 超时帧数: {self.timeout_frames}")
        # print(f"  - 模型状态: {'已加载' if self.model is not None else '未加载'}")
    
    def _load_model(self, model_path: Optional[str] = None):
        """加载预训练模型"""
        if model_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            model_path = os.path.join(base_dir, 'model', 'body_shape_model.pkl')
        
        if os.path.exists(model_path):
            try:
                from body_type_classifier.classifier import BodyTypeClassifier
                self.model = BodyTypeClassifier.load_model(model_path)
                self.feature_engineer = self.model.feature_engineer
                # print(f"[体型三分类器] 模型已加载: {model_path}")
                # print(f"  - 模型类型: {self.model.best_model_name}")
            except Exception as e:
                # print(f"[体型三分类器] 模型加载失败: {e}")
                self.model = None
                self.feature_engineer = None
        else:
            # print(f"[体型三分类器] 模型文件不存在: {model_path}")
            # print(f"  请先运行 train_model.py 训练模型")
    
    def trigger(self) -> Dict:
        """
        外部触发启动体型识别
        
        Returns:
            状态信息字典
        """
        if self.model is None:
            return {
                'success': False,
                'message': '模型未加载，无法启动分类',
                'state': self.state.name
            }
        
        if self.state == ClassifierState.COLLECTING:
            return {
                'success': False,
                'message': f'正在采集中 ({self.collected_count}/{self.collect_frames})',
                'state': self.state.name,
                'progress': self.collected_count / self.collect_frames
            }
        
        # 重置并开始采集
        self.frame_buffer.clear()
        self.collected_count = 0
        self.total_frame_count = 0
        self.skipped_count = 0
        self._pressure_history.clear()
        self._adaptive_threshold = None
        self._consecutive_seated = 0
        self._is_stable = False
        self.state = ClassifierState.COLLECTING
        self.latest_result = None
        
        # print(f"[体型三分类器] 触发采集，需要 {self.collect_frames} 个有效入座帧 "
              f"(约 {self.collect_time_sec:.1f} 秒)")
        
        return {
            'success': True,
            'message': f'开始采集，需要 {self.collect_frames} 个有效入座帧 ({self.collect_time_sec:.1f}秒)',
            'state': self.state.name,
            'collect_frames': self.collect_frames,
            'collect_time_sec': self.collect_time_sec
        }
    
    def _is_seated_stable(self, raw_144: np.ndarray) -> bool:
        """
        判断当前帧是否为稳定入座状态
        
        使用自适应阈值 + 稳定性检测策略：
        1. 收集压力历史，使用 min + (max - min) * ratio 作为动态阈值
        2. 连续 stable_frames 帧超过阈值才认为稳定入座
        3. 跳过入座过渡帧，与 DataLoader 的 trim 逻辑对应
        
        Args:
            raw_144: 144点原始传感器数据
            
        Returns:
            是否稳定入座（可以开始缓冲）
        """
        cushion = raw_144[84:144].astype(np.float64)
        cushion_sum = float(np.sum(cushion))
        
        # 记录压力历史
        self._pressure_history.append(cushion_sum)
        
        # 自适应阈值：当有足够历史时，使用动态阈值
        if len(self._pressure_history) >= self.baseline_frames:
            p_min = min(self._pressure_history)
            p_max = max(self._pressure_history)
            dynamic_threshold = p_min + (p_max - p_min) * self.seated_threshold_ratio
            self._adaptive_threshold = max(dynamic_threshold, self.seated_threshold)
        else:
            self._adaptive_threshold = self.seated_threshold
        
        # 检查当前帧是否超过阈值
        above_threshold = cushion_sum >= self._adaptive_threshold
        
        if above_threshold:
            self._consecutive_seated += 1
        else:
            self._consecutive_seated = 0
            self._is_stable = False
        
        # 连续超过阈值才认为稳定入座（只在首次稳定时打印日志）
        if self._consecutive_seated >= self.stable_frames:
            if not self._is_stable:
                self._is_stable = True
                # print(f"[体型三分类器] 稳定入座检测成功（连续{self.stable_frames}帧，"
                      f"阈值={self._adaptive_threshold:.0f}，当前压力={cushion_sum:.0f}）")
        
        return self._is_stable and above_threshold
    
    def update(self, sensor_data: np.ndarray) -> Optional[Dict]:
        """
        每帧调用，喂入原始传感器数据
        
        自动进行入座检测，只缓冲有效入座帧。
        
        Args:
            sensor_data: 原始144点传感器数据 (shape: (144,) 或 (1, 144))
            
        Returns:
            如果分类完成，返回分类结果字典；
            如果超时，返回错误字典；
            否则返回None（继续采集）
        """
        if self.state != ClassifierState.COLLECTING:
            return None
        
        data = sensor_data.flatten().copy()
        self.total_frame_count += 1
        
        # 入座检测（包含稳定性检测，跳过过渡帧）
        if not self._is_seated_stable(data):
            self.skipped_count += 1
            # 超时检查
            if self.total_frame_count >= self.timeout_frames:
                return self._timeout()
            return None
        
        # 缓冲有效入座帧
        self.frame_buffer.append(data)
        self.collected_count += 1
        
        # 检查是否采集完成
        if self.collected_count >= self.collect_frames:
            return self._classify()
        
        # 超时检查
        if self.total_frame_count >= self.timeout_frames:
            # 即使未满，如果有足够的帧也尝试分类
            if self.collected_count >= self.collect_frames // 2:
                # print(f"[体型三分类器] 超时但有 {self.collected_count} 帧，尝试分类")
                return self._classify()
            return self._timeout()
        
        return None
    
    def _parse_sensor_data(self, raw_144: np.ndarray) -> Dict:
        """
        解析144点原始数据为结构化格式
        
        注意：此处**不做**预处理矫正（pre_correction / voltage_divider_correction），
        因为训练数据（DataLoader）使用的是原始数据。推理时必须与训练时保持一致。
        
        Args:
            raw_144: 144点原始传感器数据
            
        Returns:
            包含 sensor_full, backrest_matrix, cushion_matrix, wing_sensors 的字典
        """
        sensor = raw_144.astype(np.float64)
        
        # 使用与 DataLoader 完全一致的索引切片
        backrest_large = sensor[self.BACKREST_LARGE_SLICE].reshape(
            self.MATRIX_ROWS, self.MATRIX_COLS)
        cushion_large = sensor[self.CUSHION_LARGE_SLICE].reshape(
            self.MATRIX_ROWS, self.MATRIX_COLS)
        
        return {
            'sensor_full': sensor,
            'backrest_matrix': backrest_large,
            'cushion_matrix': cushion_large,
            'wing_sensors': {
                'back_left': sensor[self.BACK_LEFT_SLICE],
                'back_right': sensor[self.BACK_RIGHT_SLICE],
                'cush_left': sensor[self.CUSH_LEFT_SLICE],
                'cush_right': sensor[self.CUSH_RIGHT_SLICE],
            }
        }
    
    def _classify(self) -> Dict:
        """
        执行分类
        
        Returns:
            分类结果字典
        """
        self.state = ClassifierState.CLASSIFYING
        
        try:
            # 解析所有缓冲帧
            parsed_frames = [self._parse_sensor_data(raw) for raw in self.frame_buffer]
            
            # 使用 feature_engineer 的 transform_single_window 进行特征提取
            X = self.feature_engineer.transform_single_window(parsed_frames)
            
            # 预测概率
            proba = self.model.predict_proba(X)[0]
            label = int(np.argmax(proba))
            confidence = float(proba[label])
            
            self.classification_count += 1
            
            result = {
                'label': label,
                'body_shape': self.LABEL_TO_CN[label],
                'body_shape_en': self.LABEL_TO_EN[label],
                'confidence': confidence,
                'probabilities': {
                    '瘦小': float(proba[0]),
                    '中等': float(proba[1]),
                    '高大': float(proba[2]),
                },
                'probabilities_en': {
                    'Slim': float(proba[0]),
                    'Medium': float(proba[1]),
                    'Large': float(proba[2]),
                },
                'frames_used': len(self.frame_buffer),
                'frames_skipped': self.skipped_count,
                'total_frames_processed': self.total_frame_count,
                'classification_count': self.classification_count,
            }
            
            self.latest_result = result
            self.state = ClassifierState.COMPLETED
            
            # print(f"[体型三分类器] 分类完成 #{self.classification_count}: "
                  f"{result['body_shape']} (置信度={confidence:.0%})")
            # print(f"  概率分布: 瘦小={proba[0]:.2%} 中等={proba[1]:.2%} 高大={proba[2]:.2%}")
            # print(f"  有效帧/总帧: {len(self.frame_buffer)}/{self.total_frame_count} "
                  f"(跳过{self.skipped_count}帧)")
            
            return result
            
        except Exception as e:
            error_result = {
                'label': -1,
                'body_shape': '分类失败',
                'body_shape_en': 'Error',
                'confidence': 0.0,
                'error': str(e),
            }
            self.latest_result = error_result
            self.state = ClassifierState.COMPLETED
            # print(f"[体型三分类器] 分类失败: {e}")
            return error_result
    
    def _timeout(self) -> Dict:
        """
        采集超时处理
        
        Returns:
            超时错误字典
        """
        error_result = {
            'label': -1,
            'body_shape': '采集超时',
            'body_shape_en': 'Timeout',
            'confidence': 0.0,
            'error': f'采集超时: {self.total_frame_count}帧内只采集到'
                     f'{self.collected_count}/{self.collect_frames}个有效入座帧',
            'frames_used': self.collected_count,
            'frames_skipped': self.skipped_count,
            'total_frames_processed': self.total_frame_count,
        }
        self.latest_result = error_result
        self.state = ClassifierState.COMPLETED
        # print(f"[体型三分类器] 采集超时: {self.total_frame_count}帧内只有"
              f"{self.collected_count}个有效帧")
        return error_result
    
    def get_result(self) -> Optional[Dict]:
        """
        获取最新的分类结果
        
        Returns:
            分类结果字典，如果尚未完成分类则返回None
        """
        return self.latest_result
    
    def get_status(self) -> Dict:
        """
        获取当前检测器状态
        
        Returns:
            状态信息字典
        """
        status = {
            'state': self.state.name,
            'model_loaded': self.model is not None,
            'classification_count': self.classification_count,
        }
        
        if self.state == ClassifierState.COLLECTING:
            status['progress'] = self.collected_count / self.collect_frames
            status['collected_frames'] = self.collected_count
            status['total_frames'] = self.collect_frames
            status['skipped_frames'] = self.skipped_count
            status['remaining_sec'] = (self.collect_frames - self.collected_count) / self.hz
        
        if self.state == ClassifierState.COMPLETED and self.latest_result:
            status['result'] = self.latest_result
        
        return status
    
    def reset(self):
        """重置检测器到空闲状态"""
        self.state = ClassifierState.IDLE
        self.frame_buffer.clear()
        self.collected_count = 0
        self.total_frame_count = 0
        self.skipped_count = 0
        self._pressure_history.clear()
        self._adaptive_threshold = None
        self._consecutive_seated = 0
        self._is_stable = False
        self.latest_result = None
        # print("[体型三分类器] 已重置")
