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

        var lastError: Exception? = null
        val delays = longArrayOf(100L, 300L, 500L, 800L)
        for (attempt in delays.indices) {
            if (attempt > 0) {
                try {
                    Thread.sleep(delays[attempt])
                } catch (_: InterruptedException) {
                    // ignore
                }
            }
            val conn = usbManager.openDevice(device)
            if (conn == null) {
                lastError = Exception("openDevice returned null")
                continue
            }
            try {
                port!!.open(conn)
                port!!.setParameters(
                    baudRate,
                    8,
                    UsbSerialPort.STOPBITS_1,
                    UsbSerialPort.PARITY_NONE
                )
                try {
                    port!!.purgeHwBuffers(true, true)
                } catch (_: Exception) {
                    // ignore
                }
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
                try {
                    conn.close()
                } catch (_: Exception) {
                    // ignore
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

    fun writeBytes(bytes: ByteArray): OpenResult {
        val currentPort = port ?: return OpenResult.Fail("NOT_OPEN", "port not open")
        return try {
            currentPort.write(bytes, 2000)
            OpenResult.Ok
        } catch (e: Exception) {
            OpenResult.Fail("WRITE_FAIL", e.message ?: "write failed")
        }
    }

    fun close() {
        readThread?.shutdown()
        try {
            readThread?.join(300)
        } catch (_: Exception) {
            // ignore
        }
        readThread = null
        port?.close()
        port = null
    }
}
