package com.fastimage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.content.Context;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.request.FutureTarget;
import com.facebook.react.modules.network.OkHttpClientProvider;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.IOException;

import okhttp3.OkHttpClient;

// Images an app loads with Glide itself (a plain GlideUrl, not FastImage's
// source), from its own native code or another library, as Glide starts with
// FastImage's modules: they go through React Native's OkHttp client, as
// FastImage's images do, so the app's interceptors and cookies apply to them.
@RunWith(RobolectricTestRunner.class)
public class FastImageGlideNetworkTest {
    private TestServer server;

    @Before
    public void setUp() throws IOException {
        server = new TestServer();
        // React Native's client (before Glide starts and FastImage asks for
        // it), with an interceptor that marks its requests, as an app's can.
        // OkHttpClientProvider keeps the first client it makes, so this only
        // applies if no earlier test in the JVM asked for one (none does).
        // A test that starts Glide or asks for the client before this one
        // would make it depend on the order the tests run in.
        OkHttpClientProvider.setOkHttpClientFactory(() -> new OkHttpClient.Builder()
                .addInterceptor(chain -> chain.proceed(
                        chain.request().newBuilder().header("X-Client", "react-native").build()))
                .build());
    }

    @After
    public void tearDown() throws IOException {
        server.close();
        Glide.tearDown();
        OkHttpClientProvider.setOkHttpClientFactory(null);
    }

    @Test
    public void glideUrlLoadsGoThroughReactNativesClient() throws Exception {
        server.route("/plain");
        Context context = RuntimeEnvironment.getApplication();
        Glide.with(context).downloadOnly().load(new GlideUrl(server.url("/plain"))).submit();
        server.awaitRequest("/plain");
        assertEquals("react-native", server.headers("/plain").get("x-client"));
    }

    // The app's own loads don't take FastImage's requests per host: with five
    // of them waiting for a host's headers (OkHttp's limit per host),
    // FastImage's download from that host is still sent.
    @Test
    public void glideUrlLoadsDontHoldUpFastImagesDownloads() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        for (int i = 1; i <= 5; i++) server.route("/glide" + i).holdHeaders();
        server.route("/fast");
        for (int i = 1; i <= 5; i++) {
            Glide.with(context).downloadOnly().load(new GlideUrl(server.url("/glide" + i))).submit();
        }
        server.awaitRequests(5);
        FutureTarget<File> fast = Glide.with(context).downloadOnly()
                .load(new FastImageUrl(new GlideUrl(server.url("/fast")))).submit();
        server.awaitRequest("/fast");
        // FastImage's request let go of, as when its view unmounts, so the
        // shared downloads hold nothing for the tests after this one.
        Glide.with(context).clear(fast);
        String busy = FastImageSharedDownloads.busy();
        for (long end = System.currentTimeMillis() + 10_000; busy != null && System.currentTimeMillis() < end; ) {
            ShadowLooper.idleMainLooper();
            Thread.sleep(20);
            busy = FastImageSharedDownloads.busy();
        }
        assertNull("the downloads still hold " + busy, busy);
    }
}
