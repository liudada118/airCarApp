# -*- coding: utf-8 -*-
"""
body_type_classifier - 汽车座椅压力传感器体型三分类算法包 V2

基于144元素座椅压力传感器数据，实现瘦小/中等/高大三种体型的自动分类。

V2核心改进:
    - 滑动窗口时间聚合（消除帧间噪声，最佳粒度）
    - 全144点传感器特征（含侧翼小矩形）
    - 概率软投票（比硬投票更鲁棒）
    - KNN为核心模型（最适合小样本场景）

主要模块:
    - data_loader: 数据加载与预处理（含全144点和侧翼传感器）
    - feature_engineer: 特征工程（增强版 + 滑动窗口 + 时间变异特征）
    - classifier: 分类模型训练与预测（概率软投票）
    - visualizer: 分类结果可视化
"""

# 子模块版本号，算法包统一版本见 version.py
__sub_version__ = "2.0.0"
__author__ = "Hirkond"

from .data_loader import DataLoader
from .feature_engineer import FeatureEngineer
from .classifier import BodyTypeClassifier
from .visualizer import ClassificationVisualizer
