# GUI 更新方案 - v1.1.0 新功能接入

## 现有GUI结构分析

visualizer.py 共约2867行，包含以下主要面板：
1. 串口连接面板 (_create_connection_panel)
2. 集成系统状态面板 (_create_integrated_status_panel) - 座椅状态、活体、体型等
3. 模块输出面板 (_create_module_output_panel) - 活体检测、体型检测、体型三分类详细输出
4. 控制决策面板 (_create_control_decision_panel) - 腰托/侧翼/腿托的比例和决策
5. 气囊状态面板 (_create_airbag_status_panel) - 24路气囊状态
6. 品味面板 (_create_preference_panel) - 品味状态、阈值、记录按钮
7. 手动控制面板 (_create_manual_control_panel) - 模式切换、气囊选择、充放气按钮

## 需要新增/修改的GUI功能点

### 1. 控制模式面板 (新增)
- 显示当前控制模式: Mode1(体验版) / Mode2(量产版)
- Mode2子状态显示: 自适应阶段 / 保压阶段
- Mode2计时器显示: 当前阶段剩余时间
- 来源: get_control_mode() 和 get_mode2_status() API

### 2. 臀托操作计数显示 (修改)
- 在手动控制面板的操作计数中添加 hip 区域
- region_short 映射中添加 'hip': '臀托'
- 来源: get_manual_airbag_ops() 返回的 hip 字段

### 3. 品味面板扩展 (修改)
- 添加臀托品味净操作次数显示
- 来源: get_preference_status() 中的 net_ops 字段

### 4. 臀托初始化状态显示 (新增)
- 在集成系统状态面板中显示臀托初始化进度
- 来源: result 中的 hip_init_* 字段

### 5. Mode2状态信息在result中 (修改)
- 在 update_integrated_display 中读取 mode2_sub_state 和 mode2_phase_counter
- 来源: process_frame 返回的 result 字典

## 需要同步的文件
- visualizer.py (主开发版)
- release_package/visualizer.py (发布包副本)
- test_visualizer_features.py (补充hip和mode2测试)
- docs/ 相关文档
- release_package/docs/ 相关文档
