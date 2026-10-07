package com.dylanvann.rnfibenchmark.macrobenchmark

import androidx.benchmark.Outputs
import androidx.benchmark.macro.ExperimentalMetricApi
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.MemoryUsageMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.io.File
import java.net.URLEncoder
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

// Measures the benchmark app (../../app) on Android, the same scenarios as
// the iOS UI tests (../../ios) and recordings (../../ios/capture).
// Instrumentation arguments: benchPackage (the subject's app), or
// benchPackages (several subjects' apps, comma-separated, which timeToImage
// runs in turns on this phone, to compare them without the differences
// between phones), benchIterations (default 5), benchScenarios (for
// timeToImage, default "grid,large"), benchLatencyMs and benchMbps (the image
// server's network, default 40 ms and no limit).
@RunWith(AndroidJUnit4::class)
class BenchmarkTest {
    @get:Rule val rule = MacrobenchmarkRule()

    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val arguments = InstrumentationRegistry.getArguments()
    private val packages = arguments.getString("benchPackages")
        ?.split(",")
        ?.filter { it.isNotEmpty() }
        ?: listOf(arguments.getString("benchPackage") ?: "com.dylanvann.rnfibenchmark.image")
    // scroll and largeMemory measure the first.
    private val pkg = packages.first()
    private val iterations = arguments.getString("benchIterations")?.toInt() ?: 5
    private val device = UiDevice.getInstance(instrumentation)

    private val latencyMs = arguments.getString("benchLatencyMs")?.toLong() ?: 40
    private val mbps = arguments.getString("benchMbps")?.toDouble() ?: 0.0
    private lateinit var server: ImageServer

    private fun shell(command: String): String = device.executeShellCommand(command)

    // The images come from this process, on the phone (ImageServer), so
    // every run and every phone has the same network.
    @Before
    fun startServer() {
        server = ImageServer(instrumentation.context.assets, latencyMs, mbps)
    }

    @After
    fun stopServer() {
        server.close()
    }

    // Starts an app on a scenario with a new run id (so no image comes from
    // an earlier run's caches), in a new process, loading from the server
    // here, with none of the benchmark apps running.
    private fun launch(scenario: String, run: String, app: String = pkg) {
        for (other in packages) shell("am force-stop $other")
        val url = URLEncoder.encode(server.url, "UTF-8")
        // Not through a shell: `&` needs no escaping.
        shell("am start -W -a android.intent.action.VIEW -d rnfibench://run?scenario=$scenario&run=$run&server=$url $app")
    }

    // Waits for the scenario to finish; returns its results (JSON), which the
    // app logs in numbered chunks: "BENCH_RESULTS <run> <n>/<count> <json>".
    private fun waitDone(scenario: String, run: String): String {
        device.wait(Until.findObject(By.res("done")), 60_000)
            ?: throw AssertionError("$scenario didn't finish")
        val prefix = "BENCH_RESULTS $run "
        repeat(20) {
            val chunks = shell("logcat -d -v raw -s ReactNativeJS:I")
                .lines()
                .filter { it.startsWith(prefix) }
                .map { it.removePrefix(prefix) }
            val count = chunks.firstOrNull()?.substringBefore(' ')?.substringAfter('/')?.toInt()
            if (count != null && chunks.size >= count) {
                return chunks
                    .sortedBy { it.substringBefore('/').toInt() }
                    .joinToString("") { it.substringAfter(' ') }
            }
            Thread.sleep(250)
        }
        throw AssertionError("$scenario has no results in the log")
    }

    // Time to image: records the screen while each scenario runs, and saves
    // the recording and the app's results (with the image requests the server
    // got) in the test's output folder, which ../../scripts/run-android.ts
    // (or Firebase Test Lab) pulls and analyzes. Each app is compiled as the
    // Macrobenchmark tests leave it (with its profile), whichever ran first,
    // and one unmeasured run of each comes first. With several apps, each
    // iteration runs them in turns, in the other order every time (A B, then
    // B A), so neither always goes first or last as the phone warms, and each
    // app's files are in a folder named after it. A run that fails is written
    // as <scenario>-<n>.error, and the next goes on.
    @Test
    fun timeToImage() {
        val scenarios = (arguments.getString("benchScenarios") ?: "grid,large")
            .split(",")
            .filter { it.isNotEmpty() }
        val out = Outputs.outputDirectory
        for (app in packages) {
            shell("cmd package compile -f -m speed-profile $app")
            val first = "first-${System.nanoTime()}"
            launch(scenarios.firstOrNull() ?: "grid", first, app)
            waitDone("first run", first)
        }
        for (scenario in scenarios) {
            for (i in 1..iterations) {
                val order = if (i % 2 == 1) packages else packages.reversed()
                for (app in order) {
                    val dir = if (packages.size > 1) File(out, app).apply { mkdirs() } else out
                    measure(app, scenario, i, dir)
                }
            }
        }
    }

    private fun measure(app: String, scenario: String, i: Int, dir: File) {
        val video = File(dir, "$scenario-$i.mp4")
        val recorder = instrumentation.uiAutomation.executeShellCommand(
            "screenrecord --bit-rate 20000000 ${video.absolutePath}",
        )
        var results: String? = null
        try {
            Thread.sleep(1000)
            val run = "android-$scenario-$i-${System.nanoTime()}"
            launch(scenario, run, app)
            results = JSONObject(waitDone(scenario, run))
                .put("imageRequests", server.imageRequests(run))
                .toString()
            Thread.sleep(500)
        } catch (error: Throwable) {
            File(dir, "$scenario-$i.error").writeText(error.toString())
        } finally {
            // Only this recorder (Test Lab can run its own).
            shell("pkill -INT -f ${video.absolutePath}")
            recorder.close()
            // screenrecord finishes the file after its signal.
            Thread.sleep(1500)
        }
        results?.let { File(dir, "$scenario-$i.json").writeText(it) }
    }

    // Scrolling the 500-image list (the scroll scenario): frame timing. Each
    // iteration starts the app, scrolls through once to load the images, then
    // measures a pass with them cached, as the iOS test does.
    @Test
    fun scroll() {
        rule.measureRepeated(
            packageName = pkg,
            metrics = listOf(FrameTimingMetric()),
            iterations = iterations,
            // No startup mode: COLD kills the app between setupBlock and the
            // measured block. setupBlock starts a new process anyway.
            startupMode = null,
            setupBlock = {
                val run = "scroll-${System.nanoTime()}"
                launch("scroll", run)
                waitDone("scroll", run)
                pass()
            },
        ) {
            pass()
        }
    }

    private fun pass() {
        val list = device.findObject(By.res("list")) ?: throw AssertionError("no list")
        list.setGestureMargin(device.displayWidth / 5)
        repeat(4) {
            list.fling(Direction.DOWN)
            device.waitForIdle()
        }
        repeat(4) {
            list.fling(Direction.UP)
            device.waitForIdle()
        }
    }

    // The large scenario (20 photos of 4000 × 3000 in small views): memory
    // once they're shown.
    @OptIn(ExperimentalMetricApi::class)
    @Test
    fun largeMemory() {
        rule.measureRepeated(
            packageName = pkg,
            metrics = listOf(MemoryUsageMetric(MemoryUsageMetric.Mode.Last)),
            iterations = iterations,
            startupMode = StartupMode.COLD,
        ) {
            val run = "memory-${System.nanoTime()}"
            launch("large", run)
            waitDone("large", run)
        }
    }
}
