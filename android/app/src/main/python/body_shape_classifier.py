# -*- coding: utf-8 -*-
"""
体型三分类检测器（集成到座椅控制系统）

外部触发式体型分类器，支持：
1. 外部触发启动采集
2. 自动入座检测 — 只缓冲有效入座帧（坐垫压力超过阈值）
3. 缓冲指定帧数的原始传感器数据
4. 滑动窗口特征提取 + KNN分类 + 概率软投票
5. 返回三分类结果（瘦小/中等/高大）

推理后端：
- 优先使用 ONNX Runtime（无需 scikit-learn，适合 Android 等嵌入式环境）
- 回退到 sklearn pkl 模型（需要 scikit-learn）
- ONNX 模型包含完整的 StandardScaler → SelectKBest → KNN 管线
- 特征工程（143维单帧特征 + 窗口聚合 = 286维）使用纯 numpy 实现，无 sklearn/scipy 依赖
"""

import os
import json
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

    推理后端：
        - ONNX: 使用 onnxruntime，无需 scikit-learn（推荐，适合 Android）
        - PKL:  使用 scikit-learn，需要完整 ML 环境（fallback）

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
            model_path: 预训练模型文件路径（.onnx 或 .pkl），如果为None则自动查找
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

        # 推理后端
        self._backend = None  # 'onnx', 'pkl' 或 'json'
        self._onnx_session = None
        self._onnx_input_name = None
        self._feature_columns_order = None  # ONNX/JSON模式下的特征列顺序
        self._single_frame_feature_names = None  # 单帧特征名列表

        # json 后端（纯 numpy KNN 推理，无需 sklearn/onnxruntime）
        self._json_scaler_mean = None
        self._json_scaler_scale = None
        self._json_selector_mask = None
        self._json_knn_X_train = None
        self._json_knn_y_train = None
        self._json_knn_n_neighbors = None
        self._json_knn_weights = None
        self._json_knn_classes = None

        # pkl fallback
        self.model = None
        self.feature_engineer = None

        # 加载模型
        self._load_model(model_path)

        print(f"[体型三分类器] 初始化完成")
        print(f"  - 采集帧数: {self.collect_frames} ({self.collect_time_sec:.1f}秒 @{self.hz}Hz)")
        print(f"  - 入座阈值: {self.seated_threshold}")
        print(f"  - 超时帧数: {self.timeout_frames}")
        print(f"  - 推理后端: {self._backend or '未加载'}")

    def _load_model(self, model_path: Optional[str] = None):
        """
        加载模型，优先尝试 JSON（纯numpy），然后 ONNX，最后回退到 pkl

        加载优先级：
        1. JSON 后端（纯 numpy KNN，无外部依赖，最适合 Android/Chaquopy）
        2. ONNX 后端（需要 onnxruntime）
        3. PKL 后端（需要 scikit-learn，Chaquopy 下可能因 AssetFinder 问题失败）

        Args:
            model_path: 模型文件路径（.onnx 或 .pkl），None 则自动查找
        """
        base_dir = os.path.dirname(os.path.abspath(__file__))
        model_dir = os.path.join(base_dir, 'model')

        # 始终优先尝试 JSON 后端（纯 numpy，无外部依赖）
        # 搜索多个可能的路径
        json_candidates = [
            os.path.join(model_dir, 'model_params.json'),
        ]
        # 如果 model_path 指定了，也从其父目录查找
        if model_path:
            json_candidates.append(
                os.path.join(os.path.dirname(os.path.abspath(model_path)), 'model_params.json')
            )
        # HOME 目录 fallback
        home_model_dir = os.path.join(os.path.expanduser('~'), 'model')
        json_candidates.append(os.path.join(home_model_dir, 'model_params.json'))

        for params_path in json_candidates:
            if os.path.exists(params_path):
                print(f"[体型三分类器] 找到JSON参数文件: {params_path}")
                self._try_load_json(params_path)
                if self._backend is not None:
                    return

        print(f"[体型三分类器] JSON参数文件未找到，尝试的路径:")
        for p in json_candidates:
            print(f"  - {p} (exists={os.path.exists(p)})")

        if self._backend is not None:
            return

        # 确定模型文件路径
        if model_path is not None:
            # 用户指定路径
            if model_path.endswith('.onnx'):
                self._try_load_onnx(model_path, model_dir)
            elif model_path.endswith('.pkl'):
                self._try_load_pkl(model_path)
            else:
                print(f"[体型三分类器] 不支持的模型格式: {model_path}")
        else:
            # 自动查找：ONNX -> PKL
            onnx_path = os.path.join(model_dir, 'body_shape_model.onnx')
            pkl_path = os.path.join(model_dir, 'body_shape_model.pkl')

            if os.path.exists(onnx_path):
                self._try_load_onnx(onnx_path, model_dir)

            if self._backend is None and os.path.exists(pkl_path):
                self._try_load_pkl(pkl_path)

            if self._backend is None:
                print(f"[体型三分类器] 未找到可用模型")
                print(f"  查找路径: {params_path}")
                print(f"  查找路径: {onnx_path}")
                print(f"  查找路径: {pkl_path}")

    def _try_load_json(self, params_path: str):
        """尝试加载 JSON 后端（纯 numpy KNN 推理，无需 sklearn/onnxruntime）"""
        try:
            # 尝试直接读取，如果失败（AssetFinder问题）则复制到HOME目录
            try:
                with open(params_path, 'r', encoding='utf-8') as f:
                    params = json.load(f)
            except Exception as read_err:
                print(f"[体型三分类器] 直接读取JSON失败({read_err})，尝试复制到HOME目录")
                import shutil
                home_model_dir = os.path.join(os.path.expanduser('~'), 'model')
                os.makedirs(home_model_dir, exist_ok=True)
                real_path = os.path.join(home_model_dir, 'model_params.json')
                shutil.copy2(params_path, real_path)
                print(f"[体型三分类器] JSON已复制到: {real_path}")
                with open(real_path, 'r', encoding='utf-8') as f:
                    params = json.load(f)

            # 检查是否包含 KNN 训练数据
            required_keys = ['knn_X_train', 'knn_y_train', 'knn_n_neighbors',
                             'scaler_mean', 'scaler_scale', 'selector_mask',
                             'feature_columns_order']
            missing = [k for k in required_keys if k not in params]
            if missing:
                print(f"[体型三分类器] JSON参数文件缺少字段: {missing}，跳过JSON后端")
                return

            # 加载特征工程参数
            self._feature_columns_order = params['feature_columns_order']
            self._single_frame_feature_names = params.get('single_frame_feature_names')
            self._json_scaler_mean = np.array(params['scaler_mean'], dtype=np.float64)
            self._json_scaler_scale = np.array(params['scaler_scale'], dtype=np.float64)
            # 防止除零
            self._json_scaler_scale[self._json_scaler_scale == 0] = 1.0
            self._json_selector_mask = np.array(params['selector_mask'], dtype=bool)

            # 加载 KNN 参数
            self._json_knn_X_train = np.array(params['knn_X_train'], dtype=np.float64)
            self._json_knn_y_train = np.array(params['knn_y_train'], dtype=np.int64)
            self._json_knn_n_neighbors = params['knn_n_neighbors']
            self._json_knn_weights = params.get('knn_weights', 'distance')
            self._json_knn_classes = np.array(params.get('knn_classes', [0, 1, 2]), dtype=np.int64)

            self._backend = 'json'
            print(f"[体型三分类器] JSON模型已加载（纯numpy KNN）: {params_path}")
            print(f"  - 特征维度: {params['n_features_in']} -> 选择{params['n_features_selected']}")
            print(f"  - KNN训练样本: {self._json_knn_X_train.shape[0]}")
            print(f"  - KNN邻居数: {self._json_knn_n_neighbors}")
            print(f"  - 模型版本: {params.get('version', '未知')}")

        except Exception as e:
            print(f"[体型三分类器] JSON后端加载失败: {e}")
            import traceback
            traceback.print_exc()

    def _try_load_onnx(self, onnx_path: str, model_dir: str):
        """尝试加载 ONNX 模型"""
        try:
            import onnxruntime as ort

            # 加载参数文件
            params_path = os.path.join(model_dir, 'model_params.json')
            if not os.path.exists(params_path):
                print(f"[体型三分类器] ONNX参数文件不存在: {params_path}")
                return

            with open(params_path, 'r', encoding='utf-8') as f:
                params = json.load(f)

            self._feature_columns_order = params['feature_columns_order']
            self._single_frame_feature_names = params.get('single_frame_feature_names')

            # 创建 ONNX 推理会话
            # 使用 CPUExecutionProvider，兼容所有平台
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            self._onnx_session = ort.InferenceSession(
                onnx_path,
                sess_options=sess_options,
                providers=['CPUExecutionProvider']
            )
            self._onnx_input_name = self._onnx_session.get_inputs()[0].name

            self._backend = 'onnx'
            print(f"[体型三分类器] ONNX模型已加载: {onnx_path}")
            print(f"  - 特征维度: {params['n_features_in']}")
            print(f"  - 模型版本: {params.get('version', '未知')}")

        except ImportError:
            print(f"[体型三分类器] onnxruntime 未安装，跳过 ONNX 加载")
        except Exception as e:
            print(f"[体型三分类器] ONNX 加载失败: {e}")

    def _try_load_pkl(self, pkl_path: str):
        """尝试加载 pkl 模型（fallback）"""
        try:
            from body_type_classifier.classifier import BodyTypeClassifier
            self.model = BodyTypeClassifier.load_model(pkl_path)
            self.feature_engineer = self.model.feature_engineer
            self._backend = 'pkl'
            print(f"[体型三分类器] PKL模型已加载（fallback）: {pkl_path}")
            print(f"  - 模型类型: {self.model.best_model_name}")
        except Exception as e:
            print(f"[体型三分类器] PKL模型加载失败: {e}")
            self.model = None
            self.feature_engineer = None

    # ========================================
    # 纯 numpy 特征提取（无 sklearn/scipy 依赖）
    # ========================================

    @staticmethod
    def _skewness(arr: np.ndarray) -> float:
        """计算偏度（纯numpy实现，与scipy.stats.skew一致）"""
        n = len(arr)
        if n < 3:
            return 0.0
        mean = np.mean(arr)
        std = np.std(arr, ddof=0)
        if std < 1e-10:
            return 0.0
        m3 = np.mean((arr - mean) ** 3)
        return float(m3 / (std ** 3))

    @staticmethod
    def _kurtosis(arr: np.ndarray) -> float:
        """计算超额峰度（纯numpy实现，与scipy.stats.kurtosis一致，Fisher定义）"""
        n = len(arr)
        if n < 4:
            return 0.0
        mean = np.mean(arr)
        std = np.std(arr, ddof=0)
        if std < 1e-10:
            return 0.0
        m4 = np.mean((arr - mean) ** 4)
        return float(m4 / (std ** 4) - 3.0)

    def _compute_single_frame_features(self, frame: Dict) -> Dict:
        """
        对单帧数据计算全部143个特征（纯numpy实现）

        与 body_type_classifier.feature_engineer.compute_single_frame_features 完全一致，
        但不依赖 scipy.stats，使用内置的 _skewness/_kurtosis 替代。

        Args:
            frame: 包含 sensor_full, backrest_matrix, cushion_matrix, wing_sensors

        Returns:
            特征名 -> 特征值 的映射（143个特征）
        """
        back = frame['backrest_matrix']
        cush = frame['cushion_matrix']
        sensor = frame['sensor_full']
        wings = frame.get('wing_sensors', None)

        feats = {}

        # === 全144点特征 ===
        feats['full_sum'] = np.sum(sensor)
        feats['full_mean'] = np.mean(sensor)
        feats['full_std'] = np.std(sensor)
        feats['full_energy'] = float(np.sum(sensor**2))
        feats['full_rms'] = float(np.sqrt(np.mean(sensor**2)))
        feats['full_max'] = np.max(sensor)
        feats['full_p75'] = np.percentile(sensor, 75)
        feats['full_p25'] = np.percentile(sensor, 25)
        feats['full_iqr'] = feats['full_p75'] - feats['full_p25']
        feats['full_nonzero'] = np.count_nonzero(sensor) / len(sensor)

        # === 侧翼传感器特征 ===
        if wings is not None:
            back_left = wings['back_left']
            back_right = wings['back_right']
            cush_left = wings['cush_left']
            cush_right = wings['cush_right']
        else:
            back_left = sensor[0:6]
            back_right = sensor[6:12]
            cush_left = sensor[72:78]
            cush_right = sensor[78:84]

        feats['back_wing_sum'] = float(np.sum(back_left) + np.sum(back_right))
        feats['cush_wing_sum'] = float(np.sum(cush_left) + np.sum(cush_right))
        feats['back_wing_mean'] = float((np.mean(back_left) + np.mean(back_right)) / 2)
        feats['cush_wing_mean'] = float((np.mean(cush_left) + np.mean(cush_right)) / 2)
        feats['back_wing_lr_diff'] = float(abs(np.sum(back_left) - np.sum(back_right)))
        feats['cush_wing_lr_diff'] = float(abs(np.sum(cush_left) - np.sum(cush_right)))
        feats['wing_total'] = feats['back_wing_sum'] + feats['cush_wing_sum']

        # === 大矩阵特征（靠背 + 坐垫）===
        for prefix, mat in [('back', back), ('cush', cush)]:
            flat = mat.flatten()
            total = np.sum(mat)

            # 基础统计
            feats[f'{prefix}_mean'] = np.mean(flat)
            feats[f'{prefix}_std'] = np.std(flat)
            feats[f'{prefix}_sum'] = float(total)
            feats[f'{prefix}_max'] = np.max(flat)
            feats[f'{prefix}_min'] = np.min(flat)
            feats[f'{prefix}_median'] = np.median(flat)
            feats[f'{prefix}_p10'] = np.percentile(flat, 10)
            feats[f'{prefix}_p25'] = np.percentile(flat, 25)
            feats[f'{prefix}_p75'] = np.percentile(flat, 75)
            feats[f'{prefix}_p90'] = np.percentile(flat, 90)
            feats[f'{prefix}_iqr'] = feats[f'{prefix}_p75'] - feats[f'{prefix}_p25']
            feats[f'{prefix}_range'] = feats[f'{prefix}_max'] - feats[f'{prefix}_min']
            feats[f'{prefix}_cv'] = feats[f'{prefix}_std'] / (feats[f'{prefix}_mean'] + 1e-6)
            feats[f'{prefix}_nonzero'] = np.count_nonzero(flat) / len(flat)

            # 能量
            feats[f'{prefix}_energy'] = float(np.sum(flat**2))
            feats[f'{prefix}_rms'] = float(np.sqrt(np.mean(flat**2)))

            # 分布形态（纯numpy替代scipy.stats）
            if np.std(flat) > 0:
                feats[f'{prefix}_skewness'] = self._skewness(flat)
                feats[f'{prefix}_kurtosis'] = self._kurtosis(flat)
            else:
                feats[f'{prefix}_skewness'] = 0.0
                feats[f'{prefix}_kurtosis'] = 0.0

            # 熵
            flat_pos = flat[flat > 0]
            if len(flat_pos) > 0:
                p = flat_pos / flat_pos.sum()
                feats[f'{prefix}_entropy'] = float(-np.sum(p * np.log2(p + 1e-10)))
            else:
                feats[f'{prefix}_entropy'] = 0.0

            # 行列分布
            row_means = mat.mean(axis=1)
            row_sums = mat.sum(axis=1)
            col_means = mat.mean(axis=0)
            col_sums = mat.sum(axis=0)

            feats[f'{prefix}_row_max_idx'] = float(np.argmax(row_means))
            feats[f'{prefix}_row_spread'] = float(np.std(row_means))
            feats[f'{prefix}_col_spread'] = float(np.std(col_means))

            # 上中下三段
            if total > 0:
                feats[f'{prefix}_upper_ratio'] = float(row_sums[:3].sum() / total)
                feats[f'{prefix}_middle_ratio'] = float(row_sums[3:7].sum() / total)
                feats[f'{prefix}_lower_ratio'] = float(row_sums[7:].sum() / total)
            else:
                feats[f'{prefix}_upper_ratio'] = 0.333
                feats[f'{prefix}_middle_ratio'] = 0.333
                feats[f'{prefix}_lower_ratio'] = 0.333

            # 左右
            left_sum = mat[:, :3].sum()
            right_sum = mat[:, 3:].sum()
            feats[f'{prefix}_lr_diff'] = float(abs(left_sum - right_sum) / (total + 1e-6))
            feats[f'{prefix}_lr_ratio'] = float(left_sum / (right_sum + 1e-6))

            # CoP
            if total > 0:
                feats[f'{prefix}_cop_row'] = float(np.sum(np.arange(10) * row_sums) / total)
                feats[f'{prefix}_cop_col'] = float(np.sum(np.arange(6) * col_sums) / total)
            else:
                feats[f'{prefix}_cop_row'] = 4.5
                feats[f'{prefix}_cop_col'] = 2.5

            # 接触面积（多阈值）
            feats[f'{prefix}_contact_above_mean'] = float(np.sum(flat > np.mean(flat)) / len(flat))
            feats[f'{prefix}_contact_above_50'] = float(np.sum(flat > 50) / len(flat))
            feats[f'{prefix}_contact_above_100'] = float(np.sum(flat > 100) / len(flat))

            # 峰值集中度
            feats[f'{prefix}_peak_ratio'] = float(feats[f'{prefix}_max'] / (feats[f'{prefix}_mean'] + 1e-6))

            # 2×3分块区域
            for bi in range(2):
                for bj in range(3):
                    block = mat[bi*5:(bi+1)*5, bj*2:(bj+1)*2]
                    feats[f'{prefix}_block_{bi}_{bj}_mean'] = float(np.mean(block))
                    feats[f'{prefix}_block_{bi}_{bj}_sum'] = float(np.sum(block))
                    feats[f'{prefix}_block_{bi}_{bj}_max'] = float(np.max(block))

            # 梯度
            row_grad = np.diff(row_means)
            feats[f'{prefix}_row_grad_mean'] = float(np.mean(np.abs(row_grad)))
            feats[f'{prefix}_row_grad_max'] = float(np.max(np.abs(row_grad)))
            col_grad = np.diff(col_means)
            feats[f'{prefix}_col_grad_mean'] = float(np.mean(np.abs(col_grad)))

            # 对角线特征
            diag_main = np.array([mat[i, min(i, 5)] for i in range(10)])
            feats[f'{prefix}_diag_mean'] = float(np.mean(diag_main))

        # === 组合特征 ===
        feats['total_pressure'] = feats['back_sum'] + feats['cush_sum']
        feats['total_energy'] = feats['back_energy'] + feats['cush_energy']
        feats['back_cush_ratio'] = feats['back_sum'] / (feats['cush_sum'] + 1e-6)
        feats['back_cush_energy_ratio'] = feats['back_energy'] / (feats['cush_energy'] + 1e-6)
        feats['mean_ratio'] = feats['back_mean'] / (feats['cush_mean'] + 1e-6)
        feats['std_ratio'] = feats['back_std'] / (feats['cush_std'] + 1e-6)
        feats['cop_row_diff'] = feats['back_cop_row'] - feats['cush_cop_row']
        feats['entropy_diff'] = feats['back_entropy'] - feats['cush_entropy']
        feats['entropy_ratio'] = feats['back_entropy'] / (feats['cush_entropy'] + 1e-6)
        feats['wing_main_ratio'] = feats['wing_total'] / (feats['total_pressure'] + 1e-6)

        # 分块比值
        for bi in range(2):
            for bj in range(3):
                bk = f'block_{bi}_{bj}_mean'
                feats[f'bc_ratio_{bi}_{bj}'] = feats[f'back_{bk}'] / (feats[f'cush_{bk}'] + 1e-6)

        return feats

    def _extract_features_onnx(self, parsed_frames: List[Dict]) -> np.ndarray:
        """
        ONNX 模式下的特征提取：纯 numpy 实现

        流程：
        1. 对每帧计算143个特征
        2. 窗口聚合：每个特征取 mean 和 std，得到 286 维
        3. 按 feature_columns_order 排列，确保与训练时一致
        4. nan_to_num 处理

        Args:
            parsed_frames: 解析后的帧数据列表

        Returns:
            shape=(1, 286) 的特征向量（float32）
        """
        # 计算每帧特征
        frame_feats_list = []
        for frame in parsed_frames:
            feats = self._compute_single_frame_features(frame)
            frame_feats_list.append(feats)

        # 获取特征名（使用第一帧的key顺序）
        feat_names = list(frame_feats_list[0].keys())

        # 窗口聚合：mean + std
        record = {}
        for name in feat_names:
            vals = [f[name] for f in frame_feats_list]
            record[name] = float(np.mean(vals))
            record[f'{name}_tstd'] = float(np.std(vals))

        # 按训练时的列顺序排列
        feature_vector = []
        for col_name in self._feature_columns_order:
            feature_vector.append(record.get(col_name, 0.0))

        X = np.array([feature_vector], dtype=np.float32)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

        return X

    # ========================================
    # 公共接口
    # ========================================

    def trigger(self) -> Dict:
        """
        外部触发启动体型识别

        Returns:
            状态信息字典
        """
        if self._backend is None:
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

        print(f"[体型三分类器] 触发采集，需要 {self.collect_frames} 个有效入座帧 "
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
                print(f"[体型三分类器] 稳定入座检测成功（连续{self.stable_frames}帧，"
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
                print(f"[体型三分类器] 超时但有 {self.collected_count} 帧，尝试分类")
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
        执行分类（自动选择 ONNX 或 pkl 后端）

        Returns:
            分类结果字典
        """
        self.state = ClassifierState.CLASSIFYING

        try:
            # 解析所有缓冲帧
            parsed_frames = [self._parse_sensor_data(raw) for raw in self.frame_buffer]

            if self._backend == 'json':
                proba = self._classify_json(parsed_frames)
            elif self._backend == 'onnx':
                proba = self._classify_onnx(parsed_frames)
            elif self._backend == 'pkl':
                proba = self._classify_pkl(parsed_frames)
            else:
                raise RuntimeError("无可用的推理后端")

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
                'backend': self._backend,
            }

            self.latest_result = result
            self.state = ClassifierState.COMPLETED

            print(f"[体型三分类器] 分类完成 #{self.classification_count} ({self._backend}): "
                  f"{result['body_shape']} (置信度={confidence:.0%})")
            print(f"  概率分布: 瘦小={proba[0]:.2%} 中等={proba[1]:.2%} 高大={proba[2]:.2%}")
            print(f"  有效帧/总帧: {len(self.frame_buffer)}/{self.total_frame_count} "
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
            print(f"[体型三分类器] 分类失败: {e}")
            import traceback
            traceback.print_exc()
            return error_result

    def _classify_onnx(self, parsed_frames: List[Dict]) -> np.ndarray:
        """
        ONNX 后端推理

        Args:
            parsed_frames: 解析后的帧数据列表

        Returns:
            概率数组 shape=(3,)
        """
        X = self._extract_features_onnx(parsed_frames)
        output_names = [o.name for o in self._onnx_session.get_outputs()]
        results = self._onnx_session.run(output_names, {self._onnx_input_name: X})

        # 输出: [labels, probabilities]
        proba = results[1][0]  # shape=(3,)
        return np.array(proba, dtype=np.float64)

    def _classify_json(self, parsed_frames: List[Dict]) -> np.ndarray:
        """
        JSON 后端推理：纯 numpy 实现的 KNN 分类

        流程：
        1. 提取286维特征（复用 _extract_features_onnx）
        2. StandardScaler 标准化
        3. SelectKBest 特征选择
        4. KNN 距离加权投票

        Args:
            parsed_frames: 解析后的帧数据列表

        Returns:
            概率数组 shape=(3,)
        """
        # 1. 特征提取（286维）
        X_raw = self._extract_features_onnx(parsed_frames)  # shape=(1, 286), float32
        X = X_raw.astype(np.float64).flatten()  # shape=(286,)

        # 2. StandardScaler 标准化
        X_scaled = (X - self._json_scaler_mean) / self._json_scaler_scale

        # 3. SelectKBest 特征选择
        X_selected = X_scaled[self._json_selector_mask]  # shape=(n_selected,)

        # 4. KNN 推理
        return self._knn_predict_proba(X_selected)

    def _knn_predict_proba(self, x: np.ndarray) -> np.ndarray:
        """
        纯 numpy 实现的 KNN 概率预测（distance 加权）

        与 sklearn KNeighborsClassifier(weights='distance', metric='minkowski', p=2) 一致

        Args:
            x: 单个样本特征向量 shape=(n_features,)

        Returns:
            概率数组 shape=(n_classes,)
        """
        # 计算欧氏距离（minkowski p=2）
        diffs = self._json_knn_X_train - x  # shape=(n_train, n_features)
        distances = np.sqrt(np.sum(diffs ** 2, axis=1))  # shape=(n_train,)

        # 找到 k 个最近邻
        k = self._json_knn_n_neighbors
        nn_indices = np.argsort(distances)[:k]
        nn_distances = distances[nn_indices]
        nn_labels = self._json_knn_y_train[nn_indices]

        n_classes = len(self._json_knn_classes)
        proba = np.zeros(n_classes, dtype=np.float64)

        if self._json_knn_weights == 'distance':
            # 距离加权：权重 = 1/distance，距离为0时该邻居权重为1其余为0
            if np.any(nn_distances == 0):
                # 有完全匹配的点
                zero_mask = nn_distances == 0
                for label in nn_labels[zero_mask]:
                    proba[label] += 1.0
            else:
                weights = 1.0 / nn_distances
                for label, w in zip(nn_labels, weights):
                    proba[label] += w
        else:
            # uniform 权重
            for label in nn_labels:
                proba[label] += 1.0

        # 归一化为概率
        total = np.sum(proba)
        if total > 0:
            proba /= total

        return proba

    def _classify_pkl(self, parsed_frames: List[Dict]) -> np.ndarray:
        """
        PKL 后端推理（fallback）

        Args:
            parsed_frames: 解析后的帧数据列表

        Returns:
            概率数组 shape=(3,)
        """
        X = self.feature_engineer.transform_single_window(parsed_frames)
        proba = self.model.predict_proba(X)[0]
        return np.array(proba, dtype=np.float64)

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
        print(f"[体型三分类器] 采集超时: {self.total_frame_count}帧内只有"
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
            'model_loaded': self._backend is not None,
            'backend': self._backend or 'none',
            'classification_count': self.classification_count,
        }

        if self.state == ClassifierState.COLLECTING:
            status['progress'] = self.collected_count / self.collect_frames
            status['collected_frames'] = self.collected_count
            status['total_frames'] = self.collect_frames
            status['skipped_frames'] = self.skipped_count
            status['remaining_sec'] = (self.collect_frames - self.collected_count) / self.hz

        # 只要有分类结果就返回（不再仅限 COMPLETED 状态）
        if self.latest_result:
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
        print("[体型三分类器] 已重置")
