package com.awesomeprojectgpt.airbag

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
    init {
        System.loadLibrary("airbag")
    }

    external fun nativeInitialize()
    external fun nativeTerminate()
    external fun nativeStep(
        payload: ByteArray,
        mode: Float,
        part: Float,
        dir: Float,
        massageStop: Float,
    ): FloatArray

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
    const val OUT_LEN = 174
}
