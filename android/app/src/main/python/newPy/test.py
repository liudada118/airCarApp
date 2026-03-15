"""
读取 CSV 文件，计算 carAirdata 列的滤波后 sum 值
支持分压矫正处理
"""
import pandas as pd
import numpy as np
import ast
import sys
import json

# 增加递归限制（用于 DFS）
sys.setrecursionlimit(10000)

# 分压矫正常量
VOLTAGE_DIVIDER_VALUE = 4096 / 6  # 约等于1365


def apply_voltage_divider_correction(matrix: np.ndarray) -> np.ndarray:
    """
    对 10x6 矩阵应用分压矫正（按列处理）

    公式：
        den = itemValue + value - sumTotal
        if den <= 0: den = 1
        result = int(itemValue / den)

    Args:
        matrix: 10x6 压力矩阵

    Returns:
        矫正后的 10x6 矩阵
    """
    rows, cols = matrix.shape
    corrected = np.zeros_like(matrix, dtype=np.float64)

    for col in range(cols):
        column_data = matrix[:, col].astype(np.float64)
        sum_total = np.sum(column_data)

        for row in range(rows):
            item_value = column_data[row]
            denominator = item_value + VOLTAGE_DIVIDER_VALUE - sum_total

            if denominator <= 0:
                denominator = 1

            corrected[row, col] = int(item_value / denominator)

    # 将结果除数2
    # corrected = corrected / 10
    # 限制在 0-255 范围内
    corrected = np.clip(corrected, 0, 255).astype(np.uint8)
    return corrected


def reconstruct_144_array(original_72: np.ndarray, corrected_matrix: np.ndarray) -> np.ndarray:
    """
    将矫正后的 10x6 矩阵重新组装回 72 元素数组

    Args:
        original_72: 原始 72 元素数组（包含左右小矩形）
        corrected_matrix: 矫正后的 10x6 矩阵

    Returns:
        重组后的 72 元素数组（左右小矩形保持原值，中间矩阵使用矫正值）
    """
    result = original_72.copy()
    # [0-5]: 左侧小矩形（保持原值）
    # [6-11]: 右侧小矩形（保持原值）
    # [12-71]: 中间 10x6 矩阵（使用矫正值）
    result[12:] = corrected_matrix.flatten()
    return result


def remove_small_components(mask: np.ndarray, min_size: int = 6) -> np.ndarray:
    """
    移除小于指定大小的连通区域（8联通）
    """
    rows, cols = mask.shape
    labeled = np.zeros_like(mask, dtype=np.int32)
    result = np.zeros_like(mask)
    label = 0

    directions = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]

    def dfs(r, c, current_label, points):
        if r < 0 or r >= rows or c < 0 or c >= cols:
            return
        if mask[r, c] == 0 or labeled[r, c] != 0:
            return
        labeled[r, c] = current_label
        points.append((r, c))
        for dr, dc in directions:
            dfs(r + dr, c + dc, current_label, points)

    for i in range(rows):
        for j in range(cols):
            if mask[i, j] == 1 and labeled[i, j] == 0:
                label += 1
                points = []
                dfs(i, j, label, points)
                if len(points) >= min_size:
                    for r, c in points:
                        result[r, c] = 1

    return result


def calculate_filtered_sum(matrix: np.ndarray, threshold: int = 20, min_size: int = 6) -> float:
    """
    计算滤波后的 sum 值

    Args:
        matrix: 10x6 压力矩阵
        threshold: 压力阈值（低于此值视为无效）
        min_size: 最小连通区域大小

    Returns:
        滤波后的 sum 值
    """
    # 1. 生成二值掩码
    original_mask = (matrix >= threshold).astype(np.uint8)

    # 2. 滤除小连通区域
    filtered_mask = remove_small_components(original_mask, min_size=min_size)

    # 3. 计算滤波后的 sum
    filtered_sum = np.sum(matrix[filtered_mask == 1])

    return float(filtered_sum)


