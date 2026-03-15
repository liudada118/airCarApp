"""
集成座椅控制系统使用示例

演示如何：
1. 初始化系统
2. 推入传感器数据
3. 解析算法包输出

【输入数据格式】
传感器数据: np.ndarray, 形状(1, 144), dtype=uint8
- 前72个元素: 靠背传感器 [左侧小矩形6 + 右侧小矩形6 + 中间大矩阵60]
- 后72个元素: 坐垫传感器 [左侧小矩形6 + 右侧小矩形6 + 中间大矩阵60]
- 数据范围: 0-255 (压力值)

【输出数据格式】
process_frame() 返回字典，包含以下关键字段：
- control_command: 54字节控制指令 (或None)
- living_status: 活体状态 ("活体"/"静物"/"检测中"/"离座"/"未启用")
- body_type: 体型分类 ("大人"/"小孩"/"未判断")
- seat_state: 座椅状态 ("OFF_SEAT"/"CUSHION_ONLY"/"ADAPTIVE_LOCKED"/"RESETTING")
- cushion_sum: 坐垫压力总和
- backrest_sum: 靠背压力总和
- living_confidence: 活体检测置信度 [0.0-1.0]
- control_decision_data: 控制决策详细数据 (腰托/侧翼/腿托)
- body_features: 体型检测详细特征
- frame_count: 当前帧计数

详细字段说明请参考 print_result() 函数的注释
"""

import numpy as np
from integrated_system import IntegratedSeatSystem

def server(sensor_data):
    newdata = np.array(sensor_data, dtype=np.uint8)
    # print("111")
    # return 111
    result = IntegratedSeatSystem.process_frame(newdata)


    return result

def main():
    """主函数"""
    # print("=" * 60)
    # print("集成座椅控制系统使用示例")
    # print("=" * 60)



    # ========================================
    # 步骤 1: 初始化系统
    # ========================================
    # print("\n[步骤 1] 初始化集成系统...")
    system = IntegratedSeatSystem('sensor_config.yaml')
    # print("系统初始化完成\n")

    # ========================================
    # 步骤 2: 模拟数据推送
    # ========================================
    # print("[步骤 2] 开始模拟数据推送...\n")

    # 模拟不同场景
    scenarios = [
        ("离座状态", 0, 100),           # 前100帧：离座
        ("仅坐垫有压力", 100, 200),     # 100-200帧：坐垫有压力
        ("全座有压力", 200, 400),       # 200-400帧：坐垫+靠背都有压力
        ("保持在座", 400, 500),         # 400-500帧：保持在座
        ("准备离座", 500, 600),         # 500-600帧：离座
    ]

    for scenario_name, start_frame, end_frame in scenarios:
        # print(f"\n{'=' * 40}")
        # print(f"场景: {scenario_name} (帧 {start_frame}-{end_frame})")
        # print(f"{'=' * 40}")

        for frame_idx in range(start_frame, end_frame):
            # 生成模拟数据
            sensor_data = generate_simulated_data(scenario_name, frame_idx)

            # 处理一帧数据
            result = system.process_frame(sensor_data)

            # 每10帧打印一次结果
            if frame_idx % 10 == 0 or frame_idx in [start_frame, end_frame - 1]:
                print_result(result)

    # ========================================
    # 步骤 3: 演示参数修改
    # ========================================
    # print("\n\n[步骤 3] 演示运行时参数修改...")
    # print("修改坐垫阈值从 500 → 800")
    system.set_param('cushion_sum_threshold', 800)

    # print("修改全座帧数从 130 → 65")
    system.set_param('full_seat_frames_threshold', 65)

    # ========================================
    # 步骤 4: 系统重置
    # ========================================
    # print("\n[步骤 4] 重置系统...")
    system.reset()
    # print("系统已重置")

    # print("\n" + "=" * 60)
    # print("示例完成")
    # print("=" * 60)


