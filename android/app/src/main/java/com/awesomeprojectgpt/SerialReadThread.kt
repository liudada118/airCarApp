package com.awesomeprojectgpt.serial

import com.hoho.android.usbserial.driver.UsbSerialPort
import android.util.Log

class SerialReadThread(
    private val port: UsbSerialPort,
    private val onFrame: (String) -> Unit,
    private val onDisconnect: (() -> Unit)? = null
) : Thread() {

    private val logTag = "SerialReadThread"
    private val buffer = ByteArray(8192)
    private val ring = ByteRingBuffer()
    private val parser = FrameParser()

    @Volatile private var running = true

    /** 最大连续读取异常次数，超过后判定为真正断线 */
    private val maxConsecutiveErrors = 5
    /** 重试间隔（毫秒），逐次递增 */
    private val retryDelays = longArrayOf(50, 100, 200, 500, 1000)

    override fun run() {
        var consecutiveErrors = 0

        while (running) {
            try {
                val len = port.read(buffer, 200) // 阻塞读取

                if (len > 0) {
                    // 读取成功，重置错误计数
                    consecutiveErrors = 0
                    ring.write(buffer, len)
                    parseLoop()
                }
            } catch (e: Exception) {
                if (!running) {
                    // 正常关闭流程，不记录错误
                    break
                }

                consecutiveErrors++
                Log.w(logTag, "serial read error ($consecutiveErrors/$maxConsecutiveErrors): ${e.message}")

                if (consecutiveErrors >= maxConsecutiveErrors) {
                    // 连续失败超过阈值，判定为真正断线
                    Log.e(logTag, "serial read failed $maxConsecutiveErrors times consecutively, treating as disconnected", e)
                    try {
                        onDisconnect?.invoke()
                    } catch (cbErr: Exception) {
                        Log.e(logTag, "onDisconnect callback error", cbErr)
                    }
                    break
                }

                // 可恢复异常：等待后重试
                val delay = retryDelays[
                    (consecutiveErrors - 1).coerceAtMost(retryDelays.size - 1)
                ]
                try {
                    Thread.sleep(delay)
                } catch (_: InterruptedException) {
                    if (!running) break
                }
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
