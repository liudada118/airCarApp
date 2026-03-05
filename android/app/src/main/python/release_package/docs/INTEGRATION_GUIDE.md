# 汽车座椅算法包 - 集成指南

**版本**: 1.1  
**更新日期**: 2026-03-05

---

本文档为上层应用软件集成 `IntegratedSeatSystem` 算法包提供完整的接口说明、输入输出字段定义和配置指南。算法包以纯Python实现，不包含任何服务端逻辑。

---

## 1. 概述

算法包以 `IntegratedSeatSystem` 类为统一入口。集成方只需初始化该类，并按固定频率（推荐13Hz）传入座椅压力传感器数据，即可在返回值中获取所有算法结果，包括离座状态、活体检测、体型识别、品味记忆状态和最终的气囊控制指令。

---

## 2. 快速集成

```python
import numpy as np
from integrated_system import IntegratedSeatSystem

# 1. 初始化
system = IntegratedSeatSystem("sensor_config.yaml")

# 2. 主循环（推荐13Hz）
def on_new_sensor_data(raw_144: np.ndarray):
    result = system.process_frame(raw_144)

    # 3. 使用核心输出
    seat_status    = result['seat_status']
    body_shape_info = result['body_shape_info']
    airbag_command = result['airbag_command']

    if airbag_command['is_new_command'] and airbag_command['command'] is not None:
        send_to_hardware(airbag_command['command'])
```

---

## 3. 核心接口

### 3.1. `__init__(self, config_path: str)`

构造函数，初始化整个系统。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `config_path` | `str` | 是 | 指向 `sensor_config.yaml` 配置文件的绝对或相对路径 |

**返回值：** 无（构造函数）

---

### 3.2. `process_frame(self, sensor_data: np.ndarray) -> Dict`