def parse_carairdata(data_str: str) -> np.ndarray:
    """解析 carAirdata 字符串为 numpy 数组"""
    # 移除方括号和空格，解析为列表
    arr = ast.literal_eval(data_str)
    return np.array(arr, dtype=np.uint8)


def split_and_reshape(data_144: np.ndarray):
    """
    拆分 144 元素数据为靠背和坐垫的 10x6 矩阵

    数据结构：
    - [0-71]: 靠背（[0-5]左小矩形, [6-11]右小矩形, [12-71]中间10x6矩阵）
    - [72-143]: 坐垫（同上结构）
    """
    # 拆分靠背和坐垫
    backrest_data = data_144[:72]
    cushion_data = data_144[72:144]

    # 提取中间 10x6 矩阵（跳过前 12 个元素的左右小矩形）
    backrest_matrix = backrest_data[12:].reshape(10, 6)
    cushion_matrix = cushion_data[12:].reshape(10, 6)

    return backrest_matrix, cushion_matrix


def process_csv(input_path: str, output_path: str, threshold: int = 20, min_size: int = 6):
    """
    处理 CSV 文件，添加滤波后的 sum 列（支持分压矫正）

    Args:
        input_path: 输入 CSV 路径
        output_path: 输出 CSV 路径
        threshold: 压力阈值
        min_size: 最小连通区域大小
    """
    # print(f"读取文件: {input_path}")
    df = pd.read_csv(input_path)

    # print(f"总行数: {len(df)}")
    # print(f"列名: {list(df.columns)}")

    # 原始数据列
    cushion_filtered_sums = []
    backrest_filtered_sums = []
    cushion_original_sums = []
    backrest_original_sums = []

    # 矫正后数据列
    corrected_data_144_list = []  # 矫正后的 144 元素 JSON
    cushion_corrected_original_sums = []  # 矫正后坐垫原始 sum
    backrest_corrected_original_sums = []  # 矫正后靠背原始 sum
    cushion_corrected_filtered_sums = []  # 矫正后坐垫滤波 sum
    backrest_corrected_filtered_sums = []  # 矫正后靠背滤波 sum

    for idx, row in df.iterrows():
        try:
            # 解析 carAirdata
            data_144 = parse_carairdata(row['carAirdata'])

            # 拆分靠背和坐垫原始 72 元素数据
            backrest_data = data_144[:72]
            cushion_data = data_144[72:144]

            # 拆分和重塑（原始）
            backrest_matrix, cushion_matrix = split_and_reshape(data_144)

            # ========== 原始数据指标 ==========
            cushion_original_sum = float(np.sum(cushion_matrix))
            backrest_original_sum = float(np.sum(backrest_matrix))
            cushion_filtered_sum = calculate_filtered_sum(cushion_matrix, threshold, min_size)
            backrest_filtered_sum = calculate_filtered_sum(backrest_matrix, threshold, min_size)

            cushion_original_sums.append(cushion_original_sum)
            backrest_original_sums.append(backrest_original_sum)
            cushion_filtered_sums.append(cushion_filtered_sum)
            backrest_filtered_sums.append(backrest_filtered_sum)

            # ========== 分压矫正处理 ==========
            # 对中间 10x6 矩阵应用分压矫正
            backrest_corrected_matrix = apply_voltage_divider_correction(backrest_matrix)
            cushion_corrected_matrix = apply_voltage_divider_correction(cushion_matrix)

            # 重组 144 元素数组（左右小矩形保持原值）
            backrest_corrected_72 = reconstruct_144_array(backrest_data, backrest_corrected_matrix)
            cushion_corrected_72 = reconstruct_144_array(cushion_data, cushion_corrected_matrix)

            # 合并为 144 元素数组
            corrected_data_144 = np.concatenate([backrest_corrected_72, cushion_corrected_72])
            corrected_data_144_list.append(json.dumps(corrected_data_144.tolist()))

            # ========== 矫正后数据指标 ==========
            cushion_corrected_original_sum = float(np.sum(cushion_corrected_matrix))
            backrest_corrected_original_sum = float(np.sum(backrest_corrected_matrix))
            cushion_corrected_filtered_sum = calculate_filtered_sum(cushion_corrected_matrix, threshold, min_size)
            backrest_corrected_filtered_sum = calculate_filtered_sum(backrest_corrected_matrix, threshold, min_size)

            cushion_corrected_original_sums.append(cushion_corrected_original_sum)
            backrest_corrected_original_sums.append(backrest_corrected_original_sum)
            cushion_corrected_filtered_sums.append(cushion_corrected_filtered_sum)
            backrest_corrected_filtered_sums.append(backrest_corrected_filtered_sum)

            if (idx + 1) % 100 == 0:
                # print(f"处理进度: {idx + 1}/{len(df)}")

        except Exception as e:
            # print(f"第 {idx} 行处理失败: {e}")
            # 原始数据
            cushion_original_sums.append(0.0)
            backrest_original_sums.append(0.0)
            cushion_filtered_sums.append(0.0)
            backrest_filtered_sums.append(0.0)
            # 矫正后数据
            corrected_data_144_list.append(json.dumps([0] * 144))
            cushion_corrected_original_sums.append(0.0)
            backrest_corrected_original_sums.append(0.0)
            cushion_corrected_filtered_sums.append(0.0)
            backrest_corrected_filtered_sums.append(0.0)

    # 添加原始数据列
    df['cushion_original_sum'] = cushion_original_sums
    df['backrest_original_sum'] = backrest_original_sums
    df['cushion_filtered_sum'] = cushion_filtered_sums
    df['backrest_filtered_sum'] = backrest_filtered_sums

    # 添加矫正后数据列
    df['carAirdata_corrected'] = corrected_data_144_list
    df['cushion_corrected_original_sum'] = cushion_corrected_original_sums
    df['backrest_corrected_original_sum'] = backrest_corrected_original_sums
    df['cushion_corrected_filtered_sum'] = cushion_corrected_filtered_sums
    df['backrest_corrected_filtered_sum'] = backrest_corrected_filtered_sums

    # 保存
    df.to_csv(output_path, index=False, encoding='utf-8-sig')
    # print(f"\n处理完成，已保存到: {output_path}")

    # 显示统计信息
    # print(f"\n========== 原始数据统计 ==========")
    # print(f"  坐垫原始 sum: min={min(cushion_original_sums):.0f}, max={max(cushion_original_sums):.0f}, avg={np.mean(cushion_original_sums):.0f}")
    # print(f"  坐垫滤波 sum: min={min(cushion_filtered_sums):.0f}, max={max(cushion_filtered_sums):.0f}, avg={np.mean(cushion_filtered_sums):.0f}")
    # print(f"  靠背原始 sum: min={min(backrest_original_sums):.0f}, max={max(backrest_original_sums):.0f}, avg={np.mean(backrest_original_sums):.0f}")
    # print(f"  靠背滤波 sum: min={min(backrest_filtered_sums):.0f}, max={max(backrest_filtered_sums):.0f}, avg={np.mean(backrest_filtered_sums):.0f}")

    # print(f"\n========== 矫正后数据统计 ==========")
    # print(f"  坐垫原始 sum: min={min(cushion_corrected_original_sums):.0f}, max={max(cushion_corrected_original_sums):.0f}, avg={np.mean(cushion_corrected_original_sums):.0f}")
    # print(f"  坐垫滤波 sum: min={min(cushion_corrected_filtered_sums):.0f}, max={max(cushion_corrected_filtered_sums):.0f}, avg={np.mean(cushion_corrected_filtered_sums):.0f}")
    # print(f"  靠背原始 sum: min={min(backrest_corrected_original_sums):.0f}, max={max(backrest_corrected_original_sums):.0f}, avg={np.mean(backrest_corrected_original_sums):.0f}")
    # print(f"  靠背滤波 sum: min={min(backrest_corrected_filtered_sums):.0f}, max={max(backrest_corrected_filtered_sums):.0f}, avg={np.mean(backrest_corrected_filtered_sums):.0f}")


