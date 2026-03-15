# -*- coding: utf-8 -*-
"""
分类结果可视化模块 V2

提供多种可视化方法展示体型分类的训练和评估结果。

V2改进:
    - 适配概率软投票评估结果
    - 增加窗口级特征分布可视化
    - 优化图表布局和信息密度
"""

import os
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
from sklearn.metrics import confusion_matrix
from typing import Dict, List, Optional

# 设置中文字体
plt.style.use('seaborn-v0_8-whitegrid')
matplotlib.rcParams['font.sans-serif'] = ['Noto Sans CJK SC', 'SimHei', 'DejaVu Sans']
matplotlib.rcParams['axes.unicode_minus'] = False

# 颜色方案
BODY_TYPE_COLORS = {
    'Slim': '#2196F3',
    'Medium': '#4CAF50',
    'Large': '#F44336',
}
LABEL_COLORS = {0: '#2196F3', 1: '#4CAF50', 2: '#F44336'}
BODY_TYPE_CN = {'Slim': '瘦小', 'Medium': '中等', 'Large': '高大'}
LABEL_CN = {0: '瘦小', 1: '中等', 2: '高大'}
BODY_TYPE_ORDER = ['Slim', 'Medium', 'Large']
LABEL_NAMES = ['Slim(瘦小)', 'Medium(中等)', 'Large(高大)']


