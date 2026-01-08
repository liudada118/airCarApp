import json
import os

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


def server(sensor_data):
    data = np.array(sensor_data, dtype=np.uint8)
    if data.ndim == 1:
        data = data.reshape(1, -1)
    result = _system.process_frame(data)
    return json.dumps(_to_builtin(result), ensure_ascii=False)


def main():
    return


if __name__ == "__main__":
    main()
