package com.awesomeprojectgpt.serial

/**
 * 帧解析结果，包含帧数据 CSV 和帧字节长度
 */
data class FrameResult(
    val csv: String,
    val length: Int
)

/**
 * 帧尾扫描解析器。
 *
 * 所有帧靠固定帧尾 AA 55 03 99 同步：把连续到达的字节累积起来，
 * 一旦缓冲区末尾出现帧尾，就把帧尾之前的全部字节当作一帧数据输出。
 * 这样不依赖固定帧长，能同时支持多种长度的帧：
 *   - 1372 字节：新板子的 float32 数据帧（343 个 float32 + 帧尾）
 *   - 144 字节：老压力垫帧（保留，新板子不会发）
 *   - 51 字节：老气囊模式帧（保留）
 */
class FrameParser {

    private val delimiter = intArrayOf(0xAA, 0x55, 0x03, 0x99)
    private var buf = ByteArray(4096)
    private var idx = 0

    /** 安全上限：长时间没出现帧尾时丢弃，避免缓冲区无限增长 */
    private val maxLen = 1 shl 16 // 65536

    fun feed(b: Int): FrameResult? {
        ensureCapacity()
        buf[idx++] = b.toByte()

        if (idx >= delimiter.size && tailMatches()) {
            val dataLen = idx - delimiter.size
            val result = if (dataLen > 0) {
                val data = buf.copyOf(dataLen)
                FrameResult(
                    csv = data.joinToString(",") { (it.toInt() and 0xFF).toString() },
                    length = dataLen
                )
            } else {
                null // 帧尾紧挨帧尾（数据区为空）→ 忽略
            }
            idx = 0
            return result
        }

        if (idx >= maxLen) {
            // 迟迟没等到帧尾，判定为脏数据，丢弃重新对齐
            idx = 0
        }
        return null
    }

    /** 检查缓冲区末尾 4 字节是否等于帧尾 */
    private fun tailMatches(): Boolean {
        for (i in delimiter.indices) {
            val pos = idx - delimiter.size + i
            if ((buf[pos].toInt() and 0xFF) != delimiter[i]) return false
        }
        return true
    }

    private fun ensureCapacity() {
        if (idx < buf.size) return
        buf = buf.copyOf(buf.size * 2)
    }
}
