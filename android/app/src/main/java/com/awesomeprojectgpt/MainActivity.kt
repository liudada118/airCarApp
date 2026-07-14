package com.awesomeprojectgpt

import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * 运行时把方向「记死」为固定横屏(SCREEN_ORIENTATION_LANDSCAPE)。
   * 注意:必须用固定 LANDSCAPE,不能用 SENSOR_LANDSCAPE——后者仍会跟随
   * 重力感应/系统自动旋转,系统一旦强制某方向就会被带着转;
   * 固定 LANDSCAPE 完全不看传感器、不看系统旋转锁,才是真正锁死。
   * onCreate/onResume/onWindowFocusChanged/onConfigurationChanged 都再强制一次,
   * 防止系统在获得焦点或配置变化时把它转走。
   */
  private fun lockLandscape() {
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    lockLandscape()
    super.onCreate(savedInstanceState)
  }

  override fun onResume() {
    super.onResume()
    lockLandscape()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) lockLandscape()
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    lockLandscape()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AwesomeProjectGPT"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