def process_directory(input_dir: str, output_dir: str = None, threshold: int = 20, min_size: int = 6):
    """
    批量处理目录下的所有 CSV 文件

    Args:
        input_dir: 输入目录路径
        output_dir: 输出目录路径（默认与输入目录相同）
        threshold: 压力阈值
        min_size: 最小连通区域大小
    """
    import os
    import glob

    if output_dir is None:
        output_dir = input_dir

    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)

    # 查找所有 CSV 文件（排除已处理的文件）
    csv_files = glob.glob(os.path.join(input_dir, "*.csv"))
    csv_files = [f for f in csv_files if not f.endswith("_with_filtered_sum.csv")]

    if not csv_files:
        # print(f"目录 {input_dir} 中未找到 CSV 文件")
        return

    # print(f"\n{'='*60}")
    # print(f"批量处理模式")
    # print(f"输入目录: {input_dir}")
    # print(f"输出目录: {output_dir}")
    # print(f"找到 {len(csv_files)} 个 CSV 文件")
    # print(f"{'='*60}\n")

    success_count = 0
    fail_count = 0

    for i, input_path in enumerate(csv_files, 1):
        filename = os.path.basename(input_path)
        name_without_ext = os.path.splitext(filename)[0]
        output_path = os.path.join(output_dir, f"{name_without_ext}_with_filtered_sum.csv")

        # print(f"\n[{i}/{len(csv_files)}] 处理: {filename}")
        # print("-" * 40)

        try:
            process_csv(input_path, output_path, threshold, min_size)
            success_count += 1
        except Exception as e:
            # print(f"处理失败: {e}")
            fail_count += 1

    # print(f"\n{'='*60}")
    # print(f"批量处理完成")
    # print(f"  成功: {success_count} 个")
    # print(f"  失败: {fail_count} 个")
    # print(f"{'='*60}")


