package com.awesomeprojectgpt.airbag

import android.content.Context
import android.util.Log
import java.io.File

/**
 * airbag_13Hz 算法的 JNI 入口（对应 cpp/airbag_jni.c）。
 *
 * 用法：先 nativeInitialize() 一次，然后每帧 nativeStep(92字节)，退出时 nativeTerminate()。
 * 算法是全局单实例，必须单线程串行调用。
 *
 * nativeStep(payload, mode, part, dir, massageStop) 返回 FloatArray（长度 174）：
 *   [0] reasonCode  [1] isFullSeat  [2] cushionSum  [3] backrestSum
 *   [4..58]   frame[55]（气囊指令帧，逐元素 0..255 → uint8 后发硬件）
 *   [59..106] cushionData[48]（坐垫热力图，列优先，恢复 6×8）
 *   [107..162] backrestData[56]（靠背热力图，列优先，恢复 7×8）
 *   [163] isLivingRaw（活体窗口原始结果 0/1）
 *   [164] detectionTriggered（本周期是否产生新活体结果 0/1）
 *   [165] longSitMinutes（连续入座分钟）
 *   [166] longSitCycleRemain（距下次久坐触发剩余帧数，/13=秒）
 *   [167] longSitPrompt（久坐按摩提示脉冲 0/1）
 *   [168] longSitMassageActive（久坐按摩运行中 0/1）
 *   [169] spineProtectActive  [170] spineProtectSide  [171] bumpReliefActive
 *   [172] motionSicknessActive  [173] healthReasonCode（位掩码 1脊椎/2颠簸/4晕车）
 *
 * mode/part/dir = 本帧 frontCmd（自定义气囊/品味命令，一帧脉冲）；massageStop = 久坐按摩开关(0允许/1停)。
 */
object AirbagNative {
    private const val TAG = "AirbagNative"

    /** 算法团队 push 覆盖包的固定目录名（位于 App 外部私有目录下）。
     *  实际路径：/sdcard/Android/data/com.awesomeprojectgpt/files/algo/libairbag.so
     *  这个目录 adb push 不需要 root、也不需要存储权限（App 自己的私有目录）。 */
    private const val OVERRIDE_DIR = "algo"
    private const val SO_NAME = "libairbag.so"

    @Volatile private var loaded = false
    /** 记录本次到底加载了哪个 .so（"override:<路径>" 或 "bundled"），供状态面板显示。 */
    @Volatile var loadedFrom: String = "(未加载)"
        private set

    /**
     * 确保 libairbag.so 已加载。幂等：每个进程只真正加载一次。
     * 加载优先级：
     *   ① 覆盖包 getExternalFilesDir/algo/libairbag.so —— 存在就用它（算法团队热替换）
     *   ② 打包内置 jniLibs/arm64-v8a/libairbag.so —— 兜底
     * 任一步失败都自动回退到内置包，保证 App 一定能起来。
     *
     * 调用点：AirbagModule.ensureInit / SerialModule.ensureAirbag13Init，
     * 必须在任何 nativeXxx() 之前调用一次。
     */
    @Synchronized
    fun ensureLoaded(context: Context) {
        if (loaded) return

        val override = resolveOverrideSo(context)
        if (override != null) {
            try {
                // dlopen 要求从可执行的位置加载；外部存储在部分设备是 noexec，
                // 所以先复制到内部私有目录（filesDir）再 System.load。
                val active = File(context.filesDir, "algo_active/$SO_NAME")
                active.parentFile?.mkdirs()
                override.copyTo(active, overwrite = true)
                System.load(active.absolutePath)
                loaded = true
                loadedFrom = "override:${override.absolutePath}(${override.length()}B)"
                Log.i(TAG, "已加载算法覆盖包 -> $loadedFrom")
                return
            } catch (e: Throwable) {
                Log.e(TAG, "覆盖包加载失败，回退内置包: ${override.absolutePath}", e)
            }
        }

        // 兜底：打包内置
        System.loadLibrary("airbag")
        loaded = true
        loadedFrom = "bundled"
        Log.i(TAG, "已加载内置算法包 (jniLibs/libairbag.so)")
    }

