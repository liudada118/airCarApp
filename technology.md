# Technology Notes

## 1.7 代码审查要点
- 关键问题：`SerialReadThread` 使用 `port.read(..., 0)` 导致空闲时忙等，占用 CPU；应设置正超时或在无数据时让出 CPU。
- 关键问题：`SerialManager.listDevices` 未返回 `deviceId`，而前端以 `deviceId` 作为 React key，列表多设备时键重复、选中不稳定。
- 关键问题：`gradle-wrapper.properties` 的 `distributionUrl` 指向本地磁盘 `file:///E:/android/gradle-8.13-bin.zip`，其他机器/CI 无法构建。

## 修改记录
- 新增 `technology.md`，记录上述审查要点，便于后续修复与跟踪。
- 除此之外未修改其他文件。

- 修正串口相关 Kotlin 包名与导入，并补充 `usb-serial-for-android` 依赖，涉及 `android/app/src/main/java/com/awesomeprojectgpt/*.kt` 与 `android/app/build.gradle`。
- 新增 RN 手动注册包与串口枚举模块：`SerialEnumPackage`、`SerialEnumModule`，并在 `MainApplication` 注册。
- 增加 USB 权限申请与 pending/超时处理，新增 `resetPendingOpen`，以及 PendingIntent flag 处理。
- 增加 CH340 探测回退与串口打开细节（可配置波特率、DTR/RTS、重试、写入接口）。
- 串口帧解析改为以 `AA 55 03 99` 为分隔符输出完整数据段。
- 更新 RN 示例页面：设备选择、波特率设置、发送、RX/TX 日志、CH340 标识。- Added serial module/package fixes and usb-serial dependency updates (android/app/src/main/java/com/awesomeprojectgpt/*.kt, android/app/build.gradle).
- Added SerialEnumModule + SerialEnumPackage and manual registration in MainApplication.
- Added USB permission flow with pending/timeout handling and resetPendingOpen.
- Added CH340 probe fallback and open options (baud rate, DTR/RTS, retry) plus write support.
- Updated frame parsing to use delimiter AA 55 03 99.
- Updated RN example UI to select device, set baud rate, send, and show RX/TX logs with CH340 labels.
