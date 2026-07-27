// JNI 包装：把 Simulink 生成的 airbag_13Hz 算法暴露给 Kotlin 调用。
// 数据流：Kotlin 传入 92 字节原始压力帧 → 逐个转 float 填 frame_data[92]
//         → airbag_13Hz_step() → 读输出结构体 → 打包成 float[] 返回。
//
// 注意：Simulink 生成代码是全局单实例（airbag_13Hz_U / _Y / _DW），
// 只能单线程串行调用，不要并发 step()。

#include <jni.h>
#include <string.h>
#include <android/log.h>
#include "airbag_13Hz.h"

#define LOG_TAG "AirbagNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

// step() 返回的 float[] 布局（长度 165）：
//   [0] reasonCode   [1] isFullSeat   [2] cushionSum   [3] backrestSum
//   [4..58]   frame[55]（气囊指令帧，逐元素 0..255，取整转 uint8 后发硬件）
//   [59..106] cushionData[48]（坐垫热力图，MATLAB 列优先，恢复 6×8）
//   [107..162] backrestData[56]（靠背热力图，MATLAB 列优先，恢复 7×8）
//   [163] isLivingRaw（最近一次活体窗口原始结果 0/1）
//   [164] detectionTriggered（本周期是否产生新活体结果 0/1，=1 时前端采样 isLivingRaw）
//   [165] longSitMinutes（连续入座分钟）
//   [166] longSitCycleRemain（距下次久坐触发剩余帧数，/13=秒）
//   [167] longSitPrompt（进入久坐按摩的提示脉冲 0/1）
//   [168] longSitMassageActive（久坐按摩是否运行中 0/1）
//   [169] spineProtectActive（脊椎保护激活 0/1）
//   [170] spineProtectSide（脊椎偏移方向 -1/0/+1）
//   [171] bumpReliefActive（颠簸缓解激活 0/1）
//   [172] motionSicknessActive（晕车提醒激活 0/1）
//   [173] healthReasonCode（健康位掩码 0~7：1脊椎 2颠簸 4晕车）
#define OUT_FRAME_BASE      4
#define OUT_CUSHION_BASE    59
#define OUT_BACKREST_BASE   107
#define OUT_IS_LIVING_RAW   163
#define OUT_DET_TRIGGERED   164
#define OUT_LONGSIT_MIN     165
#define OUT_LONGSIT_REMAIN  166
#define OUT_LONGSIT_PROMPT  167
#define OUT_LONGSIT_ACTIVE  168
#define OUT_SPINE_ACTIVE    169
#define OUT_SPINE_SIDE      170
#define OUT_BUMP_ACTIVE     171
#define OUT_MOTION_ACTIVE   172
#define OUT_HEALTH_CODE     173
#define OUT_LEN             174

// 把算法输入结构体设为文档默认值（阈值/时序等）。
// initialize() 不会给输入设默认值，若不填全局输入会是 0，
// cushionThreshold=0 会导致「压力和>=0 恒成立 → 永远判定有人坐」。
static void set_input_defaults(void) {
    ExtU_airbag_13Hz_T *U = &airbag_13Hz_U;
    memset(U->frame_data, 0, sizeof(U->frame_data));
    U->backTotalThreshold    = 22.0F;
    U->resetFlag             = 0;
    U->detectorEnabled       = 1.0F;
    U->inflation_time        = 10.0F;
    U->inflation_time1       = 5.0F;
    U->holding_time          = 30.0F;
    U->deflation_time        = 10.0F;
    U->adoption_frequency    = 13.0F;
    U->cushionThreshold      = 1700.0F;
    U->backrestThreshold     = 1500.0F;
    U->leftInflateThreshold  = 0.75F;
    U->leftDeflateThreshold  = 0.9F;
    U->rightInflateThreshold = 0.75F;
    U->rightDeflateThreshold = 0.9F;
    U->ratioInflateLeft      = 0.8F;
    U->ratioDeflateLeft      = 1.3F;
    U->ratioInflate          = 1.2F;
    U->ratioDeflate          = 0.35F;
    U->longSitMassageStop    = 0.0F;
    U->manualMassageOn       = 0.0F;
    U->sitThresholdmin       = 5.0F;
    U->frontCmd[0] = 0.0F;
    U->frontCmd[1] = 0.0F;
    U->frontCmd[2] = 0.0F;
    // 模型 1.213 新增的健康检测标定输入。显式写入模型内置的回退值，
    // 避免依赖全局变量恰好为 0，也方便后续算法方给出车型标定值后统一替换。
    U->spineBiasDeadband = 0.5F;
    U->sickForwardMinMm  = 5.0F;
    U->sickBackDropRatio = 0.3F;
    U->sickPairWindowSec = 0.8F;
    U->bumpMinVelocity   = 8.0F;
    U->bumpMaxRms        = 0.5F;
    U->bumpMaxRangeMm    = 15.0F;
}

