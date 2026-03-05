package com.awesomeprojectgpt.serial

import com.hoho.android.usbserial.driver.UsbSerialPort
import android.util.Log

class SerialReadThread(
    private val port: UsbSerialPort,
    private val onFrame: (FrameResult) -> Unit
) : Thread() {

    private val logTag = "SerialReadThread"
    private val buffer = ByteArray(8192)
    private val ring = ByteRingBuffer()
    private val parser = FrameParser()

    @Volatile private var running = true

    override fun run() {
        while (running) {
            try {
                val len = port.read(buffer, 200)
                if (len > 0) {
                    ring.write(buffer, len)
                    parseLoop()
                }
            } catch (e: Exception) {
                if (running) {
                    Log.e(logTag, "serial read failed", e)
                }
                break
            }
        }
    }

    private fun parseLoop() {
        while (true) {
            val b = ring.readByte()
            if (b < 0) break

            val frame = parser.feed(b)
            if (frame != null) {
                onFrame(frame)
            }
        }
    }

    fun shutdown() {
        running = false
        interrupt()
    }
}
