# -*- coding: utf-8 -*-
"""
训练体型三分类模型并保存为 .pkl 文件

使用 body_type_classifier 算法包中的完整流程：
1. 加载CSV数据
2. 特征工程（全144点 + 滑动窗口聚合）
3. 使用全部数据训练最佳模型（KNN5_dist）
4. 保存模型到 model/body_shape_model.pkl

运行方式:
    python train_model.py
"""

import os
import sys

# 确保能导入 body_type_classifier 包
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from body_type_classifier.data_loader import DataLoader
from body_type_classifier.feature_engineer import FeatureEngineer
from body_type_classifier.classifier import BodyTypeClassifier


def main():
    # 数据目录
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model')
    os.makedirs(output_dir, exist_ok=True)
    
    model_path = os.path.join(output_dir, 'body_shape_model.pkl')
    
    # print("=" * 60)
    # print("体型三分类模型训练")
    # print("=" * 60)
    
    # 1. 加载数据
    # print("\n[1/5] 加载数据...")
    loader = DataLoader()
    all_data = loader.load_from_directory(data_dir)
    # all_data 是帧级列表，每个元素是一帧的字典
    persons = set(d['person_name'] for d in all_data)
    # print(f"  加载了 {len(persons)} 个受试者的数据，共 {len(all_data)} 帧")
    from collections import Counter
    person_counts = Counter(d['person_name'] for d in all_data)
    for name, count in person_counts.items():
        bt = next(d['body_type_cn'] for d in all_data if d['person_name'] == name)
        # print(f"    - {name}: {bt} ({count} 帧)")
    
    # 2. 特征工程
    # print("\n[2/5] 特征工程...")
    fe = FeatureEngineer(window_size=30, stride=15, n_select=40)
    frame_df = fe.build_frame_feature_dataframe(all_data)
    # print(f"  帧级特征: {frame_df.shape}")
    
    windowed_df = fe.build_windowed_features(frame_df)
    # print(f"  窗口级特征: {windowed_df.shape}")
    
    # 3. 准备数据
    # print("\n[3/5] 准备训练数据...")
    classifier = BodyTypeClassifier(feature_engineer=fe)
    X, y, groups = classifier.prepare_data(windowed_df)
    # print(f"  特征矩阵: {X.shape}, 标签: {y.shape}")
    # print(f"  选中特征数: {len(fe.selected_features)}")
    
    # 4. 评估（可选，验证模型效果）
    # print("\n[4/5] LOSO-CV 评估...")
    results = classifier.evaluate_with_soft_voting(X, y, groups, verbose=True)
    best_name = classifier.select_best_model('person_accuracy')
    best_result = results[best_name]
    # print(f"\n  最佳模型: {best_name}")
    # print(f"  受试者准确率: {best_result['person_accuracy']:.0%} "
          f"({best_result['n_correct']}/{best_result['n_total']})")
    
    # 5. 训练最终模型并保存
    # print(f"\n[5/5] 训练最终模型 ({best_name}) 并保存...")
    classifier.train_final_model(X, y, model_name=best_name)
    classifier.save_model(model_path)
    # print(f"  模型已保存到: {model_path}")
    
    # 验证加载
    # print("\n验证模型加载...")
    loaded = BodyTypeClassifier.load_model(model_path)
    # print(f"  模型类型: {loaded.best_model_name}")
    # print(f"  特征工程器: 已恢复 (n_select={loaded.feature_engineer.n_select})")
    
    # print("\n" + "=" * 60)
    # print("训练完成！")
    # print(f"模型文件: {model_path}")
    # print("=" * 60)


if __name__ == '__main__':
    main()
