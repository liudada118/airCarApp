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

    private val manager = SerialManager(reactContext)
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
        manager.close()
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
        try {
            reactContext.unregisterReceiver(permissionReceiver)
        } catch (_: Exception) {
            // ignore
        }
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
        if (values.isNotEmpty()) {
            Log.i(logTag, "frame received: size=${values.size} first=${values.first()} last=${values.last()}")
        } else {
            Log.i(logTag, "frame received: empty")
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
        Log.i(logTag, "mode frame received: size=${values.size} modeValue=$modeValue")
        emitSerialMode(data, modeValue)
        when (modeValue) {
            0 -> {
                if (!isAutoMode) {
                    isAutoMode = true
                    Log.i(logTag, "auto mode enabled")
                    startAutoWrite()
                }
            }
            1 -> {
                if (isAutoMode) {
                    isAutoMode = false
                    Log.i(logTag, "auto mode disabled")
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

            if (hex != lastAutoWriteHex) {
                lastAutoWriteHex = hex
                Log.i(logTag, "auto write payload updated: hex=$hex (${bytes.size} bytes)")
            }
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
                        when (val result = manager.writeBytes(bytes)) {
                            is SerialManager.OpenResult.Fail ->
                                Log.e(logTag, "auto write failed: ${result.code} ${result.message}")
                            else -> {
                                Log.d(logTag, "auto write sent ${bytes.size} bytes")
                            }
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