# 汽车座椅压力传感器控制系统

```
c:\github\car\
├── integrated_system.py    # 集成座椅控制系统（核心模块）
├── control.py              # 检测器模块（活体检测、体型检测）
├── body_shape_classifier.py # 体型三分类检测器（外部触发式，集成到主系统）
├── config.py               # 配置管理模块（支持注释保留）
├── tap_massage.py          # 拍打按摩检测模块
├── seat_service.py         # HTTP API 服务（FastAPI + WebSocket）
├── visualizer.py           # 可视化工具（Tkinter + Matplotlib）
├── sensor_config.yaml      # 配置文件
├── body_type_classifier/   # 体型三分类算法包 (V2)
├── model/                  # 预训练模型文件
├── train_model.py          # 模型训练脚本
├── data/                   # 原始CSV数据
├── output/                 # 分类算法运行结果
├── run_classification.py   # 分类算法主运行脚本
├── test.py                 # 测试脚本
├── test_constant_input.py  # 常量输入测试
├── .gitignore              # Git忽略文件
└── README.md               # 本文档
```

## 体型三分类算法 V2

基于北汽汽车座椅144点压力传感器数据，实现瘦小/中等/高大三种体型的自动分类。

### 核心指标

| 指标 | V1 | V2 |
|------|------|------|
| 受试者准确率 | 62.5% (5/8) | **100% (8/8)** |
| 帧级 F1 (macro) | 0.60 | **0.86** |
| 最佳模型 | LogisticRegression | **KNN5 (distance)** |

### V2核心改进

1. **滑动窗口时间聚合** — 30帧窗口消除帧间噪声
2. **全144点传感器特征** — 包含侧翼小矩形
3. **时间变异特征** — 窗口内标准差，捕捉动态压力模式
4. **概率软投票** — 比硬投票更鲁棒
5. **自动特征选择** — SelectKBest(k=40)

### 快速运行分类算法

```bash
pip install -r requirements.txt
python run_classification.py
```

详见 [ALGORITHM_SUMMARY_V2.md](ALGORITHM_SUMMARY_V2.md)

## API 文档

### IntegratedSeatSystem 类

#### `__init__(config_path: str)`
初始化集成控制系统

**参数：**
- `config_path` (str): 配置文件路径

#### `process_frame(sensor_data: np.ndarray) -> Dict`
处理一帧传感器数据

**参数：**
- `sensor_data` (np.ndarray): 144元素的传感器数据（uint8）

**返回：**
- `Dict`: 包含状态、检测结果、控制指令等完整信息

#### `get_latest_result() -> Optional[Dict]`
获取最近一次处理结果

#### `get_pending_commands() -> List[Dict]`
获取队列中所有待处理的指令（非阻塞）

**返回：**
- `List[Dict]`: 指令信息列表，每个元素包含：
  - `command`: list[int] - 55个10进制整数的协议帧
  - `frame_count`: int - 生成该指令时的帧计数
  - `command_count`: int - 指令序号
  - `state`: str - 生成该指令时的状态机状态
  - `decision_data`: dict - 控制决策数据

#### `set_param(key: str, value: Any, auto_save: bool = True) -> None`
运行时修改参数

**参数：**
- `key` (str): 参数名（简短形式如 `cushion_sum_threshold`）或配置路径（如 `integrated_system.cushion_sum_threshold`）
- `value` (Any): 新值
- `auto_save` (bool): 是否自动保存到文件，默认True

**示例：**
```python
system.set_param('cushion_sum_threshold', 600)  # 简短形式
system.set_param('integrated_system.cushion_sum_threshold', 600)  # 完整路径
```

#### `reset() -> None`
重置系统状态（包括状态机、检测器、队列等）

#### `reset_massage(clear_history: bool = False) -> None`
重置拍打按摩为关闭状态

**参数：**
- `clear_history` (bool): 是否同时清空拍打检测历史缓冲，默认False仅关闭按摩

**示例：**
```python
system.reset_massage()  # 仅关闭按摩
system.reset_massage(clear_history=True)  # 关闭按摩并清空检测历史
```

### Config 类

配置管理类，支持注释保留和读取。可通过 `system.config` 访问。

#### `get(key_path: str, default: Any = None) -> Any`
获取配置值，支持嵌套键（用`.`分隔）

**示例：**
```python
config.get('system.hz')  # 返回 13
config.get('lumbar.airbags')  # 返回 [5, 6]
```

#### `set(key_path: str, value: Any) -> None`
设置配置值，支持嵌套键

#### `get_all() -> Dict[str, Any]`
获取所有配置（深拷贝）

#### `get_comment(key_path: str) -> Optional[str]`
获取指定参数的注释

#### `get_all_with_comments() -> Dict[str, Any]`
获取所有配置及其注释（扁平化格式）

#### `reload() -> None`
从文件重新加载配置

#### `reset() -> None`
重置配置到初始加载状态（不影响文件）

#### `save_to_file() -> None`
将当前配置保存到文件（保留注释）

### HTTP API 端点