    /** 找覆盖包文件，不存在/空文件返回 null。 */
    private fun resolveOverrideSo(context: Context): File? {
        return try {
            val dir = context.getExternalFilesDir(OVERRIDE_DIR) ?: return null
            val f = File(dir, SO_NAME)
            if (f.isFile && f.length() > 0L) f else null
        } catch (e: Throwable) {
            Log.e(TAG, "查找覆盖包出错", e)
            null
        }
    }

    external fun nativeInitialize()
    external fun nativeTerminate()
    external fun nativeStep(
        payload: ByteArray,
        mode: Float,
        part: Float,
        dir: Float,
        massageStop: Float,
        manualMassageOn: Float,
        sitThresholdMin: Float,
    ): FloatArray

    // ===== 可运行时调节的算法阈值表（对应 cpp/airbag_jni.c 的 g_params）=====
    // 面板打开时逐项拉取；改一项用 nativeSetThreshold；恢复默认用 nativeResetThresholds。
    external fun nativeThresholdCount(): Int
    external fun nativeThresholdName(i: Int): String
    external fun nativeThresholdGroup(i: Int): String
    external fun nativeThresholdLabel(i: Int): String
    external fun nativeThresholdValue(i: Int): Float
    external fun nativeThresholdDefault(i: Int): Float
    external fun nativeSetThreshold(name: String, value: Float): Boolean
    external fun nativeResetThresholds()

    // 输出数组索引常量
    const val IDX_REASON_CODE = 0
    const val IDX_IS_FULL_SEAT = 1
    const val IDX_CUSHION_SUM = 2
    const val IDX_BACKREST_SUM = 3
    const val IDX_FRAME_BASE = 4        // frame[0..54] 在 [4..58]
    const val IDX_CUSHION_DATA = 59     // cushionData[48] 在 [59..106]（列优先 6×8）
    const val IDX_BACKREST_DATA = 107   // backrestData[56] 在 [107..162]（列优先 7×8）
    const val IDX_IS_LIVING_RAW = 163   // isLivingRaw（活体窗口原始结果 0/1）
    const val IDX_DET_TRIGGERED = 164   // detectionTriggered（本周期是否产生新活体结果 0/1）
    const val IDX_LONGSIT_MIN = 165     // longSitMinutes（连续入座分钟）
    const val IDX_LONGSIT_REMAIN = 166  // longSitCycleRemain（剩余帧数，/13=秒）
    const val IDX_LONGSIT_PROMPT = 167  // longSitPrompt（提示脉冲 0/1）
    const val IDX_LONGSIT_ACTIVE = 168  // longSitMassageActive（运行中 0/1）
    const val IDX_SPINE_ACTIVE = 169    // spineProtectActive（脊椎保护激活 0/1）
    const val IDX_SPINE_SIDE = 170      // spineProtectSide（偏移方向 -1/0/+1）
    const val IDX_BUMP_ACTIVE = 171     // bumpReliefActive（颠簸缓解激活 0/1）
    const val IDX_MOTION_ACTIVE = 172   // motionSicknessActive（晕车提醒激活 0/1）
    const val IDX_HEALTH_CODE = 173     // healthReasonCode（健康位掩码 0~7）
    const val IDX_IS_LIVING = 174       // isLiving（乘员入座/活体 0/1）
    const val IDX_IS_STATIC = 175       // isStatic（静物占位 0/1）；两者都 0 = 识别中/离座
    const val IDX_IS_CHILD = 176        // isChild（儿童确认 0/1，先活体后儿童，重物恒 0）
    const val IDX_IS_ADULT = 177        // isAdult（成人确认 0/1，与 isChild 互斥）
    const val IDX_CHILD_THRESHOLD = 178 // childThreshold_out（儿童坐垫压力阈值回显，非法/未接线=1400）
    // 「无预压力热力图」用：没减 2 秒预压力基线的绝对值，点位排布与上面的热力图完全一致
    const val IDX_RAW_CUSHION = 179     // rawCushionData[48] 在 [179..226]（列优先 6×8）
    const val IDX_RAW_BACKREST = 227    // rawBackrestData[56] 在 [227..282]（列优先 7×8）
    const val OUT_LEN = 283
}
