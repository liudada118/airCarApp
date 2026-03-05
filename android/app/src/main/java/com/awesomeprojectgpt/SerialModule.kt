package com.awesomeprojectgpt.serial

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.chaquo.python.Python
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class SerialModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        /** 全局单例保护：reload 时确保旧实例的串口被关闭 */
        @Volatile
        private var activeManager: SerialManager? = null

        @Synchronized
        fun getOrCreateManager(context: Context): SerialManager {
            // reload 时旧 manager 仍然存活，先关闭它
            val existing = activeManager
            if (existing != null) {
                try { existing.close() } catch (_: Exception) {}
            }
            val m = SerialManager(context)
            activeManager = m
            return m
        }

        @Synchronized
        fun closeActiveManager() {
            try { activeManager?.close() } catch (_: Exception) {}
            activeManager = null
        }
    }

    private val manager = getOrCreateManager(reactContext)
    private val usbManager =
        reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
    private val permissionAction = "com.awesomeprojectgpt.USB_PERMISSION"

    private data class PendingOpen(
        val device: UsbDevice,
        val vendorId: Int,
        val productId: Int,
        val baudRate: Int,
        val promise: Promise
    )

    private var pendingOpen: PendingOpen? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pendingTimeout: Runnable? = null
    private val pythonExecutor = Executors.newSingleThreadExecutor()
    private val autoWriteScheduler = Executors.newSingleThreadScheduledExecutor()
    private val autoWriteLock = Any()
    private var autoWriteTask: ScheduledFuture<*>? = null
    @Volatile private var autoWriteText: String? = null
    @Volatile private var autoWriteBytes: ByteArray? = null
    @Volatile private var isAutoMode = true
    @Volatile private var lastAutoWriteHex: String? = null
    private val logTag = "SerialModule"

    /** autoWrite 连续写入失败计数器 */
    private val autoWriteFailCount = AtomicInteger(0)
    /** autoWrite 连续失败阈值，超过后通知 JS 层连接异常 */
    private val autoWriteFailThreshold = 3

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != permissionAction) return
            
            val device =
                intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
            
            val granted =
                intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            
            val pending = pendingOpen
            
            if (pending == null || device.deviceId != pending.device.deviceId) return
            
            pendingOpen = null
            clearPendingTimeout()
            
            if (!granted) {
                pending.promise.reject("NO_PERMISSION", "usb permission denied")
                return
            }
            val result = manager.open(pending.vendorId, pending.productId, pending.baudRate,
                onFrame = { frameResult -> handleFrame(frameResult) },
                onDisconnect = { handleReadThreadDisconnect() }
            )
            
            when (result) {
                is SerialManager.OpenResult.Ok -> {
                    if (isAutoMode) {
                        startAutoWrite()
                    }
                    pending.promise.resolve(true)
                }
                is SerialManager.OpenResult.Fail ->
                    pending.promise.reject(result.code, result.message)
            }
        }
    }

    override fun getName() = "SerialModule"

    init {
        val filter = IntentFilter(permissionAction)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(
                permissionReceiver,
                filter,
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            reactContext.registerReceiver(permissionReceiver, filter)
        }
    }

    @ReactMethod
    fun listDevices(promise: Promise) {
        promise.resolve(manager.listDevices())
    }

    @ReactMethod
    fun open(vendorId: Int, productId: Int, promise: Promise) {
        val device = usbManager.deviceList.values.find {
            it.vendorId == vendorId && it.productId == productId
        }
        if (device == null) {
            promise.reject("NOT_FOUND", "device not found")
            return
        }
        if (pendingOpen != null) {
            pendingOpen?.promise?.reject("OPEN_CANCELED", "open canceled by new request")
            pendingOpen = null
            clearPendingTimeout()
        }
        if (usbManager.hasPermission(device)) {
            val result = manager.open(vendorId, productId, 1000000,
                onFrame = { frameResult -> handleFrame(frameResult) },
                onDisconnect = { handleReadThreadDisconnect() }
            )
            when (result) {
                is SerialManager.OpenResult.Ok -> {
                    if (isAutoMode) {
                        startAutoWrite()
                    }
                    promise.resolve(true)
                }
                is SerialManager.OpenResult.Fail ->
                    promise.reject(result.code, result.message)
            }
            return
        }
        pendingOpen = PendingOpen(device, vendorId, productId, 1000000, promise)
        schedulePendingTimeout()
        requestPermission(device)
    }

    @ReactMethod
    fun openWithOptions(vendorId: Int, productId: Int, options: ReadableMap, promise: Promise) {
        val baudRate = if (options.hasKey("baudRate") && !options.isNull("baudRate")) {
            options.getInt("baudRate")
        } else {
            1000000
        }
        val device = usbManager.deviceList.values.find {
            it.vendorId == vendorId && it.productId == productId
        }
        if (device == null) {
            promise.reject("NOT_FOUND", "device not found")
            return
        }
        if (pendingOpen != null) {
            pendingOpen?.promise?.reject("OPEN_CANCELED", "open canceled by new request")
            pendingOpen = null
            clearPendingTimeout()
        }
        if (usbManager.hasPermission(device)) {
            val result = manager.open(vendorId, productId, baudRate,
                onFrame = { frameResult -> handleFrame(frameResult) },
                onDisconnect = { handleReadThreadDisconnect() }
            )
            when (result) {
                is SerialManager.OpenResult.Ok -> {
                    if (isAutoMode) {
                        startAutoWrite()
                    }
                    promise.resolve(true)
                }
                is SerialManager.OpenResult.Fail ->
                    promise.reject(result.code, result.message)
            }
            return
        }
        pendingOpen = PendingOpen(device, vendorId, productId, baudRate, promise)
        schedulePendingTimeout()
        requestPermission(device)
    }

    @ReactMethod
    fun write(text: String, promise: Promise) {
        val result = manager.write(text)
        when (result) {
            is SerialManager.OpenResult.Ok ->
                promise.resolve(true)
            is SerialManager.OpenResult.Fail ->
                promise.reject(result.code, result.message)
        }
    }

    @ReactMethod
    fun setAutoWritePayload(text: String) {
        autoWriteText = text
        autoWriteBytes = null
    }

    /**
     * JS 端主动控制算法模式（自动写入）
     * @param enabled true=开启算法自动写入, false=关闭算法自动写入
     * @param sendStopFrame true=关闭时发送全停保压帧
     */
    @ReactMethod
    fun setAlgoMode(enabled: Boolean) {
        Log.i(logTag, "[AlgoMode] setAlgoMode($enabled) isAutoMode was $isAutoMode")
        if (enabled && !isAutoMode) {
            isAutoMode = true
            startAutoWrite()
            Log.i(logTag, "[AlgoMode] Algorithm mode ENABLED, autoWrite started")
        } else if (!enabled && isAutoMode) {
            isAutoMode = false
            stopAutoWrite()
            autoWriteText = null
            autoWriteBytes = null
            Log.i(logTag, "[AlgoMode] Algorithm mode DISABLED, autoWrite stopped")
        }
    }

    /**
     * JS 端调用：发送全部保压帧（所有气囊档位=0x00）
     * 用于自适应关闭或进入自定义调节时让所有气囊进入保压状态
     */
    @ReactMethod
    fun sendStopAllFrame(promise: Promise) {
        try {
            // 构建保压帧：所有气囊档位为 GEAR_STOP (0x00)
            val frame = buildProtocolFrame(emptyMap())
            val hexStr = frame.joinToString("") { "%02X".format(it) }

            Log.i(logTag, "[StopAll] Sending stop-all frame: $hexStr (${frame.size} bytes)")

            when (val result = manager.writeBytes(frame)) {
                is SerialManager.OpenResult.Ok -> {
                    Log.i(logTag, "[StopAll] Sent successfully")
                    promise.resolve(hexStr)
                }
                is SerialManager.OpenResult.Fail -> {
                    Log.e(logTag, "[StopAll] Send failed: ${result.code} ${result.message}")
                    promise.reject(result.code, result.message)
                }
            }
        } catch (e: Exception) {
            Log.e(logTag, "[StopAll] Error", e)
            promise.reject("STOP_ALL_ERROR", e.message ?: "sendStopAllFrame failed")
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by NativeEventEmitter
    }

    @ReactMethod
    fun close() {
        stopAutoWrite()
        try {
            closeActiveManager()
        } catch (e: Exception) {
            Log.w("SerialModule", "close: ${e.message}")
        }
    }

    @ReactMethod
    fun getConfig(promise: Promise) {
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("get_config").toString()
                promise.resolve(resultJson)
            } catch (e: Exception) {
                promise.reject("PY_ERROR", e.message ?: "get_config failed")
            }
        }
    }

    @ReactMethod
    fun setConfig(keyPath: String, valueJson: String, promise: Promise) {
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("set_config", keyPath, valueJson).toString()
                promise.resolve(resultJson)
            } catch (e: Exception) {
                promise.reject("PY_ERROR", e.message ?: "set_config failed")
            }
        }
    }

    @ReactMethod
    fun resetConfig(promise: Promise) {
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("reset_config").toString()
                promise.resolve(resultJson)
            } catch (e: Exception) {
                promise.reject("PY_ERROR", e.message ?: "reset_config failed")
            }
        }
    }

    // ─── 品味记录接口 ─────────────────────────────────────────

    @ReactMethod
    fun triggerPreferenceRecording(bodyShape: String?, promise: Promise) {
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = if (bodyShape != null && bodyShape.isNotEmpty()) {
                    module.callAttr("trigger_preference_recording", bodyShape).toString()
                } else {
                    module.callAttr("trigger_preference_recording").toString()
                }
                promise.resolve(resultJson)
            } catch (e: Exception) {
                promise.reject("PY_ERROR", e.message ?: "trigger_preference_recording failed")
            }
        }
    }

    @ReactMethod
    fun cancelPreferenceRecording(promise: Promise) {
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("cancel_preference_recording").toString()
                promise.resolve(resultJson)
            } catch (e: Exception) {
                promise.reject("PY_ERROR", e.message ?: "cancel_preference_recording failed")
            }
        }
    }

    @ReactMethod
    fun getPreferenceStatus(promise: Promise) {
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("get_preference_status").toString()
                promise.resolve(resultJson)
            } catch (e: Exception) {
                promise.reject("PY_ERROR", e.message ?: "get_preference_status failed")
            }
        }
    }

    // ─── 气囊手动控制 ─────────────────────────────────────────────────

    /** AirbagZone → 协议气囊 ID 列表
     *  同时支持主页 10 组旧名和自定义页面 5 组新名
     */
    private val zoneToAirbagIds: Map<String, List<Int>> = mapOf(
        // ─── 主页 10 组（算法自适应） ───
        "sideWingL"  to listOf(2, 4),   // 左侧翼上、左侧翼下
        "sideWingR"  to listOf(1, 3),   // 右侧翼上、右侧翼下
        "lumbarUp"   to listOf(5),      // 腰托1
        "lumbarDown"  to listOf(6),     // 腰托2
        "shoulderL"  to listOf(7),      // 肩部左（预留）
        "shoulderR"  to listOf(8),      // 肩部右（预留）
        "cushionFL"  to listOf(11),     // 坐垫前左（预留）
        "cushionFR"  to listOf(12),     // 坐垫前右（预留）
        "cushionRL"  to listOf(9),      // 坐垫后左 → 腿托1
        "cushionRR"  to listOf(10),     // 坐垫后右 → 腿托2
        // ─── 自定义页面 5 组（每组控制 2 个物理气囊） ───
        "shoulder"   to listOf(1, 2),   // 肩部气囊
        "sideWing"   to listOf(3, 4),   // 侧翼气囊
        "lumbar"     to listOf(5, 6),   // 腰托气囊
        "hipFirm"    to listOf(7, 8),   // 臀部软硬度气囊
        "legRest"    to listOf(9, 10)   // 腿托气囊
    )

    private val FRAME_HEADER = 0x1F
    private val FRAME_TAIL = intArrayOf(0xAA, 0x55, 0x03, 0x99)
    private val GEAR_STOP = 0x00
    private val GEAR_INFLATE = 0x03
    private val GEAR_DEFLATE = 0x04
    private val MODE_AUTO = 0x00
    private val DIRECTION_DOWNLOAD = 0x00

    /**
     * 构建 55 字节协议帧
     * @param commands  气囊ID → 档位 的映射
     */
    private fun buildProtocolFrame(commands: Map<Int, Int>): ByteArray {
        val frame = mutableListOf<Int>()
        frame.add(FRAME_HEADER)
        for (airbagId in 1..24) {
            frame.add(airbagId)
            frame.add(commands.getOrDefault(airbagId, GEAR_STOP))
        }
        frame.add(MODE_AUTO)
        frame.add(DIRECTION_DOWNLOAD)
        for (b in FRAME_TAIL) {
            frame.add(b)
        }
        return ByteArray(frame.size) { frame[it].toByte() }
    }

    @ReactMethod
    fun sendAirbagCommand(zone: String, action: String, promise: Promise) {
        try {
            val airbagIds = zoneToAirbagIds[zone]
            if (airbagIds == null) {
                promise.reject("INVALID_ZONE", "Unknown airbag zone: $zone")
                return
            }

            val gear = when (action) {
                "inflate" -> GEAR_INFLATE
                "deflate" -> GEAR_DEFLATE
                "stop"    -> GEAR_STOP
                else -> {
                    promise.reject("INVALID_ACTION", "Unknown action: $action, expected inflate/deflate/stop")
                    return
                }
            }

            val commands = mutableMapOf<Int, Int>()
            for (id in airbagIds) {
                commands[id] = gear
            }

            val frame = buildProtocolFrame(commands)
            val hexStr = frame.joinToString("") { "%02X".format(it) }

            Log.i(logTag, "[AirbagCmd] zone=$zone action=$action airbagIds=$airbagIds gear=0x${Integer.toHexString(gear)}")
            Log.i(logTag, "[AirbagCmd] HEX: $hexStr (${frame.size} bytes)")

            val params = Arguments.createMap().apply {
                putString("zone", zone)
                putString("action", action)
                putString("hex", hexStr)
                putInt("bytes", frame.size)
            }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onAirbagCommandSent", params)

            when (val result = manager.writeBytes(frame)) {
                is SerialManager.OpenResult.Ok -> {
                    Log.i(logTag, "[AirbagCmd] Sent successfully")
                    promise.resolve(hexStr)
                }
                is SerialManager.OpenResult.Fail -> {
                    Log.e(logTag, "[AirbagCmd] Send failed: ${result.code} ${result.message}")
                    promise.reject(result.code, result.message)
                }
            }
        } catch (e: Exception) {
            Log.e(logTag, "[AirbagCmd] Error", e)
            promise.reject("AIRBAG_CMD_ERROR", e.message ?: "sendAirbagCommand failed")
        }
    }

      // ─── 3D 点图配置持久化（SharedPreferences） ───────────────────
    private val prefs by lazy {
        reactContext.getSharedPreferences("point_settings", Context.MODE_PRIVATE)
    }

    // ─── 气囊设置持久化（SharedPreferences） ───────────────────
    private val airbagPrefs by lazy {
        reactContext.getSharedPreferences("airbag_settings", Context.MODE_PRIVATE)
    }

    @ReactMethod
    fun saveAirbagSettings(jsonStr: String, promise: Promise) {
        try {
            airbagPrefs.edit().putString("custom_airbag_values", jsonStr).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message ?: "save airbag settings failed")
        }
    }

    @ReactMethod
    fun loadAirbagSettings(promise: Promise) {
        try {
            val json = airbagPrefs.getString("custom_airbag_values", null)
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message ?: "load airbag settings failed")
        }
    }

    @ReactMethod
    fun savePointSettings(jsonStr: String, promise: Promise) {
        try {
            prefs.edit().putString("settings", jsonStr).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SAVE_ERROR", e.message ?: "save failed")
        }
    }

    @ReactMethod
    fun loadPointSettings(promise: Promise) {
        try {
            val json = prefs.getString("settings", null)
            promise.resolve(json)
        } catch (e: Exception) {
            promise.reject("LOAD_ERROR", e.message ?: "load failed")
        }
    }

    @ReactMethod
    fun resetPendingOpen() {
        pendingOpen?.promise?.reject("OPEN_CANCELED", "open canceled by reset")
        pendingOpen = null
        clearPendingTimeout()
    }

    override fun invalidate() {
        super.invalidate()
        clearPendingTimeout()
        stopAutoWrite()
        autoWriteScheduler.shutdownNow()
        pythonExecutor.shutdownNow()
        closeActiveManager()
        try {
            reactContext.unregisterReceiver(permissionReceiver)
        } catch (_: Exception) {
            // ignore
        }
    }

    override fun onCatalystInstanceDestroy() {
        invalidate()
        super.onCatalystInstanceDestroy()
    }

    private fun requestPermission(device: UsbDevice) {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        val intent = PendingIntent.getBroadcast(
            reactContext,
            0,
            Intent(permissionAction),
            flags
        )
        usbManager.requestPermission(device, intent)
    }

    private fun schedulePendingTimeout() {
        clearPendingTimeout()
        pendingTimeout = Runnable {
            val pending = pendingOpen ?: return@Runnable
            pendingOpen = null
            pending.promise.reject("OPEN_TIMEOUT", "usb permission timeout")
        }
        mainHandler.postDelayed(pendingTimeout!!, 15000)
    }

    private fun clearPendingTimeout() {
        pendingTimeout?.let { mainHandler.removeCallbacks(it) }
        pendingTimeout = null
    }

    /**
     * 读取线程检测到连续读取失败后的回调，通知 JS 层连接已断开
     */
    private fun handleReadThreadDisconnect() {
        Log.e(logTag, "[Disconnect] Read thread detected serial disconnection")
        stopAutoWrite()
        emitConnectionLost("串口读取线程检测到连接断开")
    }

    /**
     * 发送连接断开事件到 JS 层
     */
    private fun emitConnectionLost(reason: String) {
        try {
            val map = Arguments.createMap()
            map.putString("reason", reason)
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onSerialDisconnect", map)
        } catch (e: Exception) {
            Log.e(logTag, "emitConnectionLost failed", e)
        }
    }

    private fun handleFrame(frameResult: FrameResult) {
        val data = frameResult.csv
        val frameLen = frameResult.length

        // 非 144 字节的帧都打印到回传面板（包括 51 字节模式帧、气囊回传等）
        if (frameLen != 144) {
            Log.w(logTag, "[NonStdFrame] length=$frameLen data=$data")
            emitNonStandardFrame(data, frameLen)
        }

        // 非标准帧（不是 144 也不是 51）→ 仅打印，不走后续处理
        if (frameLen != 144 && frameLen != 51) {
            return
        }

        // 标准帧 → 正常处理
        emitSerialData(data)
        val values = parseCsvToIntList(data)
        if (values == null) {
            // PARSE_ERROR 是数据解析问题，不是连接错误，仅记录日志不上报为连接异常
            Log.w(logTag, "[Frame] PARSE_ERROR: $data")
            return
        }
        if (values.size == 51) {
            handleModeFrame(values, data)
            return
        }
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("server", values).toString()
                emitSerialResult(data, resultJson, null)
                // 始终更新 autoWrite 缓存，确保开启自适应时能立即发送最新指令
                updateAutoWritePayloadFromResult(resultJson)
            } catch (e: Exception) {
                Log.e(logTag, "python server call failed", e)
                // Python 算法错误仅作为算法错误上报，不影响连接状态
                emitAlgoError(e.message ?: "PY_ERROR")
            }
        }
    }

    private fun emitSerialData(data: String) {
        val map = Arguments.createMap()
        map.putString("data", data)
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onSerialData", map)
    }

    private fun emitSerialResult(data: String, resultJson: String?, error: String?) {
        val map = Arguments.createMap()
        map.putString("data", data)
        if (resultJson != null) {
            map.putString("result", resultJson)
        }
        if (error != null) {
            map.putString("error", error)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onSerialResult", map)
    }

    /**
     * 发送算法处理错误事件（与连接错误区分开）
     */
    private fun emitAlgoError(message: String) {
        val map = Arguments.createMap()
        map.putString("error", message)
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onAlgoError", map)
    }

    private fun emitSerialMode(data: String, modeValue: Int) {
        val map = Arguments.createMap()
        map.putString("data", data)
        map.putInt("modeValue", modeValue)
        map.putBoolean("manual", modeValue == 1)
        map.putBoolean("auto", modeValue == 0)
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onSerialMode", map)
    }

    /** 发送非标准帧数据到 JS 端 */
    private fun emitNonStandardFrame(data: String, length: Int) {
        val map = Arguments.createMap()
        map.putString("data", data)
        map.putInt("length", length)
        map.putDouble("timestamp", System.currentTimeMillis().toDouble())
        // 将 CSV 转为 HEX 方便查看
        val hexStr = try {
            data.split(",").joinToString(" ") {
                val v = it.trim().toIntOrNull() ?: 0
                "%02X".format(v and 0xFF)
            }
        } catch (_: Exception) { data }
        map.putString("hex", hexStr)
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onNonStandardFrame", map)
    }

    private fun handleModeFrame(values: List<Int>, data: String) {
        val modeValue = values.getOrNull(49) ?: -1
        Log.i(logTag, "[ModeFrame] modeValue=$modeValue (0=auto, 1=manual)")
        // 只发送事件通知 JS 端，不控制 autoWrite
        // autoWrite 的启停由 JS 端通过 setAlgoMode 控制
        emitSerialMode(data, modeValue)
    }

    private fun parseCsvToIntList(data: String): List<Int>? {
        if (data.isBlank()) return emptyList()
        val parts = data.split(',')
        val list = ArrayList<Int>(parts.size)
        for (part in parts) {
            val trimmed = part.trim()
            if (trimmed.isEmpty()) continue
            val value = trimmed.toIntOrNull() ?: return null
            list.add(value)
        }
        return list
    }

    private fun updateAutoWritePayloadFromResult(resultJson: String) {
        try {
            val json = JSONObject(resultJson)

            var arr: JSONArray? = null
            if (json.has("airbag_command") && !json.isNull("airbag_command")) {
                val airbagCmd = json.optJSONObject("airbag_command")
                if (airbagCmd != null && airbagCmd.has("command") && !airbagCmd.isNull("command")) {
                    arr = airbagCmd.optJSONArray("command")
                }
            }
            if (arr == null) {
                if (!json.has("control_command") || json.isNull("control_command")) {
                    autoWriteText = null
                    autoWriteBytes = null
                    return
                }
                arr = json.optJSONArray("control_command")
            }
            if (arr == null) {
                autoWriteText = null
                autoWriteBytes = null
                return
            }

            val hex = controlCommandToHex(arr)
            if (hex.isEmpty()) {
                autoWriteText = null
                autoWriteBytes = null
                return
            }

            val bytes = hexStringToByteArray(hex)
            autoWriteText = hex
            autoWriteBytes = bytes

            lastAutoWriteHex = hex
        } catch (e: Exception) {
            Log.e(logTag, "parse control_command failed", e)
        }
    }

    /** 将 hex 字符串解码为二进制 ByteArray */
    private fun hexStringToByteArray(hex: String): ByteArray {
        val len = hex.length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(hex[i], 16) shl 4) + Character.digit(hex[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }

    private fun controlCommandToHex(arr: JSONArray): String {
        val sb = StringBuilder(arr.length() * 2)
        for (i in 0 until arr.length()) {
            val value = arr.optInt(i, -1)
            if (value < 0) continue
            val hex = Integer.toString(value and 0xFF, 16).padStart(2, '0')
            sb.append(hex)
        }
        return sb.toString()
    }

    private fun startAutoWrite() {
        synchronized(autoWriteLock) {
            if (autoWriteTask != null) return
            if (autoWriteScheduler.isShutdown) {
                Log.w(logTag, "auto write scheduler is shutdown")
                return
            }
            autoWriteFailCount.set(0)
            autoWriteTask = autoWriteScheduler.scheduleAtFixedRate({
                try {
                    // 优先使用二进制 ByteArray 发送
                    val bytes = autoWriteBytes
                    if (bytes != null && bytes.isNotEmpty()) {
                        val hex = autoWriteText ?: bytes.joinToString("") { "%02X".format(it) }
                        Log.i(logTag, "[SerialWrite] HEX: $hex (${bytes.size} bytes)")
                        when (val result = manager.writeBytes(bytes)) {
                            is SerialManager.OpenResult.Fail -> {
                                Log.e(logTag, "auto write failed: ${result.code} ${result.message}")
                                handleAutoWriteFailure()
                            }
                            else -> {
                                autoWriteFailCount.set(0) // 写入成功，重置失败计数
                            }
                        }
                        return@scheduleAtFixedRate
                    }
                    val payload = autoWriteText
                    if (payload.isNullOrEmpty()) return@scheduleAtFixedRate
                    val fallbackBytes = hexStringToByteArray(payload)
                    when (val result = manager.writeBytes(fallbackBytes)) {
                        is SerialManager.OpenResult.Fail -> {
                            Log.e(logTag, "auto write failed: ${result.code} ${result.message}")
                            handleAutoWriteFailure()
                        }
                        else -> {
                            autoWriteFailCount.set(0)
                            Log.d(logTag, "auto write sent ${fallbackBytes.size} bytes (from hex)")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(logTag, "auto write task crashed", e)
                }
            }, 0, 500, TimeUnit.MILLISECONDS)
        }
    }

    /**
     * autoWrite 写入失败时的处理：连续失败超过阈值则通知 JS 层连接异常
     */
    private fun handleAutoWriteFailure() {
        val count = autoWriteFailCount.incrementAndGet()
        if (count >= autoWriteFailThreshold) {
            Log.e(logTag, "[AutoWrite] $count consecutive write failures, notifying JS of disconnection")
            // 不停止 autoWrite，让硬件 mode frame 能继续控制；仅通知 JS 层
            emitConnectionLost("串口写入连续失败 $count 次")
        }
    }

    private fun stopAutoWrite() {
        synchronized(autoWriteLock) {
            autoWriteTask?.cancel(true)
            autoWriteTask = null
        }
    }
}
