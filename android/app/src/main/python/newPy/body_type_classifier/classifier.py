# -*- coding: utf-8 -*-
"""
体型三分类器模块 V2

采用LOSO-CV + 概率软投票评估策略。

V2核心改进:
    1. 概率软投票 — 使用predict_proba均值而非硬投票，更鲁棒
    2. KNN为核心模型 — 最适合小样本场景
    3. 多模型概率融合 — 多个模型的概率均值融合
    4. 与滑动窗口特征工程深度集成
"""

import os
import json
import pickle
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from collections import Counter
from sklearn.ensemble import (
    RandomForestClassifier, 
    GradientBoostingClassifier,
    AdaBoostClassifier,
)
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (
    accuracy_score, 
    classification_report, 
    confusion_matrix,
    f1_score
)
from sklearn.model_selection import LeaveOneGroupOut, cross_val_predict

from .data_loader import DataLoader
from .feature_engineer import FeatureEngineer


class BodyTypeClassifier:
    """
    座椅压力传感器体型三分类器 V2
    
    分类目标:
        0 - Slim (瘦小)
        1 - Medium (中等)
        2 - Large (高大)
    
    评估策略:
        留一受试者交叉验证 (LOSO-CV) + 概率软投票
        每次留出一个受试者的全部数据作为测试集，用其余受试者训练模型。
        对测试集的所有样本预测概率后取均值，选择概率最高的类别。
    """
    
    LABEL_MAP = {'Slim': 0, 'Medium': 1, 'Large': 2}
    LABEL_NAMES = ['Slim(瘦小)', 'Medium(中等)', 'Large(高大)']
    LABEL_CN = {0: '瘦小', 1: '中等', 2: '高大'}
    
    def __init__(self, feature_engineer: Optional[FeatureEngineer] = None):
        """
        初始化分类器
        
        Parameters
        ----------
        feature_engineer : FeatureEngineer or None
            特征工程器实例，如果为None则使用默认配置
        """
        self.feature_engineer = feature_engineer or FeatureEngineer()
        self.best_model = None
        self.best_model_name = None
        self.evaluation_results = {}
        self.voting_results = {}
        self.feature_df = None
        self.labels = None
        self.groups = None
    
    @staticmethod
    def get_candidate_models() -> Dict:
        """
        获取候选分类模型字典
        
        Returns
        -------
        dict
            模型名称 -> 模型实例
        """
        return {
            'KNN5_dist': KNeighborsClassifier(
                n_neighbors=5, weights='distance', metric='minkowski'
            ),
            'KNN3_dist': KNeighborsClassifier(
                n_neighbors=3, weights='distance', metric='minkowski'
            ),
            'KNN7_dist': KNeighborsClassifier(
                n_neighbors=7, weights='distance', metric='minkowski'
            ),
            'LogisticRegression': LogisticRegression(
                C=1.0, max_iter=1000, class_weight='balanced',
                random_state=42
            ),
            'SVM_Linear': SVC(
                kernel='linear', C=1.0,
                class_weight='balanced', probability=True, random_state=42
            ),
            'SVM_RBF': SVC(
                kernel='rbf', C=10, gamma='scale',
                class_weight='balanced', probability=True, random_state=42
            ),
            'RandomForest': RandomForestClassifier(
                n_estimators=200, max_depth=8, min_samples_leaf=3,
                class_weight='balanced', random_state=42, n_jobs=-1
            ),
            'GradientBoosting': GradientBoostingClassifier(
                n_estimators=200, max_depth=3, learning_rate=0.05,
                min_samples_leaf=3, random_state=42
            ),
        }
    
    def prepare_data(self, feature_df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        准备训练数据
        
        Parameters
        ----------
        feature_df : pd.DataFrame
            特征DataFrame（帧级或窗口级）
            
        Returns
        -------
        tuple of (X, y, groups)
            X: 标准化+特征选择后的特征矩阵
            y: 标签数组
            groups: 受试者分组数组（用于LOSO-CV）
        """
        self.feature_df = feature_df
        self.labels = feature_df['body_type'].map(self.LABEL_MAP).values
        self.groups = feature_df['person_name'].values
        
        X, selected = self.feature_engineer.fit_transform(feature_df, self.labels)
        
        return X, self.labels, self.groups
    
    def evaluate_with_soft_voting(self, X: np.ndarray, y: np.ndarray,
                                   groups: np.ndarray, verbose: bool = True) -> Dict:
        """
        使用LOSO-CV + 概率软投票评估所有候选模型
        
        对每个受试者：
        1. 用其余受试者训练模型
        2. 对该受试者所有样本预测概率
        3. 取概率均值，选择概率最高的类别
        
        Parameters
        ----------
        X : np.ndarray
            标准化特征矩阵
        y : np.ndarray
            标签数组
        groups : np.ndarray
            受试者分组数组
        verbose : bool
            是否打印评估进度
            
        Returns
        -------
        dict
            模型名称 -> 评估结果字典
        """
        logo = LeaveOneGroupOut()
        models = self.get_candidate_models()
        results = {}
        
        if verbose:
            # print(f"\n{'='*70}")
            # print(f"LOSO-CV + 概率软投票评估")
            # print(f"特征数: {X.shape[1]}, 样本数: {X.shape[0]}, "
                  f"受试者数: {len(np.unique(groups))}")
            # print(f"{'='*70}")
        
        for name, model_template in models.items():
            try:
                unique_persons = np.unique(groups)
                person_results = {}
                all_y_true = []
                all_y_pred = []
                
                for train_idx, test_idx in logo.split(X, y, groups):
                    X_train, X_test = X[train_idx], X[test_idx]
                    y_train = y[train_idx]
                    test_person = groups[test_idx][0]
                    true_label = y[test_idx][0]
                    
                    # 训练模型
                    model = type(model_template)(**model_template.get_params())
                    model.fit(X_train, y_train)
                    
                    # 概率预测
                    if hasattr(model, 'predict_proba'):
                        proba = model.predict_proba(X_test)
                        mean_proba = proba.mean(axis=0)
                        voted_label = np.argmax(mean_proba)
                        confidence = float(mean_proba[voted_label])
                        proba_dict = {int(i): float(mean_proba[i]) for i in range(len(mean_proba))}
                    else:
                        pred = model.predict(X_test)
                        vote_counts = Counter(pred)
                        voted_label = vote_counts.most_common(1)[0][0]
                        confidence = vote_counts[voted_label] / len(pred)
                        proba_dict = {}
                    
                    # 帧级预测（用于计算帧级指标）
                    frame_preds = model.predict(X_test)
                    frame_acc = accuracy_score(y[test_idx], frame_preds)
                    
                    all_y_true.extend(y[test_idx])
                    all_y_pred.extend(frame_preds)
                    
                    person_results[test_person] = {
                        'true_label': int(true_label),
                        'voted_label': int(voted_label),
                        'confidence': confidence,
                        'correct': voted_label == true_label,
                        'frame_accuracy': frame_acc,
                        'probabilities': proba_dict,
                    }
                
                # 计算总体指标
                n_correct = sum(1 for r in person_results.values() if r['correct'])
                n_total = len(person_results)
                person_accuracy = n_correct / n_total
                
                all_y_true = np.array(all_y_true)
                all_y_pred = np.array(all_y_pred)
                frame_acc = accuracy_score(all_y_true, all_y_pred)
                frame_f1_macro = f1_score(all_y_true, all_y_pred, average='macro')
                frame_f1_weighted = f1_score(all_y_true, all_y_pred, average='weighted')
                cm = confusion_matrix(all_y_true, all_y_pred)
                report = classification_report(all_y_true, all_y_pred,
                                               target_names=self.LABEL_NAMES,
                                               output_dict=True)
                
                results[name] = {
                    'person_results': person_results,
                    'person_accuracy': person_accuracy,
                    'n_correct': n_correct,
                    'n_total': n_total,
                    'frame_accuracy': frame_acc,
                    'f1_macro': frame_f1_macro,
                    'f1_weighted': frame_f1_weighted,
                    'confusion_matrix': cm,
                    'classification_report': report,
                    'predictions': all_y_pred,
                }
                
                if verbose:
                    # print(f"\n  {name:25s}  受试者={person_accuracy:.0%}({n_correct}/{n_total})  "
                          f"帧F1={frame_f1_macro:.3f}  帧Acc={frame_acc:.3f}")
                    for p in sorted(person_results.keys()):
                        r = person_results[p]
                        mark = "✓" if r['correct'] else "✗"
                        # print(f"    {mark} {p}: 真实={self.LABEL_CN[r['true_label']]} "
                              f"预测={self.LABEL_CN[r['voted_label']]} "
                              f"置信度={r['confidence']:.0%}")
                
            except Exception as e:
                if verbose:
                    # print(f"\n  {name:25s}  ERROR: {e}")
                results[name] = {'error': str(e)}
        
        self.evaluation_results = results
        return results
    
    def select_best_model(self, metric: str = 'person_accuracy') -> str:
        """
        根据指定指标选择最佳模型
        
        Parameters
        ----------
        metric : str
            评估指标名称（person_accuracy, f1_macro, frame_accuracy）
            默认使用受试者准确率
            
        Returns
        -------
        str
            最佳模型名称
        """
        valid_results = {k: v for k, v in self.evaluation_results.items() 
                         if 'error' not in v}
        
        # 综合评分：受试者准确率为主，帧级F1为辅
        if metric == 'combined':
            best_name = max(valid_results, key=lambda k: 
                           0.7 * valid_results[k]['person_accuracy'] + 
                           0.3 * valid_results[k]['f1_macro'])
        else:
            best_name = max(valid_results, key=lambda k: valid_results[k][metric])
        
        self.best_model_name = best_name
        return best_name
    
    def train_final_model(self, X: np.ndarray, y: np.ndarray, 
                          model_name: Optional[str] = None) -> None:
        """
        使用全部数据训练最终模型
        
        Parameters
        ----------
        X : np.ndarray
            标准化特征矩阵
        y : np.ndarray
            标签数组
        model_name : str or None
            模型名称，如果为None则使用select_best_model()的结果
        """
        if model_name is None:
            if self.best_model_name is None:
                self.select_best_model()
            model_name = self.best_model_name
        
        models = self.get_candidate_models()
        self.best_model = models[model_name]
        self.best_model.fit(X, y)
        self.best_model_name = model_name
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """使用训练好的模型进行预测"""
        if self.best_model is None:
            raise RuntimeError("模型尚未训练，请先调用train_final_model()")
        return self.best_model.predict(X)
    
    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        """预测各类别概率"""
        if self.best_model is None:
            raise RuntimeError("模型尚未训练，请先调用train_final_model()")
        return self.best_model.predict_proba(X)
    
    def predict_window(self, frames: List[Dict]) -> Dict:
        """
        对一个窗口的多帧数据进行体型预测（端到端推理接口）
        
        Parameters
        ----------
        frames : list of dict
            窗口内的多帧数据列表
            
        Returns
        -------
        dict
            包含 label, body_type, body_type_cn, confidence, probabilities
        """
        X = self.feature_engineer.transform_single_window(frames)
        proba = self.predict_proba(X)[0]
        label = int(np.argmax(proba))
        
        return {
            'label': label,
            'body_type': DataLoader.LABEL_TO_TYPE[label],
            'body_type_cn': DataLoader.LABEL_TO_CN[label],
            'confidence': float(proba[label]),
            'probabilities': {
                'Slim': float(proba[0]),
                'Medium': float(proba[1]),
                'Large': float(proba[2]),
            }
        }
    
    def get_evaluation_summary(self) -> pd.DataFrame:
        """
        获取所有模型的评估结果汇总表
        
        Returns
        -------
        pd.DataFrame
            模型评估汇总
        """
        rows = []
        for name, res in self.evaluation_results.items():
            if 'error' in res:
                continue
            row = {
                'Model': name,
                'Person_Acc': res['person_accuracy'],
                'N_Correct': f"{res['n_correct']}/{res['n_total']}",
                'Frame_Acc': res['frame_accuracy'],
                'F1_macro': res['f1_macro'],
                'F1_weighted': res['f1_weighted'],
            }
            # 添加各类别F1
            for cls_name in self.LABEL_NAMES:
                if cls_name in res['classification_report']:
                    row[f'F1_{cls_name}'] = res['classification_report'][cls_name]['f1-score']
            rows.append(row)
        
        df = pd.DataFrame(rows)
        df = df.sort_values('Person_Acc', ascending=False).reset_index(drop=True)
        return df
    
    def save_model(self, filepath: str) -> None:
        """
        保存训练好的模型和特征工程器
        
        Parameters
        ----------
        filepath : str
            保存路径（.pkl文件）
        """
        save_dict = {
            'model': self.best_model,
            'model_name': self.best_model_name,
            'feature_engineer': self.feature_engineer,
            'version': '2.0',
        }
        with open(filepath, 'wb') as f:
            pickle.dump(save_dict, f)
    
    @classmethod
    def load_model(cls, filepath: str) -> 'BodyTypeClassifier':
        """
        加载已保存的模型
        
        Parameters
        ----------
        filepath : str
            模型文件路径（.pkl文件）
            
        Returns
        -------
        BodyTypeClassifier
            加载后的分类器实例
        """
        with open(filepath, 'rb') as f:
            save_dict = pickle.load(f)
        
        classifier = cls(feature_engineer=save_dict['feature_engineer'])
        classifier.best_model = save_dict['model']
        classifier.best_model_name = save_dict['model_name']
        return classifier
