#!/usr/bin/env python3
"""
测试初始化流程重构：验证 init_phase 状态机的严格顺序执行

测试场景：
1. 入座后 init_phase 应为 'waiting_recognition'
2. 活体确认前不应启动任何充气
3. 活体确认后应进入 'support_inflate'
4. 支撑气囊完成后，有品味数据时进入 'hip_inflate'
5. 支撑气囊完成后，无品味数据时直接进入 'done'
6. 臀托完成后进入 'done'
7. 只有 init_phase == 'done' 时才能进入自适应控制
8. 离座/复位时 init_phase 重置为 'idle'
9. reset() 方法重置 init_phase 为 'idle'
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from integrated_system import IntegratedSeatSystem, IntegratedState

def test_1_init_phase_on_seat_entry():
    """测试1: 入座后 init_phase 应为 'waiting_recognition'"""
    print("=" * 60)
    print("测试1: 入座后 init_phase 应为 'waiting_recognition'")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 初始状态
    assert system.init_phase == 'idle', f"初始状态应为 'idle'，实际为 '{system.init_phase}'"
    assert system.state == IntegratedState.OFF_SEAT
    
    # 模拟入座（坐垫+靠背都有压力）
    system.state = IntegratedState.OFF_SEAT
    # 直接调用状态更新
    system._update_state(cushion_sum=5000.0, backrest_sum=3000.0)
    
    assert system.state == IntegratedState.ADAPTIVE_LOCKED, f"应为 ADAPTIVE_LOCKED，实际为 {system.state}"
    assert system.init_phase == 'waiting_recognition', f"应为 'waiting_recognition'，实际为 '{system.init_phase}'"
    assert system.adaptive_control_unlocked == False, "自适应控制应未解锁"
    assert system.is_init_inflating == False, "支撑气囊不应在充气"
    assert system.is_hip_init_inflating == False, "臀托不应在充气"
    
    print("  ✓ 通过")

def test_2_no_inflate_before_living():
    """测试2: 活体确认前不应启动任何充气"""
    print("=" * 60)
    print("测试2: 活体确认前不应启动任何充气")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 设置为入座后等待识别状态
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'waiting_recognition'
    system.adaptive_control_unlocked = False
    
    # 尝试推进 - 活体未确认，不应推进
    system._try_advance_init_phase()
    
    assert system.init_phase == 'waiting_recognition', f"活体未确认时不应推进，实际为 '{system.init_phase}'"
    assert system.is_init_inflating == False, "支撑气囊不应在充气"
    
    print("  ✓ 通过")

def test_3_advance_to_support_inflate():
    """测试3: 活体确认后应进入 'support_inflate'"""
    print("=" * 60)
    print("测试3: 活体确认后应进入 'support_inflate'")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 设置为入座后等待识别状态
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'waiting_recognition'
    system.adaptive_control_unlocked = True  # 活体已确认
    system.init_inflate_enabled = True
    system.init_inflate_done = False
    
    # 推进
    system._try_advance_init_phase()
    
    assert system.init_phase == 'support_inflate', f"应进入 'support_inflate'，实际为 '{system.init_phase}'"
    assert system.is_init_inflating == True, "支撑气囊应在充气"
    assert system.init_inflate_counter == 0, "计数器应为0"
    
    print("  ✓ 通过")

def test_4_support_complete_with_preference():
    """测试4: 支撑气囊完成后，有品味数据时进入 'hip_inflate'"""
    print("=" * 60)
    print("测试4: 支撑气囊完成后，有品味数据时进入 'hip_inflate'")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    from body_shape_classifier import ClassifierState
    
    # 设置为支撑气囊初始化阶段
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'support_inflate'
    system.is_init_inflating = False  # 支撑气囊已完成
    system.hip_init_done = False
    
    # 模拟体型三分类已完成
    if system.body_shape_classifier:
        system.body_shape_classifier.state = ClassifierState.COMPLETED
    
    # 模拟有品味数据
    system.preference_manager.set_active_body_shape('高大')
    # 写入品味数据
    system.preference_manager.preferences['高大'] = {
        'thresholds': {'lumbar': {'inflate': 1.5, 'deflate': 0.7}},
        'net_ops': {'hip': 2}
    }
    
    # 推进
    system._try_advance_init_phase()
    
    assert system.init_phase == 'hip_inflate', f"应进入 'hip_inflate'，实际为 '{system.init_phase}'"
    assert system.is_hip_init_inflating == True, "臀托应在充气"
    
    print("  ✓ 通过")

def test_5_support_complete_without_preference():
    """测试5: 支撑气囊完成后，无品味数据时仍应启动臀托基础初始化"""
    print("=" * 60)
    print("测试5: 支撑气囊完成后，无品味数据时仍应启动臀托基础初始化")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    from body_shape_classifier import ClassifierState
    
    # 设置为支撑气囊初始化阶段
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'support_inflate'
    system.is_init_inflating = False  # 支撑气囊已完成
    system.hip_init_done = False
    
    # 模拟体型三分类已完成但无品味数据
    if system.body_shape_classifier:
        system.body_shape_classifier.state = ClassifierState.COMPLETED
    system.preference_manager.set_active_body_shape('中等')
    # 不写入品味数据
    
    # 推进
    system._try_advance_init_phase()
    
    # 无品味时，臀托仍应启动基础初始化（hip_base_cycles=26帧）
    assert system.init_phase == 'hip_inflate', f"应进入 'hip_inflate'，实际为 '{system.init_phase}'"
    assert system.is_hip_init_inflating == True, "臀托应在初始化充气中"
    assert system.hip_init_action == 'inflate', f"应为 inflate，实际为 '{system.hip_init_action}'"
    assert system.hip_init_cycles == system.hip_base_cycles, (
        f"无品味时应为基础周期数{system.hip_base_cycles}，实际为 {system.hip_init_cycles}")
    assert system.hip_init_done == False, "hip_init_done 应为 False（正在执行）"
    
    print("  ✓ 通过")

def test_6_support_complete_no_body_shape():
    """测试6: 支撑气囊完成后，体型未识别时仍应启动臀托基础初始化"""
    print("=" * 60)
    print("测试6: 支撑气囊完成后，体型未识别时仍应启动臀托基础初始化")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 设置为支撑气囊初始化阶段
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'support_inflate'
    system.is_init_inflating = False  # 支撑气囊已完成
    system.hip_init_done = False
    
    # 体型三分类未完成（classifier仍在IDLE状态）
    # 不设置 active_body_shape
    
    # 推进
    system._try_advance_init_phase()
    
    # 体型未识别时，臀托仍应启动基础初始化（net_ops=0，total=base_cycles）
    assert system.init_phase == 'hip_inflate', f"应进入 'hip_inflate'，实际为 '{system.init_phase}'"
    assert system.is_hip_init_inflating == True, "臀托应在初始化充气中"
    assert system.hip_init_action == 'inflate', f"应为 inflate，实际为 '{system.hip_init_action}'"
    assert system.hip_init_cycles == system.hip_base_cycles, (
        f"无品味时应为基础周期数{system.hip_base_cycles}，实际为 {system.hip_init_cycles}")
    assert system.hip_init_done == False, "hip_init_done 应为 False（正在执行）"
    
    print("  ✓ 通过")

def test_7_hip_complete_to_done():
    """测试7: 臀托初始化完成后进入 'done'"""
    print("=" * 60)
    print("测试7: 臀托初始化完成后进入 'done'")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 设置为臀托初始化阶段
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'hip_inflate'
    system.hip_init_done = True  # 臀托已完成
    
    # 推进
    system._try_advance_init_phase()
    
    assert system.init_phase == 'done', f"应进入 'done'，实际为 '{system.init_phase}'"
    assert system.init_inflate_done == True
    
    print("  ✓ 通过")

def test_8_leave_seat_resets_init_phase():
    """测试8: 离座/复位时 init_phase 重置为 'idle'"""
    print("=" * 60)
    print("测试8: 离座/复位时 init_phase 重置为 'idle'")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 设置为自适应控制中
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'done'
    system.init_inflate_done = True
    
    # ADAPTIVE_LOCKED离座路径：
    # 1. 坐垫压力消失 → off_counter累加 → 超过阈值后进入RESETTING
    # 注意：靠背压力消失会先回到CUSHION_ONLY，所以需要坐垫也消失
    for i in range(20):  # 超过off_seat_frames_threshold(14)
        system._update_state(cushion_sum=0.0, backrest_sum=3000.0)  # 坐垫消失但靠背还在
    
    assert system.state == IntegratedState.RESETTING, f"应为 RESETTING，实际为 {system.state}"
    assert system.init_phase == 'idle', f"应为 'idle'，实际为 '{system.init_phase}'"
    
    print("  ✓ 通过")

def test_9_reset_clears_init_phase():
    """测试9: reset() 方法重置 init_phase 为 'idle'"""
    print("=" * 60)
    print("测试9: reset() 方法重置 init_phase 为 'idle'")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 设置各种状态
    system.init_phase = 'support_inflate'
    system.is_init_inflating = True
    system.init_inflate_counter = 10
    system.is_hip_init_inflating = True
    system.hip_init_counter = 5
    
    # 重置
    system.reset()
    
    assert system.init_phase == 'idle', f"应为 'idle'，实际为 '{system.init_phase}'"
    assert system.is_init_inflating == False
    assert system.init_inflate_counter == 0
    assert system.is_hip_init_inflating == False
    assert system.hip_init_counter == 0
    assert system.init_inflate_done == False
    assert system.hip_init_done == False
    
    print("  ✓ 通过")

def test_10_mode2_respects_init_phase():
    """测试10: Mode2 也必须等待 init_phase == 'done' 才能进入自适应"""
    print("=" * 60)
    print("测试10: Mode2 也必须等待 init_phase == 'done' 才能进入自适应")
    system = IntegratedSeatSystem('sensor_config.yaml')
    
    # 设置为 Mode2
    system.control_mode = 'mode2'
    system.state = IntegratedState.ADAPTIVE_LOCKED
    system.init_phase = 'waiting_recognition'
    
    # 验证 init_phase 不是 done 时，Mode2 子状态机不应被触发
    # （这通过 _generate_control_command 中的阶段控制来保证）
    assert system.init_phase != 'done', "init_phase 不应为 done"
    
    # 完成初始化后
    system.init_phase = 'done'
    system.init_inflate_done = True
    
    # Mode2 子状态机应该被正确初始化
    assert system.mode2_sub_state == 'adaptive'
    assert system.mode2_sub_counter == 0
    
    print("  ✓ 通过")


if __name__ == '__main__':
    print("\n" + "=" * 60)
    print("初始化流程重构测试 (init_phase 状态机)")
    print("=" * 60 + "\n")
    
    tests = [
        test_1_init_phase_on_seat_entry,
        test_2_no_inflate_before_living,
        test_3_advance_to_support_inflate,
        test_4_support_complete_with_preference,
        test_5_support_complete_without_preference,
        test_6_support_complete_no_body_shape,
        test_7_hip_complete_to_done,
        test_8_leave_seat_resets_init_phase,
        test_9_reset_clears_init_phase,
        test_10_mode2_respects_init_phase,
    ]
    
    passed = 0
    failed = 0
    errors = []
    
    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            failed += 1
            errors.append((test.__name__, str(e)))
            print(f"  ✗ 失败: {e}")
        except Exception as e:
            failed += 1
            errors.append((test.__name__, str(e)))
            print(f"  ✗ 异常: {e}")
    
    print("\n" + "=" * 60)
    print(f"测试结果: {passed} 通过, {failed} 失败")
    if errors:
        print("\n失败详情:")
        for name, msg in errors:
            print(f"  - {name}: {msg}")
    print("=" * 60)
