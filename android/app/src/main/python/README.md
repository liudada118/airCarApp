# 座椅压力传感器控制系统

智能座椅气囊自适应控制算法包，基于压力传感器矩阵数据实时调节气囊充放气。

## 功能特性

- **模块化设计**：数据处理、区域提取、控制逻辑、协议生成四大模块
- **状态机管理**：离座检测、落座等待、自适应调节的完整状态流转
- **三路并行控制**：腰托、侧翼、腿托独立逻辑同时运行
- **参数可配置**：YAML配置文件，支持运行时动态调整
- **协议帧生成**：自动生成符合硬件规范的控制协议帧

## 系统架构

```
传感器数据(1x144)
    ↓
模块1: 数据拆分 → 靠背矩阵(72) + 坐垫矩阵(72)
    ↓
模块2: 区域提取 → 靠背上/下、左/右、坐垫屁股/腿托
    ↓
模块3: 控制逻辑
    ├─ 离座检测 → 状态机管理
    ├─ 腰托控制 → 上下背部压力比判断
    ├─ 侧翼控制 → 左右背部压力比判断
    └─ 腿托控制 → 腿部屁股压力比判断
    ↓
模块4: 协议帧生成 → 54字节控制帧
    ↓
硬件串口输出
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 基础使用

```python
import numpy as np
from control import SeatControlSystem

# 初始化控制系统
controller = SeatControlSystem('sensor_config.yaml')

# 模拟传感器数据（实际使用时替换为真实传感器读取）
sensor_data = np.random.randint(0, 100, (1, 144))

# 处理一帧数据
protocol_frame = controller.process_frame(sensor_data)

# 如果有控制指令，发送到串口
if protocol_frame:
    # serial_port.write(protocol_frame)
    print(f"发送控制帧: {len(protocol_frame)} 字节")
```

### 3. 运行时修改参数

```python
# 修改腰托启动阈值
controller.set_param('lumbar.back_total_threshold', 600)

# 修改离座检测阈值
controller.set_param('seat_detection.threshold', 150)

# 修改控制检查间隔
controller.set_param('control.check_interval_frames', 5)
```

### 4. 测试示例

```bash
# 运行内置测试
python control.py
```

## 配置说明

配置文件：[sensor_config.yaml](sensor_config.yaml)

### 主要参数

| 参数分类 | 关键参数 | 默认值 | 说明 |
|---------|---------|-------|------|
| 系统 | `system.hz` | 13 | 采样频率(Hz) |
| 离座检测 | `seat_detection.threshold` | 100 | 离座阈值 |
|  | `seat_detection.off_seat_frames` | 65 | 离座判定帧数(5秒) |
|  | `seat_detection.on_seat_delay_frames` | 65 | 落座启动延迟(5秒) |
| 控制 | `control.check_interval_frames` | 4 | 检查间隔帧数 |
| 腰托 | `lumbar.back_total_threshold` | 500 | 背部总压力启动阈值 |
|  | `lumbar.upper_lower_ratio_inflate` | 1.5 | 充气比例阈值 |
|  | `lumbar.upper_lower_ratio_deflate` | 0.7 | 放气比例阈值 |
| 侧翼 | `side_wings.left_right_ratio_inflate_left` | 0.7 | 左侧充气阈值 |
|  | `side_wings.left_right_ratio_deflate_left` | 1.3 | 左侧放气阈值 |
| 腿托 | `leg_support.leg_butt_ratio_inflate` | 0.5 | 腿部充气阈值 |
|  | `leg_support.leg_butt_ratio_deflate` | 1.2 | 腿部放气阈值 |

## 矩阵结构

### 输入数据格式

```
1x144数组:
[靠背72元素 | 坐垫72元素]
```

### 72元素矩阵结构

```
[左小矩形6元素 | 右小矩形6元素 | 中间大矩阵60元素(10x6)]
```

### 区域划分

**靠背区域：**
- 上半部分：10x6矩阵的行0-4
- 下半部分：10x6矩阵的行5-9
- 左半部分：列0-2
- 右半部分：列3-5

**坐垫区域：**
- 屁股区域：10x6矩阵的行0-7
- 腿托区域：10x6矩阵的行8-9

## 气囊映射

| 气囊编号 | 位置 | 控制区域 |
|---------|------|---------|
| 5, 6 | 腰托 | 腰部支撑 |
| 1, 3 | 右侧翼 | 右侧包裹 |
| 2, 4 | 左侧翼 | 左侧包裹 |
| 9, 10 | 腿托 | 腿部托举 |

## 控制逻辑

### 1. 离座检测

```
坐垫总压力 < 阈值 持续5秒
    → 进入复位状态
    → 所有气囊放气(10秒)
    → 进入离座状态
```

### 2. 落座自适应

```
坐垫总压力 > 阈值
    → 落座等待(5秒)
    → 开启自适应调节
