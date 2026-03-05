# 架构文档

> 本文档由 Manus 自动生成和维护。最后更新于：2026-03-05 15:30

## 1. 项目概述

本项目是一个基于 React Native 和 Chaquopy 的安卓应用，用于控制和展示智能座椅气囊系统。它通过 USB 串口与硬件通信，实时接收传感器数据，运行 Python 算法进行数据处理和决策，并将结果通过 3D 模型进行可视化展示。用户可以通过 App 实时调节算法参数、手动控制气囊，实现对座椅的精细化控制。

## 2. 技术栈

| 分类 | 技术 | 版本/说明 |
| :--- | :--- | :--- |
| **前端框架** | React Native | 0.81.5 |
| **UI 渲染** | Expo GL, Three.js | 用于 3D 座椅模型渲染 |
| **后端/算法** | Python (via Chaquopy) | 3.11 (在 Android 端运行) |
| **编程语言** | TypeScript, Kotlin, Python | 分别用于前端、Android Native 和算法 |
| **包管理器** | pnpm, Gradle | 分别用于 Node.js 和 Android |
| **部署环境** | Android | 通过 Gradle 编译 APK |
| **其他关键库**| `react-native-safe-area-context`, `ruamel.yaml` | UI 适配、Python 端配置管理 |

## 3. 目录结构

```
./
├── android/                # Android 原生项目
│   ├── app/
│   │   ├── build.gradle    # Gradle 配置文件 (含 Chaquopy 配置)
│   │   └── src/main/
│   │       ├── java/       # Kotlin Native 模块
│   │       │   └── .../    # (SerialModule, SerialManager, FrameParser)
│   │       └── python/     # Chaquopy Python 源代码
│   │           ├── release_package/ # 算法核心包
│   │           │   ├── integrated_system.py # 算法主入口
│   │           │   ├── config.py            # 配置管理
│   │           │   └── ...
│   │           └── server.py              # Python 服务端接口 (被 Native 调用)
├── src/                    # React Native 源代码
│   ├── components/         # 可复用 UI 组件 (SeatDiagram, TopBar)
│   ├── screens/            # 页面组件 (HomeScreen, CustomAirbagScreen)
│   ├── theme/                # 主题、颜色、间距
│   └── types/                # TypeScript 类型定义
├── App.tsx                 # App 主入口和页面导航
└── package.json            # Node.js 依赖
```

### 关键目录说明

| 目录 | 主要功能 |
| :--- | :--- |
| `/android/app/src/main/java` | Android Native 模块，负责串口通信、Chaquopy 桥接 |
| `/android/app/src/main/python` | Python 算法代码，由 Chaquopy 在 Android 端执行 |
| `/src/screens` | React Native 页面组件，负责 UI 展示和用户交互 |
| `/src/components` | 可复用的 UI 组件，如 3D 座椅模型、弹窗等 |

## 4. 核心模块与数据流

### 4.1. 模块关系图 (Mermaid)

```mermaid
graph TD
    subgraph React Native UI
        A[HomeScreen] -- "打开" --> B[CustomAirbagScreen];
        A -- "打开" --> C[配置弹窗];
        A -- "打开" --> D[实时数据弹窗];
        A -- "渲染" --> E[3D座椅模型 CarAirRN];
    end

    subgraph Android Native (Kotlin)
        F[SerialModule] -- "@ReactMethod" --> A;
        F -- "@ReactMethod" --> B;
        F -- "@ReactMethod" --> C;
        G[SerialManager] -- "读/写" --> H[USB串口];
        F -- "调用" --> G;
        I[FrameParser] -- "解析" --> G;
    end

    subgraph Python (Chaquopy)
        J[server.py] -- "get_config/set_config" --> C;
        J -- "process_frame" --> F;
        K[integrated_system.py] -- "调用" --> J;
    end

    F -- "调用" --> J;
```

### 4.2. 主要数据流

1.  **传感器数据接收与处理**
    - `SerialManager` 通过 `SerialReadThread` 从 USB 串口持续读取数据。
    - `FrameParser` 将原始数据解析为 `FrameResult(csv, length)` 对象，包含帧数据和帧字节长度。
    - `SerialModule.handleFrame` 接收到 `FrameResult`，根据帧长度区分处理：
      - **144 字节**：标准传感器帧，调用 Python 的 `server.process_frame`。
      - **51 字节**：模式帧，处理自动/手动模式切换。
      - **其他长度**：非标准帧（如气囊回传指令），通过 `onNonStandardFrame` 事件发送到 JS 端。
    - `server.process_frame` 调用 `integrated_system.py` 中的算法，返回 JSON 结果。
    - `SerialModule` 将 JSON 结果通过 `onSerialData` 事件发送给 JS 端。
    - `HomeScreen` 接收到事件，更新 `sensorData` 和 `realtimeData` 状态，触发 3D 模型和实时数据弹窗的重新渲染。

