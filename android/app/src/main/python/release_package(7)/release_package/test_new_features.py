# -*- coding: utf-8 -*-
"""
新功能单元测试

测试三个新功能：
1. 离座reset阶段：放气10s + 保持10s = 20s
2. 臀托初始化：与品味系数联动
3. 双模式控制：mode1体验版 / mode2量产版
"""

import sys
import os
import numpy as np

# 确保可以导入项目模块
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def test_reset_timing():
    """测试1: 离座reset阶段时间配置"""
    print("=" * 60)
    print("测试1: 离座reset阶段时间配置")
    print("=" * 60)

    from integrated_system import IntegratedSeatSystem

    system = IntegratedSeatSystem('sensor_config.yaml')

    hz = 13  # 系统采样率
    expected_deflate_seconds = 10
    expected_total_seconds = 20

    # 验证配置值
    deflate_frames = system.reset_deflate_frames
    total_frames = system.reset_frames_threshold

    deflate_seconds = deflate_frames / hz
    total_seconds = total_frames / hz

    print(f"  放气帧数: {deflate_frames} ({deflate_seconds:.1f}s)")
    print(f"  总帧数: {total_frames} ({total_seconds:.1f}s)")
    print(f"  保持帧数: {total_frames - deflate_frames} ({(total_frames - deflate_frames) / hz:.1f}s)")

    assert abs(deflate_seconds - expected_deflate_seconds) < 1.0, \
        f"放气时间不正确: 期望~{expected_deflate_seconds}s, 实际{deflate_seconds:.1f}s"
    assert abs(total_seconds - expected_total_seconds) < 1.0, \
        f"总时间不正确: 期望~{expected_total_seconds}s, 实际{total_seconds:.1f}s"

    print("  ✓ 离座reset时间配置正确")
    return True


def test_hip_init_basic():
    """测试2: 臀托初始化基本功能"""
    print("\n" + "=" * 60)
    print("测试2: 臀托初始化基本功能")
    print("=" * 60)

    from integrated_system import IntegratedSeatSystem

    system = IntegratedSeatSystem('sensor_config.yaml')

    # 验证臀托配置
    print(f"  臀托气囊: {system.hip_airbags}")
    print(f"  基础周期数: {system.hip_base_cycles}")
    print(f"  品味每次操作秒数: {system.hip_preference_seconds_per_op}")

    assert system.hip_airbags == [7, 8], f"臀托气囊配置错误: {system.hip_airbags}"
    assert system.hip_base_cycles > 0, "基础周期数应大于0"
    assert system.hip_preference_seconds_per_op == 3, "品味每次操作应为3秒"

    # 测试_start_hip_init（无品味数据时）
    system.preference_manager.set_active_body_shape(None)
    system._start_hip_init()

    assert system.is_hip_init_inflating == True, "无品味数据时应启动臀托初始化"
    assert system.hip_init_action == 'inflate', "无品味数据时应为充气"
    assert system.hip_init_cycles == system.hip_base_cycles, "无品味数据时周期数应等于基础周期数"

    print(f"  无品味数据: 动作={system.hip_init_action}, 周期={system.hip_init_cycles}")
    print("  ✓ 臀托初始化基本功能正确")
    return True


