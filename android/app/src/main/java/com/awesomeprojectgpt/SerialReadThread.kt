package com.awesomeprojectgpt.serial

import com.hoho.android.usbserial.driver.UsbSerialPort
import android.util.Log
import java.util.concurrent.ArrayBlockingQueue

class SerialReadThread(
    private val port: UsbSerialPort,
    private val onFrame: (String) -> Unit
) : Thread() {

    private val logTag = "SerialReadThread"
    private val buffer = ByteArray(8192)
    private val ring = ByteRingBuffer()
    private val parser = FrameParser()

    @Volatile private var running = true

    override fun run() {
        // 持续运行线程，直到running标志被设置为false
        while (running) {
            try {
                // 从串口读取数据，最多读取200字节，这是一个阻塞操作
                // 如果没有数据可读，线程将在此处等待
                val len = port.read(buffer, 200) // 阻塞
                
                // 如果成功读取到数据（len > 0）
                if (len > 0) {
                    // 将读取到的数据写入环形缓冲区
                    ring.write(buffer, len)
                    // 调用解析循环，处理缓冲区中的数据
                    parseLoop()
                }
            } catch (e: Exception) {
                // 捕获读取过程中可能出现的异常
                // 只有在线程仍在运行时才记录错误，避免在关闭过程中产生错误日志
                if (running) {
                    Log.e(logTag, "serial read failed", e)
                }
                // 发生异常时跳出循环，结束线程
                break
            }
        }
    }

    private fun parseLoop() {
        // 无限循环，持续从环形缓冲区读取数据，直到缓冲区为空
        while (true) {
            // 从环形缓冲区读取一个字节
            val b = ring.readByte()
            // 如果读取失败（返回负值），说明缓冲区已空，退出循环
            if (b < 0) break
            
            // 将字节提供给帧解析器，尝试解析出完整的数据帧
            val frame = parser.feed(b)
            // 如果解析出一个完整的数据帧（frame不为null）
            if (frame != null) {
                // 调用回调函数，将解析出的帧传递给上层处理
                onFrame(frame)
            }
        }
    }

    fun shutdown() {
        running = false
        interrupt()
    }
}