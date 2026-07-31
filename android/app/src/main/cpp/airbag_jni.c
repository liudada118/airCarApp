// JNI 包装：把 Simulink 生成的 airbag_13Hz 算法暴露给 Kotlin 调用。
// 数据流：Kotlin 传入 92 字节原始压力帧 → 逐个转 float 填 frame_data[92]
//         → airbag_13Hz_v2_step() → 读输出结构体 → 打包成 float[] 返回。
//
// 注意：Simulink 生成代码是全局单实例（airbag_13Hz_v2_U / _Y / _DW），
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
//   [176] isChild（儿童确认 0/1，先活体后儿童，重物恒 0）
//   [177] isAdult（成人确认 0/1，与 isChild 互斥；isLiving=1 时二者恰一为 1）
//   [178] childThreshold_out（儿童坐垫压力阈值回显，非法/未接线回显 1400）
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
#define OUT_IS_CHILD        176  // 儿童确认标志(1/0)：先活体后儿童，重物恒0
#define OUT_IS_ADULT        177  // 成人确认标志(1/0)：与 isChild 互斥；isLiving=1 时二者恰一为1
#define OUT_CHILD_THRESHOLD 178  // 儿童坐垫压力阈值回显(有效值回显下发，非法/未接线回显1400)
#define OUT_LEN             179

// ===== 可运行时调节的算法阈值表 =====
// 这些原本写死在 set_input_defaults() 里、改一次就得重编 .so 的标定输入，
// 现在统一登记到一张参数表：既用于回灌默认值，也通过 JNI 暴露给配置面板
// 逐项读/改/恢复默认（改动只在内存里，重启后由 Kotlin 端从 SharedPreferences 回放）。
//
// 每一行：结构体字段 | 默认值 | 分组(中文,面板分节) | 标签(中文,面板显示名)
// 只有「标定阈值」类输入进表；逐帧控制信号(frame_data1/frontCmd1/
// longSitMassageStop1/manualMassageOn1) 和 resetFlag1 不进表，单独处理。
#define AIRBAG_PARAM_TABLE(X) \
    X(cushionThreshold1,        1700.0F, "在座判定",   "坐垫压力阈值") \
    X(backrestThreshold1,       1500.0F, "在座判定",   "靠背压力阈值") \
    X(backTotalThreshold1,      22.0F,   "在座判定",   "靠背总压阈值") \
    X(pointThreshold1,          20.0F,   "在座判定",   "单点有效压力阈值") \
    X(detectorEnabled1,         1.0F,    "在座判定",   "检测器使能(0/1)") \
    X(inflation_time2,          10.0F,   "充放气时序", "充气时长1(s)") \
    X(inflation_time3,          5.0F,    "充放气时序", "充气时长2(s)") \
    X(holding_time1,            30.0F,   "充放气时序", "保持时长(s)") \
    X(deflation_time1,          10.0F,   "充放气时序", "放气时长(s)") \
    X(adoption_frequency1,      13.0F,   "充放气时序", "自适应频率") \
    X(leftInflateThreshold1,    0.75F,   "充放气阈值", "左充气阈值") \
    X(leftDeflateThreshold1,    0.9F,    "充放气阈值", "左放气阈值") \
    X(rightInflateThreshold1,   0.75F,   "充放气阈值", "右充气阈值") \
    X(rightDeflateThreshold1,   0.9F,    "充放气阈值", "右放气阈值") \
    X(ratioInflateLeft1,        0.8F,    "充放气阈值", "左充气比例") \
    X(ratioDeflateLeft1,        1.3F,    "充放气阈值", "左放气比例") \
    X(ratioInflate1,            1.2F,    "充放气阈值", "充气比例") \
    X(ratioDeflate1,            0.35F,   "充放气阈值", "放气比例") \
    X(sadThresholdIn1,          0.3F,    "活体检测",   "判活分数阈值") \
    X(sadNormalizeScaleIn1,     3.0F,    "活体检测",   "判活归一化尺度") \
    X(livingConfirmCountIn1,    2.0F,    "活体检测",   "确认活体次数(1~3)") \
    X(spineBiasDeadband1,       0.5F,    "健康-脊椎",  "脊椎偏移死区") \
    X(spineTimeThresholdSec1,   60.0F,   "健康-脊椎",  "脊椎持续阈值(s)") \
    X(bumpMinVelocity1,         8.0F,    "健康-颠簸",  "颠簸最小速度") \
    X(bumpMaxRms1,              0.5F,    "健康-颠簸",  "颠簸最大RMS") \
    X(bumpMaxRangeMm1,          15.0F,   "健康-颠簸",  "颠簸最大幅度(mm)") \
    X(bumpTimeThresholdSec1,    3.0F,    "健康-颠簸",  "颠簸持续阈值(s)") \
    X(sickForwardMinMm1,        5.0F,    "健康-晕车",  "前移最小距离(mm)") \
    X(sickBackDropRatio1,       0.3F,    "健康-晕车",  "靠背压降比例") \
    X(sickPairWindowSec1,       0.8F,    "健康-晕车",  "配对时间窗(s)") \
    X(cushionForwardSign1,      -1.0F,   "健康-晕车",  "坐垫前移方向符号") \
    X(welcomeSideWingTime1,     2.0F,    "入座欢迎",   "侧翼时长(s)") \
    X(welcomeLegTime1,          2.0F,    "入座欢迎",   "腿托时长(s)") \
    X(welcomeLumbarTime1,       3.0F,    "入座欢迎",   "腰托时长(s)") \
    X(welcomeHipTime1,          3.0F,    "入座欢迎",   "臀部时长(s)") \
    X(sitThresholdmin1,         5.0F,    "久坐按摩",   "久坐触发(分钟)") \
    X(childCushionThresholdIn,  1400.0F, "儿童识别",   "儿童坐垫压力阈值")

