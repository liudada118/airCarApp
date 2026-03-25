# Changelog

本文件记录算法包的所有版本变更，遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 格式和 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

## [1.0.2] - 2026-03-04

### 优化

- **腿托控制算法V2**：重构腿托自适应控制逻辑，采用“重心划分左右腿 + 前3后3比 + 左右独立阈值”方案，大幅提升充气检测准确率至100%。
- **品味采集同步**：品味记忆的腿托比例采集逻辑同步更新为前3后3比方案，确保了控制与记录的一致性。

### 文档

- **品味系统文档更新**：清理了文档中关于服务端（HTTP/WebSocket）的描述，聚焦于Python包内部的调用接口，避免引起误解。

## [1.0.0] - 2026-03-04

首个正式版本，包含完整的座椅智能控制功能集。

### 核心功能

- **集成座椅控制系统** (`integrated_system.py`)：四状态状态机（OFF_SEAT / CUSHION_ONLY / ADAPTIVE_LOCKED / RESETTING），统一管理所有子模块
- **活体检测** (`control.py`)：基于 SAD（Sum of Absolute Differences）算法的实时活体判定
- **体型检测** (`control.py`)：大人/小孩/空座三分类，基于滤波后的压力总和
- **体型三分类** (`body_shape_classifier.py`)：瘦小/中等/高大分类，基于 KNN + 概率软投票 + 滑动窗口时间聚合
- **品味记忆** (`preference_manager.py`)：用户偏好记录、持久化（JSON）、体型关联、区间自动生成
- **腰托自适应控制**：基于上下区域压力比的充放气调节
- **侧翼自适应控制**：基于左右区域压力比的充放气调节
- **腿托自适应控制**：基于臀腿区域压力比的充放气调节
- **拍打按摩** (`tap_massage.py`)：按摩气囊指令生成（已屏蔽输出）

### 架构特性

- **方案C体型识别触发**：入座全座后自动触发 + 外部 API 手动触发双模式，配置开关 `body_shape_classification.auto_trigger`
- **三字段精简输出**：`seat_status`（离座状态）、`body_shape_info`（体型信息）、`airbag_command`（气囊指令），同时保留兼容字段
- **离座状态重置**：进入 RESETTING 时自动清除体型三分类结果和品味激活状态，防止换人入座时使用旧数据
- **品味持久化**：`preferences.json` 文件存储，重启后自动恢复，需重新识别体型后激活

### 配置

- 统一配置文件 `sensor_config.yaml`，支持点分路径访问（如 `lumbar.upper_lower_ratio_inflate`）
- 品味管理配置段：`preference.record_sample_frames`、`preference.margin_ratio` 等

### 文档

- `INTEGRATION_GUIDE.md`：完整的集成指南
- `PREFERENCE_FUNCTION_DEEP_DIVE.md`：品味记忆功能深度解析
- `OUTPUT_FIELDS.md`：三字段输出文档
- `CODE_REVIEW_SUMMARY.md`：代码审查总结
- `算法思维与可复用知识点总结.md`：可复用算法设计模式

### 测试

- `test_preference.py`：品味管理单元测试
- `test_preference_full_lifecycle.py`：品味记忆全生命周期测试（13场景，124项检查）
- `test_auto_trigger_and_output.py`：方案C自动触发 + 三字段输出测试（12场景）
- `test_body_shape_reset_on_leave.py`：离座体型重置测试（10场景）

### 已知限制

- 腿托固定区域划分对极端体型适应性不足（数据采集方案已制定，待优化）
- `preferences.json` 写入无原子性保护（低风险）
- `_load_from_file` 未检查数据格式版本号

[1.0.0]: https://github.com/P-t99/car-beiqi/releases/tag/v1.0.0
