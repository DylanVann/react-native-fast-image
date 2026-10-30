package com.fastimage.example

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Choreographer
import android.view.FrameMetrics
import android.view.Window
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.lang.reflect.Proxy

// Example app only: pauses the main thread's animators (android.animation,
// which FastImage's fades use) and steps them by hand, so the regression
// runner can screenshot a fade at set times instead of recording it. It gives
// the thread's AnimationHandler a frame source of its own, as the platform's
// AnimatorTestRule does: a hidden API, which verify.mts allows on the
// emulator it starts. Everything else (layout, drawing, React Native's own
// frame callbacks) keeps running.
object AnimationClock {
    private val handlerClass = Class.forName("android.animation.AnimationHandler")
    private val providerClass =
        Class.forName("android.animation.AnimationHandler\$AnimationFrameCallbackProvider")

    // The animators' time (ms, uptime) while paused.
    private var time = 0L
    private var paused = false
    private val frames = mutableListOf<Choreographer.FrameCallback>()
    private val commits = mutableListOf<Runnable>()

    private val provider: Any =
        Proxy.newProxyInstance(providerClass.classLoader, arrayOf(providerClass)) { proxy, method, args ->
            when (method.name) {
                "postFrameCallback" -> frames.add(args[0] as Choreographer.FrameCallback).let { null }
                "postCommitCallback" -> commits.add(args[0] as Runnable).let { null }
                "getFrameTime" -> time
                "getFrameDelay" -> 16L
                "setFrameDelay" -> null
                "hashCode" -> System.identityHashCode(proxy)
                "equals" -> proxy === args[0]
                "toString" -> "AnimationClock"
                else -> null
            }
        }

    private fun setProvider(value: Any?) {
        val handler = handlerClass.getMethod("getInstance").invoke(null)
        handlerClass.getMethod("setProvider", providerClass).invoke(handler, value)
    }

    fun pause() {
        if (paused) return
        time = SystemClock.uptimeMillis()
        setProvider(provider)
        paused = true
    }

    // Moves the animators on by `ms` and runs one frame of them, once that
    // much real time has passed since the pause too (the clock never gets
    // ahead of real time, so the animators don't go back when it resumes).
    // `then` gets what the frame threw, if anything.
    fun step(ms: Long, then: (Throwable?) -> Unit) {
        if (!paused) return then(null)
        time += ms
        Handler(Looper.getMainLooper()).postDelayed(
            {
                val error = runCatching { runFrame() }.exceptionOrNull()
                then(error)
            },
            maxOf(0L, time - SystemClock.uptimeMillis()),
        )
    }

    private fun runFrame() {
        if (!paused) return
        val due = frames.toList()
        frames.clear()
        for (frame in due) frame.doFrame(time * 1_000_000)
        val committed = commits.toList()
        commits.clear()
        for (commit in committed) commit.run()
    }

    fun resume() {
        if (!paused) return
        // The commits ask the clock for its time: before going back to the
        // Choreographer's, which only answers during a frame.
        val committed = commits.toList()
        commits.clear()
        for (commit in committed) runCatching { commit.run() }
        paused = false
        setProvider(null)
        val due = frames.toList()
        frames.clear()
        for (frame in due) Choreographer.getInstance().postFrameCallback(frame)
    }
}

class AnimationClockModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = NAME

    // Each resolves on the main thread once it's done; step once the frame
    // it ran has been drawn (two vsyncs later).
    private fun onMain(promise: Promise, block: (done: () -> Unit) -> Unit) {
        UiThreadUtil.runOnUiThread {
            try {
                block { promise.resolve(null) }
            } catch (e: Throwable) {
                promise.reject("E_ANIMATION_CLOCK", e.cause ?: e)
            }
        }
    }

    // Once the animators have caught up to the pause (their next frame, which
    // the clock runs at the time it paused) and that has been drawn.
    @ReactMethod
    fun pause(promise: Promise) {
        onMain(promise) { done ->
            AnimationClock.pause()
            afterFrames(3, done)
        }
    }

    @ReactMethod
    fun step(ms: Double, promise: Promise) {
        onMain(promise) { done ->
            AnimationClock.step(ms.toLong()) { error ->
                if (error != null) promise.reject("E_ANIMATION_CLOCK", error)
                else afterRendered { afterFrames(2, done) }
            }
        }
    }

    @ReactMethod
    fun resume(promise: Promise) {
        onMain(promise) { done ->
            AnimationClock.resume()
            done()
        }
    }

    // Once the window's next frame has been rendered (its FrameMetrics, which
    // come once the render thread has drawn and swapped it): on an emulator
    // without a GPU that can take longer than a few vsyncs, and a screenshot
    // then showed the step before. The frame is asked for, in case the step
    // changed nothing, and told apart from the ones before it by its vsync
    // time. At once without FrameMetrics' vsync time (before API 26), and
    // after a second at most.
    private fun afterRendered(done: () -> Unit) {
        val window: Window? = reactApplicationContext.currentActivity?.window
        if (window == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return done()
        val handler = Handler(Looper.getMainLooper())
        var vsync = Long.MAX_VALUE
        var finished = false
        lateinit var onMetrics: Window.OnFrameMetricsAvailableListener
        val finish = Runnable {
            if (finished) return@Runnable
            finished = true
            window.removeOnFrameMetricsAvailableListener(onMetrics)
            done()
        }
        onMetrics = Window.OnFrameMetricsAvailableListener { _, metrics, _ ->
            if (metrics.getMetric(FrameMetrics.VSYNC_TIMESTAMP) >= vsync) handler.post(finish)
        }
        window.addOnFrameMetricsAvailableListener(onMetrics, handler)
        window.decorView.invalidate()
        // Runs in the frame that draws it, with that frame's vsync time.
        Choreographer.getInstance().postFrameCallback { vsync = it }
        handler.postDelayed(finish, 1000)
    }

    private fun afterFrames(count: Int, done: () -> Unit) {
        if (count == 0) return done()
        Choreographer.getInstance().postFrameCallback { afterFrames(count - 1, done) }
    }

    companion object {
        const val NAME = "AnimationClock"
    }
}

class AnimationClockPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
        if (name == AnimationClockModule.NAME) AnimationClockModule(reactContext) else null

    override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
        mapOf(
            AnimationClockModule.NAME to
                ReactModuleInfo(
                    AnimationClockModule.NAME,
                    AnimationClockModule::class.java.name,
                    false,
                    false,
                    false,
                    false,
                ),
        )
    }
}