typedef struct {
    const char *name;    // 字段名（与 JS/Kotlin 一致的键）
    real32_T   *ptr;     // 指向 airbag_13Hz_v2_U 里的字段（链接期常量地址）
    real32_T    def;     // 默认值
    const char *group;   // 面板分组
    const char *label;   // 面板显示名
} AirbagParam;

static AirbagParam g_params[] = {
#define X(field, defv, grp, lbl) { #field, &airbag_13Hz_v2_U.field, (real32_T)(defv), grp, lbl },
    AIRBAG_PARAM_TABLE(X)
#undef X
};
static const int g_paramCount = (int)(sizeof(g_params) / sizeof(g_params[0]));

// 把算法输入结构体设为文档默认值（阈值/时序等）。
// initialize() 不会给输入设默认值，若不填全局输入会是 0，
// cushionThreshold=0 会导致「压力和>=0 恒成立 → 永远判定有人坐」。
static void set_input_defaults(void) {
    ExtU_airbag_13Hz_v2_T *U = &airbag_13Hz_v2_U;
    // 逐帧控制信号 / 复位标志：不进阈值表，这里单独清零。
    memset(U->frame_data1, 0, sizeof(U->frame_data1));
    U->resetFlag1          = 0;
    U->frontCmd1[0]        = 0.0F;
    U->frontCmd1[1]        = 0.0F;
    U->frontCmd1[2]        = 0.0F;
    U->longSitMassageStop1 = 0.0F;
    U->manualMassageOn1    = 0.0F;
    // 标定阈值：统一从参数表回灌默认值。
    for (int i = 0; i < g_paramCount; i++) {
        *g_params[i].ptr = g_params[i].def;
    }
}

JNIEXPORT void JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeInitialize(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    airbag_13Hz_v2_initialize();
    set_input_defaults();
    LOGI("airbag_13Hz initialized, defaults set");
}

JNIEXPORT void JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeTerminate(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    airbag_13Hz_v2_terminate();
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
        airbag_13Hz_v2_U.frame_data1[i] = (real32_T)v;
    }
    (*env)->ReleaseByteArrayElements(env, payload, bytes, JNI_ABORT);

    // 本帧输入：frontCmd 脉冲 + 久坐按摩开关
    airbag_13Hz_v2_U.frontCmd1[0] = (real32_T)mode;
    airbag_13Hz_v2_U.frontCmd1[1] = (real32_T)part;
    airbag_13Hz_v2_U.frontCmd1[2] = (real32_T)dir;
    airbag_13Hz_v2_U.longSitMassageStop1 = (real32_T)massageStop;
    airbag_13Hz_v2_U.manualMassageOn1 = (real32_T)manualMassageOn;
    // 注：sitThresholdmin1 已改为「阈值表」管理（配置面板可调），不再逐帧覆盖。
    //     这里保留形参兼容旧签名；传 <=0 表示「用面板/默认值」，>0 才临时覆盖。
    if ((real32_T)sitThresholdMin > 0.0F) {
        airbag_13Hz_v2_U.sitThresholdmin1 = (real32_T)sitThresholdMin;
    }

    airbag_13Hz_v2_step();

    jfloat out[OUT_LEN];
    out[0] = airbag_13Hz_v2_Y.reasonCode1;
    out[1] = airbag_13Hz_v2_Y.isFullSeat1;
    out[2] = airbag_13Hz_v2_Y.cushionSum1;
    out[3] = airbag_13Hz_v2_Y.backrestSum1;
    for (int i = 0; i < 55; i++) {
        out[OUT_FRAME_BASE + i] = airbag_13Hz_v2_Y.frame1[i];
    }
    for (int i = 0; i < 48; i++) {
        out[OUT_CUSHION_BASE + i] = airbag_13Hz_v2_Y.cushionData1[i];
    }
    for (int i = 0; i < 56; i++) {
        out[OUT_BACKREST_BASE + i] = airbag_13Hz_v2_Y.backrestData1[i];
    }
    out[OUT_IS_LIVING_RAW] = airbag_13Hz_v2_Y.isLivingRaw1;
    out[OUT_DET_TRIGGERED] = airbag_13Hz_v2_Y.detectionTriggered1;
    out[OUT_LONGSIT_MIN]    = airbag_13Hz_v2_Y.longSitMinutes1;
    out[OUT_LONGSIT_REMAIN] = airbag_13Hz_v2_Y.longSitCycleRemain1;
    out[OUT_LONGSIT_PROMPT] = airbag_13Hz_v2_Y.longSitPrompt1;
    out[OUT_LONGSIT_ACTIVE] = airbag_13Hz_v2_Y.longSitMassageActive1;
    out[OUT_SPINE_ACTIVE]   = airbag_13Hz_v2_Y.spineProtectActive1;
    out[OUT_SPINE_SIDE]     = airbag_13Hz_v2_Y.spineProtectSide1;
    out[OUT_BUMP_ACTIVE]    = airbag_13Hz_v2_Y.bumpReliefActive1;
    out[OUT_MOTION_ACTIVE]  = airbag_13Hz_v2_Y.motionSicknessActive1;
    out[OUT_HEALTH_CODE]    = airbag_13Hz_v2_Y.healthReasonCode1;
    out[OUT_IS_LIVING]      = airbag_13Hz_v2_Y.isLiving1;
    out[OUT_IS_STATIC]      = airbag_13Hz_v2_Y.isStatic1;
    out[OUT_IS_CHILD]        = airbag_13Hz_v2_Y.isChild;
    out[OUT_IS_ADULT]        = airbag_13Hz_v2_Y.isAdult;
    out[OUT_CHILD_THRESHOLD] = airbag_13Hz_v2_Y.childThreshold_out;

    jfloatArray result = (*env)->NewFloatArray(env, OUT_LEN);
    (*env)->SetFloatArrayRegion(env, result, 0, OUT_LEN, out);
    return result;
}

