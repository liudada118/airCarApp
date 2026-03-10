import json
import os
import sys
from collections.abc import Iterable

import numpy as np

_base_dir = os.path.dirname(__file__)
_release_dir = os.path.join(_base_dir, "release_package")
if _release_dir not in sys.path:
    sys.path.insert(0, _release_dir)

# Ensure imports resolve to release_package modules, not previously cached legacy modules.
_release_prefix = os.path.abspath(_release_dir)
for _name in (
    "integrated_system",
    "config",
    "control",
    "body_shape_classifier",
    "tap_massage",
    "body_type_classifier",
    "preference_manager",
):
    _mod = sys.modules.get(_name)
    _mod_file = getattr(_mod, "__file__", "") if _mod else ""
    if _mod and _mod_file and not os.path.abspath(_mod_file).startswith(_release_prefix):
        del sys.modules[_name]

# ─── 依赖检查（调试用）─────────────────────────────────────────
def _check_dependencies():
    """检查体型三分类所需的依赖是否可用"""
    deps = ['sklearn', 'pandas', 'scipy', 'numpy', 'pickle']
    for dep in deps:
        try:
            __import__(dep)
            print(f"[server.py] 依赖检查 OK: {dep}")
        except ImportError as e:
            print(f"[server.py] 依赖检查 FAIL: {dep} -> {e}")

_check_dependencies()

from integrated_system import IntegratedSeatSystem

_config_path = os.path.join(_release_dir, "sensor_config.yaml")
print(f"[server.py] 配置文件路径: {_config_path}")
print(f"[server.py] 配置文件存在: {os.path.exists(_config_path)}")

try:
    _system = IntegratedSeatSystem(_config_path)
    # 打印体型三分类器状态
    if hasattr(_system, 'body_shape_classifier') and _system.body_shape_classifier is not None:
        print(f"[server.py] 体型三分类器: 已初始化")
        print(f"[server.py]   模型已加载: {_system.body_shape_classifier._backend is not None}")
        print(f"[server.py]   推理后端: {_system.body_shape_classifier._backend or '未加载'}")
        print(f"[server.py]   自动触发: {_system.auto_trigger_body_shape}")
    else:
        print(f"[server.py] 体型三分类器: 未初始化（body_shape_classifier is None）")
        print(f"[server.py]   enabled配置: {_system.config.get('body_shape_classification.enabled', 'NOT_FOUND')}")
except Exception as e:
    import traceback
    print(f"[server.py] IntegratedSeatSystem 初始化失败: {e}")
    traceback.print_exc()
    raise


def _to_builtin(value):
    """递归将所有特殊类型转换为 Python 内置类型，确保 json.dumps 兼容"""
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        return {str(key): _to_builtin(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_builtin(val) for val in value]
    # ruamel.yaml 特殊标量类型：ScalarFloat -> float, ScalarInt -> int, ScalarString -> str
    if isinstance(value, bool):
        return bool(value)
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return float(value)
    if isinstance(value, str):
        return str(value)
    # 兜底：尝试转换
    try:
        return str(value)
    except Exception:
        return None


def _is_sequence(value):
    if isinstance(value, (str, bytes, bytearray, dict)):
        return False
    if isinstance(value, (list, tuple, np.ndarray)):
        return True
    if hasattr(value, "size") and hasattr(value, "get"):
        return True
    return isinstance(value, Iterable)


def _to_list(value):
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (list, tuple)):
        return list(value)
    if hasattr(value, "size") and hasattr(value, "get"):
        try:
            return [value.get(i) for i in range(value.size())]
        except Exception:
            return [value]
    try:
        return list(value)
    except Exception:
        return [value]


def _normalize_sensor_data(sensor_data):
    if _is_sequence(sensor_data):
        data = _to_list(sensor_data)
    else:
        data = [sensor_data]

    for _ in range(2):
        if any(_is_sequence(item) for item in data):
            flat = []
            for item in data:
                if _is_sequence(item):
                    flat.extend(_to_list(item))
                else:
                    flat.append(item)
            data = flat
        else:
            break

    return data


def server(sensor_data):
    data = _normalize_sensor_data(sensor_data)
    data = np.array(data, dtype=np.uint8)
    if data.ndim == 1:
        data = data.reshape(1, -1)
    result = _system.process_frame(data)
    return json.dumps(_to_builtin(result), ensure_ascii=False)


# ─── 配置管理接口（供 Chaquopy / Native 桥接调用） ────────────────────

def get_config():
    """
    获取所有配置参数及注释（扁平化 JSON）。
    返回 JSON 字符串，格式：
    {
        "key.path": {"value": ..., "comment": "..."},
        ...
    }
    """
    try:
        all_cfg = _system.config.get_all_with_comments()
        builtin = _to_builtin(all_cfg)
        result_json = json.dumps(builtin, ensure_ascii=False)
        return result_json
    except Exception as e:
        import traceback
        err_detail = traceback.format_exc()
        return json.dumps({"error": str(e), "traceback": err_detail}, ensure_ascii=False)


