package com.awesomeprojectgpt.chaquopy

import android.util.Log
import com.chaquo.python.Python
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PyHelloModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val tag = "PyHello"

  override fun getName(): String = "PyHello"

  @ReactMethod
  fun getMessage(promise: Promise) {
    try {
      val py = Python.getInstance()
      val module = py.getModule("hello")
      val message = module.callAttr("get_message").toString()
      promise.resolve(message)
    } catch (e: Exception) {
      promise.reject("PY_ERROR", e)
    }
  }

  @ReactMethod
  fun runTestConstantInput(promise: Promise) {
    Thread {
      try {
        Log.i(tag, "runTestConstantInput: start")
        val py = Python.getInstance()
        val module = py.getModule("test_constant_input")
        module.callAttr("main")
        Log.i(tag, "runTestConstantInput: done")
        promise.resolve("done")
      } catch (e: Exception) {
        Log.e(tag, "runTestConstantInput: failed", e)
        promise.reject("PY_ERROR", e)
      }
    }.start()
  }
}