def generate_simulated_data(scenario: str, frame_idx: int) -> np.ndarray:
    """
    生成模拟传感器数据

    Args:
        scenario: str - 场景名称，可选值：
            - "离座状态": 模拟无人坐在座椅上
            - "仅坐垫有压力": 模拟人坐下但未靠背
            - "全座有压力": 模拟人坐下并靠在靠背上
            - "保持在座": 模拟人保持坐姿，压力有自然波动
            - "准备离座": 模拟人准备起身，压力逐渐减小

        frame_idx: int - 当前帧索引（从0开始）

    Returns:
        np.ndarray - 形状为(1, 144)的传感器数据数组，dtype=uint8
            - 数据范围: 0-255
            - 前72个元素: 靠背传感器数据
                - [0:12]: 左右两侧小矩形区域（6+6）
                - [12:72]: 中间大矩阵区域（10行×6列=60）
            - 后72个元素: 坐垫传感器数据
                - [72:84]: 左右两侧小矩形区域（6+6）
                - [84:144]: 中间大矩阵区域（10行×6列=60）
    """
    # 基础数据（全0）
    data = np.zeros(144, dtype=np.uint8)

    if scenario == "离座状态":
        # 离座：所有值很小
        data = np.random.randint(0, 10, size=144, dtype=np.uint8)

    elif scenario == "仅坐垫有压力":
        # 坐垫有压力，靠背压力小
        # 前72个是靠背
        data[:72] = np.random.randint(0, 20, size=72, dtype=np.uint8)
        # 后72个是坐垫（中间矩阵有较大压力）
        data[72:84] = np.random.randint(0, 20, size=12, dtype=np.uint8)  # 左右小矩形
        data[84:144] = np.random.randint(40, 80, size=60, dtype=np.uint8)  # 中间矩阵

    elif scenario == "全座有压力":
        # 坐垫和靠背都有压力
        # 靠背（中间矩阵有较大压力）
        data[:12] = np.random.randint(0, 20, size=12, dtype=np.uint8)  # 左右小矩形
        data[12:72] = np.random.randint(30, 60, size=60, dtype=np.uint8)  # 中间矩阵
        # 坐垫（中间矩阵有较大压力）
        data[72:84] = np.random.randint(0, 20, size=12, dtype=np.uint8)  # 左右小矩形
        data[84:144] = np.random.randint(40, 80, size=60, dtype=np.uint8)  # 中间矩阵

    elif scenario == "保持在座":
        # 类似"全座有压力"，略有波动
        offset = int(10 * np.sin(frame_idx * 0.1))
        data[:12] = np.random.randint(0, 20, size=12, dtype=np.uint8)
        data[12:72] = np.clip(
            np.random.randint(30, 60, size=60).astype(np.int32) + offset,
            0, 255
        ).astype(np.uint8)
        data[72:84] = np.random.randint(0, 20, size=12, dtype=np.uint8)
        data[84:144] = np.clip(
            np.random.randint(40, 80, size=60).astype(np.int32) + offset,
            0, 255
        ).astype(np.uint8)

    elif scenario == "准备离座":
        # 压力逐渐减小
        decay = max(0, 1 - (frame_idx - 500) / 100)
        data = (np.random.randint(20, 50, size=144, dtype=np.uint8) * decay).astype(np.uint8)

    return data.reshape(1, 144)


