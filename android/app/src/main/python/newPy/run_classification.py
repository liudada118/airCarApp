# -*- coding: utf-8 -*-
"""
体型三分类主运行脚本 V2

完整流程：
  数据加载 → 帧级特征提取 → 滑动窗口聚合 → 模型评估(概率软投票) → 
  最佳模型训练 → 可视化 → 模型保存

V2核心改进:
  1. 滑动窗口时间聚合（窗口=30帧，步长=15帧）
  2. 增强特征集（全144点 + 侧翼 + 时间变异）
  3. 概率软投票评估
  4. KNN5为核心模型
"""

import os
import sys
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from body_type_classifier import DataLoader, FeatureEngineer, BodyTypeClassifier, ClassificationVisualizer


def main():
    # ============================================================
    # 配置
    # ============================================================
    DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
    MODEL_PATH = os.path.join(OUTPUT_DIR, 'body_type_model.pkl')
    
    # 滑动窗口参数（经过优化搜索确定）
    WINDOW_SIZE = 30
    STRIDE = 15
    N_SELECT_FEATURES = 40
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # print("=" * 70)
    # print("汽车座椅压力传感器 — 体型三分类算法 V2")
    # print("=" * 70)
    # print(f"配置: 窗口={WINDOW_SIZE}帧, 步长={STRIDE}帧, 特征选择={N_SELECT_FEATURES}维")
    
    # ============================================================
    # 第1步：数据加载
    # ============================================================
    # print("\n[1/7] 加载数据...")
    loader = DataLoader()
    raw_data = loader.load_from_directory(DATA_DIR)
    
    if not raw_data:
        # print("错误：未加载到数据，请检查数据目录。")
        pass
        return
    
    # ============================================================
    # 第2步：帧级特征提取
    # ============================================================
    # print("\n[2/7] 帧级特征提取...")
    fe = FeatureEngineer(
        window_size=WINDOW_SIZE,
        stride=STRIDE,
        n_select=N_SELECT_FEATURES,
        use_windowing=True
    )
    frame_df = fe.build_frame_feature_dataframe(raw_data)
    
    frame_feat_cols = fe.get_feature_columns(frame_df)
    # print(f"  帧级特征矩阵: {frame_df.shape}")
    # print(f"  帧级特征数: {len(frame_feat_cols)}")
    # print(f"  体型分布: {frame_df['body_type'].value_counts().to_dict()}")
    # print(f"  受试者: {frame_df['person_name'].nunique()} 人")
    
    # ============================================================
    # 第3步：滑动窗口聚合
    # ============================================================
    # print("\n[3/7] 滑动窗口时间聚合...")
    window_df = fe.build_windowed_features(frame_df)
    
    window_feat_cols = fe.get_feature_columns(window_df)
    # print(f"  窗口级特征矩阵: {window_df.shape}")
    # print(f"  窗口级特征数: {len(window_feat_cols)}")
    # print(f"  各受试者窗口数:")
    for person in sorted(window_df['person_name'].unique()):
        n = len(window_df[window_df['person_name'] == person])
        bt = window_df[window_df['person_name'] == person]['body_type_cn'].iloc[0]
        # print(f"    {person}({bt}): {n} 个窗口")
    
    # ============================================================
    # 第4步：模型评估（LOSO-CV + 概率软投票）
    # ============================================================
    # print("\n[4/7] 模型评估 (LOSO-CV + 概率软投票)...")
    classifier = BodyTypeClassifier(feature_engineer=fe)
    X, y, groups = classifier.prepare_data(window_df)
    
    # print(f"  选中特征数: {len(fe.selected_features)}")
    
    eval_results = classifier.evaluate_with_soft_voting(X, y, groups)
    
    # ============================================================
    # 第5步：选择最佳模型并训练
    # ============================================================
    # print("\n[5/7] 选择最佳模型...")
    best_name = classifier.select_best_model(metric='person_accuracy')
    
    eval_summary = classifier.get_evaluation_summary()
    # print("\n--- 模型评估汇总 ---")
    # print(eval_summary.to_string(index=False))
    
    best_res = eval_results[best_name]
    # print(f"\n最佳模型: {best_name}")
    # print(f"  受试者准确率: {best_res['person_accuracy']:.0%} ({best_res['n_correct']}/{best_res['n_total']})")
    # print(f"  帧级 F1 (macro): {best_res['f1_macro']:.4f}")
    # print(f"  帧级 Accuracy: {best_res['frame_accuracy']:.4f}")
    
    # 打印各受试者详细结果
    label_cn = {0: '瘦小', 1: '中等', 2: '高大'}
    # print("\n--- 各受试者分类详情 ---")
    for person in sorted(best_res['person_results'].keys()):
        pr = best_res['person_results'][person]
        bt_cn = window_df[window_df['person_name'] == person]['body_type_cn'].iloc[0]
        wt = window_df[window_df['person_name'] == person]['weight_kg'].iloc[0]
        wt_str = f"{int(wt)}kg" if (wt is not None and not pd.isna(wt)) else "未知"
        correct_mark = "✓" if pr['correct'] else "✗"
        # print(f"  {correct_mark} {person}（{bt_cn},{wt_str}）: "
              # f"真实={label_cn[pr['true_label']]}  "
              # f"投票={label_cn[pr['voted_label']]}  "
              # f"置信度={pr['confidence']:.0%}")
    
    # 训练最终模型
    # print(f"\n训练最终模型: {best_name}...")
    classifier.train_final_model(X, y, best_name)
    
    # ============================================================
    # 第6步：可视化
    # ============================================================
    # print("\n[6/7] 生成可视化结果...")
    viz = ClassificationVisualizer(output_dir=OUTPUT_DIR)
    chart_paths = viz.plot_comprehensive_results(
        X=X, y_true=y, groups=groups,
        eval_results=eval_results, feature_df=window_df,
        eval_summary=eval_summary,
        best_model_name=best_name
    )
    
    # print(f"\n  已生成 {len(chart_paths)} 张图表:")
    for p in chart_paths:
        pass
        # print(f"    - {os.path.basename(p)}")
    
    # ============================================================
    # 第7步：保存模型和结果
    # ============================================================
    # print("\n[7/7] 保存模型和结果...")
    
    classifier.save_model(MODEL_PATH)
    # print(f"  模型已保存: {MODEL_PATH}")
    
    eval_summary.to_csv(os.path.join(OUTPUT_DIR, 'model_evaluation.csv'),
                        index=False, encoding='utf-8-sig')
    
    # 保存分类报告
    with open(os.path.join(OUTPUT_DIR, 'classification_report.txt'), 'w', encoding='utf-8') as f:
        f.write(f"体型三分类报告 V2\n")
        f.write(f"{'='*60}\n\n")
        f.write(f"算法版本: 2.0\n")
        f.write(f"最佳模型: {best_name}\n")
        f.write(f"评估方式: LOSO-CV + 概率软投票\n")
        f.write(f"滑动窗口: {WINDOW_SIZE}帧, 步长{STRIDE}帧\n")
        f.write(f"选中特征数: {len(fe.selected_features)}\n")
        f.write(f"窗口样本数: {len(y)}\n")
        f.write(f"受试者数: {len(np.unique(groups))}\n\n")
        
        f.write(f"受试者级指标:\n")
        f.write(f"  受试者准确率: {best_res['person_accuracy']:.0%} "
                f"({best_res['n_correct']}/{best_res['n_total']})\n\n")
        
        f.write(f"帧级指标:\n")
        f.write(f"  Accuracy:    {best_res['frame_accuracy']:.4f}\n")
        f.write(f"  F1 (macro):  {best_res['f1_macro']:.4f}\n")
        f.write(f"  F1 (weighted): {best_res['f1_weighted']:.4f}\n\n")
        
        f.write(f"各受试者投票详情:\n")
        for person in sorted(best_res['person_results'].keys()):
            pr = best_res['person_results'][person]
            bt_cn = window_df[window_df['person_name'] == person]['body_type_cn'].iloc[0]
            wt = window_df[window_df['person_name'] == person]['weight_kg'].iloc[0]
            wt_str = f"{int(wt)}kg" if (wt is not None and not pd.isna(wt)) else "未知"
            f.write(f"  {'✓' if pr['correct'] else '✗'} {person}({bt_cn},{wt_str}): "
                    f"真实={label_cn[pr['true_label']]} "
                    f"投票={label_cn[pr['voted_label']]} "
                    f"置信度={pr['confidence']:.0%}\n")
        
        f.write(f"\n选中特征列表:\n")
        for i, feat in enumerate(fe.selected_features):
            f.write(f"  {i+1:2d}. {feat}\n")
        
        f.write(f"\n混淆矩阵 (帧级):\n")
        f.write(f"{best_res['confusion_matrix']}\n")
    
    # print(f"\n{'='*70}")
    # print(f"分类完成！所有结果已保存到: {OUTPUT_DIR}")
    # print(f"受试者准确率: {best_res['person_accuracy']:.0%} ({best_res['n_correct']}/{best_res['n_total']})")
    # print(f"{'='*70}")
    
    return classifier, eval_results, window_df


if __name__ == '__main__':
    main()
