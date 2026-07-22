package com.awesomeprojectgpt.airbag

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/**
 * airbag_13Hz 原生算法的 RN 桥。
 * 目前只提供 selfTest（冒烟测试）和 step（喂一帧、拿输出），用于验证 .so 能在平板上跑通。
 * 后续接串口时，由 SerialModule 把 96 字节帧里的 92 字节喂给 step。
 */
class AirbagModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val tag = "AirbagModule"
    private var initialized = false

    override fun getName(): String = "AirbagNativeModule"

    private fun ensureInit() {
        if (!initialized) {
            AirbagNative.nativeInitialize()
            initialized = true
        }
    }

    /** 冒烟测试：初始化 + 喂一帧全 0（空座）+ 喂一帧假的“坐垫高压”，返回关键输出。 */
    @ReactMethod
    fun selfTest(promise: Promise) {
        try {
            ensureInit()

            // ① 空座帧（全 0）
            val emptyOut = AirbagNative.nativeStep(ByteArray(92), 0f, 0f, 0f, 0f)

            // ② 假造一帧：坐垫区(索引46..91)给一片高压，模拟有人坐
            val pressed = ByteArray(92)
            for (i in 46 until 92) pressed[i] = 200.toByte()
            val pressedOut = AirbagNative.nativeStep(pressed, 0f, 0f, 0f, 0f)

            val result = Arguments.createMap()
            result.putInt("outLen", emptyOut.size)
            // 空座
            result.putDouble("empty_reasonCode", emptyOut[AirbagNative.IDX_REASON_CODE].toDouble())
            result.putDouble("empty_cushionSum", emptyOut[AirbagNative.IDX_CUSHION_SUM].toDouble())
            // 假“有人坐”
            result.putDouble("pressed_reasonCode", pressedOut[AirbagNative.IDX_REASON_CODE].toDouble())
            result.putDouble("pressed_isFullSeat", pressedOut[AirbagNative.IDX_IS_FULL_SEAT].toDouble())
            result.putDouble("pressed_cushionSum", pressedOut[AirbagNative.IDX_CUSHION_SUM].toDouble())
            // 气囊帧头尾自检：frame[0] 应=31(0x1F)，frame[51..54] 应=170/85/3/153
            result.putDouble("frameHead", pressedOut[AirbagNative.IDX_FRAME_BASE + 0].toDouble())
            result.putDouble("frameTail0", pressedOut[AirbagNative.IDX_FRAME_BASE + 51].toDouble())
            result.putDouble("frameTail3", pressedOut[AirbagNative.IDX_FRAME_BASE + 54].toDouble())
            Log.i(tag, "selfTest ok: $result")
            promise.resolve(result)
        } catch (e: Throwable) {
            Log.e(tag, "selfTest failed", e)
            promise.reject("AIRBAG_NATIVE_ERR", e)
        }
    }

    /** 喂一帧真实的 92 字节压力，返回长度 59 的输出数组。 */
    @ReactMethod
    fun step(payload: ReadableArray, promise: Promise) {
        try {
            ensureInit()
            val bytes = ByteArray(92)
            val n = minOf(payload.size(), 92)
            for (i in 0 until n) bytes[i] = (payload.getInt(i) and 0xFF).toByte()
            val out = AirbagNative.nativeStep(bytes, 0f, 0f, 0f, 0f)
            val arr = Arguments.createArray()
            for (v in out) arr.pushDouble(v.toDouble())
            promise.resolve(arr)
        } catch (e: Throwable) {
            promise.reject("AIRBAG_NATIVE_ERR", e)
        }
    }
}