// ===== 阈值表的 JNI 读/改/恢复接口 =====
// 面板打开时：Count → 逐项 Name/Group/Label/Value/Default 拉一遍；
// 用户改一项：SetThreshold(name,value)；点恢复默认：ResetThresholds()。

JNIEXPORT jint JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeThresholdCount(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    return (jint)g_paramCount;
}

JNIEXPORT jstring JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeThresholdName(JNIEnv *env, jobject thiz, jint i) {
    (void)thiz;
    if (i < 0 || i >= g_paramCount) return (*env)->NewStringUTF(env, "");
    return (*env)->NewStringUTF(env, g_params[i].name);
}

JNIEXPORT jstring JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeThresholdGroup(JNIEnv *env, jobject thiz, jint i) {
    (void)thiz;
    if (i < 0 || i >= g_paramCount) return (*env)->NewStringUTF(env, "");
    return (*env)->NewStringUTF(env, g_params[i].group);
}

JNIEXPORT jstring JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeThresholdLabel(JNIEnv *env, jobject thiz, jint i) {
    (void)thiz;
    if (i < 0 || i >= g_paramCount) return (*env)->NewStringUTF(env, "");
    return (*env)->NewStringUTF(env, g_params[i].label);
}

JNIEXPORT jfloat JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeThresholdValue(JNIEnv *env, jobject thiz, jint i) {
    (void)env; (void)thiz;
    if (i < 0 || i >= g_paramCount) return 0.0F;
    return (jfloat)(*g_params[i].ptr);
}

JNIEXPORT jfloat JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeThresholdDefault(JNIEnv *env, jobject thiz, jint i) {
    (void)env; (void)thiz;
    if (i < 0 || i >= g_paramCount) return 0.0F;
    return (jfloat)g_params[i].def;
}

// 按字段名设置一项阈值；返回是否命中。
JNIEXPORT jboolean JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeSetThreshold(JNIEnv *env, jobject thiz,
        jstring name, jfloat value) {
    (void)thiz;
    if (name == NULL) return JNI_FALSE;
    const char *n = (*env)->GetStringUTFChars(env, name, NULL);
    jboolean hit = JNI_FALSE;
    for (int i = 0; i < g_paramCount; i++) {
        if (strcmp(n, g_params[i].name) == 0) {
            *g_params[i].ptr = (real32_T)value;
            hit = JNI_TRUE;
            break;
        }
    }
    (*env)->ReleaseStringUTFChars(env, name, n);
    return hit;
}

// 全部阈值恢复出厂默认值。
JNIEXPORT void JNICALL
Java_com_awesomeprojectgpt_airbag_AirbagNative_nativeResetThresholds(JNIEnv *env, jobject thiz) {
    (void)env; (void)thiz;
    for (int i = 0; i < g_paramCount; i++) {
        *g_params[i].ptr = g_params[i].def;
    }
}
