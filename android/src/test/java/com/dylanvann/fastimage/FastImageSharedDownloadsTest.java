package com.dylanvann.fastimage;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.HttpException;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.Headers;
import com.bumptech.glide.load.model.LazyHeaders;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.rules.TestName;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import okhttp3.OkHttpClient;

// The shared downloads as Glide uses them: each request is a fetcher from the
// loader's load data, which Glide starts with its priority (on its threads),
// cancels (on the main thread, which is the test's), and cleans up once it
// has decoded the stream it got. The downloads are real requests to a real
// server (TestServer), which holds responses where a test says, so tests see
// what was requested, in what order, and what each request got.
@RunWith(RobolectricTestRunner.class)
public class FastImageSharedDownloadsTest {
    @Rule
    public final TemporaryFolder folder = new TemporaryFolder();
    @Rule
    public final TestName name = new TestName();

    private TestServer server;
    private OkHttpClient client;
    private final List<Load> loads = new ArrayList<>();

    @Before
    public void setUp() throws IOException {
        server = new TestServer();
        client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build();
        FastImageSharedDownloads.setDirectory(folder.newFolder("downloads"));
    }

    @After
    public void tearDown() throws Exception {
        // What a test left loading (e.g. one that failed) is cancelled, as
        // when its views unmount.
        for (Load load : loads) {
            if (!load.cancelled && load.done.getCount() > 0) load.cancel();
        }
        server.close();
        for (Load load : loads) {
            assertTrue("a request got " + load.callbacks.get() + " callbacks", load.callbacks.get() <= 1);
        }
        // Once every request has its result or has left, the downloads hold
        // nothing: no memory, no temporary file, none waiting or running.
        String busy = FastImageSharedDownloads.busy();
        for (long end = System.currentTimeMillis() + 10_000; busy != null && System.currentTimeMillis() < end; ) {
            Thread.sleep(20);
            busy = FastImageSharedDownloads.busy();
        }
        assertNull("the downloads still hold " + busy, busy);
    }

    @Test
    public void requestsForAnImageShareOneDownload() throws Exception {
        TestServer.Route image = server.route("/image").holdAfter(100);
        Load small = load(url("/image"));
        Load large = load(url("/image"));
        server.awaitRequest("/image");
        image.release();
        assertArrayEquals(image.body, small.bytes());
        assertArrayEquals(image.body, large.bytes());
        assertEquals(1, server.count("/image"));
    }

    @Test
    public void aRequestThatLeavesLeavesTheDownloadToTheOthers() throws Exception {
        TestServer.Route image = server.route("/image").holdAfter(100);
        Load leaving = load(url("/image"));
        Load staying = load(url("/image"));
        server.awaitRequest("/image");
        leaving.cancel();
        image.release();
        assertArrayEquals(image.body, staying.bytes());
        assertEquals(0, leaving.callbacks.get());
        assertEquals(1, server.count("/image"));
    }

    @Test
    public void theDownloadIsCancelledWhenEveryRequestHasLeft() throws Exception {
        TestServer.Route image = server.route("/image").holdAfter(100);
        Load first = load(url("/image"));
        Load second = load(url("/image"));
        server.awaitRequest("/image");
        first.cancel();
        second.cancel();
        await(image.hungUp);
        // A later request downloads the image again.
        Load again = load(url("/image"));
        server.awaitRequests(2);
        image.release();
        assertArrayEquals(image.body, again.bytes());
        assertEquals(0, first.callbacks.get() + second.callbacks.get());
    }

    @Test
    public void anHttpErrorFailsEveryRequestForTheImage() throws Exception {
        TestServer.Route missing = server.route("/missing").status(404).holdHeaders();
        Load small = load(url("/missing"));
        Load large = load(url("/missing"));
        server.awaitRequest("/missing");
        missing.release();
        assertEquals(404, small.status());
        assertEquals(404, large.status());
        assertEquals(1, server.count("/missing"));
    }

