import json
import os
from collections.abc import Iterable

import numpy as np
from integrated_system import IntegratedSeatSystem

_config_path = os.path.join(os.path.dirname(__file__), "sensor_config.yaml")
_system = IntegratedSeatSystem(_config_path)


def _to_builtin(value):
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, dict):
        return {key: _to_builtin(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_builtin(val) for val in value]
    return value


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


def main():
    return


if __name__ == "__main__":
    main()