| 方法 | 路径 | 说明 |
|-----|------|------|
| POST | `/process_frame` | 处理单帧数据 |
| POST | `/reset` | 重置系统 |
| GET | `/status` | 获取当前状态 |
| POST | `/set_param` | 修改系统参数 |
| POST | `/body_shape/trigger` | 触发体型三分类识别 |
| GET | `/body_shape/status` | 查询体型分类进度和状态 |
| GET | `/body_shape/result` | 获取体型分类结果 |
| GET | `/config` | 获取所有配置 |
| GET | `/config/{key_path}` | 获取指定配置 |
| PUT | `/config/{key_path}` | 设置指定配置 |
| POST | `/config/save` | 保存配置到文件 |
| POST | `/config/reload` | 从文件重新加载 |
| GET | `/health` | 健康检查 |
| WebSocket | `/ws` | 实时通信接口 |

### WebSocket 消息格式

```json
// 处理帧
{"action": "process_frame", "sensor_data": [50, 50, ...]}
// 获取状态
{"action": "status"}
// 修改配置
{"action": "config_set", "key": "lumbar.threshold", "value": 25}
// 重置系统
{"action": "reset"}
// 触发体型三分类
{"action": "trigger_body_shape"}
// 查询体型分类状态
{"action": "body_shape_status"}
// 获取体型分类结果
{"action": "body_shape_result"}
```

## 体型三分类使用流程

### 工作原理

体型三分类采用**外部触发式**设计，工作流程如下：

1. 外部调用 `POST /body_shape/trigger` 启动采集
2. 系统自动进行入座检测，等待稳定入座（连续5帧超过自适应阈值）
3. 缓冲30帧有效入座数据（约2.3秒 @13Hz）
4. 自动进行特征提取 + KNN分类
5. 返回三分类结果：**瘦小** / **中等** / **高大** + 置信度

### 使用示例

```python
# Python 直接调用
from integrated_system import IntegratedSeatSystem

system = IntegratedSeatSystem('sensor_config.yaml')

# 步骤1：触发体型识别
result = system.trigger_body_shape_classification()
print(result)  # {'success': True, 'message': '开始采集...'}

# 步骤2：继续喂入帧数据（正常process_frame循环）
for frame in sensor_frames:
    result = system.process_frame(frame)
    if result['body_shape']['state'] == 'COMPLETED':
        print(f"体型: {result['body_shape']['body_shape']}")
        print(f"置信度: {result['body_shape']['confidence']:.0%}")
        break
```

```bash
# HTTP API 调用
curl -X POST http://localhost:8000/body_shape/trigger
# 等待级3秒后查询结果
curl http://localhost:8000/body_shape/result
```

### 配置参数

```yaml
body_shape_classification:
  enabled: true
  collect_frames: 30        # 采集有效入座帧数
  seated_threshold: 2000    # 坐垫压力固定阈值兜底
  seated_threshold_ratio: 0.3  # 自适应阈值比例
  stable_frames: 5          # 稳定入座所需连续帧数
  timeout_frames: 300       # 采集超时帧数
```

### 模型训练

```bash
# 将CSV数据放入data/目录后运行
python train_model.py
# 模型保存到 model/body_shape_model.pkl
```

## 典型应用场景

### 场景1：与硬件串口集成

```python
import serial
import numpy as np
from integrated_system import IntegratedSeatSystem

ser = serial.Serial('COM3', 115200)
system = IntegratedSeatSystem('sensor_config.yaml')

while True:
    sensor_data = read_sensor_data()  # 你的传感器读取函数
    result = system.process_frame(sensor_data)
    if result.get('protocol_frame'):
        ser.write(result['protocol_frame'])
    time.sleep(0.077)  # 13Hz
```

### 场景2：Node.js 通过 HTTP 调用

```javascript
const axios = require('axios');

async function processSensorData(sensorData) {
    const response = await axios.post('http://localhost:8000/process_frame', {
        sensor_data: sensorData
    });
    return response.data;
}
```

### 场景3：实时数据可视化

```bash
# 启动服务
python seat_service.py &
# 启动可视化
python visualizer.py
```

## 常见问题

### Q1: 活体检测不准确？
A: 调整 `living_detection.sad_threshold` 和 `living_detection.sad.normalize_scale` 参数。

### Q2: 体型判断错误？
A: 调整 `body_type_detection.body_size_adult_threshold` 和 `body_type_detection.body_size_child_threshold`。

### Q3: 气囊频繁充放气？
A:
1. 增大对应区域的保持区间
2. 启用放气冷却锁：`integrated_system.deflate_cooldown.enabled: true`

### Q4: 拍打按摩不触发？
A:
1. 降低 `tap_massage.tap_threshold` 阈值
2. 减少 `tap_massage.required_taps` 所需拍打次数

### Q5: 如何禁用某个功能？
A: 在配置文件中设置对应的 `enabled: false`，如：
```yaml
living_detection:
  enabled: false
```

## 性能说明

- **处理延迟**：单帧处理 < 5ms
- **内存占用**：< 50MB
- **CPU占用**：13Hz采样率下 < 5%

## 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。

---
**版本**：v2.0.0
**更新日期**：2025-02-25