    @Test
    public void aStalledDownloadFailsEveryRequestForIt() throws Exception {
        client = client.newBuilder().readTimeout(1, TimeUnit.SECONDS).build();
        server.route("/stalled").holdAfter(100);
        Load small = load(url("/stalled"));
        Load large = load(url("/stalled"));
        assertNotNull(small.error());
        assertNotNull(large.error());
        assertEquals(1, server.count("/stalled"));
    }

    @Test
    public void aHeaderOkHttpCantSendFailsTheRequest() throws Exception {
        GlideUrl url = new GlideUrl(server.url("/image"),
                new LazyHeaders.Builder().addHeader("X-Token", "line\nbreak").build());
        Load load = load(url);
        assertTrue(load.error() instanceof IOException);
        assertEquals(0, server.requests().size());
    }

    @Test
    public void responsesWithoutALengthAreShared() throws Exception {
        TestServer.Route image = server.route("/chunked").chunked().body(TestServer.bytes(300_000, 1)).holdAfter(1000);
        Load small = load(url("/chunked"));
        Load large = load(url("/chunked"));
        server.awaitRequest("/chunked");
        image.release();
        assertArrayEquals(image.body, small.bytes());
        assertArrayEquals(image.body, large.bytes());
        assertEquals(1, server.count("/chunked"));
    }

    @Test
    public void largeResponsesAreShared() throws Exception {
        TestServer.Route image = server.route("/large").body(TestServer.bytes(1_500_000, 2)).holdAfter(1000);
        Load small = load(url("/large"));
        Load large = load(url("/large"));
        server.awaitRequest("/large");
        image.release();
        assertArrayEquals(image.body, small.bytes());
        assertArrayEquals(image.body, large.bytes());
        assertEquals(1, server.count("/large"));
    }

    // Responses kept in a temporary file (over 1 MB, or without a length)
    // when the file can't be made, as when the device's storage is full (a
    // file where the folder should be): kept in memory up to 5 MB instead, as
    // Glide's own fetcher decoded from the network stream when it couldn't
    // write its disk cache.

    @Test
    public void imagesStillLoadWhenTheirTemporaryFileCantBeMade() throws Exception {
        FastImageSharedDownloads.setDirectory(folder.newFile("not-a-folder"));
        TestServer.Route large = server.route("/large").body(TestServer.bytes(1_500_000, 3)).holdAfter(1000);
        TestServer.Route chunked = server.route("/chunked").chunked();
        TestServer.Route largeChunked = server.route("/large-chunked").chunked().body(TestServer.bytes(3_000_000, 4));
        Load small = load(url("/large"));
        Load big = load(url("/large"));
        server.awaitRequest("/large");
        large.release();
        assertArrayEquals(large.body, small.bytes());
        assertArrayEquals(large.body, big.bytes());
        assertArrayEquals(chunked.body, load(url("/chunked")).bytes());
        assertArrayEquals(largeChunked.body, load(url("/large-chunked")).bytes());
    }

    @Test
    public void imagesOver5MbFailWhenTheirTemporaryFileCantBeMade() throws Exception {
        FastImageSharedDownloads.setDirectory(folder.newFile("not-a-folder"));
        server.route("/huge").body(TestServer.bytes(6_000_000, 5));
        server.route("/huge-chunked").chunked().body(TestServer.bytes(6_000_000, 6));
        assertTrue(load(url("/huge")).error() instanceof IOException);
        assertTrue(load(url("/huge-chunked")).error() instanceof IOException);
    }

    // A cacheKey's urls are one image, and the url asked for last wins.

