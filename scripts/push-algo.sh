#!/usr/bin/env bash
# ============================================================================
#  算法热替换脚本 —— 换 libairbag.so，不用重新打 APK
# ----------------------------------------------------------------------------
#  用法：
#     ./scripts/push-algo.sh <新的libairbag.so路径>
#  例：
#     ./scripts/push-algo.sh ./build/libairbag.so
#
#  干三件事：① 把新 .so push 到平板 App 私有目录 ② 重启 App ③ 打印当前生效包
#  平板需已用 USB 或 `adb connect <ip:port>` 连上电脑。
# ============================================================================
set -euo pipefail

# 关键：在 Windows 的 Git Bash / MSYS 下，禁止把 /sdcard/... 这类设备路径
# 自动改写成 Windows 路径（否则 adb 会收到 C:\... 的错误路径）。
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL='*'

PKG="com.awesomeprojectgpt"
DEST_DIR="/sdcard/Android/data/${PKG}/files/algo"
DEST="${DEST_DIR}/libairbag.so"

SO="${1:-}"
if [[ -z "$SO" ]]; then
  echo "❌ 用法: $0 <libairbag.so 的路径>"
  exit 1
fi
if [[ ! -f "$SO" ]]; then
  echo "❌ 找不到文件: $SO"
  exit 1
fi

# --- 找 adb ---
ADB="${ADB:-adb}"
if ! command -v "$ADB" >/dev/null 2>&1; then
  # 常见 Windows SDK 路径兜底
  for c in "$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe" \
           "$HOME/AppData/Local/Android/Sdk/platform-tools/adb.exe"; do
    [[ -x "$c" ]] && ADB="$c" && break
  done
fi

# --- 自动选第一台已连接设备 ---
DEV="$("$ADB" devices | grep -w device | head -1 | cut -f1 || true)"
if [[ -z "$DEV" ]]; then
  echo "❌ 没有已连接的设备。先插 USB，或跑： $ADB connect <平板IP:端口>"
  exit 1
fi
echo "📱 设备: $DEV"

# --- ① 建目录 + push（改名成固定的 libairbag.so）---
echo "📦 推送算法包 -> $DEST"
"$ADB" -s "$DEV" shell mkdir -p "$DEST_DIR"
"$ADB" -s "$DEV" push "$SO" "$DEST"

# --- ② 重启 App 让它重新加载 ---
echo "🔄 重启 App..."
"$ADB" -s "$DEV" shell am force-stop "$PKG"
"$ADB" -s "$DEV" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

echo ""
echo "✅ 换包完成。App 已重启并加载新算法包。"
echo "   想确认生效：进 App 触发一次算法（或点自检），看日志里的 AirbagNative 一行，"
echo "   应显示 '已加载算法覆盖包 -> override:...'。"
echo ""
echo "   看日志： $ADB -s $DEV logcat -s AirbagNative"
echo "   还原到内置包： $ADB -s $DEV shell rm $DEST  然后重启 App。"