class ClassificationVisualizer:
    """分类结果可视化器 V2"""
    
    def __init__(self, output_dir: str = './output'):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def plot_model_comparison(self, eval_summary: pd.DataFrame, 
                              save_name: str = 'model_comparison.png') -> str:
        """绘制模型性能对比图"""
        fig, axes = plt.subplots(1, 2, figsize=(20, 8))
        fig.suptitle('模型性能对比 (LOSO-CV + 概率软投票)', fontsize=16, fontweight='bold')
        
        # 左图: 受试者准确率对比
        ax = axes[0]
        x = np.arange(len(eval_summary))
        colors = ['#4CAF50' if acc >= 0.875 else '#FFA726' if acc >= 0.625 else '#F44336' 
                  for acc in eval_summary['Person_Acc']]
        bars = ax.bar(x, eval_summary['Person_Acc'], color=colors, alpha=0.85, edgecolor='white')
        ax.set_xticks(x)
        ax.set_xticklabels(eval_summary['Model'], rotation=45, ha='right', fontsize=9)
        ax.set_ylabel('受试者准确率')
        ax.set_title('受试者级投票准确率')
        ax.set_ylim(0, 1.15)
        ax.axhline(y=0.9, color='green', linestyle='--', alpha=0.5, label='90%目标线')
        ax.legend(fontsize=9)
        ax.grid(axis='y', alpha=0.3)
        
        for i, (bar, acc, nc) in enumerate(zip(bars, eval_summary['Person_Acc'], eval_summary['N_Correct'])):
            ax.text(bar.get_x() + bar.get_width()/2, acc + 0.02, 
                    f'{acc:.0%}\n({nc})', ha='center', fontsize=9, fontweight='bold')
        
        # 右图: 帧级指标对比
        ax = axes[1]
        width = 0.3
        ax.bar(x - width, eval_summary['Frame_Acc'], width, label='Frame Acc', 
               color='#42A5F5', alpha=0.85)
        ax.bar(x, eval_summary['F1_macro'], width, label='F1 (macro)', 
               color='#66BB6A', alpha=0.85)
        ax.bar(x + width, eval_summary['F1_weighted'], width, label='F1 (weighted)', 
               color='#FFA726', alpha=0.85)
        ax.set_xticks(x)
        ax.set_xticklabels(eval_summary['Model'], rotation=45, ha='right', fontsize=9)
        ax.set_ylabel('Score')
        ax.set_title('帧级指标对比')
        ax.legend(loc='lower right')
        ax.set_ylim(0, 1.05)
        ax.grid(axis='y', alpha=0.3)
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, save_name)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        return filepath
    
    def plot_confusion_matrices(self, eval_results: Dict, 
                                 top_n: int = 4,
                                 save_name: str = 'confusion_matrices.png') -> str:
        """绘制Top-N模型的混淆矩阵"""
        valid = {k: v for k, v in eval_results.items() if 'error' not in v}
        sorted_models = sorted(valid.keys(), key=lambda k: valid[k]['person_accuracy'], reverse=True)
        top_models = sorted_models[:top_n]
        
        n_cols = min(top_n, 4)
        n_rows = (len(top_models) + n_cols - 1) // n_cols
        fig, axes = plt.subplots(n_rows, n_cols, figsize=(5 * n_cols, 5 * n_rows))
        fig.suptitle('混淆矩阵 (LOSO-CV 帧级)', fontsize=16, fontweight='bold')
        
        if n_rows == 1 and n_cols == 1:
            axes = np.array([[axes]])
        elif n_rows == 1:
            axes = axes.reshape(1, -1)
        elif n_cols == 1:
            axes = axes.reshape(-1, 1)
        
        for idx, name in enumerate(top_models):
            row, col = idx // n_cols, idx % n_cols
            ax = axes[row, col]
            cm = valid[name]['confusion_matrix']
            pacc = valid[name]['person_accuracy']
            f1 = valid[name]['f1_macro']
            
            sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=ax,
                        xticklabels=['瘦小', '中等', '高大'],
                        yticklabels=['瘦小', '中等', '高大'])
            ax.set_title(f'{name}\n受试者={pacc:.0%}, F1={f1:.3f}', fontsize=11)
            ax.set_ylabel('真实标签')
            ax.set_xlabel('预测标签')
        
        for idx in range(len(top_models), n_rows * n_cols):
            row, col = idx // n_cols, idx % n_cols
            axes[row, col].set_visible(False)
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, save_name)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        return filepath
    
    def plot_pca_classification(self, X: np.ndarray, y_true: np.ndarray, 
                                 groups: np.ndarray,
                                 model_name: str = '',
                                 save_name: str = 'pca_classification.png') -> str:
        """PCA降维后的分类结果可视化"""
        pca = PCA(n_components=2)
        X_pca = pca.fit_transform(X)
        
        fig, axes = plt.subplots(1, 2, figsize=(18, 7))
        fig.suptitle(f'PCA降维可视化 — {model_name}', fontsize=16, fontweight='bold')
        
        # 左图: 按体型着色
        ax = axes[0]
        for label in [0, 1, 2]:
            mask = y_true == label
            ax.scatter(X_pca[mask, 0], X_pca[mask, 1], 
                       c=LABEL_COLORS[label], label=LABEL_NAMES[label],
                       alpha=0.5, s=20, edgecolors='none')
        ax.set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%})')
        ax.set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%})')
        ax.set_title('按体型着色')
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)
        
        # 右图: 按受试者着色
        ax = axes[1]
        unique_persons = np.unique(groups)
        cmap = plt.cm.get_cmap('tab10', len(unique_persons))
        for i, person in enumerate(unique_persons):
            mask = groups == person
            ax.scatter(X_pca[mask, 0], X_pca[mask, 1],
                       c=[cmap(i)], label=person,
                       alpha=0.5, s=20, edgecolors='none')
        ax.set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%})')
        ax.set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%})')
        ax.set_title('按受试者着色')
        ax.legend(fontsize=8, ncol=2)
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, save_name)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        return filepath
    
    def plot_tsne_classification(self, X: np.ndarray, y_true: np.ndarray,
                                  groups: np.ndarray,
                                  model_name: str = '',
                                  save_name: str = 'tsne_classification.png') -> str:
        """t-SNE降维后的分类结果可视化"""
        n_samples = len(X)
        perp = min(30, max(5, n_samples // 5))
        tsne = TSNE(n_components=2, perplexity=perp, random_state=42, max_iter=1000)
        X_tsne = tsne.fit_transform(X)
        
        fig, axes = plt.subplots(1, 2, figsize=(18, 7))
        fig.suptitle(f't-SNE降维可视化 — {model_name}', fontsize=16, fontweight='bold')
        
        # 左图: 按体型着色
        ax = axes[0]
        for label in [0, 1, 2]:
            mask = y_true == label
            ax.scatter(X_tsne[mask, 0], X_tsne[mask, 1],
                       c=LABEL_COLORS[label], label=LABEL_NAMES[label],
                       alpha=0.6, s=25, edgecolors='none')
        ax.set_title('按体型着色')
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)
        
        # 右图: 按受试者着色
        ax = axes[1]
        unique_persons = np.unique(groups)
        cmap = plt.cm.get_cmap('tab10', len(unique_persons))
        for i, person in enumerate(unique_persons):
            mask = groups == person
            ax.scatter(X_tsne[mask, 0], X_tsne[mask, 1],
                       c=[cmap(i)], label=person,
                       alpha=0.6, s=25, edgecolors='none')
        ax.set_title('按受试者着色')
        ax.legend(fontsize=8, ncol=2)
        ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, save_name)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        return filepath
    
    def plot_voting_results(self, eval_result: Dict, feature_df: pd.DataFrame,
                            model_name: str = '',
                            save_name: str = 'voting_results.png') -> str:
        """绘制受试者级投票结果图"""
        if 'person_results' not in eval_result:
            return ''
        
        person_info = feature_df.drop_duplicates('person_name')[
            ['person_name', 'body_type', 'body_type_cn', 'weight_kg']
        ].set_index('person_name')
        
        pr = eval_result['person_results']
        persons = sorted(pr.keys())
        
        fig, axes = plt.subplots(1, 2, figsize=(20, 7))
        fig.suptitle(f'受试者级概率软投票分类结果 — {model_name}\n'
                     f'受试者准确率: {eval_result["person_accuracy"]:.0%} '
                     f'({eval_result["n_correct"]}/{eval_result["n_total"]})',
                     fontsize=16, fontweight='bold')
        
        # 左图: 投票结果对比
        ax = axes[0]
        x = np.arange(len(persons))
        width = 0.35
        
        true_labels = [pr[p]['true_label'] for p in persons]
        voted_labels = [pr[p]['voted_label'] for p in persons]
        true_colors = [LABEL_COLORS[l] for l in true_labels]
        voted_colors = [LABEL_COLORS[l] for l in voted_labels]
        
        ax.bar(x - width/2, [1]*len(persons), width, 
               color=true_colors, alpha=0.7, label='真实体型', edgecolor='black', linewidth=0.5)
        ax.bar(x + width/2, [1]*len(persons), width,
               color=voted_colors, alpha=0.7, label='投票结果', edgecolor='black', linewidth=0.5)
        
        for i, p in enumerate(persons):
            ax.text(x[i] - width/2, 0.5, LABEL_CN[true_labels[i]], 
                    ha='center', va='center', fontsize=10, fontweight='bold', color='white')
            ax.text(x[i] + width/2, 0.5, LABEL_CN[voted_labels[i]],
                    ha='center', va='center', fontsize=10, fontweight='bold', color='white')
            mark = '✓' if pr[p]['correct'] else '✗'
            mark_color = '#4CAF50' if pr[p]['correct'] else '#F44336'
            ax.text(x[i], 1.05, mark, ha='center', va='bottom', 
                    fontsize=16, fontweight='bold', color=mark_color)
        
        xlabels = []
        for p in persons:
            if p in person_info.index:
                wt = person_info.loc[p, 'weight_kg']
                wt_str = f",{int(wt)}kg" if (wt is not None and not np.isnan(wt)) else ""
                xlabels.append(f"{p}{wt_str}")
            else:
                xlabels.append(p)
        
        ax.set_xticks(x)
        ax.set_xticklabels(xlabels, rotation=30, ha='right', fontsize=10)
        ax.set_ylim(0, 1.3)
        ax.set_yticks([])
        ax.set_title('真实体型 vs 投票结果', fontsize=13)
        ax.legend(loc='upper right', fontsize=10)
        
        # 右图: 置信度
        ax = axes[1]
        confidences = [pr[p]['confidence'] for p in persons]
        frame_accs = [pr[p]['frame_accuracy'] for p in persons]
        
        bar_colors = ['#4CAF50' if pr[p]['correct'] else '#F44336' for p in persons]
        bars = ax.bar(x, confidences, color=bar_colors, alpha=0.85, edgecolor='white')
        
        for i, (conf, p) in enumerate(zip(confidences, persons)):
            ax.text(x[i], conf + 0.02, f'{conf:.0%}', 
                    ha='center', fontsize=10, fontweight='bold')
        
        ax.set_xticks(x)
        ax.set_xticklabels(xlabels, rotation=30, ha='right', fontsize=10)
        ax.set_ylim(0, 1.15)
        ax.set_ylabel('置信度')
        ax.set_title('投票置信度（绿=正确，红=错误）', fontsize=13)
        ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.5, label='50%基线')
        ax.legend(fontsize=9)
        ax.grid(axis='y', alpha=0.3)
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, save_name)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        return filepath
    
    def plot_probability_heatmap(self, eval_result: Dict, feature_df: pd.DataFrame,
                                  model_name: str = '',
                                  save_name: str = 'probability_heatmap.png') -> str:
        """绘制受试者概率分布热力图"""
        if 'person_results' not in eval_result:
            return ''
        
        pr = eval_result['person_results']
        persons = sorted(pr.keys())
        
        person_info = feature_df.drop_duplicates('person_name')[
            ['person_name', 'body_type_cn', 'weight_kg']
        ].set_index('person_name')
        
        # 构建概率矩阵
        prob_matrix = []
        ylabels = []
        for p in persons:
            if 'probabilities' in pr[p] and pr[p]['probabilities']:
                probs = pr[p]['probabilities']
                prob_matrix.append([probs.get(0, 0), probs.get(1, 0), probs.get(2, 0)])
            else:
                prob_matrix.append([0, 0, 0])
            
            if p in person_info.index:
                cn = person_info.loc[p, 'body_type_cn']
                wt = person_info.loc[p, 'weight_kg']
                wt_str = f",{int(wt)}kg" if (wt is not None and not np.isnan(wt)) else ""
                mark = "✓" if pr[p]['correct'] else "✗"
                ylabels.append(f"{mark} {p}({cn}{wt_str})")
            else:
                ylabels.append(p)
        
        prob_matrix = np.array(prob_matrix)
        
        fig, ax = plt.subplots(figsize=(10, 8))
        fig.suptitle(f'受试者概率分布热力图 — {model_name}\n'
                     f'受试者准确率: {eval_result["person_accuracy"]:.0%}',
                     fontsize=14, fontweight='bold')
        
        sns.heatmap(prob_matrix, annot=True, fmt='.2f', cmap='YlOrRd', ax=ax,
                    xticklabels=['瘦小(Slim)', '中等(Medium)', '高大(Large)'],
                    yticklabels=ylabels, vmin=0, vmax=1,
                    linewidths=0.5, linecolor='white')
        ax.set_xlabel('预测概率', fontsize=12)
        ax.set_ylabel('受试者', fontsize=12)
        
        plt.tight_layout()
        filepath = os.path.join(self.output_dir, save_name)
        plt.savefig(filepath, dpi=150, bbox_inches='tight')
        plt.close()
        return filepath
    
    def plot_comprehensive_results(self, X: np.ndarray, y_true: np.ndarray,
                                    groups: np.ndarray,
                                    eval_results: Dict, feature_df: pd.DataFrame,
                                    eval_summary: pd.DataFrame,
                                    best_model_name: str = '') -> List[str]:
        """
        生成全套可视化结果
        
        Returns
        -------
        list of str
            所有生成的图表文件路径
        """
        paths = []
        
        # print("  生成模型对比图...")
        paths.append(self.plot_model_comparison(eval_summary))
        
        # print("  生成混淆矩阵...")
        paths.append(self.plot_confusion_matrices(eval_results))
        
        # print("  生成PCA分类结果图...")
        paths.append(self.plot_pca_classification(X, y_true, groups, best_model_name))
        
        # print("  生成t-SNE分类结果图...")
        paths.append(self.plot_tsne_classification(X, y_true, groups, best_model_name))
        
        # 投票结果和概率热力图
        if best_model_name in eval_results and 'person_results' in eval_results[best_model_name]:
            # print("  生成投票结果图...")
            paths.append(self.plot_voting_results(
                eval_results[best_model_name], feature_df, best_model_name))
            
            # print("  生成概率热力图...")
            paths.append(self.plot_probability_heatmap(
                eval_results[best_model_name], feature_df, best_model_name))
        
        return [p for p in paths if p]