JNIEXPORT void JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeInitialize(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    airbag_13Hz_initialize();
    set_input_defaults();
    LOGI("airbag_13Hz initialized, defaults set");
}

JNIEXPORT void JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeTerminate(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    airbag_13Hz_terminate();
}

// payload: 板子发的 92 字节原始压力（前 46 靠背、后 46 坐垫，每点 1 字节 0..255）。
// mode/part/dir: 本帧的 frontCmd（自定义气囊/品味模式命令，边沿脉冲，由 Kotlin 每帧发一次后回零）。
// massageStop: 久坐按摩开关（0=允许自动按摩，1=停止）。
JNIEXPORT jfloatArray JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeStep(JNIEnv *env, jobject thiz,
        jbyteArray payload, jfloat mode, jfloat part, jfloat dir,
        jfloat massageStop, jfloat manualMassageOn, jfloat sitThresholdMin) {
    (void)thiz;
    jsize n = (*env)->GetArrayLength(env, payload);
    jbyte *bytes = (*env)->GetByteArrayElements(env, payload, NULL);
    jsize count = n < 92 ? n : 92;

    for (int i = 0; i < 92; i++) {
        // 关键：单字节值逐个转 float，不能 memcpy uint8[92] 到 real32[92]
        float v = (i < count) ? (float)((unsigned char)bytes[i]) : 0.0F;
        airbag_13Hz_U.frame_data[i] = (real32_T)v;
    }
    (*env)->ReleaseByteArrayElements(env, payload, bytes, JNI_ABORT);

    // 本帧输入：frontCmd 脉冲 + 久坐按摩开关
    airbag_13Hz_U.frontCmd[0] = (real32_T)mode;
    airbag_13Hz_U.frontCmd[1] = (real32_T)part;
    airbag_13Hz_U.frontCmd[2] = (real32_T)dir;
    airbag_13Hz_U.longSitMassageStop = (real32_T)massageStop;
    airbag_13Hz_U.manualMassageOn = (real32_T)manualMassageOn;
    airbag_13Hz_U.sitThresholdmin = (real32_T)sitThresholdMin;

    airbag_13Hz_step();

    jfloat out[OUT_LEN];
    out[0] = airbag_13Hz_Y.reasonCode;
    out[1] = airbag_13Hz_Y.isFullSeat;
    out[2] = airbag_13Hz_Y.cushionSum;
    out[3] = airbag_13Hz_Y.backrestSum;
    for (int i = 0; i < 55; i++) {
        out[OUT_FRAME_BASE + i] = airbag_13Hz_Y.frame[i];
    }
    for (int i = 0; i < 48; i++) {
        out[OUT_CUSHION_BASE + i] = airbag_13Hz_Y.cushionData[i];
    }
    for (int i = 0; i < 56; i++) {
        out[OUT_BACKREST_BASE + i] = airbag_13Hz_Y.backrestData[i];
    }
    out[OUT_IS_LIVING_RAW] = airbag_13Hz_Y.isLivingRaw;
    out[OUT_DET_TRIGGERED] = airbag_13Hz_Y.detectionTriggered;
    out[OUT_LONGSIT_MIN]    = airbag_13Hz_Y.longSitMinutes;
    out[OUT_LONGSIT_REMAIN] = airbag_13Hz_Y.longSitCycleRemain;
    out[OUT_LONGSIT_PROMPT] = airbag_13Hz_Y.longSitPrompt;
    out[OUT_LONGSIT_ACTIVE] = airbag_13Hz_Y.longSitMassageActive;
    out[OUT_SPINE_ACTIVE]   = airbag_13Hz_Y.spineProtectActive;
    out[OUT_SPINE_SIDE]     = airbag_13Hz_Y.spineProtectSide;
    out[OUT_BUMP_ACTIVE]    = airbag_13Hz_Y.bumpReliefActive;
    out[OUT_MOTION_ACTIVE]  = airbag_13Hz_Y.motionSicknessActive;
    out[OUT_HEALTH_CODE]    = airbag_13Hz_Y.healthReasonCode;

    jfloatArray result = (*env)->NewFloatArray(env, OUT_LEN);
    (*env)->SetFloatArrayRegion(env, result, 0, OUT_LEN, out);
    return result;
}
