#!/usr/bin/env bash
# 重新编译 airbag_13Hz 的原生库 libairbag.so（arm64-v8a），输出到 jniLibs。
#
# 为什么不用 gradle 的 externalNativeBuild：
#   本项目 newArchEnabled=true，RN 自己用 externalNativeBuild 编 libappmodules.so；
#   若在 app/build.gradle 再定义 externalNativeBuild 会覆盖掉 RN 的那份，
#   导致 PlatformConstants 等核心模块缺失、App 起不来。
#   所以这里用 NDK 预编译成 .so，由 Gradle 当预编译库打包。
#
# 用法：改了 c_airbag/*.c 或 airbag_jni.c 后，跑一次本脚本，再重新构建 App。
set -e

NDK="${ANDROID_NDK:-/c/Users/98765/AppData/Local/Android/Sdk/ndk/27.1.12297006}"
CLANG="$NDK/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe"

HERE="$(cd "$(dirname "$0")" && pwd)"
CDIR="$HERE/../c_airbag"
OUTDIR="$HERE/../jniLibs/arm64-v8a"
mkdir -p "$OUTDIR"

"$CLANG" --target=aarch64-linux-android24 -shared -fPIC -O2 -Wall -I"$CDIR" \
  "$HERE/airbag_jni.c" \
  "$CDIR/airbag_13Hz.c" \
  "$CDIR/rt_nonfinite.c" \
  "$CDIR/rtGetNaN.c" \
  -llog -o "$OUTDIR/libairbag.so"

echo "OK -> $OUTDIR/libairbag.so"
