package com.awesomeprojectgpt.serial

import com.hoho.android.usbserial.driver.UsbSerialPort
import java.util.concurrent.ArrayBlockingQueue

class SerialReadThread(
    private val port: UsbSerialPort,
    private val onFrame: (String) -> Unit
) : Thread() {

    private val buffer = ByteArray(8192)
    private val ring = ByteRingBuffer()
    private val parser = FrameParser()

    @Volatile private var running = true

    override fun run() {
        while (running) {
            val len = port.read(buffer, 0) // 阻塞
            if (len > 0) {
                ring.write(buffer, len)
                parseLoop()
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