if __name__ == "__main__":
    import os
    import sys

    # 滤波参数（与 control.py 中 BodyTypeDetector 一致）
    THRESHOLD = 20      # 压力阈值
    MIN_SIZE = 6        # 最小连通区域大小

    # 默认目录
    default_dir = r"c:\github\car"

    # 支持命令行参数
    if len(sys.argv) > 1:
        # 命令行参数模式
        input_path = sys.argv[1]

        if os.path.isdir(input_path):
            # 目录模式
            process_directory(input_path, None, THRESHOLD, MIN_SIZE)
        elif os.path.isfile(input_path):
            # 单文件模式
            name_without_ext = os.path.splitext(input_path)[0]
            output_path = f"{name_without_ext}_with_filtered_sum.csv"
            process_csv(input_path, output_path, THRESHOLD, MIN_SIZE)
        else:
            # print(f"路径不存在: {input_path}")
            sys.exit(1)
    else:
        # 交互式选择模式
        # print("="*60)
        # print("座椅压力数据处理工具（支持分压矫正）")
        # print("="*60)
        # print("\n选择处理模式:")
        # print("  1. 处理单个 CSV 文件")
        # print("  2. 批量处理目录下所有 CSV 文件")
        # print()

        choice = input("请输入选项 (1/2，默认2): ").strip() or "2"

        if choice == "1":
            # 单文件模式
            input_path = input(f"请输入 CSV 文件路径: ").strip()
            if not input_path:
                # print("未输入文件路径，退出")
                sys.exit(1)

            if not os.path.isfile(input_path):
                # print(f"文件不存在: {input_path}")
                sys.exit(1)

            name_without_ext = os.path.splitext(input_path)[0]
            output_path = f"{name_without_ext}_with_filtered_sum.csv"

            process_csv(input_path, output_path, THRESHOLD, MIN_SIZE)
        else:
            # 批量模式
            input_dir = input(f"请输入目录路径 (默认: {default_dir}): ").strip() or default_dir

            if not os.path.isdir(input_dir):
                # print(f"目录不存在: {input_dir}")
                sys.exit(1)

            process_directory(input_dir, None, THRESHOLD, MIN_SIZE)
