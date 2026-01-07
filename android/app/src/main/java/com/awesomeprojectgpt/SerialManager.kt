package com.awesomeprojectgpt.serial

import android.content.Context
import android.hardware.usb.*
import com.hoho.android.usbserial.driver.Ch34xSerialDriver
import com.hoho.android.usbserial.driver.ProbeTable
import com.hoho.android.usbserial.driver.UsbSerialPort
import com.hoho.android.usbserial.driver.UsbSerialProber
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray

class SerialManager(private val context: Context) {

    private val usbManager =
        context.getSystemService(Context.USB_SERVICE) as UsbManager

    private var port: UsbSerialPort? = null
    private var readThread: SerialReadThread? = null

    sealed class OpenResult {
        object Ok : OpenResult()
        data class Fail(val code: String, val message: String) : OpenResult()
    }

    fun listDevices(): WritableArray {
        val array = Arguments.createArray()
        usbManager.deviceList.values.forEach { d ->
            val map = Arguments.createMap()
            map.putInt("vendorId", d.vendorId)
            map.putInt("productId", d.productId)
            map.putString("deviceName", d.deviceName)
            array.pushMap(map)
        }
        return array
    }

    fun open(
        vendorId: Int,
        productId: Int,
        baudRate: Int,
        onFrame: (String) -> Unit
    ): OpenResult {
        close()
        val device = usbManager.deviceList.values.find {
            it.vendorId == vendorId && it.productId == productId
        } ?: return OpenResult.Fail("NOT_FOUND", "device not found")

        val driver = UsbSerialProber.getDefaultProber().probeDevice(device)
            ?: UsbSerialProber(
                ProbeTable().apply {
                    addProduct(device.vendorId, device.productId, Ch34xSerialDriver::class.java)
                }
            ).probeDevice(device)
            ?: return OpenResult.Fail("NO_DRIVER", "usb-serial driver not found")
        port = driver.ports[0]

        val conn = usbManager.openDevice(device)
            ?: return OpenResult.Fail("OPEN_DEVICE_FAIL", "openDevice returned null")
        var lastError: Exception? = null
        for (attempt in 0 until 2) {
            try {
                if (attempt == 0) {
                    try {
                        Thread.sleep(100)
                    } catch (_: InterruptedException) {
                        // ignore
                    }
                }
                port!!.open(conn)
                port!!.setParameters(
                    baudRate,
                    8,
                    UsbSerialPort.STOPBITS_1,
                    UsbSerialPort.PARITY_NONE
                )
                port!!.dtr = true
                port!!.rts = true
                readThread = SerialReadThread(port!!, onFrame)
                readThread!!.start()
                return OpenResult.Ok
            } catch (e: Exception) {
                lastError = e
                try {
                    port?.close()
                } catch (_: Exception) {
                    // ignore
                }
                if (attempt == 0) {
                    try {
                        Thread.sleep(200)
                    } catch (_: InterruptedException) {
                        // ignore
                    }
                }
            }
        }
        return OpenResult.Fail("OPEN_EXCEPTION", lastError?.message ?: "open exception")
    }

    fun write(text: String): OpenResult {
        val currentPort = port ?: return OpenResult.Fail("NOT_OPEN", "port not open")
        return try {
            val bytes = text.toByteArray(Charsets.UTF_8)
            currentPort.write(bytes, 2000)
            OpenResult.Ok
        } catch (e: Exception) {
            OpenResult.Fail("WRITE_FAIL", e.message ?: "write failed")
        }
    }

    fun close() {
        readThread?.shutdown()
        port?.close()
        port = null
    }
}
