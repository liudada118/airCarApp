package com.awesomeprojectgpt.serial

/**
 * 帧解析结果，包含帧数据 CSV 和帧字节长度
 */
data class FrameResult(
    val csv: String,
    val length: Int
)

class FrameParser {

    private val delimiter = intArrayOf(0xAA, 0x55, 0x03, 0x99)
    private val window = IntArray(4)
    private var windowPos = 0
    private var windowFilled = 0

    private val expectedLength = 144
    private var inFrame = false
    private var buf = ByteArray(4096)
    private var idx = 0

    fun feed(b: Int): FrameResult? {
        updateWindow(b)

        if (inFrame) {
            ensureCapacity()
            buf[idx++] = b.toByte()
            if (idx >= expectedLength) {
                val data = buf.copyOf(idx)
                val len = idx
                idx = 0
                inFrame = false
                return FrameResult(
                    csv = data.joinToString(",") { (it.toInt() and 0xFF).toString() },
                    length = len
                )
            }
        }

        if (isDelimiterMatched()) {
            if (inFrame) {
                // 在帧内又遇到分隔符 → 当前帧被截断，输出已收集的数据（去掉尾部分隔符字节）
                val actualLen = (idx - delimiter.size).coerceAtLeast(0)
                if (actualLen > 0) {
                    val data = buf.copyOf(actualLen)
                    idx = 0
                    inFrame = true  // 新帧开始
                    return FrameResult(
                        csv = data.joinToString(",") { (it.toInt() and 0xFF).toString() },
                        length = actualLen
                    )
                }
                idx = 0
            }
            inFrame = true
        }
        return null
    }

    private fun updateWindow(b: Int) {
        window[windowPos] = b
        windowPos = (windowPos + 1) % window.size
        if (windowFilled < window.size) {
            windowFilled++
        }
    }

    private fun isDelimiterMatched(): Boolean {
        if (windowFilled < window.size) return false
        for (i in delimiter.indices) {
            val pos = (windowPos + i) % window.size
            if (window[pos] != delimiter[i]) return false
        }
        return true
    }

    private fun ensureCapacity() {
        if (idx < buf.size) return
        val next = ByteArray(buf.size * 2)
        System.arraycopy(buf, 0, next, 0, buf.size)
        buf = next
    }
}
