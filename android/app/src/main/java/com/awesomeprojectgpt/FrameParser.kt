package com.awesomeprojectgpt.serial

class FrameParser {

    private val delimiter = intArrayOf(0xAA, 0x55, 0x03, 0x99)
    private val window = IntArray(4)
    private var windowPos = 0
    private var windowFilled = 0

    private var inFrame = false
    private var buf = ByteArray(4096)
    private var idx = 0

    fun feed(b: Int): String? {
        updateWindow(b)

        if (inFrame) {
            ensureCapacity()
            buf[idx++] = b.toByte()
        }

        if (isDelimiterMatched()) {
            if (inFrame) {
                idx = (idx - delimiter.size).coerceAtLeast(0)
                if (idx > 0) {
                    val data = buf.copyOf(idx)
                    idx = 0
                    return data.joinToString(",") { (it.toInt() and 0xFF).toString() }
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