2.  **算法自动控制**
    - Python `process_frame` 返回的 JSON 中包含 `control_command`。
    - `SerialModule.updateAutoWritePayloadFromResult` 将 `control_command` 转换为 55 字节协议帧，存入 `autoWriteBytes`。
    - `startAutoWrite` 定时任务（默认 15Hz）通过 `SerialManager.writeBytes` 将 `autoWriteBytes` 写入串口。
    - `setAlgoMode(false)` 可以暂停此自动写入流程。

3.  **用户手动控制**
    - `CustomAirbagScreen` 中的加减按钮调用 `SerialModule.sendAirbagCommand`。
    - `sendAirbagCommand` 根据气囊区域和动作（充/放气）构建 55 字节协议帧。
    - 直接调用 `SerialManager.writeBytes` 将指令写入串口，绕过 `autoWrite` 流程。

## 5. API 端点 (Native <-> JS)

`SerialModule.kt` 提供的 `@ReactMethod` 方法：

| 方法 | 参数 | 描述 |
| :--- | :--- | :--- |
| `listDevices` | - | 获取 USB 设备列表 |
| `open` | `vendorId`, `productId` | 打开串口连接 |
| `close` | - | 关闭串口连接 |
| `getConfig` | - | 从 Python 获取配置参数 |
| `setConfig` | `key`, `value` | 设置 Python 配置参数 |
| `resetConfig` | - | 重置 Python 配置参数 |
| `setAlgoMode` | `enabled: boolean` | 开启/关闭算法自动控制 |
| `sendAirbagCommand`| `zone: string`, `action: string` | 发送手动气囊控制指令 |

**Native → JS 事件：**

| 事件名 | 数据字段 | 描述 |
| :--- | :--- | :--- |
| `onSerialData` | `data: string` | 标准传感器帧 CSV 数据 |
| `onSerialResult` | `data`, `result`, `error` | Python 算法处理结果 |
| `onSerialMode` | `data`, `modeValue`, `manual`, `auto` | 模式帧（自动/手动切换） |
| `onNonStandardFrame` | `data`, `hex`, `length`, `timestamp` | 非标准帧回传数据（非 144/51 字节） |
| `onAirbagCommandSent` | `zone`, `action`, `hex`, `bytes` | 气囊指令发送确认 |

## 6. 项目进度

> 记录项目从开始到现在已经完成的所有工作，每次新增追加到末尾。

| 完成日期 | 完成的功能/工作 | 说明 |
| :--- | :--- | :--- |
| 2026-03-02 | 算法模式控制 | 实现自适应调节开关与自定义气囊调节页面的算法模式联动 |
| 2026-03-02 | 自定义气囊调节 | 添加每个气囊的加减控制逻辑，并可在控制台打印串口指令 |
| 2026-03-02 | 实时算法数据弹窗 | 新增独立的实时算法数据弹窗，使用与配置弹窗相同的模板 |
| 2026-03-01 | 配置参数设置弹窗 | 实现可直接更改 Python 配置参数的弹窗 |
| 2026-02-28 | 3D 模型与数据可视化 | 实现 3D 座椅模型，实时展示传感器数据和气囊状态 |
| 2026-03-05 15:30 | manus | 非标准帧回传数据显示 | FrameParser 输出 FrameResult 含帧长度，SerialModule 区分标准帧/非标准帧，HomeScreen 新增"回传"按钮和弹窗显示非 144 字节帧的 HEX 数据 |

## 7. 更新日志

| 日期 | 变更类型 | 描述 |
| :--- | :--- | :--- |
| 2026-03-02 | 新增功能 | 实现算法模式控制，联动自适应调节开关和自定义气囊调节页面 |
| 2026-03-02 | 新增功能 | 在自定义气囊调节页面添加每个气囊的加减控制逻辑 |
| 2026-03-02 | 新增功能 | 新增独立的实时算法数据弹窗 |
| 2026-03-01 | 修复缺陷 | 修复配置弹窗加载失败问题，回退到 `pythonExecutor` 实现 |
| 2026-03-01 | 新增功能 | 实现配置参数设置弹窗 |
| 2026-02-29 | 初始化 | 创建项目架构文档 |
| 2026-03-05 15:30 | manus | 新增功能 | 添加非标准帧回传数据显示功能，用于调试气囊回传指令 |

---

*此文档旨在提供项目架构的快照，具体实现细节请参考源代码。*
