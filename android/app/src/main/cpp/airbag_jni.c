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
//   [174] isLiving（乘员入座/活体，microState==3 时为 1）
//   [175] isStatic（静物占位，microState==2 时为 1）——两者都为 0 = 识别中/离座
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
#define OUT_IS_LIVING       174
#define OUT_IS_STATIC       175
#define OUT_LEN             176

// 把算法输入结构体设为文档默认值（阈值/时序等）。
// initialize() 不会给输入设默认值，若不填全局输入会是 0，
// cushionThreshold=0 会导致「压力和>=0 恒成立 → 永远判定有人坐」。
static void set_input_defaults(void) {
    ExtU_airbag_13Hz_T *U = &airbag_13Hz_U;
    // 注：新 C 包把所有输入字段都加了「1」后缀；inflation_time/inflation_time1
    //     被重命名为 inflation_time2/inflation_time3（含义不变）。
    memset(U->frame_data1, 0, sizeof(U->frame_data1));
    U->backTotalThreshold1    = 22.0F;
    U->resetFlag1             = 0;
    U->detectorEnabled1       = 1.0F;
    U->inflation_time2        = 10.0F;
    U->inflation_time3        = 5.0F;
    U->holding_time1          = 30.0F;
    U->deflation_time1        = 10.0F;
    U->adoption_frequency1    = 13.0F;
    U->cushionThreshold1      = 1700.0F;
    U->backrestThreshold1     = 1500.0F;
    U->leftInflateThreshold1  = 0.75F;
    U->leftDeflateThreshold1  = 0.9F;
    U->rightInflateThreshold1 = 0.75F;
    U->rightDeflateThreshold1 = 0.9F;
    U->ratioInflateLeft1      = 0.8F;
    U->ratioDeflateLeft1      = 1.3F;
    U->ratioInflate1          = 1.2F;
    U->ratioDeflate1          = 0.35F;
    U->longSitMassageStop1    = 0.0F;
    U->manualMassageOn1       = 0.0F;
    U->sitThresholdmin1       = 5.0F;
    U->frontCmd1[0] = 0.0F;
    U->frontCmd1[1] = 0.0F;
    U->frontCmd1[2] = 0.0F;
    // 模型 1.213 新增的健康检测标定输入。显式写入模型内置的回退值，
    // 避免依赖全局变量恰好为 0，也方便后续算法方给出车型标定值后统一替换。
    U->spineBiasDeadband1 = 0.5F;
    U->sickForwardMinMm1  = 5.0F;
    U->sickBackDropRatio1 = 0.3F;
    U->sickPairWindowSec1 = 0.8F;
    U->bumpMinVelocity1   = 8.0F;
    U->bumpMaxRms1        = 0.5F;
    U->bumpMaxRangeMm1    = 15.0F;
    // 模型 1.225 新增的判活标定输入。显式写入（否则为 0 会走模型内置回退值）。
    // sadThresholdIn：单次判活分数阈值，sadScore >= 该值记一次"活体"，(0,1]。
    // 模型内置回退 0.4，这里按标定值改为 0.3（降低阈值，更容易判活）。
    U->sadThresholdIn1      = 0.3F;
    U->sadNormalizeScaleIn1 = 3.0F;   // 模型内置回退值
    U->livingConfirmCountIn1 = 2.0F;  // 确认活体所需判活次数(最近3次中)，1~3
    // 新 C 包新增输入：显式写入模型内置回退值（<=0 时算法会用这些值）。
    U->welcomeSideWingTime1 = 2.0F;   // 入座欢迎-侧翼时长(s)
    U->welcomeLegTime1      = 2.0F;   // 入座欢迎-腿托时长(s)
    U->welcomeLumbarTime1   = 3.0F;   // 入座欢迎-腰托时长(s)
    U->welcomeHipTime1      = 3.0F;   // 入座欢迎-臀部时长(s)
    U->cushionForwardSign1  = -1.0F;  // 坐垫前移方向符号(0/负→-1)
    U->bumpTimeThresholdSec1  = 3.0F;   // 颠簸持续时间阈值(s)
    U->spineTimeThresholdSec1 = 60.0F;  // 脊椎偏移持续时间阈值(s)
    U->pointThreshold1        = 20.0F;  // 单点有效压力阈值
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
        airbag_13Hz_U.frame_data1[i] = (real32_T)v;
    }
    (*env)->ReleaseByteArrayElements(env, payload, bytes, JNI_ABORT);

    // 本帧输入：frontCmd 脉冲 + 久坐按摩开关
    airbag_13Hz_U.frontCmd1[0] = (real32_T)mode;
    airbag_13Hz_U.frontCmd1[1] = (real32_T)part;
    airbag_13Hz_U.frontCmd1[2] = (real32_T)dir;
    airbag_13Hz_U.longSitMassageStop1 = (real32_T)massageStop;
    airbag_13Hz_U.manualMassageOn1 = (real32_T)manualMassageOn;
    airbag_13Hz_U.sitThresholdmin1 = (real32_T)sitThresholdMin;

    airbag_13Hz_step();

    jfloat out[OUT_LEN];
    out[0] = airbag_13Hz_Y.reasonCode1;
    out[1] = airbag_13Hz_Y.isFullSeat1;
    out[2] = airbag_13Hz_Y.cushionSum1;
    out[3] = airbag_13Hz_Y.backrestSum1;
    for (int i = 0; i < 55; i++) {
        out[OUT_FRAME_BASE + i] = airbag_13Hz_Y.frame1[i];
    }
    for (int i = 0; i < 48; i++) {
        out[OUT_CUSHION_BASE + i] = airbag_13Hz_Y.cushionData1[i];
    }
    for (int i = 0; i < 56; i++) {
        out[OUT_BACKREST_BASE + i] = airbag_13Hz_Y.backrestData1[i];
    }
    out[OUT_IS_LIVING_RAW] = airbag_13Hz_Y.isLivingRaw1;
    out[OUT_DET_TRIGGERED] = airbag_13Hz_Y.detectionTriggered1;
    out[OUT_LONGSIT_MIN]    = airbag_13Hz_Y.longSitMinutes1;
    out[OUT_LONGSIT_REMAIN] = airbag_13Hz_Y.longSitCycleRemain1;
    out[OUT_LONGSIT_PROMPT] = airbag_13Hz_Y.longSitPrompt1;
    out[OUT_LONGSIT_ACTIVE] = airbag_13Hz_Y.longSitMassageActive1;
    out[OUT_SPINE_ACTIVE]   = airbag_13Hz_Y.spineProtectActive1;
    out[OUT_SPINE_SIDE]     = airbag_13Hz_Y.spineProtectSide1;
    out[OUT_BUMP_ACTIVE]    = airbag_13Hz_Y.bumpReliefActive1;
    out[OUT_MOTION_ACTIVE]  = airbag_13Hz_Y.motionSicknessActive1;
    out[OUT_HEALTH_CODE]    = airbag_13Hz_Y.healthReasonCode1;
    out[OUT_IS_LIVING]      = airbag_13Hz_Y.isLiving1;
    out[OUT_IS_STATIC]      = airbag_13Hz_Y.isStatic1;

    jfloatArray result = (*env)->NewFloatArray(env, OUT_LEN);
    (*env)->SetFloatArrayRegion(env, result, 0, OUT_LEN, out);
    return result;
}
