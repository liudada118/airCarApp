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
import java.util.concurrent.Executors

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
    private val logTag = "SerialModule"

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
            val result = manager.open(pending.vendorId, pending.productId, pending.baudRate) { data ->
                handleFrame(data)
            }
            when (result) {
                is SerialManager.OpenResult.Ok ->
                    pending.promise.resolve(true)
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
            val result = manager.open(vendorId, productId, 1000000) { data ->
                handleFrame(data)
            }
            when (result) {
                is SerialManager.OpenResult.Ok ->
                    promise.resolve(true)
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
                is SerialManager.OpenResult.Ok ->
                    promise.resolve(true)
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
    fun close() {
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
        pythonExecutor.execute {
            try {
                val values = parseCsvToIntList(data)
                if (values == null) {
                    emitSerialResult(data, null, "PARSE_ERROR")
                    return@execute
                }
                val module = Python.getInstance().getModule("server")
                val resultJson = module.callAttr("server", values).toString()
                emitSerialResult(data, resultJson, null)
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
}
