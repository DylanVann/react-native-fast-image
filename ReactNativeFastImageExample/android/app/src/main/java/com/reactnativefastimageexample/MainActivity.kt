package com.reactnativefastimageexample

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.devsupport.DefaultDevLoadingViewImplementation

class MainActivity : ReactActivity() {

  // scripts/verify.mts hides React Native's development banner ("Loading
  // from…"), which its screenshots would catch.
  override fun onCreate(savedInstanceState: Bundle?) {
    if (intent?.getBooleanExtra("hideDevLoadingView", false) == true) {
      DefaultDevLoadingViewImplementation.setDevLoadingEnabled(false)
    }
    super.onCreate(savedInstanceState)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ReactNativeFastImageExample"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
