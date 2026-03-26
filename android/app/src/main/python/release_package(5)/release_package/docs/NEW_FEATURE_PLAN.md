# 新功能开发文档 v1.1.0

**版本**: 1.1.0
**日期**: 2026-03-20
**分支**: feature/new-control-modes

## 一、功能概述

本次开发包含三个核心新功能，均已通过单元测试验证（8/8通过）。

| 功能编号 | 功能名称 | 修改文件 | 状态 |
|---------|---------|---------|------|
| F1 | 离座reset阶段时间调整 | sensor_config.yaml, integrated_system.py | 已完成 |
| F2 | 臀托初始化与品味联动 | sensor_config.yaml, integrated_system.py, preference_manager.py | 已完成 |
| F3 | 双模式控制（体验版/量产版） | sensor_config.yaml, integrated_system.py | 已完成 |

## 二、功能详细说明

### F1: 离座reset阶段时间调整

**需求**: 离座后放气10秒，保持10秒，总共20秒，后续不再继续动作。

**实现方案**:

在 `sensor_config.yaml` 中调整复位参数：
- `reset_frames_threshold`: 260帧（20秒 x 13Hz）
- `reset_deflate_frames`: 130帧（10秒 x 13Hz）

复位流程：
1. 检测到离座 → 进入 `RESETTING` 状态
2. 前130帧（约10秒）：全部24个气囊放气
3. 后130帧（约10秒）：全部24个气囊保持
4. 复位完成 → 进入 `OFF_SEAT` 状态

### F2: 臀托初始化与品味联动

**需求**: 在初始化阶段添加臀托的独立初始化，与品味系数联动。

**算法方案**:

```
总初始化周期数 = 基础周期数 + 品味额外周期数
品味额外周期数 = 净充放气次数 x 每次操作秒数(3s) x 每秒周期数(Hz/控制间隔)
```

**关键参数**:
- `hip_airbags`: [7, 8]（臀托气囊编号）
- `hip_base_cycles`: 26（基础初始化周期数，约2秒）
- `hip_preference_seconds_per_op`: 3（品味每次操作对应秒数）

**执行逻辑**:
1. 入座后首次确认活体时，同时启动支撑气囊初始化和臀托初始化
2. 臀托初始化调用 `_start_hip_init()` 方法：
   - 查询当前体型的品味数据中 `hip` 区域的 `net_ops`
   - 计算总周期数 = 基础周期数 + 净操作次数 x 3秒 x 每秒周期数
   - 总周期数 > 0 → 充气；< 0 → 放气；= 0 → 跳过
3. 支撑气囊和臀托各自独立计数，全部完成后进入正常控制阶段

**品味数据扩展**:
- `preference_manager.py` 的 `REGION_RATIO_MAP` 新增 `'hip': []`（空列表，表示臀托不参与任何压力比例计算）
- `INFLATE_DIRECTION` 新增 `'hip': {}`（空字典，表示臀托充放气不影响任何比例值的预期走向）
- `_finalize_recording()` 新增 `net_ops` 字段，记录各区域净充放气次数（包含 hip）
- `_airbag_to_region` 映射新增 `7: 'hip', 8: 'hip'`
- `manual_airbag_ops` 初始化新增 `'hip': {'inflate': 0, 'deflate': 0}`

**接口调用方式**:

当调用 `trigger_preference_recording(airbag_ops=...)` 或 `start_recording(shape, airbag_ops)` 时，传入的 `airbag_ops` 字典可以包含 `'hip'` 区域：

```python
airbag_ops = {
    'lumbar':           {'inflate': 3, 'deflate': 0},
    'side_wings_left':  {'inflate': 1, 'deflate': 0},
    'side_wings_right': {'inflate': 0, 'deflate': 0},
    'leg_left':         {'inflate': 0, 'deflate': 2},
    'leg_right':        {'inflate': 0, 'deflate': 1},
    'hip':              {'inflate': 2, 'deflate': 1},  # 臀托区域
}
system.trigger_preference_recording(airbag_ops=airbag_ops)
```

