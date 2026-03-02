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

from integrated_system import IntegratedSeatSystem

_config_path = os.path.join(_release_dir, "sensor_config.yaml")
_system = IntegratedSeatSystem(_config_path)


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
        'integrated_system.cushion_sum_threshold': 'cushion_sum_threshold',
        'integrated_system.backrest_sum_threshold': 'backrest_sum_threshold',
        'integrated_system.off_seat_frames_threshold': 'off_seat_frames_threshold',
        'integrated_system.reset_frames_threshold': 'reset_frames_threshold',
        'integrated_system.reset_deflate_frames': 'reset_deflate_frames',
        'integrated_system.use_filtered_sum': 'use_filtered_sum',
    }
    attr = _map.get(key_path)
    if attr and hasattr(_system, attr):
        setattr(_system, attr, value)


def main():
    return


if __name__ == "__main__":
    main()