def print_result(result: dict):
    """
    打印算法输出结果

    Args:
        result: dict - process_frame返回的结果字典，包含以下字段：

            【核心输出字段】
            - 'control_command': bytes | None
                54字节的控制指令数据，None表示本帧无需发送指令
                协议格式：帧头(1字节) + 24个气囊状态(48字节) + 模式(1字节) + 方向(1字节) + 帧尾(4字节)

            - 'living_status': str - 活体状态，可能的值：
                "活体": 检测到活体（人）
                "静物": 检测到静物（如箱子、包裹等）
                "检测中": 正在进行活体检测，结果尚未确定
                "离座": 座椅上无人
                "未启用": 活体检测功能未启用

            - 'body_type': str - 体型分类，可能的值：
                "大人": 检测到成人体型
                "小孩": 检测到儿童体型
                "未判断": 尚未完成体型判断或非活体状态

            - 'seat_state': str - 座椅状态机当前状态，可能的值：
                "OFF_SEAT": 离座状态
                "CUSHION_ONLY": 仅坐垫有压力（进行活体+体型检测阶段）
                "FULL_SEAT_WAITING": 全座有压力，等待开启自适应锁（已废弃）
                "ADAPTIVE_LOCKED": 自适应调节锁已开启（可调节气囊）
                "RESETTING": 离座复位中（气囊放气阶段）

            【传感器数据字段】
            - 'cushion_sum': float - 坐垫中间矩阵压力总和（滤波后或原始值）
            - 'backrest_sum': float - 靠背中间矩阵压力总和（滤波后或原始值）

            【检测置信度字段】
            - 'living_confidence': float - 活体检测置信度，范围[0.0, 1.0]
                值越大表示判断越可靠

            【详细特征字段】
            - 'body_features': dict - 体型检测的详细特征数据，包含：
                'cushion': dict - 坐垫特征
                    'original_sum': float - 原始压力总和
                    'filtered_sum': float - 滤波后压力总和
                    'max_value': int - 最大压力值
                    'center_of_mass': tuple - 质心坐标(row, col)
                'backrest': dict - 靠背特征（结构同上）
                'body_size_type': str - 体型分类结果（"大人"/"小孩"/"未判断"）
                'body_size_raw': float - 体型原始评分值

            - 'control_decision_data': dict - 控制决策的详细数据，包含：
                'lumbar': dict - 腰托控制数据
                    'upper_pressure': float - 靠背上部压力
                    'lower_pressure': float - 靠背下部压力
                    'ratio': float - 上下部压力比值
                    'threshold_passed': bool - 是否超过阈值
                    'action': str - 控制动作（'INFLATE'/'DEFLATE'/'HOLD'）
                'side_wings': dict - 侧翼控制数据
                    'left_pressure': float - 左侧压力
                    'right_pressure': float - 右侧压力
                    'ratio': float - 左右压力比值
                    'left_action': str - 左侧翼动作
                    'right_action': str - 右侧翼动作
                'leg_support': dict - 腿托控制数据
                    'butt_pressure': float - 臀部区域压力
                    'leg_pressure': float - 腿部区域压力
                    'ratio': float - 腿臀压力比值
                    'action': str - 控制动作

            【帧计数字段】
            - 'frame_count': int - 当前帧计数（从1开始累加）
    """
    # 只输出控制指令信息
    if result['control_command']:
        # print(f"\n  帧 {result['frame_count']:4d} | ✓ 控制指令: {len(result['control_command'])} 字节")
        # 解析并显示具体气囊动作
        parse_control_command(result['control_command'])


def parse_control_command(command: list[int] | bytes):
    """
    解析控制指令（可选）

    Args:
        command: list[int] | bytes - 55个整数的列表或55字节的二进制数据

            【协议帧格式】（总长55元素/字节）
            [0]: 帧头（0x1F = 31）

            [1-48]: 24个气囊的控制数据（每个气囊占2元素）
                格式：气囊ID(1元素) + 档位(1元素)
                - 气囊ID: 1-24，对应24个气囊编号
                - 档位值：
                    0x00: HOLD/停止（保持当前状态）
                    0x03: 充气（3档充气）
                    0x04: 放气（初始档/放气）

            【气囊功能分组】
            - 腰托: 气囊5, 6
            - 左侧翼: 气囊2, 4
            - 右侧翼: 气囊1, 3
            - 腿托: 气囊9, 10

            [49]: 工作模式（0x00=自动模式）
            [50]: 方向标识（0x00=下行）
            [51-54]: 帧尾（0xAA, 0x55, 0x03, 0x99 = 170, 85, 3, 153）

    功能：
        解析并打印正在执行动作的气囊信息（忽略保持状态的气囊）
    """
    if len(command) != 55:
        # print(f"            ✗ 指令长度错误: {len(command)} 元素")
        return

    # 解析气囊状态
    active_airbags = []
    for i in range(24):
        airbag_id = command[1 + i * 2]
        gear = command[1 + i * 2 + 1]
        if gear != 0x00:  # 不是HOLD
            action = "充气" if gear == 0x03 else "放气"
            active_airbags.append(f"气囊{airbag_id}({action})")

    if active_airbags:
        # print(f"            → {', '.join(active_airbags)}")


if __name__ == '__main__':
    main()
