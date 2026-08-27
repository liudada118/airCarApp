#!/usr/bin/env bash
# 重新编译 airbag_13Hz 的原生库 libairbag.so（arm64-v8a），输出到 jniLibs。
#
# 为什么不用 gradle 的 externalNativeBuild：
#   本项目 newArchEnabled=true，RN 自己用 externalNativeBuild 编 libappmodules.so；
#   若在 app/build.gradle 再定义 externalNativeBuild 会覆盖掉 RN 的那份，
#   导致 PlatformConstants 等核心模块缺失、App 起不来。
#   所以这里用 NDK 预编译成 .so，由 Gradle 当预编译库打包。
#
# 用法：改了 c_airbag/*.c 或 airbag_jni.c 后，跑一次本脚本。
#   - App 开发者：跑完再重新构建 App（内置包）。
#   - 算法团队热替换：跑完直接把输出的 libairbag.so 交给 push-algo.sh 推到平板。
#
# 换机器时只需设一个环境变量指向你自己的 NDK（r27 附近即可）：
#   export ANDROID_NDK=/你的/Android/Sdk/ndk/27.1.12297006     # Windows 用 /c/Users/... 形式
set -e

NDK="${ANDROID_NDK:-/c/Users/98765/AppData/Local/Android/Sdk/ndk/27.1.12297006}"

# 自动识别本机操作系统对应的 NDK 预编译工具链目录，Windows/Mac/Linux 都能用。
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) HOST_TAG="windows-x86_64"; EXE=".exe" ;;
  Darwin)               HOST_TAG="darwin-x86_64"; EXE="" ;;
  *)                    HOST_TAG="linux-x86_64";  EXE="" ;;
esac
CLANG="$NDK/toolchains/llvm/prebuilt/$HOST_TAG/bin/clang$EXE"

if [[ ! -x "$CLANG" && ! -f "$CLANG" ]]; then
  echo "❌ 找不到 clang: $CLANG"
  echo "   请设 ANDROID_NDK 指向你安装的 NDK 目录（当前=$NDK）"
  exit 1
fi

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
