"""
测试脚本：使用全50的矩阵作为输入，按每秒13帧的频率推入算法包
"""

import numpy as np
import time
from integrated_system import IntegratedSeatSystem


def main():
    # 初始化系统
    system = IntegratedSeatSystem('sensor_config.yaml')

    # 创建全50的传感器数据矩阵 (144个元素)
    sensor_data = np.full((1, 144), 50, dtype=np.uint8)

    # 帧率配置
    fps = 13  # 每秒13帧
    frame_interval = 1.0 / fps  # 每帧间隔约77ms

    # 运行时间（秒）
    run_duration = 10  # 运行10秒
    total_frames = fps * run_duration

    print("=" * 60)
    print(f"输入数据: 全50矩阵, shape={sensor_data.shape}")
    print(f"帧率: {fps} FPS, 帧间隔: {frame_interval*1000:.1f}ms")
    print(f"计划运行: {run_duration}秒, 共{total_frames}帧")
    print("=" * 60)

    start_time = time.time()

    for frame in range(1, total_frames + 1):
        frame_start = time.time()

        result = system.process_frame(sensor_data)

        print(f"\n--- 帧 {frame} ---")
        print(f"  座椅状态: {result['seat_state']}")
        print(f"  活体状态: {result['living_status']}")
        print(f"  体型: {result['body_type']}")
        print(f"  坐垫sum: {result['cushion_sum']:.1f}")
        print(f"  靠背sum: {result['backrest_sum']:.1f}")
        print(f"  活体置信度: {result['living_confidence']:.3f}")

        if result['control_command']:
            print(f"  控制指令: {result['control_command']}")
        else:
            print(f"  控制指令: 无")

        # 控制帧率：等待剩余时间
        elapsed = time.time() - frame_start
        sleep_time = frame_interval - elapsed
        if sleep_time > 0:
            time.sleep(sleep_time)

    total_time = time.time() - start_time
    print("\n" + "=" * 60)
    print(f"运行完成: 实际耗时 {total_time:.2f}秒, 共处理 {total_frames} 帧")
    print(f"实际帧率: {total_frames / total_time:.1f} FPS")


if __name__ == '__main__':
    main()