```

### 3. 腰托逻辑

```
背部总压力 > 启动阈值时:
  - 上背/下背比例 > 1.5 → 充气（腰部悬空）
  - 上背/下背比例 < 0.7 → 放气（腰部压力饱和）
  - 0.7 ~ 1.5 → 保持
```

### 4. 侧翼逻辑

```
左/右压力比 < 0.7 → 充左侧翼
左/右压力比 > 1.3 → 放左侧翼
镜像逻辑控制右侧翼
```

### 5. 腿托逻辑

```
腿部/屁股压力比 < 0.5 → 充气托举
腿部/屁股压力比 > 1.2 → 放气释放
0.5 ~ 1.2 → 保持
```

### 6. 连续帧判定

所有控制需连续N帧（默认4帧）满足条件才执行，避免抖动。

## 协议帧格式

```
字节位置 | 字段 | 取值 | 说明
---------|------|------|------
1        | 帧头 | 0x1F | 固定
2-49     | 气囊数据 | 序号+档位 | 24个气囊×2字节
         |      | 序号: 0x01-0x18 | 气囊编号
         |      | 档位: 0x00/0x03/0x04 | 0=保持, 3=充气, 4=放气
50       | 工作模式 | 0x00 | 0x00=自动模式
51       | 方向标识 | 0x00 | 0x00=下发
52-55    | 帧尾 | 0xAA 0x55 0x03 0x99 | 固定
```

## API 文档

### SeatControlSystem 类

#### `__init__(config_path='sensor_config.yaml')`
初始化控制系统

**参数：**
- `config_path` (str): 配置文件路径

#### `process_frame(sensor_data: np.ndarray) -> Optional[bytes]`
处理一帧传感器数据

**参数：**
- `sensor_data` (np.ndarray): 1x144的传感器数据

**返回：**
- `bytes`: 协议帧，无指令时返回None

#### `set_param(key_path: str, value) -> None`
运行时修改参数

**参数：**
- `key_path` (str): 参数路径，如 'lumbar.back_total_threshold'
- `value`: 新值

**示例：**
```python
controller.set_param('lumbar.back_total_threshold', 600)
```

#### `reset_system() -> None`
重置系统状态（清空帧计数、缓冲区等）

## 项目结构

```
c:\github\car\
├── control.py              # 主控制模块
├── config.py               # 配置管理模块
├── sensor_config.yaml      # 配置文件
├── requirements.txt        # 依赖清单
├── .gitignore             # Git忽略文件
└── README.md              # 本文档
```

## 典型应用场景

### 场景1：与硬件串口集成

```python
import serial
import numpy as np
from control import SeatControlSystem

# 初始化串口和控制器
ser = serial.Serial('COM3', 115200)
controller = SeatControlSystem()

# 主循环
while True:
    # 从传感器读取数据
    sensor_data = read_sensor_data()  # 你的传感器读取函数

    # 处理并获取控制帧
    frame = controller.process_frame(sensor_data)

    # 发送控制指令
    if frame:
        ser.write(frame)

    # 等待下一帧（13Hz = 77ms）
    time.sleep(0.077)
```

### 场景2：数据记录与分析

```python
import numpy as np
from control import SeatControlSystem

controller = SeatControlSystem()

# 记录模式
data_log = []
for sensor_data in sensor_stream:
    frame = controller.process_frame(sensor_data)

    # 记录数据和指令
    data_log.append({
        'frame_id': controller.frame_count,
        'sensor_data': sensor_data,
        'command': frame,
        'state': controller.seat_state.name
    })
```

### 场景3：参数调优

```python
from control import SeatControlSystem
import numpy as np

controller = SeatControlSystem()

# 测试不同阈值的效果
thresholds = [400, 500, 600, 700]
for threshold in thresholds:
    controller.set_param('lumbar.back_total_threshold', threshold)
    controller.reset_system()

    # 运行测试序列
    for test_data in test_dataset:
        frame = controller.process_frame(test_data)
        # 分析结果...
```

## 常见问题

### Q1: 如何调整控制灵敏度？
A: 修改 `control.check_interval_frames` 参数，值越小越灵敏（但可能抖动），值越大越稳定（但响应慢）。

### Q2: 气囊频繁充放气怎么办？
A: 增大对应区域的保持区间范围，例如：
```python
controller.set_param('lumbar.upper_lower_ratio_inflate', 1.8)  # 增大上限
controller.set_param('lumbar.upper_lower_ratio_deflate', 0.5)  # 减小下限
```

### Q3: 如何禁用某个控制区域？
A: 修改配置文件中对应区域的阈值为极大值，使其永远不触发。

### Q4: 支持多少个气囊？
A: 协议支持最多24个气囊（0x01-0x18），当前配置使用了8个。

## 性能说明

- **处理延迟**：单帧处理 < 1ms
- **内存占用**：< 10MB
- **CPU占用**：13Hz采样率下 < 1%

## 许可证

本项目遵循 MIT 许可证。

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。

---

**版本**：v1.0.0
**更新日期**：2025-01-24
