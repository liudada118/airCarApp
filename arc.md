# 项目架构说明（重点：底层处理）

## 1. 总览
- 本项目是 React Native + Android 原生模块 + Chaquopy(Python) 的混合架构。
- UI 在 RN 侧完成，串口与 Python 计算在 Android 原生层完成，再把结果回传给 RN。

## 2. 模块分层
### 2.1 RN 层（JavaScript）
- `App.js`: 入口切换，当前可在 `CH340SerialExample` 与 `ChaquopyExample` 之间切换。
- `CH340SerialExample.js`: 串口 UI 与事件订阅，展示最近 3 条 RX/结果/错误日志。
- `ChaquopyExample.js`: 单独用于测试 Python 调用的示例页面。

### 2.2 Android 原生层（Kotlin）
- `SerialModule.kt`: RN 桥接模块，负责 USB 权限、打开串口、发送、事件回传，以及串口数据触发 Python 调用。
- `SerialManager.kt`: 具体的 USB 串口打开/写入逻辑（CH340 探测、参数设置、DTR/RTS、重试）。
- `SerialReadThread.kt`: 读取线程，阻塞读串口字节流，送入环形缓冲。
- `ByteRingBuffer.kt`: 环形字节缓冲，保证连续读取时的顺序和缓存。
- `FrameParser.kt`: 帧解析器，按分隔符 `AA 55 03 99` 识别帧头，并从帧头起读取固定长度（144 字节）后输出一帧。
- `PyHelloModule.kt`: Chaquopy 示例模块。
- `MainApplication.kt`: 初始化 Chaquopy。

### 2.3 Python 层（Chaquopy）
- `server.py`: Python 入口，接收传感器数据，调用 `IntegratedSeatSystem.process_frame` 并返回 JSON 字符串。
- `integrated_system.py`: 核心算法与状态机。
- `sensor_config.yaml`: 参数配置。

## 3. 数据流（串口 -> Python -> 前端）
1. RN 端调用 `SerialModule.open/openWithOptions` 打开串口。
2. `SerialReadThread` 持续阻塞读取串口字节，写入 `ByteRingBuffer`。
3. `FrameParser` 从字节流中识别帧头（`AA 55 03 99`），并读取 144 字节作为一帧数据。
4. `SerialModule.handleFrame` 接收帧（逗号分隔字符串），先发 `onSerialData` 事件给 RN。
5. `SerialModule` 在单线程执行器中调用 Chaquopy `server.server(...)`：
   - 解析 CSV 字符串为 `List<Int>`。
   - 调用 Python，返回 JSON 字符串。
6. `SerialModule` 通过 `onSerialResult` 事件把 `result` 或 `error` 回传 RN。
7. RN 侧解析 JSON，并展示最近 3 条记录。

## 4. 底层处理细节（重点）
### 4.1 串口权限与打开
- `SerialModule` 负责 USB 权限申请，使用广播接收器处理授权回调。
- 有 pending-open 与 15s 超时机制，避免权限流程挂起。
- `SerialManager.open` 会探测 CH340 驱动，设置波特率、数据位、停止位、校验位，并打开 DTR/RTS。

### 4.2 串口读取与帧解析
- `SerialReadThread` 使用 `port.read(buffer, 0)` 阻塞读。
- 数据写入 `ByteRingBuffer` 后，`FrameParser` 逐字节喂入：
  - 仅当检测到分隔符 `AA 55 03 99` 后才开始收集。
  - 收集到 144 字节即输出一帧（不会等待尾部分隔符）。
  - 输出格式为 CSV（例如 `"12,34,56,..."`），便于后续解析。

### 4.3 Python 调用与线程隔离
- `SerialModule` 使用单线程执行器调用 Python，避免阻塞串口读线程与 UI 线程。
- Python 入口 `server.server` 会对传入数据做归一化：
  - 兼容 Java 的 `ArrayList`/嵌套数组；
  - 最终转换为 `(1, 144)` 的 `np.uint8` 矩阵；
  - 调用 `IntegratedSeatSystem.process_frame`；
  - 返回 JSON 字符串，保证 RN 端容易解析。

### 4.4 事件回传
- `onSerialData`: 原始帧（CSV 字符串）。
- `onSerialResult`: Python 结果 JSON 或错误信息。
- RN 侧仅保留最近 3 条日志，避免刷屏。

## 5. 依赖与运行要点
- Android 侧通过 Chaquopy 安装 Python 依赖（如 `numpy`、`ruamel.yaml`、`matplotlib`、`pandas`、`scipy`、`serial`）。
- 需要确保设备/模拟器支持 USB host 权限与 CH340 设备。