    @Test
    public void theImageOfAUrlThatFailsGetsTheErrorAndItsOtherUrlsShareARetryOfTheLatest() throws Exception {
        TestServer.Route failing = server.route("/first").status(404).holdHeaders();
        server.route("/second");
        TestServer.Route latest = server.route("/third");
        Load first = load(keyed("/first"));
        server.awaitRequest("/first");
        Load second = load(keyed("/second"));
        Load third = load(keyed("/third"));
        failing.release();
        assertEquals(404, first.status());
        assertArrayEquals(latest.body, second.bytes());
        assertArrayEquals(latest.body, third.bytes());
        assertEquals(Arrays.asList("/first", "/third"), server.requests());
    }

    @Test
    public void aNewerUrlThatJoinsARetryIsTriedWhenTheRetryFails() throws Exception {
        TestServer.Route firstFails = server.route("/first").status(404).holdHeaders();
        TestServer.Route secondFails = server.route("/second").status(404).holdHeaders();
        TestServer.Route newer = server.route("/newer");
        Load first = load(keyed("/first"));
        server.awaitRequest("/first");
        Load second = load(keyed("/second"));
        firstFails.release();
        server.awaitRequest("/second");
        Load third = load(keyed("/newer"));
        secondFails.release();
        assertEquals(404, first.status());
        assertEquals(404, second.status());
        assertArrayEquals(newer.body, third.bytes());
        assertEquals(Arrays.asList("/first", "/second", "/newer"), server.requests());
    }

    @Test
    public void theLastUrlAskedForWinsEvenWhenItHasFailed() throws Exception {
        TestServer.Route firstFails = server.route("/first").status(404).holdHeaders();
        TestServer.Route secondFails = server.route("/second").status(404).holdHeaders();
        server.route("/newer");
        Load first = load(keyed("/first"));
        server.awaitRequest("/first");
        Load second = load(keyed("/second"));
        firstFails.release();
        server.awaitRequest("/second");
        Load newer = load(keyed("/newer"));
        Load firstAgain = load(keyed("/first"));
        secondFails.release();
        assertEquals(404, first.status());
        assertEquals(404, second.status());
        assertEquals(404, newer.status());
        assertEquals(404, firstAgain.status());
        assertEquals(Arrays.asList("/first", "/second"), server.requests());
    }

    @Test
    public void aWaitingDownloadTakesTheNewestUrlForItsKey() throws Exception {
        List<TestServer.Route> running = runSixteen();
        server.route("/old");
        TestServer.Route fresh = server.route("/fresh");
        Load old = load(keyed("/old"));
        Load newer = load(keyed("/fresh"));
        running.get(0).release();
        server.awaitRequests(17);
        assertArrayEquals(fresh.body, old.bytes());
        assertArrayEquals(fresh.body, newer.bytes());
        assertEquals(0, server.count("/old"));
    }

    @Test
    public void aWaitingDownloadGoesBackToTheLatestUrlLeftWhenARequestLeaves() throws Exception {
        List<TestServer.Route> running = runSixteen();
        TestServer.Route staying = server.route("/staying");
        server.route("/leaving");
        Load stays = load(keyed("/staying"));
        Load leaves = load(keyed("/leaving"));
        leaves.cancel();
        running.get(0).release();
        server.awaitRequests(17);
        assertArrayEquals(staying.body, stays.bytes());
        assertEquals(0, server.count("/leaving"));
        assertEquals(0, leaves.callbacks.get());
    }

    // At most 16 downloads run at once; the others wait, most urgent first.

    @Test
    public void waitingDownloadsStartMostUrgentFirst() throws Exception {
        List<TestServer.Route> running = runSixteen();
        load(url("/low"), Priority.LOW);
        load(url("/normal"), Priority.NORMAL);
        load(url("/high"), Priority.HIGH);
        Thread.sleep(200);
        assertEquals(16, server.requests().size());
        startNext(running, 3);
        assertEquals(Arrays.asList("/high", "/normal", "/low"), server.requests().subList(16, 19));
    }