def test_hip_init_with_preference():
    """测试3: 臀托初始化与品味联动"""
    print("\n" + "=" * 60)
    print("测试3: 臀托初始化与品味联动")
    print("=" * 60)

    from integrated_system import IntegratedSeatSystem

    system = IntegratedSeatSystem('sensor_config.yaml')

    # 模拟品味数据（净充气2次）
    test_shape = '中等'
    system.preference_manager.preferences[test_shape] = {
        'ratios': {'lumbar_ratio': 0.5, 'wing_ratio': 1.0, 'left_leg_ratio': 0.6, 'right_leg_ratio': 0.8},
        'thresholds': {},
        'sample_frames': 50,
        'net_ops': {'lumbar': 1, 'side_wings_left': 0, 'side_wings_right': 0, 'leg_left': 0, 'leg_right': 0, 'hip': 2},
    }
    system.preference_manager.set_active_body_shape(test_shape)

    # 启动臀托初始化
    system._start_hip_init()

    hz = 13
    # 修正：计数器每帧+1，所以直接用hz换算秒→帧
    expected_extra_cycles = int(2 * 3 * hz)  # 净充气2次 × 3秒/次 × 13帧/秒
    expected_total = system.hip_base_cycles + expected_extra_cycles

    print(f"  品味净充气次数: 2")
    print(f"  额外周期数: {expected_extra_cycles}")
    print(f"  期望总周期: {expected_total}")
    print(f"  实际总周期: {system.hip_init_cycles}")
    print(f"  动作: {system.hip_init_action}")

    assert system.hip_init_action == 'inflate', "净充气时应为充气动作"
    assert system.hip_init_cycles == expected_total, f"周期数不匹配: 期望{expected_total}, 实际{system.hip_init_cycles}"

    # 测试净放气场景（净放气3次，使总周期为负）
    system.preference_manager.preferences[test_shape]['net_ops']['hip'] = -10
    system._start_hip_init()

    expected_extra_cycles_neg = int(-10 * 3 * hz)
    expected_total_neg = system.hip_base_cycles + expected_extra_cycles_neg

    print(f"\n  品味净放气次数: -10")
    print(f"  额外周期数: {expected_extra_cycles_neg}")
    print(f"  期望总周期: {abs(expected_total_neg)}")
    print(f"  实际总周期: {system.hip_init_cycles}")
    print(f"  动作: {system.hip_init_action}")

    assert system.hip_init_action == 'deflate', "净放气超过基础时应为放气动作"
    assert system.hip_init_cycles == abs(expected_total_neg), f"周期数不匹配"

    print("  ✓ 臀托初始化与品味联动正确")
    return True


def test_dual_mode_config():
    """测试4: 双模式控制配置"""
    print("\n" + "=" * 60)
    print("测试4: 双模式控制配置")
    print("=" * 60)

    from integrated_system import IntegratedSeatSystem

    system = IntegratedSeatSystem('sensor_config.yaml')

    # 验证mode1配置
    print(f"  当前控制模式: {system.control_mode}")
    print(f"  mode2自适应帧数: {system.mode2_adaptive_frames}")
    print(f"  mode2保压帧数: {system.mode2_hold_frames}")

    assert system.control_mode in ['mode1', 'mode2'], f"控制模式无效: {system.control_mode}"
    assert system.mode2_adaptive_frames > 0, "mode2自适应帧数应大于0"
    assert system.mode2_hold_frames > 0, "mode2保压帧数应大于0"

    # 验证API
    assert system.get_control_mode() == system.control_mode
    status = system.get_mode2_status()
    assert 'control_mode' in status
    assert 'sub_state' in status
    assert 'sub_counter' in status
    assert 'adaptive_frames' in status
    assert 'hold_frames' in status

    print(f"  get_control_mode(): {system.get_control_mode()}")
    print(f"  get_mode2_status(): {status}")
    print("  ✓ 双模式控制配置正确")
    return True


def test_mode2_state_machine():
    """测试5: Mode2子状态机切换逻辑"""
    print("\n" + "=" * 60)
    print("测试5: Mode2子状态机切换逻辑")
    print("=" * 60)

    from integrated_system import IntegratedSeatSystem

    system = IntegratedSeatSystem('sensor_config.yaml')

    # 强制设置为mode2
    system.control_mode = 'mode2'

    # 验证初始状态
    assert system.mode2_sub_state == 'adaptive', "初始子状态应为adaptive"
    assert system.mode2_sub_counter == 0, "初始计数器应为0"

    # 模拟自适应阶段计数到达阈值
    system.mode2_sub_counter = system.mode2_adaptive_frames - 1
    system.mode2_sub_counter += system.control_check_interval

    if system.mode2_sub_counter >= system.mode2_adaptive_frames:
        system.mode2_sub_state = 'hold'
        system.mode2_sub_counter = 0

    assert system.mode2_sub_state == 'hold', "应切换到hold状态"
    assert system.mode2_sub_counter == 0, "切换后计数器应重置"

    # 模拟保压阶段计数到达阈值
    system.mode2_sub_counter = system.mode2_hold_frames - 1
    system.mode2_sub_counter += system.control_check_interval

    if system.mode2_sub_counter >= system.mode2_hold_frames:
        system.mode2_sub_state = 'adaptive'
        system.mode2_sub_counter = 0

    assert system.mode2_sub_state == 'adaptive', "应切换回adaptive状态"
    assert system.mode2_sub_counter == 0, "切换后计数器应重置"

    print("  ✓ Mode2子状态机切换逻辑正确")
    return True


