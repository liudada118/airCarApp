# -*- coding: utf-8 -*-
"""
数据加载与预处理模块 V2

负责从CSV文件加载传感器数据，解析144元素数组，
提取10×6靠背和坐垫大矩阵及侧翼小矩形，并进行入座状态筛选。

V2改进:
    - 保留全部144点原始传感器数据
    - 额外提取侧翼小矩形传感器数据
"""

import os
import re
import json
import glob
import numpy as np
import pandas as pd
from typing import List, Dict, Optional, Tuple


class DataLoader:
    """
    座椅压力传感器数据加载器
    
    传感器矩阵索引布局（144个元素）:
        [0-71]:   靠背传感器（72个）
          [0-5]:    左侧小矩形（3×2）
          [6-11]:   右侧小矩形（3×2）
          [12-71]:  中间大矩阵（10行×6列=60个）
        [72-143]: 坐垫传感器（72个）
          [72-77]:  左侧小矩形（3×2）
          [78-83]:  右侧小矩形（3×2）
          [84-143]: 中间大矩阵（10行×6列=60个）
    """
    
    # 传感器矩阵常量
    BACKREST_LEFT_SLICE = slice(0, 6)
    BACKREST_RIGHT_SLICE = slice(6, 12)
    BACKREST_LARGE_SLICE = slice(12, 72)
    CUSHION_LEFT_SLICE = slice(72, 78)
    CUSHION_RIGHT_SLICE = slice(78, 84)
    CUSHION_LARGE_SLICE = slice(84, 144)
    MATRIX_ROWS = 10
    MATRIX_COLS = 6
    SENSOR_TOTAL = 144
    
    # 体型映射
    BODY_TYPE_MAP = {'瘦小': 'Slim', '中等': 'Medium', '高大': 'Large'}
    BODY_TYPE_LABELS = {'Slim': 0, 'Medium': 1, 'Large': 2}
    LABEL_TO_TYPE = {0: 'Slim', 1: 'Medium', 2: 'Large'}
    LABEL_TO_CN = {0: '瘦小', 1: '中等', 2: '高大'}
    
    def __init__(self, 
                 seated_threshold_ratio: float = 0.3,
                 seated_trim_frames: int = 5,
                 seated_min_segment: int = 20):
        """
        初始化数据加载器
        
        Parameters
        ----------
        seated_threshold_ratio : float
            入座检测阈值比例，threshold = min + (max - min) * ratio
        seated_trim_frames : int
            每个入座片段前后裁剪的过渡帧数
        seated_min_segment : int
            最小有效入座片段长度（帧数）
        """
        self.seated_threshold_ratio = seated_threshold_ratio
        self.seated_trim_frames = seated_trim_frames
        self.seated_min_segment = seated_min_segment
    
    @staticmethod
    def extract_person_info(filename: str) -> Optional[Dict]:
        """
        从文件名中提取受试者信息
        
        文件名格式: carAir姓名（体型体重kg）.csv 或 carAir姓名数字（体型体重kg）.csv
        例如: carAir渠（瘦小45kg）.csv, carAir罗正科2（中等72kg）.csv
        
        Returns
        -------
        dict or None
            包含 person_name, body_type_cn, body_type, weight_kg
        """
        base = os.path.splitext(os.path.basename(filename))[0]
        m = re.search(r'carAir(.+?)（(瘦小|中等|高大)([\d.]*kg)?）', base)
        if not m:
            return None
        name = m.group(1)
        body_cn = m.group(2)
        weight_str = m.group(3)
        weight = float(weight_str.replace('kg', '')) if weight_str else None
        return {
            'person_name': name,
            'body_type_cn': body_cn,
            'body_type': DataLoader.BODY_TYPE_MAP[body_cn],
            'weight_kg': weight,
        }
    
    @staticmethod
    def parse_sensor_array(json_str: str) -> Optional[np.ndarray]:
        """
        解析carAirdata列的JSON字符串为numpy数组
        
        Returns
        -------
        np.ndarray or None
            长度为144的浮点数组
        """
        try:
            arr = np.array(json.loads(json_str), dtype=float)
            if len(arr) >= DataLoader.SENSOR_TOTAL:
                return arr[:DataLoader.SENSOR_TOTAL]
            return None
        except Exception:
            return None
    
    @staticmethod
    def extract_large_matrices(sensor_array: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """
        从144元素数组中提取并重塑两个10×6大矩阵
        
        Returns
        -------
        tuple of (backrest, cushion)
            两个 shape=(10,6) 的矩阵
        """
        backrest = sensor_array[DataLoader.BACKREST_LARGE_SLICE].reshape(
            DataLoader.MATRIX_ROWS, DataLoader.MATRIX_COLS)
        cushion = sensor_array[DataLoader.CUSHION_LARGE_SLICE].reshape(
            DataLoader.MATRIX_ROWS, DataLoader.MATRIX_COLS)
        return backrest, cushion
    
    @staticmethod
    def extract_wing_sensors(sensor_array: np.ndarray) -> Dict[str, np.ndarray]:
        """
        从144元素数组中提取侧翼小矩形传感器数据
        
        Returns
        -------
        dict
            包含 back_left, back_right, cush_left, cush_right 四个数组
        """
        return {
            'back_left': sensor_array[DataLoader.BACKREST_LEFT_SLICE],
            'back_right': sensor_array[DataLoader.BACKREST_RIGHT_SLICE],
            'cush_left': sensor_array[DataLoader.CUSHION_LEFT_SLICE],
            'cush_right': sensor_array[DataLoader.CUSHION_RIGHT_SLICE],
        }
    
    def filter_seated_frames(self, file_rows: List[Dict]) -> Tuple[List[Dict], List[Tuple]]:
        """
        从单个文件的所有帧中筛选出入座状态的帧
        
        算法:
        1. 计算每帧坐垫大矩阵总压力
        2. 以 min + (max - min) * threshold_ratio 作为阈值
        3. 提取连续超过阈值的片段
        4. 裁剪每段前后过渡帧
        5. 丢弃长度不足的短片段
        
        Returns
        -------
        tuple of (kept_rows, valid_segments)
        """
        if not file_rows:
            return file_rows, []
        
        cush_sums = [np.sum(r['cushion_matrix']) for r in file_rows]
        max_val = max(cush_sums)
        min_val = min(cush_sums)
        threshold = min_val + (max_val - min_val) * self.seated_threshold_ratio
        
        n = len(cush_sums)
        mask = [s >= threshold for s in cush_sums]
        
        # 提取连续入座片段
        raw_segments = []
        seg_start = -1
        for i in range(n):
            if mask[i] and seg_start == -1:
                seg_start = i
            elif not mask[i] and seg_start != -1:
                raw_segments.append((seg_start, i - 1))
                seg_start = -1
        if seg_start != -1:
            raw_segments.append((seg_start, n - 1))
        
        # 裁剪前后过渡帧
        trimmed = []
        for start, end in raw_segments:
            new_start = start + self.seated_trim_frames
            new_end = end - self.seated_trim_frames
            if new_start <= new_end:
                trimmed.append((new_start, new_end))
        
        # 过滤过短片段
        valid_segments = [(s, e) for s, e in trimmed 
                          if (e - s + 1) >= self.seated_min_segment]
        
        # 提取有效帧
        kept_rows = []
        for s, e in valid_segments:
            kept_rows.extend(file_rows[s:e + 1])
        
        return kept_rows, valid_segments
    
    def load_from_directory(self, data_dir: str, verbose: bool = True) -> List[Dict]:
        """
        从目录加载所有CSV文件的传感器数据
        
        Parameters
        ----------
        data_dir : str
            CSV数据文件所在目录
        verbose : bool
            是否打印加载进度
            
        Returns
        -------
        list of dict
            每个元素包含 person_name, body_type, weight_kg,
            sensor_full(144), backrest_matrix(10×6), cushion_matrix(10×6),
            wing_sensors(dict)
        """
        files = glob.glob(os.path.join(data_dir, "carAir*.csv"))
        all_rows = []
        
        for fpath in sorted(files):
            info = self.extract_person_info(fpath)
            if info is None:
                if verbose:
                    # print(f"  跳过（无法解析文件名）: {fpath}")
                    pass
                continue
            
            df = None
            for enc in ['utf-8', 'gbk', 'utf-8-sig']:
                try:
                    df = pd.read_csv(fpath, encoding=enc)
                    break
                except (UnicodeDecodeError, pd.errors.ParserError):
                    continue
            if df is None:
                if verbose:
                    # print(f"  跳过（无法读取）: {fpath}")
                    pass
                continue
            
            file_rows = []
            for _, row in df.iterrows():
                sensor = self.parse_sensor_array(str(row['carAirdata']))
                if sensor is None:
                    continue
                backrest, cushion = self.extract_large_matrices(sensor)
                wings = self.extract_wing_sensors(sensor)
                file_rows.append({
                    **info,
                    'sensor_full': sensor,
                    'backrest_matrix': backrest,
                    'cushion_matrix': cushion,
                    'wing_sensors': wings,
                })
            
            if file_rows:
                kept_rows, segments = self.filter_seated_frames(file_rows)
                if verbose:
                    # print(f"  {info['person_name']}（{info['body_type_cn']}"
                          # f"{',' + str(int(info['weight_kg'])) + 'kg' if info['weight_kg'] else ''}"
                          # f"）: {len(file_rows)} → {len(kept_rows)} 帧"
                          # f"（{len(segments)} 个入座片段）")
                    pass
                all_rows.extend(kept_rows)
        
        if verbose:
            # print(f"\n总计加载 {len(all_rows)} 个样本")
            pass
        return all_rows
    
    def load_single_frame(self, sensor_json: str) -> Optional[Dict]:
        """
        加载单帧传感器数据（用于实时推理）
        
        Parameters
        ----------
        sensor_json : str
            形如 "[63,87,73,64,...]" 的JSON数组字符串
            
        Returns
        -------
        dict or None
            包含 sensor_full, backrest_matrix, cushion_matrix, wing_sensors
        """
        sensor = self.parse_sensor_array(sensor_json)
        if sensor is None:
            return None
        backrest, cushion = self.extract_large_matrices(sensor)
        wings = self.extract_wing_sensors(sensor)
        return {
            'sensor_full': sensor,
            'backrest_matrix': backrest,
            'cushion_matrix': cushion,
            'wing_sensors': wings,
        }
