package com.fastimage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.view.PixelCopy;
import android.view.View;
import android.view.Window;
import android.view.animation.AlphaAnimation;
import android.widget.FrameLayout;
import android.widget.ImageView;

import androidx.core.content.res.ResourcesCompat;

import com.bumptech.glide.Glide;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.ParameterizedRobolectricTestRunner;
import org.robolectric.Robolectric;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadows.ShadowChoreographer;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okio.Buffer;

// ../scenario-tests/views (see its README), against FastImageViewWithUrl with
// no React Native: a real HTTP server and decoders, drawn by Skia through
// Robolectric's native graphics. The test thread is the main thread, and
// frames only come when a step moves the clock.
@RunWith(ParameterizedRobolectricTestRunner.class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@LooperMode(LooperMode.Mode.PAUSED)
public class ScenarioTest {
    private static final File REPOSITORY = new File(System.getProperty("user.dir"), "..");
    private static final File IMAGES = new File(REPOSITORY, "ReactNativeFastImageExampleServer/images");

    @ParameterizedRobolectricTestRunner.Parameters(name = "{1}")
    public static Collection<Object[]> scenarios() throws Exception {
        List<Object[]> all = new ArrayList<>();
        String file = "views/fade.json";
        JSONArray scenarios = load(file).getJSONArray("scenarios");
        for (int i = 0; i < scenarios.length(); i++) {
            JSONObject scenario = scenarios.getJSONObject(i);
            String only = scenario.optString("only", "android");
            if (only.equals("android")) all.add(new Object[] {file, scenario.getString("name")});
        }
        return all;
    }

    private static JSONObject load(String file) throws Exception {
        byte[] bytes = Files.readAllBytes(new File(REPOSITORY, "scenario-tests/" + file).toPath());
        return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    }

    private final String file;
    private final String name;

    public ScenarioTest(String file, String name) {
        this.file = file;
        this.name = name;
    }

    private static final class TestView extends FastImageViewWithUrl {
        volatile int loads = 0;
        volatile String error;

        TestView(Activity activity) {
            super(activity, Glide.with(activity));
            setHandledEvents(FastImageEvents.LOAD | FastImageEvents.ERROR);
        }

        @Override
        void dispatchEvent(String name, Map<String, Object> data) {
            if (name.equals(FastImageEvents.REACT_ON_LOAD_EVENT)) loads++;
            else if (name.equals(FastImageEvents.REACT_ON_ERROR_EVENT)) error = String.valueOf(data);
        }
    }

    // A view it's in, as React Native's: without a layer of its own for its
    // opacity.
    private static final class Parent extends FrameLayout {
        Parent(Activity activity) {
            super(activity);
        }

        @Override
        public boolean hasOverlappingRendering() {
            return false;
        }
    }

    private static final class Shown {
        TestView view;
        Parent parent;
        int x;
        int y;
        int width;
        int height;
        double sampleX;
        double sampleY;
    }

    private final class Server extends Dispatcher {
        final MockWebServer web = new MockWebServer();
        final Map<String, CountDownLatch> held = new ConcurrentHashMap<>();
        final Map<String, MockResponse> responses = new ConcurrentHashMap<>();

        @Override
        public MockResponse dispatch(RecordedRequest request) throws InterruptedException {
            String path = request.getPath();
            CountDownLatch hold = held.get(path);
            if (hold != null) hold.await(20, TimeUnit.SECONDS);
            MockResponse set = responses.get(path);
            if (set != null) return set.clone();
            File fixture = new File(IMAGES, path.split("\\?")[0]);
            if (!fixture.isFile()) return new MockResponse().setResponseCode(404);
            try {
                return new MockResponse().setBody(new Buffer().write(Files.readAllBytes(fixture.toPath())));
            } catch (Exception e) {
                return new MockResponse().setResponseCode(500);
            }
        }
    }

    private Activity activity;
    private FrameLayout root;
    private Server server;
    private final Map<String, Shown> shown = new HashMap<>();
    private int magnify = 1;

    @Test
    public void scenario() throws Exception {
        JSONArray scenarios = load(file).getJSONArray("scenarios");
        JSONArray steps = null;
        for (int i = 0; i < scenarios.length(); i++) {
            if (scenarios.getJSONObject(i).getString("name").equals(name)) {
                steps = scenarios.getJSONObject(i).getJSONArray("steps");
            }
        }
        int repeats = Integer.getInteger("scenario.repeats", 1);
        for (int time = 0; time < repeats; time++) runOnce(steps, repeats > 1 ? name + " (" + (time + 1) + ")" : name);
    }

    private void runOnce(JSONArray steps, String label) throws Exception {
        server = new Server();
        server.web.setDispatcher(server);
        server.web.start();
        activity = Robolectric.buildActivity(Activity.class).setup().get();
        root = new FrameLayout(activity);
        root.setBackgroundColor(Color.BLACK);
        activity.setContentView(root);
        ShadowLooper.idleMainLooper();
        ShadowChoreographer.setPaused(true);
        shown.clear();
        magnify = 1;
        try {
            for (int i = 0; i < steps.length(); i++) perform(steps.getJSONObject(i), label + ", step " + i);
        } finally {
            for (Shown item : shown.values()) item.view.requestManager.clear(item.view);
            pump();
            advance(2000);
            ShadowChoreographer.setPaused(false);
            for (CountDownLatch hold : server.held.values()) hold.countDown();
            server.web.shutdown();
            Glide.tearDown();
        }
    }

    private void perform(JSONObject step, String label) throws Exception {
        if (step.has("view")) {
            Shown item = new Shown();
            shown.put(step.getString("view"), item);
            JSONArray size = step.getJSONArray("size");
            item.width = size.getInt(0);
            item.height = size.getInt(1);
            JSONArray at = step.optJSONArray("at");
            item.x = at == null ? 0 : at.getInt(0);
            // Clear of the bar Android draws over the top of the window.
            item.y = (at == null ? 0 : at.getInt(1)) + 100;
            JSONArray sample = step.optJSONArray("sample");
            item.sampleX = sample == null ? item.width / 2.0 : sample.getDouble(0);
            item.sampleY = sample == null ? item.height / 2.0 : sample.getDouble(1);
            item.view = new TestView(activity);
            item.parent = new Parent(activity);
            item.parent.addView(item.view, new FrameLayout.LayoutParams(item.width, item.height));
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(item.width, item.height);
            params.leftMargin = item.x;
            params.topMargin = item.y;
            root.addView(item.parent, params);
            pump();
            apply(step, item);
        } else if (step.has("set")) {
            apply(step, shown.get(step.getString("set")));
        } else if (step.has("remove")) {
            Shown item = shown.remove(step.getString("remove"));
            item.view.requestManager.clear(item.view);
            root.removeView(item.parent);
            pump();
        } else if (step.has("hold")) {
            server.held.put(step.getString("hold"), new CountDownLatch(1));
        } else if (step.has("release")) {
            CountDownLatch hold = server.held.remove(step.getString("release"));
            if (hold != null) hold.countDown();
        } else if (step.has("respond")) {
            MockResponse response = new MockResponse().setBody(
                    new Buffer().write(Files.readAllBytes(new File(IMAGES, step.getString("fixture")).toPath())));
            JSONObject headers = step.optJSONObject("headers");
            if (headers != null) {
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    response.setHeader(key, headers.getString(key));
                }
            }
            server.responses.put(step.getString("respond"), response);
        } else if (step.has("clearMemoryCache")) {
            Glide.get(activity).clearMemory();
        } else if (step.has("advance")) {
            advance(step.getLong("advance"));
        } else if (step.has("waitFor")) {
            // Android's blur is part of the load, so fadeStarted waits for nothing.
            JSONArray names = step.getJSONObject("waitFor").optJSONArray("loaded");
            for (int i = 0; names != null && i < names.length(); i++) {
                TestView view = shown.get(names.getString(i)).view;
                long deadline = System.currentTimeMillis() + 15_000;
                while (view.loads == 0 && view.error == null && System.currentTimeMillis() < deadline) {
                    pump();
                    Thread.sleep(2);
                }
                assertNull(label, view.error);
                assertTrue(label + ": " + names.getString(i) + " never loaded", view.loads > 0);
            }
        } else if (step.has("fade")) {
            String view = step.getString("fade");
            JSONArray colors = step.getJSONArray("expect");
            long duration = step.getLong("duration");
            // The animator starts on its first frame.
            advance(17);
            for (int i = 0; i < colors.length(); i++) {
                if (i > 0) advance(duration / (colors.length() - 1));
                check(view, colors.getString(i), label + ", point " + i);
            }
            // Past its end, so nothing of it is left.
            advance(100);
        } else if (step.has("expect")) {
            JSONObject colors = step.getJSONObject("expect").getJSONObject("colors");
            Iterator<String> names = colors.keys();
            while (names.hasNext()) {
                String view = names.next();
                check(view, colors.getString(view), label);
            }
        }
    }

    private void apply(JSONObject props, Shown item) throws Exception {
        TestView view = item.view;
        JSONObject transition = props.optJSONObject("transition");
        if (transition != null) {
            view.setTransitionDuration(transition.getInt("duration"));
            view.setTransitionBetweenImages(transition.optBoolean("betweenImages", false));
            view.setTransitionSkipOnCacheHit(transition.optString("skipOnCacheHit", "memory"));
        }
        if (props.has("objectFit")) {
            view.setObjectFit(props.getString("objectFit").equals("contain") ? ImageView.ScaleType.FIT_CENTER : ImageView.ScaleType.CENTER_CROP);
        }
        if (props.has("blurRadius")) view.setBlurRadius((float) props.getDouble("blurRadius"));
        if (props.has("opacity")) view.setAlpha((float) props.getDouble("opacity"));
        if (props.has("parentOpacity")) item.parent.setAlpha((float) props.getDouble("parentOpacity"));
        if (props.has("alphaAnimation")) {
            AlphaAnimation animation = new AlphaAnimation(0.5f, (float) props.getDouble("alphaAnimation"));
            animation.setDuration(0);
            animation.setFillAfter(true);
            item.parent.startAnimation(animation);
        }
        if (props.has("magnify")) {
            magnify = props.getInt("magnify");
            item.parent.setPivotX(0);
            item.parent.setPivotY(0);
            item.parent.setScaleX(magnify);
            item.parent.setScaleY(magnify);
        }
        if (props.has("defaultSource")) view.setPlaceholder(drawable(props.getString("defaultSource")));
        if (props.has("url")) {
            String url = props.getString("url");
            Map<String, Object> source = new HashMap<>();
            source.put("uri", url.startsWith("file:")
                    ? "file://" + new File(IMAGES, url.substring(5)).getCanonicalPath()
                    : server.web.url(url).toString());
            if (props.has("cache")) source.put("cache", props.getString("cache"));
            view.setSource(new FastImageSourceProps[] {FastImageSourceProps.parse(source)});
            view.loads = 0;
        }
        view.onAfterUpdate(view.requestManager);
        pump();
    }

    // The capture draws the views' display lists, which it only updates for
    // views marked as changed.
    private static void invalidateAll(View view) {
        view.invalidate();
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) invalidateAll(group.getChildAt(i));
        }
    }

    private Drawable drawable(String name) {
        String resource = "regression_" + name.replace('-', '_');
        int id = activity.getResources().getIdentifier(resource, "drawable", activity.getPackageName());
        assertTrue("no drawable " + resource, id != 0);
        return ResourcesCompat.getDrawable(activity.getResources(), id, null);
    }

    // Runs what's waiting on the main thread, without moving the clock. A
    // layout pass waiting for a frame holds up the main thread's other messages
    // (a sync barrier), so it runs here: with frames paused it would wait until
    // the clock moves, and moving it would start the fades.
    private void pump() throws Exception {
        ShadowLooper.idleMainLooper();
        Object viewRoot = View.class.getMethod("getViewRootImpl").invoke(root);
        Field scheduled = viewRoot.getClass().getDeclaredField("mTraversalScheduled");
        scheduled.setAccessible(true);
        if (scheduled.getBoolean(viewRoot)) {
            Method traversal = viewRoot.getClass().getDeclaredMethod("doTraversal");
            traversal.setAccessible(true);
            traversal.invoke(viewRoot);
            ShadowLooper.idleMainLooper();
        }
    }

    // A frame at a time: moving the clock in one go only gives one frame, which
    // a fade starts from.
    private void advance(long ms) {
        for (long left = ms; left > 0; left -= 16) {
            ShadowLooper.idleMainLooper(Math.min(left, 16), TimeUnit.MILLISECONDS);
        }
    }

    private void check(String name, String expected, String label) throws Exception {
        Shown item = shown.get(name);
        pump();
        // Through Android's renderer (see the hardware capture mode in
        // build.gradle.kts): a software canvas doesn't show what depends on it,
        // like an alpha applied to each drawing of a view without a layer.
        Window window = activity.getWindow();
        View decor = window.getDecorView();
        invalidateAll(decor);
        Bitmap bitmap = Bitmap.createBitmap(decor.getWidth(), decor.getHeight(), Bitmap.Config.ARGB_8888);
        int[] result = {-1};
        PixelCopy.request(window, bitmap, r -> result[0] = r, new Handler(Looper.getMainLooper()));
        ShadowLooper.idleMainLooper();
        assertEquals("PixelCopy", PixelCopy.SUCCESS, result[0]);
        int[] location = new int[2];
        item.view.getLocationInWindow(location);
        int actual = bitmap.getPixel((int) (location[0] + item.sampleX * magnify), (int) (location[1] + item.sampleY * magnify));
        bitmap.recycle();
        int wanted = Color.parseColor(expected);
        boolean close = Math.abs(Color.red(actual) - Color.red(wanted)) <= 3
                && Math.abs(Color.green(actual) - Color.green(wanted)) <= 3
                && Math.abs(Color.blue(actual) - Color.blue(wanted)) <= 3;
        String text = String.format(Locale.ROOT, "#%06x", actual & 0xffffff);
        if (!close) assertEquals(label + ": " + name, expected, text);
    }
}