系统主处理函数，每帧调用一次。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sensor_data` | `np.ndarray` | 是 | 单帧传感器数据，形状 `(1, 144)` 或 `(144,)`，数值范围 0-255 |

**传感器数据结构（144个元素）：**

| 索引范围 | 区域 | 说明 |
|---|---|---|
| `[0-5]` | 靠背左侧小矩形 | 6个传感器 |
| `[6-11]` | 靠背右侧小矩形 | 6个传感器，用于拍打按摩检测 |
| `[12-71]` | 靠背中间大矩阵 | 60个传感器 = 10行 x 6列 |
| `[72-77]` | 坐垫左侧小矩形 | 6个传感器 |
| `[78-83]` | 坐垫右侧小矩形 | 6个传感器，用于拍打按摩检测 |
| `[84-143]` | 坐垫中间大矩阵 | 60个传感器 = 10行 x 6列 |

**返回值：** `Dict`，包含以下所有字段。

#### 3.2.1. 三个核心独立字段

##### `seat_status` — 离座状态

| 键 | 类型 | 说明 | 可能的值 |
|---|---|---|---|
| `state` | `str` | 状态机当前状态 | `"OFF_SEAT"`, `"CUSHION_ONLY"`, `"ADAPTIVE_LOCKED"`, `"RESETTING"` |
| `is_off_seat` | `bool` | 座椅上是否无人 | `True` / `False` |
| `is_seated` | `bool` | 座椅上是否有人 | `True`（CUSHION_ONLY 或 ADAPTIVE_LOCKED 状态） |
| `is_resetting` | `bool` | 是否正在执行离座复位 | `True` / `False` |

**状态机说明：**

| 状态 | 含义 | 转换条件 |
|---|---|---|
| `OFF_SEAT` | 无人 | 坐垫压力总和 < 阈值，持续N帧 |
| `CUSHION_ONLY` | 仅坐垫有压力 | 坐垫压力 >= 阈值，靠背压力 < 阈值 |
| `ADAPTIVE_LOCKED` | 自适应控制已开启 | 坐垫和靠背压力均 >= 阈值 |
| `RESETTING` | 离座复位中 | 从有人状态转为无人，气囊复位放气 |

##### `body_shape_info` — 体型与品味信息

| 键 | 类型 | 说明 | 可能的值 |
|---|---|---|---|
| `body_shape` | `str` | 体型三分类结果 | `"瘦小"`, `"中等"`, `"高大"`, `""`（未识别） |
| `body_shape_state` | `str` | 体型分类器状态 | `"IDLE"`, `"COLLECTING"`, `"CLASSIFYING"`, `"COMPLETED"`, `"DISABLED"` |
| `confidence` | `float` | 分类置信度 | `[0.0, 1.0]` |
| `probabilities` | `Dict` | 各体型概率分布 | `{"瘦小": 0.1, "中等": 0.3, "高大": 0.6}` |
| `preference` | `Dict` | 品味记忆子字段 | 见下表 |

**`preference` 子字段：**

| 键 | 类型 | 说明 | 可能的值 |
|---|---|---|---|
| `active_body_shape` | `str` 或 `None` | 当前品味管理器关联的体型 | `"瘦小"`, `"中等"`, `"高大"`, `None` |
| `using_preference` | `bool` | 是否正在使用已保存的品味区间 | `True` / `False` |
| `is_recording` | `bool` | 是否正在记录新的品味 | `True` / `False` |
| `recording_progress` | `Dict` 或 `None` | 品味记录进度（仅记录中非空） | 见下表 |

**`recording_progress` 子字段（仅 `is_recording=True` 时非空）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `current_frames` | `int` | 已采集帧数 |
| `total_frames` | `int` | 需采集总帧数 |
| `progress_pct` | `float` | 采集进度百分比 `[0.0, 100.0]` |
| `target_shape` | `str` | 目标体型 |
| `filter_mode` | `str` | 过滤模式：`"none"`, `"clamp"`, `"kalman"` |

##### `airbag_command` — 气囊指令

| 键 | 类型 | 说明 | 可能的值 |
|---|---|---|---|
| `command` | `List[int]` 或 `None` | 55个十进制整数的气囊控制协议帧 | `[31, 1, 0, ...]`（55元素）或 `None` |
| `is_new_command` | `bool` | 是否为本帧新生成的指令 | `True` = 新指令，`False` = 延续上一帧 |

**`command` 协议帧结构（55个元素）：**

| 索引 | 说明 |
|---|---|
| `[0]` | 帧头：固定值 `31` |
| `[1-48]` | 48个气囊的档位值（每个气囊1字节） |
| `[49]` | 模式字节 |
| `[50]` | 方向字节 |
| `[51-54]` | 帧尾（4字节校验） |

#### 3.2.2. 兼容字段（用于GUI调试）

| 键 | 类型 | 说明 |
|---|---|---|
| `control_command` | `List[int]` 或 `None` | 同 `airbag_command.command` |
| `is_new_command` | `bool` | 同 `airbag_command.is_new_command` |
| `living_status` | `str` | 活体检测状态：`"活体"`, `"静物"`, `"检测中"`, `"离座"`, `"未启用"` |
| `body_type` | `str` | 体型（大小）分类：`"大人"`, `"小孩"`, `"静物"`, `"未判断"` |
| `body_shape` | `Dict` | 体型三分类器状态摘要 |
| `seat_state` | `str` | 状态机名称（同 `seat_status.state`） |
| `cushion_sum` | `float` | 坐垫中间矩阵压力总和 |
| `backrest_sum` | `float` | 靠背中间矩阵压力总和 |
| `living_confidence` | `float` | 活体检测置信度 `[0.0, 1.0]` |
| `body_features` | `Dict` | 体型检测详细特征数据 |
| `frame_count` | `int` | 当前帧计数（从1开始） |

**`body_features` 子字段（体型检测已启用时）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `cushion` | `Dict` | 坐垫特征：`original_sum`, `filtered_sum`, `max_value`, `center_of_mass` |
| `backrest` | `Dict` | 靠背特征：结构同上 |
| `body_size_type` | `str` | `"大人"` / `"小孩"` / `"未判断"` |
| `body_size_raw` | `float` | 体型评分原始值 |

#### 3.2.3. 控制决策数据 `control_decision_data`

用于调试和GUI显示各区域气囊的控制决策过程。

**`control_decision_data.lumbar` — 腰托控制：**

| 键 | 类型 | 说明 |
|---|---|---|
| `upper_pressure` | `float` | 靠背上部区域压力均值 |
| `lower_pressure` | `float` | 靠背下部区域压力均值 |
| `ratio` | `float` | 上下部压力比值（`upper / lower`） |
| `threshold_passed` | `bool` | 背部总压力是否超过最低阈值 |
| `action` | `str` | 控制动作：`"INFLATE"`, `"DEFLATE"`, `"HOLD"` |

**`control_decision_data.side_wings` — 侧翼控制：**

| 键 | 类型 | 说明 |
|---|---|---|
| `left_pressure` | `float` | 靠背左侧小矩形压力总和 |
| `right_pressure` | `float` | 靠背右侧小矩形压力总和 |
| `ratio` | `float` | 左右压力比值（`left / right`） |
| `left_action` | `str` | 左侧翼动作：`"INFLATE"`, `"DEFLATE"` |
| `right_action` | `str` | 右侧翼动作：`"INFLATE"`, `"DEFLATE"` |

**`control_decision_data.leg_support` — 腿托控制：**

| 键 | 类型 | 说明 |
|---|---|---|
| `ratio` | `float` | 左右平均前3后3比（兼容显示） |
| `action` | `str` | 整体动作：`"INFLATE"`, `"DEFLATE"`, `"HOLD"` |
| `centroid` | `float` | 列方向重心位置 |
| `centroid_calibrated` | `bool` | 重心是否已标定 |
| `left_f3` | `float` | 左腿前3行压力均值 |
| `left_r3` | `float` | 左腿后3行压力均值 |
| `left_ratio` | `float` | 左腿前3后3比（`left_f3 / left_r3`） |
| `left_action` | `str` | 左腿动作：`"INFLATE"`, `"DEFLATE"`, `"HOLD"` |
| `right_f3` | `float` | 右腿前3行压力均值 |
| `right_r3` | `float` | 右腿后3行压力均值 |
| `right_ratio` | `float` | 右腿前3后3比（`right_f3 / right_r3`） |
| `right_action` | `str` | 右腿动作：`"INFLATE"`, `"DEFLATE"`, `"HOLD"` |

#### 3.2.4. 活体检测决策数据 `living_detection_data`

| 键 | 类型 | 说明 |
|---|---|---|
| `enabled` | `bool` | 活体检测功能是否启用 |
| `status` | `str` | 最终状态：`"活体"`, `"静物"`, `"检测中"`, `"离座"`, `"未启用"` |
| `in_enabled_state` | `bool` | 当前状态机是否处于检测启用状态 |
| `queue` | `Dict` | 状态机队列信息（见下表） |
| `control_lock` | `Dict` | 自适应控制锁信息（见下表） |
| `current_detection` | `Dict` | 本帧检测结果（见下表，仅本帧触发检测时非空） |

**`queue` 子字段：**

| 键 | 类型 | 说明 |
|---|---|---|
| `size` | `int` | 队列大小（配置的n值） |
| `current_length` | `int` | 当前队列长度 |
| `is_full` | `bool` | 队列是否已满 |
| `values` | `List[bool]` | 队列原始值 `[True, False, ...]` |
| `values_display` | `List[str]` | 队列显示值 `["活体", "静物", ...]` |

**`control_lock` 子字段：**

| 键 | 类型 | 说明 |
|---|---|---|
| `adaptive_control_unlocked` | `bool` | 自适应控制是否已解锁 |
| `message` | `str` | 锁状态描述 |

**`current_detection` 子字段（本帧有检测时）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `is_living` | `bool` | 原始判定结果 |
| `confidence` | `float` | 置信度 `[0.0, 1.0]` |
| `threshold` | `float` | 判定阈值 |
| `passed_threshold` | `bool` | 是否通过阈值 |
| `sad_score` | `float` | SAD归一化分数 |
| `sad_energy` | `float` | SAD能量（最大值） |
| `sad_cushion` | `float` | 坐垫SAD能量 |
| `sad_backrest` | `float` | 靠背SAD能量 |
| `detection_count` | `int` | 检测次数计数 |

#### 3.2.5. 体型检测决策数据 `body_type_detection_data`

| 键 | 类型 | 说明 |
|---|---|---|
| `enabled` | `bool` | 体型检测功能是否启用 |
| `body_type` | `str` | 最终体型输出 |
| `in_enabled_state` | `bool` | 当前状态机是否处于检测启用状态 |
| `queue` | `Dict` | 队列信息 |
| `lock` | `Dict` | 锁定信息 |
| `current_detection` | `Dict` | 本帧检测结果 |

**`queue` 子字段：**

| 键 | 类型 | 说明 |
|---|---|---|
| `size` | `int` | 队列大小 |
| `current_length` | `int` | 当前队列长度 |
| `is_full` | `bool` | 队列是否已满 |
| `values` | `List[str]` | 队列原始值 `["大人", "大人", ...]` |

**`lock` 子字段：**

| 键 | 类型 | 说明 |
|---|---|---|
| `locked` | `bool` | 体型是否已锁定 |
| `locked_value` | `str` | 锁定的体型值 |
| `message` | `str` | 锁状态描述 |

**`current_detection` 子字段（本帧有检测时）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `body_size_type` | `str` | `"大人"` / `"小孩"` / `"未判断"` |
| `body_size_raw` | `float` | 体型评分原始值 |
| `cushion_filtered_sum` | `float` | 坐垫滤波后压力总和 |
| `detection_count` | `int` | 检测次数计数 |

#### 3.2.6. 其他字段

**`tap_massage` — 拍打按摩检测结果（可能为 `None`）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `backrest_tap_triggered` | `bool` | 靠背拍打是否触发 |
| `backrest_command` | `str` | 靠背按摩指令：`"TOGGLE_ON"`, `"TOGGLE_OFF"`, `"NONE"` |
| `backrest_massage_active` | `bool` | 靠背按摩是否正在运行 |
| `cushion_tap_triggered` | `bool` | 坐垫拍打是否触发 |
| `cushion_command` | `str` | 坐垫按摩指令 |
| `cushion_massage_active` | `bool` | 坐垫按摩是否正在运行 |

**`deflate_cooldown` — 放气冷却锁状态：**

| 键 | 类型 | 说明 |
|---|---|---|
| `enabled` | `bool` | 放气冷却功能是否启用 |
| `max_commands` | `int` | 最大连续放气指令数 |
| `groups` | `Dict` | 各气囊组的锁定状态，每组含 `locked`(bool) 和 `counter`(int) |

**`step_drop_detection` — 阶跃下降检测（可能为 `None`）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `enabled` | `bool` | 阶跃检测功能是否启用 |
| `history_avg` | `float` | 历史压力平均值 |
| `current_pressure` | `float` | 当前压力值 |
| `is_drop_detected` | `bool` | 是否检测到阶跃下降 |
| `triggered` | `bool` | 是否已触发阶跃放气 |
| `deflate_counter` | `int` | 当前放气计数 |
| `override_active` | `bool` | 阶跃放气是否正在覆盖正常控制 |

**`preference` — 品味管理器完整状态：**

| 键 | 类型 | 说明 |
|---|---|---|
| `active_body_shape` | `str` 或 `None` | 当前激活的体型 |
| `is_recording` | `bool` | 是否正在记录品味 |
| `recording_progress` | `Dict` 或 `None` | 记录进度详情 |
| `active_thresholds` | `Dict` | 当前生效的调节区间（含各区域的inflate/deflate阈值） |
| `using_preference` | `bool` | 是否使用品味区间 |
| `shapes` | `Dict` | 各体型的品味状态 |
| `config` | `Dict` | 品味管理器配置参数 |

**`preference_record_result` — 品味记录帧结果（可能为 `None`）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `status` | `str` | `"recording"` 或 `"completed"` |
| `current_frames` | `int` | 已采集帧数 |
| `total_frames` | `int` | 需采集总帧数 |
| `progress_pct` | `float` | 采集进度百分比 |
| `thresholds` | `Dict` | 仅 `status="completed"` 时存在，生成的品味阈值 |

---

### 3.3. `trigger_preference_recording(self, body_shape=None, airbag_ops=None) -> Dict`

启动一次新的品味记录流程。用户手动调节完气囊并感觉舒适后调用。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `body_shape` | `str` | 否 | 指定为哪个体型记录。`None` 则使用当前已识别的体型。可选值：`"瘦小"`, `"中等"`, `"高大"` |
| `airbag_ops` | `Dict` | 否 | 充放气次数字典。传入后激活鲁棒记录模式。未传入则退化为原始无过滤采集 |

**`airbag_ops` 字典格式：**

```python
{
    "lumbar":           {"inflate": 3, "deflate": 0},   # 腰托充气3次
    "side_wings_left":  {"inflate": 1, "deflate": 0},   # 左侧翼充气1次
    "side_wings_right": {"inflate": 0, "deflate": 0},   # 右侧翼未调节
    "leg_left":         {"inflate": 0, "deflate": 2},   # 左腿托放气2次
    "leg_right":        {"inflate": 0, "deflate": 1},   # 右腿托放气1次
}
```

**`airbag_ops` 支持的区域键名：**

| 键名 | 对应区域 | 影响的比例 |
|---|---|---|
| `lumbar` | 腰托 | 靠背上/下比 |
| `side_wings_left` | 左侧翼 | 左/右压力比 |
| `side_wings_right` | 右侧翼 | 左/右压力比 |
| `leg_left` | 左腿托 | 左腿前3/后3比 |
| `leg_right` | 右腿托 | 右腿前3/后3比 |

**返回值：** `Dict`

| 键 | 类型 | 说明 | 何时存在 |
|---|---|---|---|
| `success` | `bool` | 是否成功触发 | 始终 |
| `message` | `str` | 描述信息 | 始终 |
| `state` | `str` | 当前状态：`"RECORDING"` 或 `"ERROR"` | 始终 |
| `target_shape` | `str` | 目标体型 | 仅成功时 |
| `total_frames` | `int` | 需采集的总帧数 | 仅成功时 |
| `filter_mode` | `str` | 过滤模式：`"none"`, `"clamp"`, `"kalman"` | 仅成功时 |
| `confidence_intervals` | `Dict` | 各比例的置信区间 | 仅成功且有 `airbag_ops` 时 |

**`confidence_intervals` 子字段（每个比例键对应一个区间）：**

| 键 | 类型 | 说明 |
|---|---|---|
| `predicted_center` | `float` | 基于充放气次数预测的比例中心值 |
| `lower` | `float` | 置信区间下界 |
| `upper` | `float` | 置信区间上界 |
| `net_ops` | `int` | 净充放气次数（inflate - deflate） |

---

### 3.4. `cancel_preference_recording(self) -> Dict`

中断正在进行中的品味记录。

**输入参数：** 无

**返回值：** `Dict`

| 键 | 类型 | 说明 |
|---|---|---|
| `success` | `bool` | 是否成功取消 |
| `message` | `str` | 描述信息 |

---

### 3.5. `get_preference_status(self) -> Dict`

获取品味管理器的完整实时状态。

**输入参数：** 无

**返回值：** `Dict`

| 键 | 类型 | 说明 |
|---|---|---|
| `active_body_shape` | `str` 或 `None` | 当前激活的体型 |
| `is_recording` | `bool` | 是否正在记录 |
| `recording_progress` | `Dict` 或 `None` | 记录进度（`current_frames`, `total_frames`, `progress_pct`, `target_shape`, `filter_mode`） |
| `active_thresholds` | `Dict` | 当前生效的调节区间 |
| `using_preference` | `bool` | 是否使用品味区间（`True` = 品味覆盖，`False` = 默认配置） |
| `shapes` | `Dict` | 各体型的品味状态，格式：`{"瘦小": {"has_preference": True, "thresholds": {...}}, ...}` |
| `config` | `Dict` | 品味管理器配置参数 |

**`active_thresholds` 子字段：**

| 键 | 类型 | 说明 |
|---|---|---|
| `lumbar_inflate` | `float` | 腰托充气阈值（上/下比高于此值时充气） |
| `lumbar_deflate` | `float` | 腰托放气阈值（上/下比低于此值时放气） |
| `side_wing_inflate` | `float` | 侧翼充气阈值 |
| `side_wing_deflate` | `float` | 侧翼放气阈值 |
| `left_leg_inflate` | `float` | 左腿托充气阈值（前3/后3比低于此值时充气） |
| `left_leg_deflate` | `float` | 左腿托放气阈值（前3/后3比高于此值时放气） |
| `right_leg_inflate` | `float` | 右腿托充气阈值 |
| `right_leg_deflate` | `float` | 右腿托放气阈值 |

---

### 3.6. `clear_preference(self, body_shape=None) -> Dict`

清除指定体型（或所有体型）已保存的品味数据。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `body_shape` | `str` | 否 | 指定体型。`None` 则清除所有体型的品味数据 |

**返回值：** `Dict`

| 键 | 类型 | 说明 |
|---|---|---|
| `success` | `bool` | 是否成功 |
| `message` | `str` | 描述信息 |

---

### 3.7. `trigger_body_shape_classification(self) -> Dict`

手动触发体型三分类识别。通常由 `auto_trigger` 自动触发，也可手动调用。

**输入参数：** 无

**返回值：** `Dict`

| 键 | 类型 | 说明 |
|---|---|---|
| `success` | `bool` | 是否成功触发 |
| `message` | `str` | 描述信息 |
| `state` | `str` | 当前状态：`"COLLECTING"`, `"DISABLED"`, 等 |

---

### 3.8. `get_body_shape_result(self) -> Optional[Dict]`

获取体型三分类的最新结果。

**输入参数：** 无

**返回值：** `Dict` 或 `None`（功能未启用或未完成分类时返回 `None`）

| 键 | 类型 | 说明 |
|---|---|---|
| `label` | `int` | 分类标签：`0` = 瘦小，`1` = 中等，`2` = 高大 |
| `body_shape` | `str` | 分类结果：`"瘦小"`, `"中等"`, `"高大"` |
| `confidence` | `float` | 置信度 `[0.0, 1.0]` |
| `probabilities` | `Dict` | 概率分布：`{"瘦小": 0.1, "中等": 0.3, "高大": 0.6}` |

---

### 3.9. `get_body_shape_status(self) -> Dict`

获取体型三分类器的当前状态。

**输入参数：** 无

**返回值：** `Dict`

| 键 | 类型 | 说明 |
|---|---|---|
| `state` | `str` | `"IDLE"`, `"COLLECTING"`, `"CLASSIFYING"`, `"COMPLETED"`, `"DISABLED"` |
| `model_loaded` | `bool` | 模型是否已加载 |
| `progress` | `float` | 采集进度（仅 COLLECTING 状态） |
| `remaining_sec` | `float` | 剩余采集时间（秒，仅 COLLECTING 状态） |
| `result` | `Dict` | 分类结果（仅 COMPLETED 状态，含 `label`, `body_shape`, `confidence`, `probabilities`） |

---

### 3.10. `get_pending_commands(self) -> List[Dict]`

获取队列中所有待处理的指令（非阻塞）。适用于异步架构中批量获取指令。

**输入参数：** 无

**返回值：** `List[Dict]`，每个元素包含：

| 键 | 类型 | 说明 |
|---|---|---|
| `command` | `List[int]` | 55个十进制整数的协议帧 |
| `frame_count` | `int` | 生成该指令时的帧计数 |
| `command_count` | `int` | 指令序号 |
| `state` | `str` | 生成该指令时的状态机状态 |
| `decision_data` | `Dict` | 控制决策数据（同 `control_decision_data`） |

---

### 3.11. `reset(self)`

重置系统到初始状态。保留已存储的品味数据，但清除所有运行时状态。

**输入参数：** 无  
**返回值：** 无

---

### 3.12. `reset_massage(self, clear_history=False)`

重置拍打按摩为关闭状态。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `clear_history` | `bool` | 否 | 是否同时清空拍打检测历史缓冲。默认 `False`，仅关闭按摩 |

**返回值：** 无

---

### 3.13. `set_param(self, key, value, auto_save=True)`

运行时动态修改参数。

**输入参数：**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `key` | `str` | 是 | 参数名（简短形式或完整配置路径） |
| `value` | `Any` | 是 | 新值 |
| `auto_save` | `bool` | 否 | 是否自动保存到配置文件。默认 `True` |

**支持的参数名：**

| 简短名称 | 配置路径 | 说明 |
|---|---|---|
| `cushion_sum_threshold` | `integrated_system.cushion_sum_threshold` | 坐垫压力阈值 |
| `backrest_sum_threshold` | `integrated_system.backrest_sum_threshold` | 靠背压力阈值 |
| `off_seat_frames_threshold` | `integrated_system.off_seat_frames_threshold` | 离座判定帧数 |
| `reset_frames_threshold` | `integrated_system.reset_frames_threshold` | 复位帧数 |
| `control_check_interval` | `control.check_interval_frames` | 控制检查间隔帧数 |
| `living_window_size` | `living_detection.window_size_frames` | 活体检测窗口大小 |
| `living_detection_interval` | `living_detection.detection_interval_frames` | 活体检测间隔 |
| `living_sad_threshold` | `living_detection.sad_threshold` | SAD阈值 |
| `living_queue_size` | `living_detection.queue_size` | 活体队列大小 |
| `body_threshold` | `body_type_detection.threshold` | 体型检测阈值 |

**返回值：** 无

---

## 4. 配置文件 (`sensor_config.yaml`)

所有算法参数和开关都在 `sensor_config.yaml` 中配置。以下列出关键配置项：

### 4.1. 品味记忆配置 (`preference`)

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `preference.enabled` | `bool` | `true` | 是否启用品味记忆功能 |
| `preference.recording_frames` | `int` | `30` | 品味记录采集帧数 |
| `preference.margin` | `float` | `0.15` | 默认阈值扩展margin |
| `preference.lumbar_margin` | `float` | `0.3` | 腰托阈值扩展margin |
| `preference.side_wing_margin` | `float` | `0.2` | 侧翼阈值扩展margin |
| `preference.leg_support_margin` | `float` | `0.2` | 腿托阈值扩展margin |
| `preference.robust_filter_mode` | `str` | `"clamp"` | 鲁棒过滤模式：`"none"`, `"clamp"`, `"kalman"` |
| `preference.step_factor` | `float` | `0.05` | 每次充/放气操作对比例值的乘法因子 |
| `preference.confidence_tolerance` | `float` | `0.15` | 置信区间容差（比例） |
| `preference.kalman_process_noise` | `float` | `0.001` | 卡尔曼滤波过程噪声 |
| `preference.kalman_measurement_noise` | `float` | `0.01` | 卡尔曼滤波观测噪声 |

### 4.2. 腿托控制配置 (`leg_support`)

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `leg_support.left_f3r3_inflate` | `float` | `0.48` | 左腿充气阈值（前3/后3比低于此值时充气） |
| `leg_support.left_f3r3_deflate` | `float` | `0.70` | 左腿放气阈值 |
| `leg_support.right_f3r3_inflate` | `float` | `0.64` | 右腿充气阈值 |
| `leg_support.right_f3r3_deflate` | `float` | `0.96` | 右腿放气阈值 |
| `leg_support.front_rows` | `list` | `[0, 1, 2]` | 前3行索引 |
| `leg_support.rear_rows` | `list` | `[7, 8, 9]` | 后3行索引 |

### 4.3. 体型三分类配置 (`body_shape_classification`)

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `body_shape_classification.enabled` | `bool` | `true` | 是否启用体型三分类 |
| `body_shape_classification.auto_trigger` | `bool` | `true` | 入座稳定后是否自动触发 |

---

## 5. 附录

- **品味记忆功能深度解析（含鲁棒记录算法原理）**: [PREFERENCE_FUNCTION_DEEP_DIVE.md](./PREFERENCE_FUNCTION_DEEP_DIVE.md)
