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

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            // 检查接收到的Intent是否是USB权限请求的响应
            if (intent.action != permissionAction) return
            
            // 从Intent中获取USB设备信息，如果获取失败则直接返回
            val device =
                intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE) ?: return
            
            // 检查用户是否授予了USB权限
            val granted =
                intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            
            // 获取当前待处理的打开请求
            val pending = pendingOpen
            
            // 验证当前设备是否与待处理请求中的设备匹配，防止处理过期或无关的权限响应
            if (pending == null || device.deviceId != pending.device.deviceId) return
            
            // 清除待处理请求和超时任务
            pendingOpen = null
            clearPendingTimeout()
            
            // 如果用户拒绝了权限，则拒绝Promise并返回
            if (!granted) {
                pending.promise.reject("NO_PERMISSION", "usb permission denied")
                return
            }
            
            // 尝试打开串口连接，并设置数据帧处理回调
            val result = manager.open(pending.vendorId, pending.productId, pending.baudRate) { data ->
                handleFrame(data)
            }
            
            // 根据打开结果处理Promise
            when (result) {
                is SerialManager.OpenResult.Ok -> {
                    // 如果当前处于自动模式，则启动自动写入任务
                    if (isAutoMode) {
                        startAutoWrite()
                    }
                    // 成功打开连接，解决Promise
                    pending.promise.resolve(true)
                }
                is SerialManager.OpenResult.Fail ->
                    // 打开失败，拒绝Promise并传递错误信息
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
            val result = manager.open(vendorId, productId, 1000000) { data ->
                handleFrame(data)
            }
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
            val result = manager.open(vendorId, productId, baudRate) { data ->
                handleFrame(data)
            }
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
            // 清空自动写入缓存，确保不会残留指令
            autoWriteText = null
            autoWriteBytes = null
            Log.i(logTag, "[AlgoMode] Algorithm mode DISABLED, autoWrite stopped")
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

    // ─── 气囊手动控制 ─────────────────────────────────────────────────

    /** AirbagZone → 协议气囊 ID 列表 */
    private val zoneToAirbagIds: Map<String, List<Int>> = mapOf(
        "sideWingL"  to listOf(2, 4),   // 左侧翼上、左侧翼下
        "sideWingR"  to listOf(1, 3),   // 右侧翼上、右侧翼下
        "lumbarUp"   to listOf(5),      // 腰托1
        "lumbarDown"  to listOf(6),     // 腰托2
        "shoulderL"  to listOf(7),      // 肩部左（预留）
        "shoulderR"  to listOf(8),      // 肩部右（预留）
        "cushionFL"  to listOf(11),     // 坐垫前左（预留）
        "cushionFR"  to listOf(12),     // 坐垫前右（预留）
        "cushionRL"  to listOf(9),      // 坐垫后左 → 腿托1
        "cushionRR"  to listOf(10)      // 坐垫后右 → 腿托2
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
        // 帧头
        frame.add(FRAME_HEADER)
        // 24 个气囊 × 2 字节
        for (airbagId in 1..24) {
            frame.add(airbagId)
            frame.add(commands.getOrDefault(airbagId, GEAR_STOP))
        }
        // 工作模式
        frame.add(MODE_AUTO)
        // 方向标识
        frame.add(DIRECTION_DOWNLOAD)
        // 帧尾
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

            // 打印发送指令到控制台
            Log.i(logTag, "[AirbagCmd] zone=$zone action=$action airbagIds=$airbagIds gear=0x${Integer.toHexString(gear)}")
            Log.i(logTag, "[AirbagCmd] HEX: $hexStr (${frame.size} bytes)")

            // 同时发送事件到 JS 端，让前端也能看到
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

    // ─── 3D 点图配置持久化（SharedPreferences） ───────────────────────
    private val prefs by lazy {
        reactContext.getSharedPreferences("point_settings", Context.MODE_PRIVATE)
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
        // reload 时的兆底清理
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

    private fun handleFrame(data: String) {
        emitSerialData(data)
        val values = parseCsvToIntList(data)
        if (values == null) {
            emitSerialResult(data, null, "PARSE_ERROR")
            return
        }
        // frame log disabled
        if (values.size == 51) {
            handleModeFrame(values, data)
            return
        }
        pythonExecutor.execute {
            try {
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("server", values).toString()
                emitSerialResult(data, resultJson, null)
                updateAutoWritePayloadFromResult(resultJson)
            } catch (e: Exception) {
                Log.e(logTag, "python server call failed", e)
                emitSerialResult(data, null, e.message ?: "PY_ERROR")
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

    private fun handleModeFrame(values: List<Int>, data: String) {
        val modeValue = values.getOrNull(49) ?: -1
        // mode frame log disabled
        emitSerialMode(data, modeValue)
        when (modeValue) {
            0 -> {
                if (!isAutoMode) {
                    isAutoMode = true
                    // Log.i(logTag, "auto mode enabled")
                    startAutoWrite()
                }
            }
            1 -> {
                if (isAutoMode) {
                    isAutoMode = false
                    // Log.i(logTag, "auto mode disabled")
                    stopAutoWrite()
                }
            }
            else -> Log.w(logTag, "unknown mode value: $modeValue")
        }
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

            // 优先从 airbag_command.command 获取，其次从 control_command 获取
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

            // 将 hex 字符串解码为二进制 ByteArray（等价于 Node.js 的 Buffer.from(hexStr, 'hex')）
            val bytes = hexStringToByteArray(hex)
            autoWriteText = hex
            autoWriteBytes = bytes

            lastAutoWriteHex = hex
        } catch (e: Exception) {
            Log.e(logTag, "parse control_command failed", e)
        }
    }

    /** 将 hex 字符串解码为二进制 ByteArray，等价于 Node.js 的 Buffer.from(hexStr, 'hex') */
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
            autoWriteTask = autoWriteScheduler.scheduleAtFixedRate({
                try {
                    // 优先使用二进制 ByteArray 发送（等价于 Node.js 的 port.write(Buffer.from(hexStr, 'hex'))）
                    val bytes = autoWriteBytes
                    if (bytes != null && bytes.isNotEmpty()) {
                        val hex = autoWriteText ?: bytes.joinToString("") { "%02X".format(it) }
                        Log.i(logTag, "[SerialWrite] HEX: $hex (${bytes.size} bytes)")
                        when (val result = manager.writeBytes(bytes)) {
                            is SerialManager.OpenResult.Fail ->
                                Log.e(logTag, "auto write failed: ${result.code} ${result.message}")
                            else -> {}
                        }
                        return@scheduleAtFixedRate
                    }
                    // 回退：如果没有缓存的 bytes，尝试从 hex 字符串转换
                    val payload = autoWriteText
                    if (payload.isNullOrEmpty()) return@scheduleAtFixedRate
                    val fallbackBytes = hexStringToByteArray(payload)
                    when (val result = manager.writeBytes(fallbackBytes)) {
                        is SerialManager.OpenResult.Fail ->
                            Log.e(logTag, "auto write failed: ${result.code} ${result.message}")
                        else -> {
                            Log.d(logTag, "auto write sent ${fallbackBytes.size} bytes (from hex)")
                        }
                    }
                } catch (e: Exception) {
                    Log.e(logTag, "auto write task crashed", e)
                }
            }, 0, 500, TimeUnit.MILLISECONDS)
        }
    }

    private fun stopAutoWrite() {
        synchronized(autoWriteLock) {
            autoWriteTask?.cancel(true)
            autoWriteTask = null
        }
    }
}