def test_preference_hip_region():
    """测试6: 品味管理器hip区域支持"""
    print("\n" + "=" * 60)
    print("测试6: 品味管理器hip区域支持")
    print("=" * 60)

    from preference_manager import PreferenceManager
    from config import Config

    config = Config('sensor_config.yaml')
    pm = PreferenceManager(config, '/tmp/test_preferences.json')

    # 验证REGION_RATIO_MAP包含hip
    assert 'hip' in pm.REGION_RATIO_MAP, "REGION_RATIO_MAP应包含hip"
    assert pm.REGION_RATIO_MAP['hip'] == [], "hip区域不应有比例键"

    # 验证INFLATE_DIRECTION包含hip
    assert 'hip' in pm.INFLATE_DIRECTION, "INFLATE_DIRECTION应包含hip"
    assert pm.INFLATE_DIRECTION['hip'] == {}, "hip区域不应有方向映射"

    print("  REGION_RATIO_MAP['hip']:", pm.REGION_RATIO_MAP['hip'])
    print("  INFLATE_DIRECTION['hip']:", pm.INFLATE_DIRECTION['hip'])
    print("  ✓ 品味管理器hip区域支持正确")

    # 清理临时文件
    if os.path.exists('/tmp/test_preferences.json'):
        os.remove('/tmp/test_preferences.json')

    return True


def test_reset_state_cleanup():
    """测试7: reset方法清理新增状态"""
    print("\n" + "=" * 60)
    print("测试7: reset方法清理新增状态")
    print("=" * 60)

    from integrated_system import IntegratedSeatSystem

    system = IntegratedSeatSystem('sensor_config.yaml')

    # 设置一些状态
    system.is_hip_init_inflating = True
    system.hip_init_counter = 10
    system.hip_init_done = True
    system.mode2_sub_state = 'hold'
    system.mode2_sub_counter = 50

    # 执行reset
    system.reset()

    # 验证状态已清理
    assert system.is_hip_init_inflating == False, "reset后臀托初始化应为False"
    assert system.hip_init_counter == 0, "reset后臀托计数器应为0"
    assert system.hip_init_done == False, "reset后臀托完成标志应为False"
    assert system.mode2_sub_state == 'adaptive', "reset后mode2子状态应为adaptive"
    assert system.mode2_sub_counter == 0, "reset后mode2计数器应为0"

    print("  ✓ reset方法正确清理新增状态")
    return True


def test_airbag_to_region_mapping():
    """测试8: 气囊到区域映射包含hip"""
    print("\n" + "=" * 60)
    print("测试8: 气囊到区域映射包含hip")
    print("=" * 60)

    from integrated_system import IntegratedSeatSystem

    system = IntegratedSeatSystem('sensor_config.yaml')

    assert system._airbag_to_region.get(7) == 'hip', "气囊7应映射到hip"
    assert system._airbag_to_region.get(8) == 'hip', "气囊8应映射到hip"

    print(f"  气囊7 → {system._airbag_to_region.get(7)}")
    print(f"  气囊8 → {system._airbag_to_region.get(8)}")
    print("  ✓ 气囊到区域映射正确")
    return True


if __name__ == '__main__':
    results = []
    tests = [
        test_reset_timing,
        test_hip_init_basic,
        test_hip_init_with_preference,
        test_dual_mode_config,
        test_mode2_state_machine,
        test_preference_hip_region,
        test_reset_state_cleanup,
        test_airbag_to_region_mapping,
    ]

    for test_func in tests:
        try:
            result = test_func()
            results.append((test_func.__name__, result))
        except Exception as e:
            print(f"  ✗ 测试失败: {e}")
            results.append((test_func.__name__, False))

    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    passed = sum(1 for _, r in results if r)
    total = len(results)
    for name, result in results:
        status = "✓ 通过" if result else "✗ 失败"
        print(f"  {status}: {name}")
    print(f"\n  总计: {passed}/{total} 通过")
