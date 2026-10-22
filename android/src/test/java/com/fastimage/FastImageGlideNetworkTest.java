package com.fastimage;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import android.Manifest;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.manager.GlideConnectivity;
import com.bumptech.glide.request.FutureTarget;
import com.bumptech.glide.request.RequestOptions;
import com.facebook.react.modules.network.OkHttpClientProvider;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.shadow.api.Shadow;
import org.robolectric.shadows.ShadowApplication;
import org.robolectric.shadows.ShadowConnectivityManager;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import okhttp3.OkHttpClient;

// Glide's network behavior with FastImage's modules: images an app loads with
// Glide itself (a plain GlideUrl, not FastImage's source), from its own native
// code or another library, go through React Native's OkHttp client, as
// FastImage's images do, so the app's interceptors and cookies apply to them;
// and a failed preload isn't started again when the network comes back.
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
        GlideConnectivity.reset();
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

    // With ACCESS_NETWORK_STATE, which apps often have through other
    // libraries, Glide starts the requests it holds that haven't completed,
    // failed ones too, again when the network comes back. A preload's
    // download that failed isn't: its result has already been reported.
    @Test
    public void failedPreloadDownloadIsntStartedAgainWhenTheNetworkComesBack() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        ((ShadowApplication) Shadow.extract(context)).grantPermissions(Manifest.permission.ACCESS_NETWORK_STATE);
        server.route("/missing").status(404);
        final List<String> results = new ArrayList<>();
        FastImageViewModule.loadFile(context, new FastImageUrl(new GlideUrl(server.url("/missing"))),
                new RequestOptions(), false, (file, error) -> results.add(file != null ? "file" : error));
        for (long end = System.currentTimeMillis() + 10_000; results.isEmpty() && System.currentTimeMillis() < end; ) {
            ShadowLooper.idleMainLooper();
            Thread.sleep(20);
        }
        // The network lost and back, as Glide's connectivity monitor sees it.
        ConnectivityManager manager = context.getSystemService(ConnectivityManager.class);
        Network network = manager.getActiveNetwork();
        Set<ConnectivityManager.NetworkCallback> callbacks = ((ShadowConnectivityManager) Shadow.extract(manager)).getNetworkCallbacks();
        assertFalse("Glide watches the network", callbacks.isEmpty());
        for (ConnectivityManager.NetworkCallback callback : callbacks) {
            callback.onLost(network);
            callback.onAvailable(network);
        }
        // Time for a download started again to be requested and fail.
        for (long end = System.currentTimeMillis() + 1_000; System.currentTimeMillis() < end; ) {
            ShadowLooper.idleMainLooper();
            Thread.sleep(20);
        }
        assertEquals(1, server.count("/missing"));
        assertEquals("one result: " + results, 1, results.size());
    }
}
