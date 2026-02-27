# `process_frame` 输出字段详解

`process_frame` 方法的返回值是一个字典，其中包含三个核心独立字段，用于满足绝大部分集成需求。所有其他字段均为调试或高级用途，集成时应优先使用这三个字段。

---

## 1. `seat_status` (离座状态)

**类型**: `Dict`

**描述**: 提供关于座椅占用状态的实时信息。

| 键 | 类型 | 描述 |
|---|---|---|
| `state` | `str` | 当前座椅状态机的状态名。可能的值：`OFF_SEAT` (无人), `CUSHION_ONLY` (仅坐垫有压力), `ADAPTIVE_LOCKED` (全座有压力，可进行自适应调节), `RESETTING` (离座后复位中)。 |
| `is_off_seat` | `bool` | `True` 表示座椅上无人。 |
| `is_seated` | `bool` | `True` 表示座椅上有人（包含 `CUSHION_ONLY` 和 `ADAPTIVE_LOCKED` 两种状态）。 |
| `is_resetting` | `bool` | `True` 表示座椅正在执行离座后的复位流程。 |

**示例**:
```json
{
  "state": "ADAPTIVE_LOCKED",
  "is_off_seat": false,
  "is_seated": true,
  "is_resetting": false
}
```

---

## 2. `body_shape_info` (体型相关信息)

**类型**: `Dict`

**描述**: 包含体型三分类和品味记忆功能的所有相关状态和结果。

| 键 | 类型 | 描述 |
|---|---|---|
| `body_shape` | `str` | 体型三分类的最终结果。可能的值：`'瘦小'`, `'中等'`, `'高大'`, `''` (空字符串表示尚未识别或未启用)。 |
| `body_shape_state` | `str` | 体型三分类器的内部状态。可能的值：`IDLE` (空闲), `COLLECTING` (采集中), `CLASSIFYING` (分类中), `COMPLETED` (已完成), `DISABLED` (未启用)。 |
| `confidence` | `float` | 体型分类结果的置信度，范围 `[0.0, 1.0]`。 |
| `probabilities` | `Dict` | 体型分类的概率分布字典，例如 `{'瘦小': 0.1, '中等': 0.8, '高大': 0.1}`。 |
| `preference` | `Dict` | 品味记忆功能的状态子字典。 |

### `preference` 子字段

| 键 | 类型 | 描述 |
|---|---|---|
| `active_body_shape` | `str` | 当前品味管理器关联的体型。 |
| `using_preference` | `bool` | `True` 表示当前的气囊调节正在使用已保存的品味区间，而不是默认区间。 |
| `is_recording` | `bool` | `True` 表示系统正在记录新的品味。 |
| `recording_progress`| `Dict` or `None` | 如果正在记录品味，此字段提供进度详情，否则为 `None`。包含 `target_shape`, `current_frames`, `total_frames`, `progress_pct`。 |

**示例**:
```json
{
  "body_shape": "中等",
  "body_shape_state": "COMPLETED",
  "confidence": 0.95,
  "probabilities": {
    "瘦小": 0.02,
    "中等": 0.95,
    "高大": 0.03
  },
  "preference": {
    "active_body_shape": "中等",
    "using_preference": true,
    "is_recording": false,
    "recording_progress": null
  }
}
```

---

## 3. `airbag_command` (气囊指令)

**类型**: `Dict`

**描述**: 包含算法生成的最终气囊控制指令。

| 键 | 类型 | 描述 |
|---|---|---|
| `command` | `List[int]` or `None` | 包含55个十进制整数的气囊控制指令列表。`None` 表示本帧无需发送新指令。 |
| `is_new_command` | `bool` | `True` 表示 `command` 字段是本帧新生成的指令，需要下发给硬件。`False` 表示 `command` 字段与上一帧相同，无需重复下发。 |

**示例**:
```json
{
  "command": [1, 0, 0, ..., 2, 0, 0],  // 长度为55的列表
  "is_new_command": true
}
```
