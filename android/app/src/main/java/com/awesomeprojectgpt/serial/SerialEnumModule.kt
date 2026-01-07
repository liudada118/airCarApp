package com.awesomeprojectgpt.serial

import android.content.Context
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SerialEnumModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SerialEnumModule"

    @ReactMethod
    fun listDevices(promise: Promise) {
        val usbManager =
            reactContext.getSystemService(Context.USB_SERVICE) as UsbManager
        val array = Arguments.createArray()
        usbManager.deviceList.values.forEach { device ->
            array.pushMap(buildDeviceMap(device))
        }
        promise.resolve(array)
    }

    private fun buildDeviceMap(device: UsbDevice) =
        Arguments.createMap().apply {
            putInt("vendorId", device.vendorId)
            putInt("productId", device.productId)
            putInt("deviceId", device.deviceId)
            putInt("interfaceCount", device.interfaceCount)
            putString("deviceName", device.deviceName)
            putString("manufacturerName", safeDeviceString { device.manufacturerName })
            putString("productName", safeDeviceString { device.productName })
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                putString("serialNumber", safeDeviceString { device.serialNumber })
            } else {
                putNull("serialNumber")
            }
        }

    private fun safeDeviceString(getter: () -> String?): String? {
        return try {
            getter()
        } catch (_: SecurityException) {
            null
        }
    }
}
