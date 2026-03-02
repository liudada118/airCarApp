# 座椅压力传感器算法包 - 纯Python集成最小文件包

## 文件清单

```
release_package/
├── integrated_system.py       # 核心：集成系统主类
├── config.py                  # 配置加载器
├── control.py                 # 活体检测器 + 体型检测器
├── body_shape_classifier.py   # 体型三分类（瘦小/中等/高大）
├── preference_manager.py      # 品味记忆管理
├── tap_massage.py             # 拍打按摩检测（可选）
├── sensor_config.yaml         # 配置文件
├── requirements.txt           # Python依赖
├── model/
│   └── body_shape_model.pkl   # 体型三分类预训练模型
└── body_type_classifier/      # 体型分类算法子包
    ├── __init__.py
    ├── classifier.py
    ├── data_loader.py
    └── feature_engineer.py
```

## 快速集成

```python
import numpy as np
from integrated_system import IntegratedSeatSystem

# 初始化
system = IntegratedSeatSystem('sensor_config.yaml')

# 每帧调用（约13Hz）
sensor_data = np.array([...], dtype=np.uint8).reshape(1, 144)  # 1×144
result = system.process_frame(sensor_data)

# 只需关注三个核心输出字段
seat_status    = result['seat_status']      # 离座状态
body_shape_info = result['body_shape_info']  # 体型信息
airbag_command = result['airbag_command']    # 气囊指令
```

## 安装依赖

```bash
pip install -r requirements.txt
```
