#!/usr/bin/env bash
# ============================================================================
#  换算法 —— 一条命令搞定：编译 + 推送 + 重启 App
# ----------------------------------------------------------------------------
#  日常用法（算法团队最常用）：
#     1. 把新的 C 文件放进 android/app/src/main/c_airbag/（覆盖同名旧文件）
#     2. 跑这一条：  bash scripts/swap-algo.sh
#
#  它内部依次做：
#     ① build_so.sh   把 c_airbag + airbag_jni.c 编成 libairbag.so
#     ② push-algo.sh  推到平板并重启 App
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==================== ① 编译 libairbag.so ===================="
bash "$HERE/../android/app/src/main/cpp/build_so.sh"

echo ""
echo "==================== ② 推送到平板并重启 ===================="
bash "$HERE/push-algo.sh"
