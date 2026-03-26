# -*- coding: utf-8 -*-
"""
特征工程模块 V2

基于全部144点传感器数据（10×6靠背/坐垫大矩阵 + 侧翼小矩形），
提取多维度特征用于体型分类。

V2核心改进:
    1. 利用全部144点传感器数据（包括侧翼小矩形）
    2. 滑动窗口时间聚合 — 消除帧间噪声，在帧级和受试者级之间找到最佳粒度
    3. 时间变异特征 — 窗口内帧间标准差，捕捉动态压力模式
    4. 自动特征选择 — SelectKBest(ANOVA F-test)

特征类别:
    1. 全144点统计特征
    2. 侧翼传感器特征
    3. 大矩阵基础统计特征
    4. 能量特征
    5. 分布形态特征（偏度、峰度、熵）
    6. 空间分布特征（行/列/上中下/左右）
    7. 压力中心特征（CoP）
    8. 接触面积特征（多阈值）
    9. 分块区域特征（2×3分块）
    10. 梯度特征
    11. 靠背/坐垫组合特征
    12. 时间变异特征（窗口内std）
"""

import numpy as np
import pandas as pd
from scipy import stats
from typing import Dict, List, Optional, Tuple
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import SelectKBest, f_classif


class FeatureEngineer:
    """
    座椅压力传感器特征工程器 V2
    
    支持两种工作模式:
    1. 帧级模式: 对每帧提取特征
    2. 窗口级模式: 对滑动窗口内的多帧聚合提取特征（推荐）
    
    窗口级模式通过时间聚合消除帧间噪声，同时引入时间变异特征，
    是实现高准确率分类的关键创新。
    """
    
    MATRIX_ROWS = 10
    MATRIX_COLS = 6
    
    # 默认窗口参数（经过优化搜索确定）
    DEFAULT_WINDOW_SIZE = 30
    DEFAULT_STRIDE = 15
    
    # 自动特征选择的默认维度
    DEFAULT_K_FEATURES = 40
    
    def __init__(self, 
                 window_size: int = 30,
                 stride: int = 15,
                 n_select: int = 40,
                 use_windowing: bool = True):
        """
        初始化特征工程器
        
        Parameters
        ----------
        window_size : int
            滑动窗口大小（帧数），推荐20-30
        stride : int
            滑动窗口步长，推荐window_size//2
        n_select : int
            SelectKBest自动选择的特征数量
        use_windowing : bool
            是否使用滑动窗口聚合（推荐True）
        """
        self.window_size = window_size
        self.stride = stride
        self.n_select = n_select
        self.use_windowing = use_windowing
        self.scaler = StandardScaler()
        self.selector = None
        self.selected_features = None
        self._is_fitted = False
        self._frame_feat_names = None  # 帧级特征名列表
    
    def compute_single_frame_features(self, frame: Dict) -> Dict:
        """
        对单帧数据计算全部特征
        
        Parameters
        ----------
        frame : dict
            包含 sensor_full, backrest_matrix, cushion_matrix, wing_sensors
            
        Returns
        -------
        dict
            特征名 -> 特征值 的映射
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
            
            # 分布形态
            if np.std(flat) > 0:
                feats[f'{prefix}_skewness'] = float(stats.skew(flat))
                feats[f'{prefix}_kurtosis'] = float(stats.kurtosis(flat))
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
    
    def build_frame_feature_dataframe(self, raw_data: List[Dict]) -> pd.DataFrame:
        """
        对所有帧计算特征，构建帧级特征DataFrame
        
        Parameters
        ----------
        raw_data : list of dict
            DataLoader.load_from_directory() 返回的数据列表
            
        Returns
        -------
        pd.DataFrame
            包含元数据列和特征列的DataFrame
        """
        records = []
        for item in raw_data:
            feats = self.compute_single_frame_features(item)
            feats['person_name'] = item.get('person_name', 'unknown')
            feats['body_type'] = item.get('body_type', 'unknown')
            feats['body_type_cn'] = item.get('body_type_cn', '未知')
            feats['weight_kg'] = item.get('weight_kg', None)
            records.append(feats)
        
        df = pd.DataFrame(records)
        
        # 缓存帧级特征名
        meta = {'person_name', 'body_type', 'body_type_cn', 'weight_kg'}
        self._frame_feat_names = [c for c in df.columns 
                                   if c not in meta and pd.api.types.is_numeric_dtype(df[c])]
        
        return df
    
    def build_windowed_features(self, frame_df: pd.DataFrame) -> pd.DataFrame:
        """
        对帧级特征进行滑动窗口聚合，生成窗口级特征
        
        核心创新：
        - 窗口内均值：消除帧间噪声
        - 窗口内标准差：捕捉动态压力模式（时间变异特征）
        - 在帧级和受试者级之间找到最佳粒度
        
        Parameters
        ----------
        frame_df : pd.DataFrame
            帧级特征DataFrame
            
        Returns
        -------
        pd.DataFrame
            窗口级特征DataFrame
        """
        meta = {'person_name', 'body_type', 'body_type_cn', 'weight_kg'}
        feat_cols = [c for c in frame_df.columns 
                     if c not in meta and pd.api.types.is_numeric_dtype(frame_df[c])]
        
        records = []
        for person in frame_df['person_name'].unique():
            person_data = frame_df[frame_df['person_name'] == person]
            body_type = person_data['body_type'].iloc[0]
            body_type_cn = person_data['body_type_cn'].iloc[0]
            weight_kg = person_data['weight_kg'].iloc[0]
            values = person_data[feat_cols].values
            
            n = len(values)
            for start in range(0, n - self.window_size + 1, self.stride):
                window = values[start:start + self.window_size]
                
                # 均值特征
                mean_feats = np.mean(window, axis=0)
                # 标准差特征（时间变异）
                std_feats = np.std(window, axis=0)
                
                record = {}
                for i, col in enumerate(feat_cols):
                    record[col] = mean_feats[i]
                    record[f'{col}_tstd'] = std_feats[i]
                
                record['person_name'] = person
                record['body_type'] = body_type
                record['body_type_cn'] = body_type_cn
                record['weight_kg'] = weight_kg
                records.append(record)
        
        return pd.DataFrame(records)
    
    def get_feature_columns(self, df: pd.DataFrame) -> List[str]:
        """获取所有数值型特征列名（排除元数据列）"""
        meta = {'person_name', 'body_type', 'body_type_cn', 'weight_kg'}
        return [c for c in df.columns if c not in meta and pd.api.types.is_numeric_dtype(df[c])]
    
    def fit_transform(self, df: pd.DataFrame, labels: np.ndarray) -> Tuple[np.ndarray, List[str]]:
        """
        拟合特征选择器和标准化器，并转换数据
        
        Parameters
        ----------
        df : pd.DataFrame
            特征DataFrame（帧级或窗口级）
        labels : np.ndarray
            标签数组
            
        Returns
        -------
        tuple of (X_scaled, selected_feature_names)
            标准化后的特征矩阵和选中的特征名列表
        """
        all_feat_cols = self.get_feature_columns(df)
        X_all = df[all_feat_cols].values
        X_all = np.nan_to_num(X_all, nan=0.0, posinf=0.0, neginf=0.0)
        
        # 标准化
        X_scaled = self.scaler.fit_transform(X_all)
        
        # 特征选择
        k = min(self.n_select, len(all_feat_cols))
        self.selector = SelectKBest(f_classif, k=k)
        X_selected = self.selector.fit_transform(X_scaled, labels)
        
        mask = self.selector.get_support()
        self.selected_features = [all_feat_cols[i] for i in range(len(all_feat_cols)) if mask[i]]
        self._is_fitted = True
        
        return X_selected, self.selected_features
    
    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """
        使用已拟合的选择器和标准化器转换新数据
        
        Parameters
        ----------
        df : pd.DataFrame
            特征DataFrame
            
        Returns
        -------
        np.ndarray
            标准化+特征选择后的特征矩阵
        """
        if not self._is_fitted:
            raise RuntimeError("FeatureEngineer尚未拟合，请先调用fit_transform()")
        
        all_feat_cols = self.get_feature_columns(df)
        X = df[all_feat_cols].values
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        X_scaled = self.scaler.transform(X)
        return self.selector.transform(X_scaled)
    
    def transform_single_window(self, frames: List[Dict]) -> np.ndarray:
        """
        对一个窗口的多帧数据进行特征提取和标准化（用于实时推理）
        
        Parameters
        ----------
        frames : list of dict
            窗口内的多帧数据列表，每帧包含 sensor_full, backrest_matrix, cushion_matrix, wing_sensors
            
        Returns
        -------
        np.ndarray
            shape=(1, n_features) 的标准化特征向量
        """
        if not self._is_fitted:
            raise RuntimeError("FeatureEngineer尚未拟合，请先调用fit_transform()")
        
        # 计算每帧特征
        frame_feats_list = []
        for frame in frames:
            feats = self.compute_single_frame_features(frame)
            frame_feats_list.append(feats)
        
        # 获取特征名
        feat_names = [k for k in frame_feats_list[0].keys()]
        
        # 窗口聚合
        record = {}
        for name in feat_names:
            vals = [f[name] for f in frame_feats_list]
            record[name] = np.mean(vals)
            record[f'{name}_tstd'] = np.std(vals)
        
        # 构建DataFrame
        df = pd.DataFrame([record])
        return self.transform(df)