def set_config(key_path, value_json):
    """
    设置单个配置参数并持久化到 yaml 文件。
    Args:
        key_path: 配置键路径，如 'lumbar.back_total_threshold'
        value_json: JSON 字符串形式的新值，如 '600' 或 '"text"' 或 '[1,2,3]'
    返回 JSON 字符串：{"ok": true} 或 {"error": "..."}
    """
    try:
        value = json.loads(str(value_json))
        _system.config.set(str(key_path), value)
        _system.config.save_to_file()
        # 同步运行时变量（针对常用阈值）
        _sync_runtime(str(key_path), value)
        return json.dumps({"ok": True}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def reset_config():
    """
    重置配置到初始状态并持久化。
    返回 JSON 字符串：{"ok": true} 或 {"error": "..."}
    """
    try:
        _system.config.reset()
        _system.config.save_to_file()
        return json.dumps({"ok": True}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def _sync_runtime(key_path, value):
    """将配置变更同步到 _system 运行时变量（热更新）"""
    _map = {
        # ── 集成系统核心参数 ──
        'integrated_system.cushion_sum_threshold': 'cushion_sum_threshold',
        'integrated_system.backrest_sum_threshold': 'backrest_sum_threshold',
        'integrated_system.off_seat_frames_threshold': 'off_seat_frames_threshold',
        'integrated_system.reset_frames_threshold': 'reset_frames_threshold',
        'integrated_system.reset_deflate_frames': 'reset_deflate_frames',
        'integrated_system.use_filtered_sum': 'use_filtered_sum',
        'integrated_system.backrest_buffer_frames': 'backrest_buffer_frames',
        # ── 控制检查间隔 ──
        'control.check_interval_frames': 'control_check_interval',
        # ── 初始化充气 ──
        'integrated_system.init_inflate.enabled': 'init_inflate_enabled',
        'integrated_system.init_inflate.cycles': 'init_inflate_cycles',
        'integrated_system.init_inflate.airbags': 'init_inflate_airbags',
        # ── 放气冷却锁 ──
        'integrated_system.deflate_cooldown.enabled': 'deflate_cooldown_enabled',
        'integrated_system.deflate_cooldown.max_continuous_commands': 'deflate_cooldown_max_commands',
        'integrated_system.deflate_cooldown.reset_on_no_deflate': 'deflate_cooldown_reset_on_no_deflate',
        # ── 矩阵预处理矫正 ──
        'matrix.pre_correction.enabled': 'pre_correction_enabled',
        'matrix.pre_correction.value': 'pre_correction_value',
        'matrix.pre_correction.multiplier': 'pre_correction_multiplier',
        # ── 坐垫分压矫正 ──
        'matrix.voltage_divider_correction.enabled': 'voltage_divider_enabled',
        'matrix.voltage_divider_correction.value': 'voltage_divider_value',
        # ── 活体检测 ──
        'living_detection.queue_size': 'living_queue_size',
        # ── 体型检测 ──
        'body_type_detection.queue_size': 'body_type_queue_size',
        # ── 腿托前后行范围 ──
        'leg_support.front_rows': 'leg_front_rows',
        'leg_support.rear_rows': 'leg_rear_rows',
        # ── 阶跃下降检测 ──
        'integrated_system.step_drop_detection.enabled': 'step_drop_enabled',
        'integrated_system.step_drop_detection.window_frames': 'step_drop_window_frames',
        'integrated_system.step_drop_detection.history_gap_frames': 'step_drop_history_gap_frames',
        'integrated_system.step_drop_detection.pressure_threshold': 'step_drop_pressure_threshold',
        'integrated_system.step_drop_detection.drop_ratio': 'step_drop_ratio',
        'integrated_system.step_drop_detection.confirm_cycles': 'step_drop_confirm_cycles',
        'integrated_system.step_drop_detection.deflate_cycles': 'step_drop_deflate_cycles',
    }
    attr = _map.get(key_path)
    if attr and hasattr(_system, attr):
        old_value = getattr(_system, attr)
        setattr(_system, attr, value)
        print(f"[_sync_runtime] {key_path}: {old_value} -> {value}")
    else:
        # 对于没有直接映射的参数，config.set() 已更新内存中的 config 对象，
        # 通过 self.config.get() 读取的参数会自动获取新值（如 lumbar 阈值等）
        print(f"[_sync_runtime] {key_path} 无直接映射，依赖 config.get() 动态读取")


# ─── 品味记录接口（供 Chaquopy / Native 桥接调用） ─────────────

def trigger_preference_recording(body_shape=None):
    """
    触发品味记录（用户手动调节完气囊后调用）。

    系统将采集一段时间的压力数据，记录当前压力比例并生成个性化调节区间。

    Args:
        body_shape: 指定体型（可选，默认使用体型三分类识别的结果）
    Returns:
        JSON 字符串 - 操作结果
    """
    try:
        result = _system.trigger_preference_recording(body_shape)
        return json.dumps(_to_builtin(result), ensure_ascii=False)
    except Exception as e:
        import traceback
        err_detail = traceback.format_exc()
        return json.dumps({
            "success": False,
            "error": str(e),
            "traceback": err_detail
        }, ensure_ascii=False)


def cancel_preference_recording():
    """
    取消正在进行的品味记录。
    Returns:
        JSON 字符串 - 操作结果
    """
    try:
        result = _system.cancel_preference_recording()
        return json.dumps(_to_builtin(result), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)}, ensure_ascii=False)


def get_preference_status():
    """
    获取品味管理器的完整状态。
    Returns:
        JSON 字符串 - 品味管理器状态
    """
    try:
        result = _system.get_preference_status()
        return json.dumps(_to_builtin(result), ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def main():
    return


if __name__ == "__main__":
    main()
