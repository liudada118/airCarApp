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
            # print(f"[server.py] 依赖检查 OK: {dep}")
        except ImportError as e:
            # print(f"[server.py] 依赖检查 FAIL: {dep} -> {e}")
            pass

_check_dependencies()

from integrated_system import IntegratedSeatSystem

# ─── 持久化配置路径 ─────────────────────────────────────────
# Chaquopy 在 Android 上会将 HOME 设置为 /data/data/<包名>/files
# 将用户修改过的配置保存到 HOME 目录，避免 APP 更新时被 extractPackages 覆盖
_default_config_path = os.path.join(_release_dir, "sensor_config.yaml")
_persistent_dir = os.environ.get("HOME", os.path.join(_base_dir, "_user_config"))
_persistent_config_path = os.path.join(_persistent_dir, "sensor_config.yaml")

import shutil

def _ensure_persistent_config():
    """确保持久化配置文件存在：不存在则从默认配置拷贝"""
    if not os.path.exists(_persistent_config_path):
        os.makedirs(_persistent_dir, exist_ok=True)
        if os.path.exists(_default_config_path):
            shutil.copy2(_default_config_path, _persistent_config_path)
            # print(f"[server.py] 首次运行，已拷贝默认配置到: {_persistent_config_path}")
        else:
            # print(f"[server.py] 警告: 默认配置文件不存在: {_default_config_path}")
            pass
    else:
        # print(f"[server.py] 使用持久化配置: {_persistent_config_path}")
        pass

_ensure_persistent_config()
_config_path = _persistent_config_path if os.path.exists(_persistent_config_path) else _default_config_path
# print(f"[server.py] 配置文件路径: {_config_path}")
# print(f"[server.py] 配置文件存在: {os.path.exists(_config_path)}")

try:
    _system = IntegratedSeatSystem(_config_path)
    # 打印体型三分类器状态
    if hasattr(_system, 'body_shape_classifier') and _system.body_shape_classifier is not None:
        # print(f"[server.py] 体型三分类器: 已初始化")
        pass
        # print(f"[server.py]   模型已加载: {_system.body_shape_classifier._backend is not None}")
        # print(f"[server.py]   推理后端: {_system.body_shape_classifier._backend or '未加载'}")
        # print(f"[server.py]   自动触发: {_system.auto_trigger_body_shape}")
    else:
        # print(f"[server.py] 体型三分类器: 未初始化（body_shape_classifier is None）")
        pass
        # print(f"[server.py]   enabled配置: {_system.config.get('body_shape_classification.enabled', 'NOT_FOUND')}")
except Exception as e:
    import traceback
    # print(f"[server.py] IntegratedSeatSystem 初始化失败: {e}")
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
        # 使用 set_param 统一更新：同时更新 config + 运行时变量 + 持久化
        # set_param 内部会自动处理参数映射、嵌套属性更新和文件保存
        _system.set_param(str(key_path), value, auto_save=True)
        return json.dumps({"ok": True}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)


def reset_config():
    """
    重置配置到初始状态并持久化。
    会从默认配置重新拷贝到持久化目录，然后重新加载。
    返回 JSON 字符串：{"ok": true} 或 {"error": "..."}
    """
    try:
        # 从默认配置重新拷贝到持久化目录
        if os.path.exists(_default_config_path) and _config_path == _persistent_config_path:
            shutil.copy2(_default_config_path, _persistent_config_path)
            # print(f"[server.py] 配置已重置，从默认配置拷贝到: {_persistent_config_path}")
        _system.config.reload()
        return json.dumps({"ok": True}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False)




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
