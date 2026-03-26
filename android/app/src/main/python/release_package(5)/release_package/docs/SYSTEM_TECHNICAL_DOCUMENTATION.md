# 汽车座椅压力传感器智能控制系统 - 核心技术文档

**版本**: v1.1.0
**日期**: 2026-03-20
**文档状态**: 正式版

本文档旨在全面记录北汽汽车座椅压力传感器智能控制系统的所有功能、算法原理、模型训练方式、数据挖掘过程以及版本演进和实现思路。本文档作为项目的核心技术资产，为后续的维护、升级和复用提供详尽的参考。

---

## 目录

1. [系统架构与核心功能总览](#1-系统架构与核心功能总览)
2. [传感器硬件布局与数据预处理](#2-传感器硬件布局与数据预处理)
3. [配置参数完整参考](#3-配置参数完整参考)
4. [核心状态机详解](#4-核心状态机详解)
5. [活体检测模块](#5-活体检测模块)
6. [体型检测模块](#6-体型检测模块)
7. [体型三分类模块（机器学习）](#7-体型三分类模块机器学习)
8. [自适应气囊控制模块](#8-自适应气囊控制模块)
9. [品味记忆模块](#9-品味记忆模块)
10. [双模式控制架构](#10-双模式控制架构)
11. [拍打按摩检测模块](#11-拍打按摩检测模块)
12. [通信协议与帧格式](#12-通信协议与帧格式)
13. [数据挖掘过程详解](#13-数据挖掘过程详解)
14. [模型训练完整流程](#14-模型训练完整流程)
15. [版本演进记录](#15-版本演进记录)
16. [实现思路与可复用设计模式](#16-实现思路与可复用设计模式)
17. [已知局限性与后续方向](#17-已知局限性与后续方向)

---

## 1. 系统架构与核心功能总览

### 1.1 系统定位

本系统是一套嵌入式座椅智能控制算法，运行于车载控制器上，通过实时分析144点压力传感器阵列的数据，驱动24路气囊执行自适应充放气控制，为乘客提供个性化的舒适支撑体验。

### 1.2 核心功能清单

| 序号 | 功能模块 | 核心文件 | 功能描述 |
|------|----------|----------|----------|
| 1 | 活体检测 | `control.py` | 基于SAD算法判断座椅上是否为活体，过滤静态重物 |
| 2 | 体型检测 | `control.py` | 基于压力总和的快速分类（大人/小孩/空座） |
| 3 | 体型三分类 | `body_shape_classifier.py` | 基于KNN的精细体型识别（瘦小/中等/高大） |
| 4 | 腰托自适应控制 | `integrated_system.py` | 基于靠背上下区域压力比的充放气调节 |
| 5 | 侧翼自适应控制 | `integrated_system.py` | 基于靠背左右区域压力比的充放气调节 |
| 6 | 腿托自适应控制 | `integrated_system.py` | 基于坐垫前3后3行压力比的左右独立控制 |
| 7 | 品味记忆 | `preference_manager.py` | 用户偏好记录、持久化、体型关联、区间自动生成 |
| 8 | 双模式控制 | `integrated_system.py` | 体验版（持续自适应）与量产版（自适应/保压交替） |
| 9 | 拍打按摩 | `integrated_system.py` | 基于压力突变的按摩动作识别（当前已屏蔽输出） |
| 10 | 臀托品味联动 | `integrated_system.py` | 臀托初始化时间与品味净操作次数联动 |

### 1.3 文件结构

```
car-beiqi/
├── integrated_system.py       # 集成系统主控（状态机、控制逻辑、对外接口）
├── control.py                 # 活体检测器、体型检测器、控制动作枚举
├── config.py                  # YAML配置加载器（支持点分路径访问）
├── body_shape_classifier.py   # 体型三分类推理器（加载模型、概率软投票）
├── preference_manager.py      # 品味记忆管理器（记录、计算、持久化）
├── version.py                 # 版本号定义
├── sensor_config.yaml         # 统一配置文件
├── model/
│   └── body_shape_model.pkl   # 预训练体型三分类模型
├── body_type_classifier/      # 模型训练工具链
│   ├── data_loader.py         # 训练数据加载与预处理
│   ├── feature_engineer.py    # 特征工程（滑动窗口聚合）
│   └── classifier.py          # 模型训练、评估与持久化
├── training/
│   ├── run_classification.py  # 训练实验入口脚本
│   ├── train_model.py         # 模型训练入口
│   └── output/                # 训练输出（报告、模型评估）
├── analysis/
│   ├── scripts/               # 数据挖掘脚本
│   └── notes/                 # 分析笔记与结论
├── docs/                      # 文档目录
└── release_package/           # 发布包
```

---

## 2. 传感器硬件布局与数据预处理

### 2.1 传感器阵列布局

系统使用144个压力传感器，分布在靠背和坐垫两个区域。每个区域由一个**中间大矩阵**（10行 × 6列 = 60个传感器）和若干**侧翼小矩形**（共12个传感器）组成。

**靠背区域（72个传感器）**：
- 中间大矩阵：10行 × 6列 = 60个传感器，覆盖肩部到腰部
- 左右侧翼小矩形：各6个传感器（共12个），位于矩阵两侧

**坐垫区域（72个传感器）**：
- 中间大矩阵：10行 × 6列 = 60个传感器，覆盖臀部到大腿
- 左右侧翼小矩形：各6个传感器（共12个），位于矩阵两侧

### 2.2 矩阵区域划分

靠背和坐垫的中间大矩阵被进一步划分为多个功能区域，用于不同的控制算法。所有划分均基于**固定行/列索引**，在 `sensor_config.yaml` 中配置：

| 区域名称 | 矩阵来源 | 行范围 | 列范围 | 用途 |
|----------|----------|--------|--------|------|
| `backrest_upper` | 靠背 | [0, 5) | 全部 | 肩部区域，用于腰托上下比计算 |
| `backrest_lower` | 靠背 | [5, 10) | 全部 | 腰部区域，用于腰托上下比计算 |
| `backrest_left` | 靠背 | 全部 | [0, mid_col) | 靠背左半侧，用于侧翼左右比计算 |
| `backrest_right` | 靠背 | 全部 | [mid_col, 6) | 靠背右半侧，用于侧翼左右比计算 |
| `cushion_butt` | 坐垫 | [5, 10) | 全部 | 臀部区域（注意：行5-9为臀部） |
| `cushion_leg` | 坐垫 | [2, 5) | 全部 | 腿部区域 |
| `cushion_front3` | 坐垫 | [0, 3) | 全部 | 前3行（膝盖侧），用于腿托前3后3比 |
| `cushion_rear3` | 坐垫 | [7, 10) | 全部 | 后3行（臀部侧），用于腿托前3后3比 |

> **设计说明**：`mid_col` 默认为 `6 // 2 = 3`，即第3列为左右分界。所有区域划分均为静态配置，不会根据用户体型动态调整。这种方式简单可靠，但对极端体型（如身高差异导致腰部实际位置偏移）的适应性有限。

### 2.3 数据预处理流程

原始传感器数据经过以下预处理步骤后，才进入控制算法：

**步骤1：预处理矫正（靠背和坐垫均适用）**

当 `matrix.pre_correction.enabled = true` 时：

```
corrected_value = max(0, pre_correction_value - raw_value) × multiplier
```

其中 `pre_correction_value = 1365.33`（即 4096/3），`multiplier = 0.5`。此步骤将ADC原始值转换为有效压力值，并消除传感器的零点偏移。

**步骤2：坐垫分压矫正（仅坐垫，可选）**

当 `matrix.voltage_divider_correction.enabled = true` 时，对坐垫数据额外应用分压矫正：

```
final_value = max(0, voltage_divider_value - corrected_value)
```

其中 `voltage_divider_value = 682.67`（即 4096/6）。当前版本此功能默认关闭。

**步骤3：连通域滤波（仅体型检测使用）**

体型检测器 `BodyTypeDetector` 在计算压力总和前，会先执行连通域滤波：
1. 将矩阵二值化：压力值 ≥ 20 的点标记为1，否则为0。
2. 使用8联通DFS算法标记所有连通区域。
3. 移除面积小于6个点的连通区域（视为噪点）。
4. 在滤波后的掩码上计算有效压力总和（`filtered_sum`）。

---

## 3. 配置参数完整参考

所有配置参数集中在 `sensor_config.yaml` 文件中，通过 `Config` 类以点分路径方式访问（如 `config.get('lumbar.upper_lower_ratio_inflate')`）。

### 3.1 系统全局参数

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `system.hz` | 13 | 系统采样频率（帧/秒） |
| `control.check_interval_frames` | 4 | 控制逻辑检查间隔（帧数），每4帧执行一次气囊调节判断 |
| `control.mode` | `mode1` | 控制模式：`mode1`=体验版，`mode2`=量产版 |
| `control.mode2_adaptive_seconds` | 5 | Mode2自适应调节阶段持续秒数 |
| `control.mode2_hold_seconds` | 10 | Mode2保压阶段持续秒数 |

### 3.2 气囊控制参数

**腰托参数**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `lumbar.back_total_threshold` | 15.0 | 背部总压力阈值，低于此值不调节腰托 |
| `lumbar.upper_lower_ratio_inflate` | 0.9 | 上/下压力比 > 此值时充气腰托 |
| `lumbar.upper_lower_ratio_deflate` | 0.35 | 上/下压力比 < 此值时放气腰托 |
| `lumbar.airbags` | [5, 6] | 腰托气囊编号 |

**侧翼参数**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `side_wings.left_right_ratio_inflate_left` | 0.8 | 左/右比 < 此值时左侧放气、右侧充气 |
| `side_wings.left_right_ratio_deflate_left` | 1.3 | 左/右比 > 此值时左侧充气、右侧放气 |
| `side_wings.left_airbags` | [2, 4] | 左侧翼气囊编号 |
| `side_wings.right_airbags` | [1, 3] | 右侧翼气囊编号 |

**腿托参数**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `leg_support.front_rows` | [0, 3] | 前3行范围（行0-2），腿前端 |
| `leg_support.rear_rows` | [7, 10] | 后3行范围（行7-9），臀后端 |
| `leg_support.left_f3r3_inflate` | 0.48 | 左腿前3后3比 < 此值时充气 |
| `leg_support.left_f3r3_deflate` | 0.70 | 左腿前3后3比 > 此值时放气 |
| `leg_support.right_f3r3_inflate` | 0.64 | 右腿前3后3比 < 此值时充气 |
| `leg_support.right_f3r3_deflate` | 0.96 | 右腿前3后3比 > 此值时放气 |
| `leg_support.left_airbags` | [9] | 左腿托气囊编号 |
| `leg_support.right_airbags` | [10] | 右腿托气囊编号 |

> **重要说明**：腿托阈值为**所有体型统一**的左右独立阈值，不区分瘦小/中等/高大。右腿阈值普遍高于左腿约0.15-0.20，这与座椅本身的物理结构有关。

### 3.3 集成系统参数

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `integrated_system.cushion_sum_threshold` | 1700.0 | 坐垫压力总和阈值，判定有人坐下 |
| `integrated_system.backrest_sum_threshold` | 1000.0 | 靠背压力总和阈值，判定靠背有压力 |
| `integrated_system.off_seat_frames_threshold` | 14 | 离座判定防抖帧数（约1秒） |
| `integrated_system.reset_frames_threshold` | 260 | 复位总时间（帧数），约20秒 |
| `integrated_system.reset_deflate_frames` | 130 | 复位放气阶段时长（帧数），约10秒 |
| `integrated_system.backrest_buffer_frames` | 13 | 靠背压力消失缓冲时间（1秒） |
| `integrated_system.use_filtered_sum` | true | 是否使用滤波后的压力总和 |

**初始化充气参数**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `integrated_system.init_inflate.enabled` | true | 是否启用初始化充气 |
| `integrated_system.init_inflate.cycles` | 52 | 支撑气囊初始化充气周期数（约4秒） |
| `integrated_system.init_inflate.airbags` | [5,6,1,2,3,4] | 需初始化充气的支撑气囊（不含臀托） |
| `integrated_system.init_inflate.hip_airbags` | [7, 8] | 臀托气囊编号 |
| `integrated_system.init_inflate.hip_base_cycles` | 26 | 臀托基础初始化周期数（约2秒） |
| `integrated_system.init_inflate.hip_preference_seconds_per_op` | 3 | 品味每次操作对应的秒数 |

**放气冷却锁参数**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `integrated_system.deflate_cooldown.enabled` | true | 是否启用放气冷却锁 |
| `integrated_system.deflate_cooldown.max_continuous_commands` | 16 | 最大连续放气指令次数（约5秒） |
| `integrated_system.deflate_cooldown.reset_on_no_deflate` | true | 无放气指令时是否重置计数 |

**阶跃下降检测参数**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `integrated_system.step_drop_detection.enabled` | true | 是否启用阶跃下降检测 |
| `integrated_system.step_drop_detection.window_frames` | 26 | 历史窗口长度（约2秒） |
| `integrated_system.step_drop_detection.history_gap_frames` | 26 | 历史窗口与当前的间隔（约2秒） |
| `integrated_system.step_drop_detection.pressure_threshold` | 6000.0 | 历史窗口压力阈值 |
| `integrated_system.step_drop_detection.drop_ratio` | 0.6 | 阶跃比例（当前值 < 历史均值 × 此值时触发） |
| `integrated_system.step_drop_detection.confirm_cycles` | 2 | 确认周期数 |
| `integrated_system.step_drop_detection.deflate_cycles` | 9 | 触发后放气周期数 |
| `integrated_system.step_drop_detection.deflate_airbags` | [1-24] | 触发后放气的气囊（全部24路） |

### 3.4 检测模块参数

**活体检测**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `living_detection.enabled` | true | 是否启用活体检测 |
| `living_detection.window_size_frames` | 13 | 检测窗口大小（1秒） |
| `living_detection.detection_interval_frames` | 13 | 检测间隔（1秒） |
| `living_detection.queue_size` | 3 | 状态机队列长度（连续3次一致才确认） |
| `living_detection.sad.normalize_scale` | 5 | SAD归一化缩放因子 |
| `living_detection.sad_threshold` | 0.6 | SAD判定阈值 |

**体型检测**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `body_type_detection.enabled` | true | 是否启用体型检测 |
| `body_type_detection.detection_interval_frames` | 13 | 检测间隔（1秒） |
| `body_type_detection.queue_size` | 2 | 体型锁定队列长度 |
| `body_type_detection.threshold` | 20 | 二值化阈值 |
| `body_type_detection.min_component_size` | 6 | 最小连通域大小 |
| `body_type_detection.body_size_adult_threshold` | 6500.0 | 成人体型阈值 |
| `body_type_detection.body_size_child_threshold` | 3000.0 | 儿童体型阈值 |

**体型三分类**：

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `body_shape_classification.enabled` | true | 是否启用体型三分类 |
| `body_shape_classification.auto_trigger` | true | 入座后自动触发识别 |
| `body_shape_classification.collect_frames` | 30 | 触发后采集的有效帧数（约2.3秒） |
| `body_shape_classification.model_path` | `model/body_shape_model.pkl` | 预训练模型路径 |
| `body_shape_classification.seated_threshold` | 2000 | 坐垫压力固定阈值兜底 |
| `body_shape_classification.seated_threshold_ratio` | 0.3 | 自适应阈值比例 |
| `body_shape_classification.baseline_frames` | 10 | 自适应阈值所需历史帧数 |
| `body_shape_classification.stable_frames` | 5 | 连续超过阈值才认为稳定入座 |
| `body_shape_classification.timeout_frames` | 300 | 采集超时帧数 |

### 3.5 品味管理参数

| 参数路径 | 默认值 | 说明 |
|----------|--------|------|
| `preference.enabled` | true | 是否启用品味管理 |
| `preference.record_frames` | 30 | 品味记录时采集帧数（约2.3秒） |
| `preference.storage_path` | `preference_data.json` | 持久化文件路径 |
| `preference.lumbar_margin` | 0.3 | 腰托区间拓展幅度 |
| `preference.side_wing_margin` | 0.2 | 侧翼区间拓展幅度 |
| `preference.leg_support_margin` | 0.2 | 腿托区间拓展幅度 |
| `preference.robust_filter_mode` | `clamp` | 过滤模式（`clamp`=截断，`kalman`=卡尔曼融合） |
| `preference.step_factor` | 0.05 | 每次操作对比例值的乘法因子 |
| `preference.confidence_tolerance` | 0.3 | 置信区间容差（乘法容差） |

### 3.6 气囊编号映射

| 气囊编号 | 名称 | 功能分组 |
|----------|------|----------|
| 1 | 右侧翼上 | 侧翼控制 |
| 2 | 左侧翼上 | 侧翼控制 |
| 3 | 右侧翼下 | 侧翼控制 |
| 4 | 左侧翼下 | 侧翼控制 |
| 5 | 腰托1 | 腰托控制 |
| 6 | 腰托2 | 腰托控制 |
| 7 | 臀托1 | 臀托控制（品味联动） |
| 8 | 臀托2 | 臀托控制（品味联动） |
| 9 | 腿托1（左） | 腿托控制 |
| 10 | 腿托2（右） | 腿托控制 |
| 11-18 | 靠背按摩气囊 | 按摩功能（强制保持，不受控制逻辑影响） |
| 19-24 | 坐垫按摩气囊 | 按摩功能（强制保持，不受控制逻辑影响） |

> **安全保护**：在 `_generate_protocol_frame` 中，按摩气囊（11-24）始终被强制设置为保持状态（`gear_stop = 0`），无论任何模式或指令来源，都不会对按摩气囊发送充放气指令。

---

## 4. 核心状态机详解

### 4.1 状态定义

系统核心由 `IntegratedSeatSystem` 驱动，维护一个四状态的有限状态机（FSM），定义在 `IntegratedState` 枚举中：

| 状态 | 枚举值 | 含义 | 活跃的子模块 |
|------|--------|------|-------------|
| `OFF_SEAT` | 0 | 离座待机 | 无（等待压力触发） |
| `CUSHION_ONLY` | 1 | 仅坐垫有压力 | 活体检测、体型检测、体型三分类采集 |
| `ADAPTIVE_LOCKED` | 2 | 自适应锁定 | 初始化充气 → 自适应控制（或Mode2交替） |
| `RESETTING` | 3 | 离座复位中 | 放气10s → 保持10s → 返回OFF_SEAT |

### 4.2 状态转换条件

**OFF_SEAT → CUSHION_ONLY**：
- 条件：`cushion_sum >= cushion_sum_threshold`（坐垫有压力）且 `backrest_sum < backrest_sum_threshold`（靠背无压力）
- 动作：清空活体队列、重置自适应控制锁、重置体型锁、重置放气冷却锁
- 场景：用户刚坐下但尚未靠背

**OFF_SEAT → ADAPTIVE_LOCKED**：
- 条件：`cushion_sum >= cushion_sum_threshold` 且 `backrest_sum >= backrest_sum_threshold`
- 动作：同上，且触发体型三分类自动采集
- 场景：用户直接坐下并靠背

**CUSHION_ONLY → ADAPTIVE_LOCKED**：
- 条件：`cushion_sum >= cushion_sum_threshold` 且 `backrest_sum >= backrest_sum_threshold`
- 动作：保留已有的活体和体型检测历史队列，触发体型三分类
- 场景：用户从前倾姿势靠回靠背

**CUSHION_ONLY → RESETTING**：
- 条件：`cushion_sum < cushion_sum_threshold` 且持续 `off_seat_frames_threshold` 帧（约1秒防抖）
- 动作：重置体型三分类结果、清除品味激活状态、重置Mode2子状态机
- 场景：用户短暂坐下后离开

**ADAPTIVE_LOCKED → RESETTING**：
- 条件1（靠背消失）：`backrest_sum < backrest_sum_threshold` 且持续 `backrest_buffer_frames` 帧
- 条件2（坐垫消失）：`cushion_sum < cushion_sum_threshold` 且持续 `off_seat_frames_threshold` 帧
- 条件3（阶跃下降）：坐垫压力发生阶跃式下降（当前值 < 历史均值 × `drop_ratio`），连续 `confirm_cycles` 个控制周期
- 动作：重置体型三分类结果、清除品味激活状态、重置臀托初始化状态、重置Mode2子状态机
- 场景：用户离开座椅

**RESETTING → OFF_SEAT**：
- 条件：复位计数器达到 `reset_frames_threshold`（260帧 ≈ 20秒）
- 动作：重置所有检测器和计数器
- 场景：复位完成，系统回到待机状态

### 4.3 RESETTING 阶段时序（v1.1.0）

复位阶段分为两个子阶段，总计20秒，之后不再继续任何动作：

```
RESETTING 开始
  ├── 放气阶段 [0, 130帧)     → 10秒，所有支撑气囊（1-10）执行放气
  └── 保持阶段 [130, 260帧)   → 10秒，所有气囊保持当前状态
RESETTING 结束 → OFF_SEAT
```

### 4.4 初始化充气流程

当系统从 `OFF_SEAT` 或 `CUSHION_ONLY` 进入 `ADAPTIVE_LOCKED` 时，如果活体检测确认为活体，则启动初始化充气：

**支撑气囊初始化**（气囊1-6）：
- 持续 `init_inflate.cycles`（52个周期 ≈ 4秒）
- 所有支撑气囊同时以 `gear_3`（快速充气）充气

**臀托初始化**（气囊7-8，独立计数器）：
- 基础周期数：`hip_base_cycles`（26个周期 ≈ 2秒）
- 品味联动：`总周期数 = 基础周期数 + 净操作次数 × 3秒 × 每秒周期数(13)`
- 若总周期数 > 0：执行充气
- 若总周期数 < 0：执行放气（取绝对值作为周期数）
- 若总周期数 = 0：跳过臀托初始化

---

## 5. 活体检测模块

### 5.1 模块概述

活体检测模块（`LivingDetector`）通过分析压力传感器数据的帧间差异（SAD），判断座椅上是否为活体（人）还是静物（物品）。活体会因呼吸、微小坐姿调整等产生持续的压力微变化，而静物的压力分布是稳定不变的。

### 5.2 算法原理

**SAD（Sum of Absolute Differences）算法**：

1. **帧差计算**：每帧计算当前帧与上一帧的逐像素绝对差之和的均值：
   ```
   SAD_energy = mean(|current_matrix - prev_matrix|)
   ```

2. **窗口统计**：在一个时间窗口（默认13帧 = 1秒）内，分别计算坐垫和靠背的SAD均值，取两者的最大值作为最终SAD能量：
   ```
   SAD_mean = max(mean(SAD_cushion_history), mean(SAD_backrest_history))
   ```

3. **归一化**：将SAD能量归一化到 [0, 1] 区间：
   ```
   SAD_score = min(1.0, SAD_energy / normalize_scale)
   ```
   其中 `normalize_scale = 5`。

4. **判定**：`SAD_score >= sad_threshold (0.6)` 则判定为活体。

### 5.3 检测周期与队列机制

- **检测间隔**：每 `detection_interval_frames`（13帧 = 1秒）执行一次检测
- **队列确认**：集成系统维护一个长度为 `queue_size`（3）的结果队列，连续3次检测结果一致才确认状态切换
- **设计意图**：防止单次检测的误判导致状态频繁切换

### 5.4 接口

```python
class LivingDetector:
    def update(self, cushion_matrix, backrest_matrix) -> Optional[Dict]
    # 每帧调用，返回检测结果（仅在检测周期触发时返回非None）
    # 返回值: {'is_living': bool, 'confidence': float, 'sad_score': float, ...}

    def get_status(self) -> Optional[Dict]
    # 获取最新检测结果

    def reset(self)
    # 重置检测器状态
```

---

## 6. 体型检测模块

### 6.1 模块概述

体型检测模块（`BodyTypeDetector`）通过分析压力矩阵的形态学特征，快速判断座椅上物体的体型类别（大人/小孩/未判断）。此模块用于基础的安全策略（如儿童座椅保护），与体型三分类模块互补。

### 6.2 算法流程

1. **二值化**：将压力矩阵中 ≥ 20 的点标记为有效点（1），其余为0
2. **连通域滤波**：使用8联通DFS算法，移除面积小于6个点的连通区域（噪点过滤）
3. **特征提取**：
   - `filtered_sum`：滤波后有效点的压力总和
   - `filtered_mean`：滤波后有效点的压力均值
   - `max_connected_component_size`：最大连通区域的面积
4. **体型判定**：基于坐垫的 `filtered_sum` 进行阈值判定

| 体型 | 条件 |
|------|------|
| 大人 | `filtered_sum >= 6500` |
| 小孩 | `3000 <= filtered_sum < 6500` |
| 未判断 | `filtered_sum < 3000` |

### 6.3 队列锁定机制

集成系统维护一个长度为 `queue_size`（2）的体型结果队列。连续2次检测结果一致时，体型结果被"锁定"（`body_type_locked = True`），后续不再更新。这防止了用户坐姿变化导致体型判定频繁切换。

### 6.4 接口

```python
class BodyTypeDetector:
    def update(self, cushion_matrix, backrest_matrix) -> Optional[Dict]
    # 每帧调用，返回检测结果（仅在检测周期触发时返回非None）
    # 返回值: {'cushion': {...}, 'backrest': {...}, 'body_size_type': str, ...}

    def reset(self)
    # 重置检测器状态
```

---

## 7. 体型三分类模块（机器学习）

### 7.1 模块概述

体型三分类模块（`BodyShapeClassifier`）是系统实现个性化控制的基础。它使用预训练的KNN模型，将用户分为"瘦小"、"中等"、"高大"三类，为品味记忆和自适应控制提供体型标签。

### 7.2 训练数据

**数据来源**：8名不同体重的受试者，在座椅上采集的压力传感器时序数据。

| 受试者 | 体型标签 | 体重 |
|--------|----------|------|
| 张 | 高大 | 92kg |
| 笑 | 高大 | 90kg |
| 涛 | 中等 | 70kg |
| 程 | 中等 | 60kg |
| 罗正科 | 中等 | 未知 |
| 罗正科2 | 中等 | 72kg |
| 曲 | 瘦小 | 48kg |
| 渠 | 瘦小 | 45kg |

**数据格式**：每个CSV文件包含144列传感器数据（靠背72 + 坐垫72），每行为一帧（13Hz采样）。

### 7.3 特征工程

特征工程由 `FeatureEngineer` 类实现，分为以下步骤：

**步骤1：原始特征提取**

从每帧的144点传感器数据中提取以下类别的特征：

| 特征类别 | 前缀 | 说明 | 示例特征 |
|----------|------|------|----------|
| 全局特征 | `full_` | 全144点的统计量 | `full_sum`, `full_mean`, `full_energy`, `full_rms`, `full_p75`, `full_p25` |
| 靠背特征 | `back_` | 靠背60点的统计量和形态特征 | `back_iqr`, `back_row_spread`, `back_contact_above_50` |
| 坐垫特征 | `cush_` | 坐垫60点的统计量和形态特征 | `cush_mean`, `cush_sum`, `cush_kurtosis`, `cush_lr_diff`, `cush_lr_ratio` |
| 侧翼特征 | `wing_` / `back_wing_` | 侧翼小矩形的统计量 | `wing_total`, `back_wing_sum`, `back_wing_mean` |
| 块特征 | `back_block_` / `cush_block_` | 矩阵分块后各块的统计量 | `back_block_1_0_mean`, `cush_block_0_1_sum` |
| 比例特征 | `bc_ratio_` / `wing_main_ratio` | 靠背/坐垫比、侧翼/主体比 | `bc_ratio_1_0`, `wing_main_ratio` |
| 综合特征 | `total_` | 全局综合指标 | `total_pressure`, `total_energy` |

**步骤2：滑动窗口时间聚合**

- 窗口大小：30帧（约2.3秒），步长：15帧
- 对窗口内的每个特征计算**均值**（消除高频噪声）和**标准差**（捕捉时间变异特征）
- 生成的特征数量 = 原始特征数 × 2

**步骤3：特征选择**

- 方法：`SelectKBest(score_func=f_classif, k=40)`，基于ANOVA F-value
- 从数百个候选特征中自动筛选出最具区分度的40个特征

### 7.4 最终选中的40个特征

以下是经过特征选择后保留的40个特征（按重要性排序）：

| 序号 | 特征名 | 序号 | 特征名 |
|------|--------|------|--------|
| 1 | `full_sum` | 21 | `cush_p75` |
| 2 | `full_mean` | 22 | `cush_p90` |
| 3 | `full_energy` | 23 | `cush_energy` |
| 4 | `full_rms` | 24 | `cush_rms` |
| 5 | `full_p75` | 25 | `cush_kurtosis` |
| 6 | `full_p25` | 26 | `cush_lr_diff` |
| 7 | `back_wing_sum` | 27 | `cush_lr_ratio` |
| 8 | `back_wing_mean` | 28 | `cush_contact_above_50` |
| 9 | `wing_total` | 29 | `cush_peak_ratio` |
| 10 | `back_iqr` | 30 | `cush_block_0_1_mean` |
| 11 | `back_row_spread` | 31 | `cush_block_0_1_sum` |
| 12 | `back_contact_above_50` | 32 | `cush_block_0_1_max` |
| 13 | `back_block_1_0_mean` | 33 | `cush_block_0_2_mean` |
| 14 | `back_block_1_0_sum` | 34 | `cush_block_0_2_sum` |
| 15 | `back_block_1_0_max` | 35 | `cush_block_0_2_max` |
| 16 | `cush_mean` | 36 | `cush_diag_mean` |
| 17 | `cush_sum` | 37 | `total_pressure` |
| 18 | `cush_min` | 38 | `total_energy` |
| 19 | `cush_median` | 39 | `wing_main_ratio` |
| 20 | `cush_p25` | 40 | `bc_ratio_1_0` |

### 7.5 模型选择

通过LOSO-CV（Leave-One-Subject-Out Cross-Validation）评估了8种候选模型：

| 模型 | 受试者准确率 | 帧级Accuracy | F1 (macro) | F1 (weighted) |
|------|-------------|-------------|------------|--------------|
| **KNN5_dist** | **100% (8/8)** | **0.875** | **0.860** | **0.870** |
| KNN3_dist | 100% (8/8) | 0.875 | 0.864 | 0.871 |
| GradientBoosting | 100% (8/8) | 0.875 | 0.874 | 0.875 |
| KNN7_dist | 87.5% (7/8) | 0.875 | 0.855 | 0.867 |
| SVM_Linear | 87.5% (7/8) | 0.864 | 0.857 | 0.864 |
| RandomForest | 87.5% (7/8) | 0.818 | 0.811 | 0.817 |
| SVM_RBF | 87.5% (7/8) | 0.784 | 0.764 | 0.779 |
| LogisticRegression | 87.5% (7/8) | 0.761 | 0.748 | 0.758 |

> **选择理由**：KNN5_dist、KNN3_dist和GradientBoosting均达到8/8的受试者级准确率。最终选择KNN5_dist，因为KNN模型结构简单、推理速度快、可解释性好，且在嵌入式环境中资源占用低。GradientBoosting虽然macro F1略高，但模型复杂度更高，不适合资源受限的车载环境。

### 7.6 推理流程

推理由 `BodyShapeClassifier` 类实现，采用**概率软投票**机制：

1. **数据采集**：入座后自动触发，采集30帧有效入座数据
2. **入座判定**：使用自适应阈值（`min + (max - min) × 0.3`）判断每帧是否为有效入座帧，需连续5帧超过阈值才认为稳定入座
3. **特征提取**：对采集的帧数据提取特征（同训练流程）
4. **模型推理**：对每个有效帧调用 `model.predict_proba()`，获取三分类概率分布
5. **概率累加**：将所有帧的概率分布累加（而非硬标签投票）
6. **最终判定**：选择累加概率最大的类别作为最终结果

```python
# 概率软投票示例
# 帧1: [0.1, 0.7, 0.2]  (中等概率最高)
# 帧2: [0.2, 0.6, 0.2]  (中等概率最高)
# 帧3: [0.3, 0.3, 0.4]  (高大概率最高)
# 累加: [0.6, 1.6, 0.8]  → 最终判定: 中等
```

> **软投票的优势**：相比硬投票（每帧一票），软投票利用了模型输出的概率信息，对边界样本更鲁棒。即使某些帧的硬标签判断错误，只要正确类别的概率始终较高，最终结果仍然正确。

### 7.7 各受试者投票详情

| 受试者 | 真实标签 | 投票结果 | 置信度 |
|--------|----------|----------|--------|
| 张(92kg) | 高大 | 高大 | 77% |
| 曲(48kg) | 瘦小 | 瘦小 | 100% |
| 涛(70kg) | 中等 | 中等 | 93% |
| 渠(45kg) | 瘦小 | 瘦小 | 97% |
| 程(60kg) | 中等 | 中等 | 96% |
| 笑(90kg) | 高大 | 高大 | 52% |
| 罗正科(未知) | 中等 | 中等 | 83% |
| 罗正科2(72kg) | 中等 | 中等 | 80% |

### 7.8 帧级混淆矩阵

|  | 预测:瘦小 | 预测:中等 | 预测:高大 |
|--|----------|----------|----------|
| 真实:瘦小 | **25** | 0 | 0 |
| 真实:中等 | 0 | **39** | 3 |
| 真实:高大 | 0 | 8 | **13** |

> **分析**：瘦小类别的帧级识别完美（F1=1.0）。中等类别偶尔被误判为高大（3帧），高大类别有8帧被误判为中等，这与90kg受试者（笑）的置信度仅52%一致，说明高大与中等的边界区分度相对较低。

### 7.9 模型持久化

训练完成后，以下对象被打包序列化为 `.pkl` 文件：
- `StandardScaler`：特征标准化器
- `SelectKBest`：特征选择器
- `KNeighborsClassifier`：KNN分类模型
- 特征名列表和标签映射

---

## 8. 自适应气囊控制模块

### 8.1 控制频率

自适应控制逻辑每 `check_interval_frames`（4帧 ≈ 0.31秒）执行一次。在每个控制周期内，系统依次计算腰托、侧翼和腿托的控制动作，然后生成统一的协议帧。

### 8.2 腰托控制（`_lumbar_control`）

**控制目标**：根据用户背部压力分布，自动调节腰托气囊（5, 6），使腰部获得适当支撑。

**算法**：

1. 计算靠背上半部分（行0-4）和下半部分（行5-9）的压力均值
2. 计算比值：`ratio = upper_mean / lower_mean`
3. 判定动作：

| 条件 | 动作 | 含义 |
|------|------|------|
| `back_mean_total == 0` | 充气 | 背部完全无压力，预充气 |
| `back_mean_total < back_total_threshold (15.0)` | 保持 | 背部压力过低，不调节 |
| `ratio > inflate_threshold (0.9)` | 充气 | 上部压力偏大，需要更多腰部支撑 |
| `ratio < deflate_threshold (0.35)` | 放气 | 下部压力偏大，腰部支撑过度 |
| 其他 | 保持 | 在舒适区间内 |

**品味覆盖**：如果当前体型有品味数据，`inflate_threshold` 和 `deflate_threshold` 将被品味区间替代。

### 8.3 侧翼控制（`_side_wing_control`）

**控制目标**：根据用户背部左右压力分布，自动调节侧翼气囊（左: 2,4；右: 1,3），提供侧向支撑。

**算法**：

1. 计算靠背左半侧（列0-2）和右半侧（列3-5）的压力总和
2. 计算比值：`left_ratio = left_total / right_total`
3. 判定动作：

| 条件 | 左侧动作 | 右侧动作 | 含义 |
|------|----------|----------|------|
| `left_ratio > deflate_left (1.3)` | 充气 | 放气 | 左侧压力大，身体偏左 |
| `left_ratio < inflate_left (0.8)` | 放气 | 充气 | 右侧压力大，身体偏右 |
| 其他 | 保持 | 保持 | 左右平衡 |

**品味覆盖**：同腰托，品味数据可替代默认阈值。

### 8.4 腿托控制（`_leg_support_control`）

**控制目标**：根据用户大腿前后压力分布，左右独立调节腿托气囊（左: 9；右: 10），为大腿提供适当支撑。

**算法（V2：重心划分 + 前3后3比）**：

1. **重心标定**：入座稳定后，使用舒适状态数据计算坐垫矩阵的**列方向压力重心**（一次标定）：
   ```
   col_centroid = Σ(col_index × col_sum) / total_sum
   ```

2. **左右划分**：以重心为分界线，将前3行和后3行分别划分为左右两半

3. **前3后3比计算**：
   ```
   left_f3r3 = mean(left_front3) / mean(left_rear3)
   right_f3r3 = mean(right_front3) / mean(right_rear3)
   ```

4. **判定动作**（左右独立）：

| 条件（以左腿为例） | 动作 | 含义 |
|-------------------|------|------|
| `left_ratio < left_inflate (0.48)` | 充气 | 前部压力小，腿悬空 |
| `left_ratio > left_deflate (0.70)` | 放气 | 前部压力大，腿压实 |
| 其他 | 保持 | 舒适区间 |

**回退机制**：若重心未标定（如入座初期），使用当前帧的坐垫矩阵实时计算重心作为回退方案。

**品味覆盖**：同上，品味数据可替代默认阈值。

### 8.5 放气冷却锁

为防止气囊持续放气导致支撑完全丧失，系统实现了放气冷却锁机制：

- 每个气囊组（腰托、左侧翼、右侧翼、左腿托、右腿托）独立维护一个连续放气计数器
- 当连续放气指令次数达到 `max_continuous_commands`（16次 ≈ 5秒）时，该气囊组被锁定，强制切换为保持
- 当该气囊组收到非放气指令时，计数器重置

---

## 9. 品味记忆模块

### 9.1 模块概述

品味记忆模块（`PreferenceManager`）通过学习用户的手动调节行为，生成个性化的舒适压力区间。这些区间在用户下次入座时自动恢复，覆盖默认的自适应阈值，实现"越用越懂你"的效果。

### 9.2 核心数据结构

**区域-比例映射（REGION_RATIO_MAP）**：

| 区域键名 | 关联的压力比例 | 说明 |
|----------|---------------|------|
| `lumbar` | `['lumbar']` | 腰托 → 上下比 |
| `side_wings` | `['side_wings']` | 侧翼 → 左右比 |
| `leg_left` | `['leg_left']` | 左腿托 → 左腿前3后3比 |
| `leg_right` | `['leg_right']` | 右腿托 → 右腿前3后3比 |
| `hip` | `[]` | 臀托 → 不参与比例计算，仅记录净操作次数 |

**充气方向映射（INFLATE_DIRECTION）**：

定义了每个区域的充气操作对各压力比例的预期影响方向：

| 区域 | 充气对比例的影响 | 说明 |
|------|-----------------|------|
| `lumbar` | `lumbar: -1` | 腰托充气 → 下部压力增大 → 上下比降低 |
| `side_wings` | `side_wings: 0` | 侧翼充气方向不确定 |
| `leg_left` | `leg_left: +1` | 左腿充气 → 前部压力增大 → 前3后3比升高 |
| `leg_right` | `leg_right: +1` | 右腿充气 → 前部压力增大 → 前3后3比升高 |
| `hip` | `{}` | 臀托不影响任何比例 |

### 9.3 品味记录流程

当用户通过外部接口触发品味记录时，系统执行以下流程：

1. **操作计数传入**：外部传入 `airbag_ops` 字典，格式为：
   ```python
   airbag_ops = {
       'lumbar': {'inflate': 3, 'deflate': 1},
       'side_wings': {'inflate': 0, 'deflate': 2},
       'leg_left': {'inflate': 1, 'deflate': 0},
       'leg_right': {'inflate': 0, 'deflate': 0},
       'hip': {'inflate': 2, 'deflate': 0}  # v1.1.0 新增
   }
   ```

2. **预期比例计算**（`_compute_expected_ratios`）：
   ```
   净操作次数 = inflate_count - deflate_count
   方向 = INFLATE_DIRECTION[region][ratio_key]
   有效次数 = 净操作次数 × 方向
   预期比例 = 基线中心 × (1 + step_factor)^有效次数
   ```
   其中 `step_factor = 0.05`，`基线中心` 为当前采集到的压力比例均值。

3. **置信区间构建**（`_build_confidence_intervals`）：
   ```
   下界 = 预期比例 × (1 - confidence_tolerance)
   上界 = 预期比例 × (1 + confidence_tolerance)
   ```
   其中 `confidence_tolerance = 0.3`。

4. **异常过滤**：在采集压力比例时，使用截断（Clamp）模式将超出置信区间的观测值拉回边界，防止用户乱动导致记录错误。

5. **净操作次数持久化**（v1.1.0 新增）：
   ```python
   net_ops = {
       'lumbar': 2,      # 3 - 1
       'side_wings': -2,  # 0 - 2
       'leg_left': 1,     # 1 - 0
       'leg_right': 0,    # 0 - 0
       'hip': 2           # 2 - 0
   }
   ```

### 9.4 品味数据持久化格式

品味数据以JSON格式存储在 `preference_data.json` 中：

```json
{
  "瘦小": {
    "thresholds": {
      "lumbar": {"inflate": 1.2, "deflate": 0.5},
      "side_wings": {"inflate_left": 0.7, "deflate_left": 1.4},
      "leg_support": {
        "left_inflate": 0.45, "left_deflate": 0.72,
        "right_inflate": 0.60, "right_deflate": 0.98
      }
    },
    "net_ops": {
      "lumbar": 2,
      "side_wings": -1,
      "leg_left": 1,
      "leg_right": 0,
      "hip": 3
    },
    "timestamp": "2026-03-20T10:30:00"
  }
}
```

### 9.5 品味激活机制

品味数据的激活需要满足以下条件：
1. 体型三分类已完成（`body_shape` 已确定）
2. 对应体型存在已保存的品味数据
3. 调用 `activate_preference(body_shape)` 后，品味区间生效

激活后，`get_active_thresholds()` 返回品味区间而非默认阈值，所有自适应控制模块自动使用品味区间。

### 9.6 臀托品味联动（v1.1.0 新增）

臀托（气囊7,8）的品味联动机制与其他区域不同：

| 对比维度 | 腰托/侧翼/腿托 | 臀托 |
|----------|----------------|------|
| 品味记录方式 | 记录操作次数 + 采集压力比例 | 仅记录净操作次数 |
| 品味应用方式 | 替代默认阈值（区间覆盖） | 调整初始化充气时间（时间联动） |
| 运行时影响 | 持续影响自适应控制判定 | 仅在入座初始化时生效一次 |
| 数据存储 | `thresholds` + `net_ops` | 仅 `net_ops.hip` |

**联动算法**：
```
净操作次数 = net_ops['hip']  (正数=净充气, 负数=净放气)
额外周期数 = 净操作次数 × hip_preference_seconds_per_op(3) × system_hz(13)
总周期数 = hip_base_cycles(26) + 额外周期数
若总周期数 > 0: 执行充气，持续 总周期数 个周期
若总周期数 < 0: 执行放气，持续 |总周期数| 个周期
若总周期数 = 0: 跳过臀托初始化
```

### 9.7 接口汇总

```python
class PreferenceManager:
    def start_recording(self, body_shape: str, airbag_ops: dict)
    # 开始品味记录，传入体型和操作计数

    def update_recording(self, regions: dict) -> bool
    # 每帧更新品味记录（采集压力比例），返回是否完成

    def activate_preference(self, body_shape: str) -> bool
    # 激活指定体型的品味数据

    def get_active_thresholds(self) -> Tuple[dict, bool]
    # 获取当前激活的阈值（品味或默认），返回(阈值字典, 是否为品味)

    def has_preference(self, body_shape: str) -> bool
    # 检查指定体型是否有品味数据

    def deactivate(self)
    # 停用品味（恢复默认阈值）
```

---

## 10. 双模式控制架构

### 10.1 模式概述

v1.1.0 引入了双模式控制架构，通过配置文件中的 `control.mode` 参数切换：

| 模式 | 名称 | 控制策略 | 适用场景 |
|------|------|----------|----------|
| `mode1` | 体验版 | 持续自适应调节 | 展示、体验、调试 |
| `mode2` | 量产版 | 自适应与保压交替 | 量产车辆、降低气泵负荷 |

### 10.2 Mode1（体验版）

Mode1 保持原有的控制逻辑：系统在 `ADAPTIVE_LOCKED` 状态下，每个控制周期（4帧）都执行自适应调节判断，持续不断地根据压力变化调整气囊。

**流程**：
```
入座 → 支撑气囊充气(4s) + 臀托初始化 → 持续自适应调节 → 离座放气(10s) → 保持(10s) → OFF_SEAT
```

### 10.3 Mode2（量产版）

Mode2 引入了自适应与保压的交替循环，降低气泵的工作频率和噪音：

**流程**：
```
入座 → 支撑气囊充气(4s) + 臀托初始化
     → 自适应调节(5s) → 全部保压(10s) → 自适应调节(5s) → 全部保压(10s) → ...
     → 离座放气(10s) → 保持(10s) → OFF_SEAT
```

**子状态机**：

Mode2 在 `ADAPTIVE_LOCKED` 状态内部维护一个子状态机：

| 子状态 | 含义 | 持续时间 |
|--------|------|----------|
| `adaptive` | 自适应调节阶段 | `mode2_adaptive_seconds`（默认5秒） |
| `hold` | 全部保压阶段 | `mode2_hold_seconds`（默认10秒） |

**状态转换**：
- `adaptive` → `hold`：自适应阶段计数器达到 `mode2_adaptive_frames`
- `hold` → `adaptive`：保压阶段计数器达到 `mode2_hold_frames`

**保压阶段行为**：在保压阶段，所有支撑气囊（1-10）发送保持指令（`gear_stop`），气泵不工作。

### 10.4 接口

```python
# 获取当前控制模式
system.get_control_mode() -> str  # 返回 "mode1" 或 "mode2"

# 获取Mode2子状态（仅mode2有效）
system.get_mode2_status() -> dict
# 返回: {'sub_state': 'adaptive'/'hold', 'counter': int, 'adaptive_frames': int, 'hold_frames': int}
```

---

## 11. 拍打按摩检测模块

### 11.1 模块概述

拍打按摩检测模块通过分析靠背压力信号的突变模式，识别用户的拍打动作，触发按摩气囊的响应。当前版本中，按摩气囊的输出已被屏蔽（按摩气囊11-24始终保持状态），但检测逻辑仍在运行。

### 11.2 算法原理

1. **信号提取**：从靠背矩阵中提取压力总和的时间序列
2. **峰值检测**：在滑动窗口（52帧 ≈ 4秒）内，检测压力变化超过 `tap_threshold`（25.0）的峰值
3. **峰值间距过滤**：相邻峰值间距需大于 `min_peak_distance`（3帧），过滤抖动
4. **触发判定**：窗口内检测到 ≥ `required_taps`（2次）拍打时触发

### 11.3 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `tap_massage.window_size_frames` | 52 | 检测窗口（约4秒） |
| `tap_massage.tap_threshold` | 25.0 | 拍打峰值阈值 |
| `tap_massage.min_peak_distance` | 3 | 峰值间最小距离（帧） |
| `tap_massage.required_taps` | 2 | 触发所需的最少拍打次数 |

---

## 12. 通信协议与帧格式

### 12.1 协议帧结构

系统输出55字节的协议帧，用于驱动24路气囊控制器：

| 字段 | 字节数 | 值 | 说明 |
|------|--------|-----|------|
| 帧头 | 1 | 0x1F (31) | 固定帧头 |
| 气囊1指令 | 2 | [ID, Gear] | 气囊编号 + 档位 |
| 气囊2指令 | 2 | [ID, Gear] | ... |
| ... | ... | ... | 共24个气囊 |
| 气囊24指令 | 2 | [ID, Gear] | ... |
| 工作模式 | 1 | 0 | 0=自动模式 |
| 方向标识 | 1 | 0 | 0=下行（控制器→气囊） |
| 帧尾 | 4 | [0xAA, 0x55, 0x03, 0x99] | 固定帧尾 |

**总长度**：1(帧头) + 24×2(气囊指令) + 1(模式) + 1(方向) + 4(帧尾) = **55字节**

### 12.2 档位定义

| 档位值 | 常量名 | 含义 |
|--------|--------|------|
| 0 | `gear_stop` | 保持当前状态 |
| 1 | `gear_1` | 1档（慢速充气/放气） |
| 2 | `gear_2` | 2档（中速充气/放气） |
| 3 | `gear_3` | 3档（快速充气） |
| 4 | `gear_initial` | 初始档位（快速放气） |

### 12.3 指令生成规则

| 场景 | 充气档位 | 放气档位 | 说明 |
|------|----------|----------|------|
| 自适应控制 | `gear_1` (1) | `gear_1` (1) | 慢速调节，避免突变 |
| 初始化充气 | `gear_3` (3) | - | 快速充气，缩短等待时间 |
| 离座复位 | - | `gear_initial` (4) | 快速放气，尽快释放气压 |
| 手动控制 | `gear_2` (2) | `gear_2` (2) | 中速，用户可感知 |

---

## 13. 数据挖掘过程详解

### 13.1 腿托阈值方案演进

腿托控制算法经历了三个主要版本的迭代，每次迭代都基于数据分析的发现进行改进。

#### 阶段一：固定区域划分（V1，v1.0.0）

**方案**：将坐垫矩阵按固定行索引划分为"臀部区域"和"腿部区域"，计算臀腿压力比。

**问题**：
- 高个子的腿部受力区域靠前，矮个子靠后，固定划分导致不同体型的压力比分布严重重叠
- 无法找到统一的充放气阈值

**数据发现**：通过绘制8名受试者的压力分布图，观察到不同体型的压力重心位置差异显著，固定区域划分无法适应。

#### 阶段二：重心划分 + 前3后3比（V2初版）

**方案**：
1. 引入列方向压力重心，动态划分左右腿
2. 使用前3行（行0-2）和后3行（行7-9）的压力比作为特征

**数据发现**：
- 前3后3比是一个极其稳定的特征：充气状态下比值显著降低（前端压力小），放气状态下比值升高
- 列方向重心普遍在2.35~2.45，整体偏左
- 左右腿的前3后3比存在固有差异：右腿比值普遍高于左腿约0.15-0.20

**人工观察笔记**（来自 `plot_observations.txt`）：
> 充气状态具有稳定的"前端下降、后端上升"模式；放气状态与舒适态对多数体型几乎重合；72kg数据方差异常大；左右腿存在绝对压力不对称。

#### 阶段三：左右独立统一阈值（V2最终版，v1.0.2）

**方案**：放弃分体型阈值，改为所有体型统一的左右独立阈值。

**阈值推导过程**（来自 `calc_unified_thresholds.py`）：
1. 排除72kg异常数据（方差过大）
2. 对剩余7名受试者的数据，分别计算左右腿在充气/舒适/放气状态下的前3后3比分布
3. 使用网格搜索，遍历所有可能的阈值组合，最大化充气检测准确率
4. 最终阈值：

| 参数 | 值 | 含义 |
|------|-----|------|
| 左腿充气阈值 | 0.48 | 前3后3比 < 0.48 → 充气 |
| 左腿放气阈值 | 0.70 | 前3后3比 > 0.70 → 放气 |
| 右腿充气阈值 | 0.64 | 前3后3比 < 0.64 → 充气 |
| 右腿放气阈值 | 0.96 | 前3后3比 > 0.96 → 放气 |

**验证结果**（所有8人，含72kg异常）：

| 指标 | 左腿 | 右腿 |
|------|------|------|
| 总体准确率 | 73.2% | 74.7% |
| 充气正确率（排除72kg） | 100% | 100% |
| 放气正确率 | 大部分体型为0% | 大部分体型为0% |

> **关键结论**：充气检测效果极好（100%），但放气检测几乎失效。这是因为放气状态的前3后3比与舒适状态高度重叠，单一比例特征无法区分。用户确认放气问题与采集方式有关，暂不处理。

### 13.2 体型三分类数据挖掘

体型三分类的数据挖掘过程主要集中在特征工程和模型选择上：

1. **V1尝试**：直接使用单帧特征 + 多种分类器，受试者级准确率仅62.5%
2. **关键发现**：引入滑动窗口时间聚合后，通过计算窗口内的均值和标准差，有效消除了帧间噪声，准确率跃升至100%
3. **特征选择**：从数百个候选特征中，ANOVA F-value筛选出40个最具区分度的特征，其中全局压力统计量（`full_sum`, `full_mean`）和坐垫特征（`cush_*`）占比最高

---

## 14. 模型训练完整流程

### 14.1 训练环境

- **语言**：Python 3.11
- **核心依赖**：numpy, pandas, scikit-learn, scipy
- **评估方式**：LOSO-CV（Leave-One-Subject-Out Cross-Validation）

### 14.2 训练流程

```
CSV数据文件 → DataLoader → FeatureEngineer → SelectKBest → KNN训练 → 模型持久化(.pkl)
```

**步骤1：数据加载（DataLoader）**

```python
# data_loader.py
class DataLoader:
    def load_data(self, data_dir: str) -> Tuple[np.ndarray, np.ndarray, list]
    # 从CSV文件加载数据
    # 返回: (特征矩阵, 标签数组, 受试者ID列表)
```

- 读取每个受试者的CSV文件（144列传感器数据）
- 标签映射：瘦小=0, 中等=1, 高大=2
- 基础清洗：去除全零帧、NaN值处理

**步骤2：特征工程（FeatureEngineer）**

```python
# feature_engineer.py
class FeatureEngineer:
    def extract_features(self, raw_data: np.ndarray) -> pd.DataFrame
    # 从原始144点数据提取特征
    # 返回: 特征DataFrame

    def apply_sliding_window(self, features: pd.DataFrame, window_size: int, step: int) -> pd.DataFrame
    # 滑动窗口时间聚合
    # 返回: 聚合后的特征DataFrame（均值+标准差）
```

- 窗口大小：30帧，步长：15帧
- 每个窗口生成均值和标准差两组特征

**步骤3：模型训练（BodyTypeClassifier）**

```python
# classifier.py
class BodyTypeClassifier:
    def train(self, X: np.ndarray, y: np.ndarray, subjects: list)
    # LOSO-CV训练和评估
    # 1. StandardScaler标准化
    # 2. SelectKBest(k=40)特征选择
    # 3. KNeighborsClassifier(n_neighbors=5, weights='distance')训练
    # 4. 概率软投票评估

    def save_model(self, path: str)
    # 序列化模型到.pkl文件

    def load_model(self, path: str)
    # 从.pkl文件加载模型
```

**步骤4：模型评估**

评估在LOSO-CV框架下进行：每次留出一名受试者作为测试集，其余7名作为训练集，循环8次。

最终评估指标：
- 受试者级准确率：100%（8/8）
- 帧级Accuracy：0.875
- 帧级F1 (macro)：0.860
- 帧级F1 (weighted)：0.870

### 14.3 训练入口脚本

```bash
# 运行训练实验
python training/run_classification.py

# 输出文件
training/output/classification_report.txt  # 详细评估报告
training/output/model_evaluation.csv       # 候选模型对比表
model/body_shape_model.pkl                 # 最终模型文件
```

---

## 15. 版本演进记录

### [1.1.0] - 2026-03-20

**核心特性：双模式控制与臀托品味联动**

- **新增**：双模式控制架构。`mode1`（体验版）保持持续自适应；`mode2`（量产版）引入自适应（5s）与保压（10s）交替循环，降低气泵工作频率。
- **新增**：臀托初始化品味联动。根据用户历史净操作次数，动态调整入座时的臀托初始化充放气时间（每次操作对应3秒）。
- **新增**：品味管理器扩展 `hip` 区域支持，`airbag_ops` 字典和 `net_ops` 字段新增 `hip` 键。
- **优化**：调整离座 `RESETTING` 阶段时序，放气10秒 + 保持10秒，共20秒后彻底进入 `OFF_SEAT` 待机，后续不再继续动作。
- **接口**：新增 `get_control_mode()` 和 `get_mode2_status()` API。

### [1.0.2] - 2026-03-04

**核心特性：腿托算法V2**

- **重构**：腿托自适应控制逻辑升级为"重心划分左右腿 + 前3后3比 + 左右独立统一阈值"方案，充气检测准确率提升至100%。
- **同步**：品味采集逻辑同步更新为前3后3比方案，确保控制与记录的一致性。
- **文档**：清理了文档中关于服务端（HTTP/WebSocket）的描述，聚焦于Python包内部的调用接口。

### [1.0.0] - 2026-03-04

**首个正式版本**

- **架构**：确立四状态机核心架构（`IntegratedSeatSystem`）。
- **算法**：集成SAD活体检测、基础体型检测（大人/小孩/空座）、基于KNN的体型三分类V2（瘦小/中等/高大）。
- **功能**：实现腰托、侧翼的自适应控制；实现基于JSON持久化的品味记忆功能；实现拍打按摩检测。
- **特性**：引入方案C（自动+手动双模式触发体型识别），实现离座状态自动重置。
- **已知限制**：腿托固定区域划分对极端体型适应性不足（后在v1.0.2中解决）。

---

## 16. 实现思路与可复用设计模式

在系统的演进过程中，沉淀了多项可复用的软件设计与算法思维模式：

### 16.1 相对量优先原则 (Relative Quantity Priority)

在所有的自适应控制（腰托、侧翼、腿托）中，系统均采用**区域压力比值**（如上下比、左右比、前3后3比）而非绝对压力值作为控制依据。相对量能有效抵消传感器个体差异、温度漂移和用户绝对体重带来的共性干扰，显著提升了算法的鲁棒性。

### 16.2 状态与逻辑分离 (State & Logic Separation)

`PreferenceManager` 仅负责管理"品味"的状态（记录操作、计算区间、持久化），而 `IntegratedSeatSystem` 负责读取这些区间并执行具体的气囊控制。这种高内聚低耦合的设计使得品味模块可以独立测试，且主控制逻辑不会被复杂的偏好计算所污染。

### 16.3 默认逻辑与策略覆盖 (Default Logic & Strategy Override)

系统在 `sensor_config.yaml` 中定义了一套普适的默认自适应阈值。当用户触发品味记忆后，`PreferenceManager` 生成的个性化区间会作为"策略"动态覆盖默认阈值。这是一种经典的策略模式应用，保证了系统在无历史数据时可用，有数据时更好用。

### 16.4 队列防抖机制 (Queue-based Debouncing)

活体检测和体型检测均采用队列防抖：连续N次检测结果一致才确认状态切换。这种机制有效过滤了瞬态干扰（如用户短暂前倾、传感器噪声），避免了状态频繁跳变。

### 16.5 状态机离场清理模式 (State Machine Exit Cleanup)

在处理换人入座的场景时，系统在状态机从 `CUSHION_ONLY` 或 `ADAPTIVE_LOCKED` 转换到 `RESETTING`（离场）时，强制执行严格的清理清单：重置体型分类结果、清除品味激活状态、重置 Mode2 子状态机、重置臀托初始化状态。这避免了状态残留导致的逻辑错乱。

### 16.6 竞争路径分析法 (Competing Path Analysis)

在状态机的 `process_frame` 中，严格区分了独立 `if` 和 `elif` 的使用。对于可能同时满足的条件（如同时满足离座条件和自适应条件），通过优先级排序和互斥分支，避免了同一帧内触发多个状态转换的竞争冒险。

### 16.7 最小集成包思维 (Minimal Integration Package)

系统在设计对外接口时，遵循最小知识原则。`process_frame` 的返回值被精简为三个语义清晰的字典：`seat_status`、`body_shape_info`、`airbag_command`。内部复杂的检测器状态被封装，极大地降低了上层应用（如 GUI 或串口通信模块）的集成成本。

### 16.8 概率软投票 (Probabilistic Soft Voting)

在体型三分类推理中，使用概率累加而非硬标签投票。这充分利用了模型输出的概率信息，对边界样本更鲁棒，是一种在小样本场景下提升分类稳定性的有效策略。

### 16.9 先验约束观测 (Prior-Constrained Observation)

在品味记忆的区间构建中，系统先根据操作次数推算预期的压力比例（先验），再用实际采集的压力比例（观测）进行校准。超出置信区间的异常观测被截断或降权处理，这是一种将领域知识融入数据驱动流程的有效方法。

---

## 17. 已知局限性与后续方向

### 17.1 当前局限性

1. **腿托放气检测失效**：放气状态的前3后3比与舒适状态高度重叠，单一比例特征无法区分。当前充气检测100%，但放气检测对大部分体型为0%。

2. **固定区域划分**：腰背部的上下分界（第5行）和左右分界（第3列）为静态配置，无法适应不同体型用户的实际腰部位置差异。

3. **训练样本量有限**：仅8名受试者的数据，高大类别仅2人，模型泛化能力有待验证。高大类别的帧级F1仅0.70，显著低于瘦小（1.0）和中等（0.88）。

4. **品味数据无版本控制**：`preferences.json` 写入无原子性保护，且未检查数据格式版本号，升级时可能存在兼容性风险。

5. **72kg异常数据**：72kg受试者的数据方差异常大，在腿托阈值推导中被排除。原因可能与采集过程中的坐姿不稳定有关。

### 17.2 后续优化方向

1. **放气检测改进**：考虑引入时间序列突变特征（如压力变化率、斜率变化）或组合多特征判定，替代单一比例特征。

2. **动态区域划分**：根据压力分布自动识别腰部位置，实现自适应的上下分界。

3. **扩充训练数据**：增加更多受试者（特别是高大类别），提升模型泛化能力。

4. **品味数据版本管理**：引入数据格式版本号和迁移机制，确保升级兼容性。

5. **品味记忆的用户手动设定放气阈值**：允许用户通过品味记忆机制间接设定放气阈值，绕过放气检测的局限性。

---

> **文档维护说明**：本文档应随每次版本发布同步更新。修改时请确保所有配置参数值、阈值、算法描述与实际代码保持一致。