> **重要说明**：`hip` 区域与其他区域的处理方式不同。其他区域的充放气次数用于构建置信区间（用于采集时过滤异常帧），而 `hip` 区域的充放气次数仅记录净值（`inflate - deflate`），持久化到品味数据的 `net_ops` 字段中，用于下次入座时臀托初始化时长的联动调整。

**持久化数据结构变化**（`preferences.json`）:

```json
{
  "高大": {
    "ratios": { "lumbar_ratio": 0.85, "wing_ratio": 1.02, ... },
    "thresholds": { ... },
    "airbag_ops": {
      "lumbar": {"inflate": 3, "deflate": 0},
      "hip": {"inflate": 2, "deflate": 1}
    },
    "net_ops": {
      "lumbar": 3,
      "side_wings_left": 0,
      "side_wings_right": 0,
      "leg_left": 0,
      "leg_right": 0,
      "hip": 1
    }
  }
}
```

### F3: 双模式控制（体验版/量产版）

**需求**: 配置文件中支持两种模式切换。

| 参数 | Mode1 体验版 | Mode2 量产版 |
|------|-------------|-------------|
| 控制逻辑 | 持续自适应调节 | 自适应与保压交替 |
| 自适应时长 | 无限制 | 5秒（可配置） |
| 保压时长 | 无 | 10秒（可配置） |
| 配置键 | `control.mode: mode1` | `control.mode: mode2` |

**Mode2 量产版流程**:

```
入座 → 支撑气囊充气2s → 自适应调节5s → 全部保压x秒 → 自适应调节5s → ... → 离座放气10s
```

**Mode2 子状态机**:
- `adaptive` 状态：执行正常自适应控制逻辑，持续 `mode2_adaptive_frames` 帧
- `hold` 状态：发送全部保持指令，持续 `mode2_hold_frames` 帧
- 两个状态交替循环

**配置参数**:
```yaml
control:
  mode: mode1  # mode1=体验版, mode2=量产版
  mode2_adaptive_seconds: 5   # 自适应阶段秒数
  mode2_hold_seconds: 10      # 保压阶段秒数
```

## 三、新增API

| API | 返回类型 | 说明 |
|-----|---------|------|
| `get_control_mode()` | str | 返回 'mode1' 或 'mode2' |
| `get_mode2_status()` | Dict | 返回 Mode2 子状态机状态（sub_state, sub_counter, adaptive_frames, hold_frames） |

## 四、配置文件变更汇总

### sensor_config.yaml 新增/修改项

```yaml
control:
  mode: mode1                    # [新增] 控制模式
  mode2_adaptive_seconds: 5      # [新增] Mode2自适应秒数
  mode2_hold_seconds: 10         # [新增] Mode2保压秒数

integrated_system:
  reset_frames_threshold: 260    # [修改] 20秒（原65帧）
  reset_deflate_frames: 130      # [修改] 10秒（原32帧）
  init_inflate:
    hip_airbags: [7, 8]                  # [新增] 臀托气囊
    hip_base_cycles: 26                  # [新增] 臀托基础周期数
    hip_preference_seconds_per_op: 3     # [新增] 品味每次操作秒数

airbag_mapping:
  7: 臀托1                       # [新增] 气囊映射
  8: 臀托2                       # [新增] 气囊映射
```

## 五、测试验证

8项单元测试全部通过：

| 测试项 | 说明 | 结果 |
|-------|------|------|
| test_reset_timing | 离座reset时间配置 | 通过 |
| test_hip_init_basic | 臀托初始化基本功能 | 通过 |
| test_hip_init_with_preference | 臀托初始化与品味联动 | 通过 |
| test_dual_mode_config | 双模式控制配置 | 通过 |
| test_mode2_state_machine | Mode2子状态机切换 | 通过 |
| test_preference_hip_region | 品味管理器hip区域 | 通过 |
| test_reset_state_cleanup | reset方法状态清理 | 通过 |
| test_airbag_to_region_mapping | 气囊区域映射 | 通过 |
