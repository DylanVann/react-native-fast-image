package com.reactnativefastimageexampleminimum

import android.content.Intent
import android.os.Bundle
import android.view.animation.AlphaAnimation
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.devsupport.DefaultDevLoadingViewImplementation
import com.facebook.react.uimanager.util.ReactFindViewUtil

class MainActivity : ReactActivity() {

  // scripts/verify.mts hides React Native's development banner ("Loading
  // from…"), which its screenshots would catch.
  override fun onCreate(savedInstanceState: Bundle?) {
    if (intent?.getBooleanExtra("hideDevLoadingView", false) == true) {
      DefaultDevLoadingViewImplementation.setDevLoadingEnabled(false)
    }
    super.onCreate(savedInstanceState)
    ReactFindViewUtil.addViewsListener(viewAnimation, setOf("regression-view-animation"))
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ReactNativeFastImageExampleMinimum"

  // The regression runner's fade-placeholder-animation case: a view
  // animation (android.view.animation) with an alpha of 0.5 on the View with
  // this nativeID, as an app's native code can start. It doesn't change the
  // view's alpha.
  private val viewAnimation =
      ReactFindViewUtil.OnMultipleViewsFoundListener { view, _ ->
        view.startAnimation(
            AlphaAnimation(0.5f, 0.5f).apply {
              duration = 600_000
              fillAfter = true
            })
      }

  // maestro/background-no-activity.yaml opens the app's
  // <scheme>://finish-on-leave link: then leaving the app finishes this
  // Activity, as Android may for one in the background, while the app's
  // process and JS keep running.
  private var finishOnLeave = false

  override fun onNewIntent(intent: Intent) {
    if (intent.data?.host == "finish-on-leave") finishOnLeave = true
    super.onNewIntent(intent)
  }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (finishOnLeave) finish()
  }

  override fun onDestroy() {
    ReactFindViewUtil.removeViewsListener(viewAnimation)
    super.onDestroy()
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
