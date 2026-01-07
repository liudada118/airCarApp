package com.awesomeprojectgpt.serial

class ByteRingBuffer(size: Int = 64 * 1024) {

    private val buf = ByteArray(size)
    private var r = 0
    private var w = 0

    @Synchronized
    fun write(src: ByteArray, len: Int) {
        for (i in 0 until len) {
            buf[w] = src[i]
            w = (w + 1) % buf.size
        }
    }

    @Synchronized
    fun readByte(): Int {
        if (r == w) return -1
        val v = buf[r].toInt() and 0xFF
        r = (r + 1) % buf.size
        return v
    }
}