    @Test
    public void aMoreUrgentRequestMovesAWaitingDownloadUp() throws Exception {
        List<TestServer.Route> running = runSixteen();
        load(url("/preload"), Priority.LOW);
        load(url("/other"), Priority.NORMAL);
        load(url("/preload"), Priority.HIGH);
        startNext(running, 2);
        assertEquals(Arrays.asList("/preload", "/other"), server.requests().subList(16, 18));
    }

    @Test
    public void aWaitingDownloadGoesBackDownWhenTheUrgentRequestLeaves() throws Exception {
        List<TestServer.Route> running = runSixteen();
        load(url("/preload"), Priority.LOW);
        Load view = load(url("/preload"), Priority.IMMEDIATE);
        view.cancel();
        load(url("/other"), Priority.NORMAL);
        startNext(running, 2);
        assertEquals(Arrays.asList("/other", "/preload"), server.requests().subList(16, 18));
    }

    // Sixteen downloads (as many as run at once), each held after its first
    // byte, so the next ones wait.
    private List<TestServer.Route> runSixteen() throws InterruptedException {
        List<TestServer.Route> running = new ArrayList<>();
        for (int i = 0; i < 16; i++) {
            running.add(server.route("/running-" + i).holdAfter(1));
            load(url("/running-" + i));
        }
        server.awaitRequests(16);
        return running;
    }

    // Lets `count` of the waiting downloads start, one at a time.
    private void startNext(List<TestServer.Route> running, int count) throws InterruptedException {
        for (int i = 0; i < count; i++) {
            running.get(i).release();
            server.awaitRequests(17 + i);
        }
    }

    private GlideUrl url(String path) {
        return new GlideUrl(server.url(path), Headers.DEFAULT);
    }

    // A source with a cacheKey (the test's).
    private GlideUrl keyed(String path) {
        return new FastImageKeyedGlideUrl(server.url(path), Headers.DEFAULT, name.getMethodName());
    }

    private Load load(GlideUrl url) {
        return load(url, Priority.NORMAL);
    }

    private Load load(GlideUrl url, Priority priority) {
        Load load = new Load(FastImageSharedDownloads.loadData(url, client).fetcher);
        loads.add(load);
        load.fetcher.loadData(priority, load);
        return load;
    }

    private static void await(CountDownLatch latch) throws InterruptedException {
        if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("timed out");
    }

    // A request, and what it got.
    private static final class Load implements DataFetcher.DataCallback<InputStream> {
        final DataFetcher<InputStream> fetcher;
        final CountDownLatch done = new CountDownLatch(1);
        final AtomicInteger callbacks = new AtomicInteger();
        volatile boolean cancelled;
        @Nullable
        private volatile byte[] bytes;
        @Nullable
        private volatile Exception error;

        Load(DataFetcher<InputStream> fetcher) {
            this.fetcher = fetcher;
        }

        // As Glide does: reads (decodes) the stream, then cleans up.
        @Override
        public void onDataReady(@Nullable InputStream data) {
            callbacks.incrementAndGet();
            try {
                ByteArrayOutputStream read = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                while (data != null && (count = data.read(buffer)) != -1) read.write(buffer, 0, count);
                bytes = read.toByteArray();
            } catch (IOException e) {
                error = e;
            } finally {
                fetcher.cleanup();
                done.countDown();
            }
        }

        @Override
        public void onLoadFailed(@NonNull Exception e) {
            callbacks.incrementAndGet();
            error = e;
            done.countDown();
        }

        void cancel() {
            cancelled = true;
            fetcher.cancel();
        }

        byte[] bytes() throws InterruptedException {
            await(done);
            if (error != null) throw new AssertionError("failed instead of loading", error);
            return bytes;
        }

        Exception error() throws InterruptedException {
            await(done);
            assertNotNull("loaded instead of failing", error);
            return error;
        }

        int status() throws InterruptedException {
            Exception e = error();
            assertTrue("not an HTTP error: " + e, e instanceof HttpException);
            return ((HttpException) e).getStatusCode();
        }
    }
}
