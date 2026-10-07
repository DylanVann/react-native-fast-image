package com.dylanvann.fastimage;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.HttpException;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.ModelLoader;
import com.bumptech.glide.util.ContentLengthInputStream;

import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import okio.ForwardingSource;
import okio.Okio;
import okio.Source;

// One download of an image at a time, shared by every request for it, as
// SDWebImage's downloader shares one per url (and Fresco one per encoded
// image). Glide only shares a load between requests for the same size and
// options, so views showing an image at different sizes, or one mounted while
// a preload downloads it, downloaded it again. Downloads are keyed by key(),
// which progress is sent by too (FastImageViewManager.onDownloadProgress).
//
// A download reads its response into memory itself, on a thread of its own
// (not one of Glide's, so a request waiting for bytes never waits for another
// request's job, and not OkHttp's dispatcher, which React Native's
// networking shares). Each request gets a stream over those bytes, which waits
// for the ones still coming, and Glide decodes its own size from it. The
// download is cancelled once every request for it has gone, and its bytes
// are dropped once it has ended and every request has read what it needed.
// A response of unknown length, or one that doesn't fit in BUDGET, isn't
// shared: the first request reads it from OkHttp, as Glide's OkHttp fetcher
// does, and the others download the image again, each on its own. A
// download that stalls fails like any other, with the timeouts of the clients
// (FastImageOkHttpProgressGlideModule).
final class FastImageSharedDownloads {
    // The most bytes held for shared downloads at once: they're encoded
    // images (not decoded bitmaps, which Glide's memory cache holds), each
    // only until its download has ended and every request has read it.
    private static final long BUDGET = Runtime.getRuntime().maxMemory() / 16;
    // How long a preload's finished file is used (see finished()).
    private static final long KEEP_MS = 60_000;
    // Progress is sent when a download has read another 0.5% (and at its
    // start and end).
    private static final long PROGRESS_STEPS = 200;

    // The download new requests for a key join: in progress, or finished and
    // still being read. Guards the downloads' sharing and progress (taken
    // before a download's own lock, and FastImageViewManager's progress lock).
    private static final Map<String, Download> downloads = new HashMap<>();
    // The download whose progress is sent for a key (guarded by downloads),
    // so two downloads of a key don't mix theirs: the first one in progress,
    // then, once it has stopped, the next of them to read more.
    private static final Map<String, Download> reporting = new HashMap<>();
    // Bytes held for shared downloads (guarded by downloads).
    private static long held = 0;

    private static ThreadFactory daemon(final String name) {
        return new ThreadFactory() {
            @Override
            public Thread newThread(@NonNull Runnable runnable) {
                Thread thread = new Thread(runnable, name);
                thread.setDaemon(true);
                return thread;
            }
        };
    }

    // Reads shared downloads' responses, eight at a time (Glide reads its
    // downloads on at most four threads); the others wait for a thread.
    private static final ThreadPoolExecutor reading = new ThreadPoolExecutor(
            8, 8, 30, TimeUnit.SECONDS, new LinkedBlockingQueue<Runnable>(), daemon("FastImageDownload"));

    static {
        reading.allowCoreThreadTimeOut(true);
    }

    private static final class Finished {
        final File file;
        final long at;

        Finished(File file, long at) {
            this.file = file;
            this.at = at;
        }
    }

    // Preloads' files in Glide's disk cache, by key, for a while after they
    // finished.
    private static final ConcurrentHashMap<String, Finished> finished = new ConcurrentHashMap<>();

    private FastImageSharedDownloads() {
    }

    // The key downloads are shared, and their progress sent, by. A url with
    // the source's cacheKey: the key (Glide caches it, and shares its loads,
    // by the key too). Another url: the url and its headers (Glide's loads
    // compare both). `web` images apart: they load with their own client, and
    // its HTTP cache.
    static String key(GlideUrl url) {
        if (url instanceof FastImageKeyedGlideUrl) return "key " + url.getCacheKey();
        String key = url.getCacheKey() + " " + new TreeMap<>(url.getHeaders());
        return (url instanceof FastImageWebGlideUrl ? "web " : "url ") + key;
    }

    // A preload's download ended (FastImageViewModule.loadFile), with its file
    // in Glide's disk cache, or null if it failed. A request that looked in
    // the disk cache before the preload stored the file, and gets to
    // downloading after, reads the file.
    static void finished(String key, @Nullable File file) {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Finished> entry : finished.entrySet()) {
            if (now - entry.getValue().at > KEEP_MS) finished.remove(entry.getKey(), entry.getValue());
        }
        if (file != null) finished.put(key, new Finished(file, now));
    }

    @Nullable
    private static File finishedFile(String key) {
        Finished file = finished.get(key);
        if (file == null) return null;
        if (System.currentTimeMillis() - file.at > KEEP_MS) {
            finished.remove(key, file);
            return null;
        }
        return file.file;
    }

    // A remote image's load data (FastImageOkHttpProgressGlideModule): its
    // download with the client, shared with the other requests for its key.
    static ModelLoader.LoadData<InputStream> loadData(GlideUrl url, OkHttpClient client) {
        return new ModelLoader.LoadData<>(url, new Fetcher(url, client));
    }

    // As Glide's OkHttp fetcher requests it. A url or header OkHttp can't
    // send is an IOException, so its load fails (OkHttp throws an
    // IllegalArgumentException, which would crash the thread it's on).
    static Request request(GlideUrl url) throws IOException {
        try {
            Request.Builder builder = new Request.Builder().url(url.toStringUrl());
            for (Map.Entry<String, String> header : url.getHeaders().entrySet()) {
                builder.addHeader(header.getKey(), header.getValue());
            }
            return builder.build();
        } catch (IllegalArgumentException e) {
            throw new IOException("Invalid request: " + e.getMessage(), e);
        }
    }

    private static boolean sameRequest(GlideUrl a, GlideUrl b) {
        return a.toStringUrl().equals(b.toStringUrl()) && a.getHeaders().equals(b.getHeaders());
    }

    private static void closeQuietly(InputStream stream) {
        try {
            stream.close();
        } catch (IOException e) {
            // Closed as far as it could.
        }
    }

    // A download's progress steps (see PROGRESS_STEPS).
    private static final class Progress {
        private long lastStep = -1;

        // Whether `loaded` is another step. Without a Content-Length the total
        // is unknown (-1), and a fraction can't be worked out from it.
        boolean step(long loaded, long total) {
            if (total <= 0) return false;
            long step = Math.min(loaded, total) * PROGRESS_STEPS / total;
            if (step == lastStep) return false;
            lastStep = step;
            return true;
        }
    }

    // A request's fetch: joins its key's download.
    private static final class Fetcher implements DataFetcher<InputStream> {
        final GlideUrl url;
        final OkHttpClient client;
        final String key;
        volatile boolean cancelled;
        // Set before it joins again, once a download for another url with its
        // key failed.
        boolean retried;
        // The download it waits for, or reads (guarded by downloads).
        @Nullable
        Download download;
        // What it gave Glide.
        @Nullable
        private volatile InputStream stream;
        private volatile boolean fromFile;

        Fetcher(GlideUrl url, OkHttpClient client) {
            this.url = url;
            this.client = client;
            this.key = key(url);
        }

        @Override
        public void loadData(@NonNull Priority priority, @NonNull DataCallback<? super InputStream> callback) {
            // `web` images follow their HTTP cache, not a preload's file.
            File file = url instanceof FastImageWebGlideUrl ? null : finishedFile(key);
            if (file != null) {
                try {
                    InputStream opened = new FileInputStream(file);
                    fromFile = true;
                    stream = opened;
                    callback.onDataReady(opened);
                    return;
                } catch (IOException e) {
                    // Gone from the disk cache meanwhile: download it.
                }
            }
            Download.join(this, callback, false);
        }

        // From the download, outside its locks, off the main thread.
        void deliver(InputStream data, DataCallback<? super InputStream> callback) {
            stream = data;
            // Cancelled meanwhile: Glide won't read or close it.
            if (cancelled) {
                closeQuietly(data);
                return;
            }
            callback.onDataReady(data);
        }

        // On one of Glide's threads.
        @Override
        public void cleanup() {
            InputStream opened = stream;
            if (opened != null) closeQuietly(opened);
        }

        // On the main thread. The request leaves its download, which cancels
        // the call once no request is left (or at once, for a response this
        // request reads from OkHttp, as Glide's OkHttp fetcher does), and a
        // stream on shared bytes is closed, so a read waiting for bytes stops.
        // OkHttp's response is closed in cleanup(): closing it reads the
        // socket, which throws on the main thread.
        @Override
        public void cancel() {
            cancelled = true;
            Download joined;
            synchronized (downloads) {
                joined = download;
            }
            if (joined != null) joined.leave(this);
            InputStream opened = stream;
            if (opened instanceof SharedStream) closeQuietly(opened);
        }

        @NonNull
        @Override
        public Class<InputStream> getDataClass() {
            return InputStream.class;
        }

        // A preload's file is from Glide's disk cache. A download is remote
        // for every request reading it: Glide stores it in its disk cache once
        // (a request that finds it there already reads it from there), and
        // fades the image in as for any download.
        @NonNull
        @Override
        public DataSource getDataSource() {
            return fromFile ? DataSource.DATA_DISK_CACHE : DataSource.REMOTE;
        }
    }

    // A request waiting for a download's response.
    private static final class Waiter {
        final Fetcher fetcher;
        final DataFetcher.DataCallback<? super InputStream> callback;

        Waiter(Fetcher fetcher, DataFetcher.DataCallback<? super InputStream> callback) {
            this.fetcher = fetcher;
            this.callback = callback;
        }
    }

    private static final class Download implements Callback {
        private final String key;
        // The request it downloads: its url and headers.
        private final GlideUrl url;
        private final Call call;
        // Guarded by this. Requests waiting for the response.
        private final List<Waiter> waiting = new ArrayList<>();
        // Streams open on the bytes.
        private int readers = 0;
        // The response's bytes, once it's shared (null before, and once
        // dropped), and how many have arrived.
        @Nullable
        private byte[] data;
        private int size = 0;
        // The response has ended (all of it read, or with an error), or gone
        // to a request (not shared).
        private boolean ended = false;
        @Nullable
        private IOException error;
        // Guarded by downloads. The budget the bytes hold.
        private long reserved = 0;
        // Not shared: the request reading the response from OkHttp, until it
        // leaves or closes it.
        @Nullable
        private Fetcher reader;
        // It sends no more progress: it ended, or was cancelled.
        private boolean silent = false;

        private Download(String key, GlideUrl url, Call call) {
            this.key = key;
            this.url = url;
            this.call = call;
        }

        // Joins the fetcher's key's download, or starts one. `alone` starts
        // one that other requests don't join.
        static void join(Fetcher fetcher, DataFetcher.DataCallback<? super InputStream> callback, boolean alone) {
            // Its own request, which a retry, or a download on its own, sends.
            Request request;
            try {
                request = request(fetcher.url);
            } catch (IOException e) {
                callback.onLoadFailed(e);
                return;
            }
            Download download;
            boolean start = false;
            InputStream ready = null;
            synchronized (downloads) {
                // Cancelled before it got here.
                if (fetcher.cancelled) return;
                download = alone ? null : downloads.get(fetcher.key);
                // A retry only joins a download of its own url and headers.
                if (download != null && fetcher.retried && !sameRequest(download.url, fetcher.url)) {
                    alone = true;
                    download = null;
                }
                if (download == null) {
                    download = new Download(fetcher.key, fetcher.url, fetcher.client.newCall(request));
                    if (!alone) downloads.put(fetcher.key, download);
                    if (!reporting.containsKey(fetcher.key)) reporting.put(fetcher.key, download);
                    start = true;
                }
                fetcher.download = download;
                synchronized (download) {
                    if (download.data != null) {
                        download.readers++;
                        ready = new SharedStream(download);
                    } else {
                        download.waiting.add(new Waiter(fetcher, callback));
                    }
                }
            }
            if (ready != null) fetcher.deliver(ready, callback);
            if (start) download.call.enqueue(download);
        }

        // With downloads locked: new requests start another download.
        private void unmap() {
            if (downloads.get(key) == this) downloads.remove(key);
        }

        // With downloads locked: it sends no more progress (the key's next
        // download to read more can).
        private void stopReporting() {
            silent = true;
            if (reporting.get(key) == this) reporting.remove(key);
        }

        // With downloads and this locked: drops the bytes, and gives their
        // budget back.
        private void drop() {
            held -= reserved;
            reserved = 0;
            data = null;
        }

        // With this locked: the requests waiting for the response.
        private List<Waiter> takeWaiting() {
            List<Waiter> taken = new ArrayList<>(waiting);
            waiting.clear();
            return taken;
        }

        // A request was cancelled (on the main thread). With no one left, the
        // download is too; a request reading an unshared response cancels its
        // call.
        void leave(Fetcher fetcher) {
            boolean cancel = false;
            synchronized (downloads) {
                synchronized (this) {
                    for (int i = waiting.size() - 1; i >= 0; i--) {
                        if (waiting.get(i).fetcher == fetcher) waiting.remove(i);
                    }
                    if (reader == fetcher) {
                        reader = null;
                        stopReporting();
                        cancel = true;
                    } else if (!ended && readers == 0 && waiting.isEmpty()) {
                        unmap();
                        stopReporting();
                        cancel = true;
                    }
                }
            }
            if (cancel) call.cancel();
        }

        // A stream on the bytes was closed.
        void readerClosed() {
            boolean cancel = false;
            synchronized (downloads) {
                synchronized (this) {
                    readers--;
                    if (readers > 0 || !waiting.isEmpty()) return;
                    unmap();
                    if (!ended) {
                        stopReporting();
                        cancel = true;
                    } else {
                        drop();
                    }
                }
            }
            if (cancel) call.cancel();
        }

        @Override
        public void onFailure(@NonNull Call call, @NonNull IOException e) {
            fail(e);
        }

        // The download failed: requests waiting for the response fail with
        // the error, and streams on the bytes throw it once they've read them.
        // A request for another url with the key (e.g. a signed url with the
        // same cacheKey) downloads its own url instead, once: this url can
        // fail for reasons of its own, like an expired token.
        private void fail(IOException e) {
            List<Waiter> failed;
            synchronized (downloads) {
                synchronized (this) {
                    unmap();
                    stopReporting();
                    if (error == null) error = e;
                    ended = true;
                    failed = takeWaiting();
                    notifyAll();
                    if (readers == 0) drop();
                }
            }
            for (Waiter waiter : failed) {
                Fetcher fetcher = waiter.fetcher;
                if (!fetcher.retried && !sameRequest(fetcher.url, url)) {
                    fetcher.retried = true;
                    join(fetcher, waiter.callback, false);
                } else {
                    waiter.callback.onLoadFailed(e);
                }
            }
        }

        @Override
        public void onResponse(@NonNull Call call, @NonNull Response response) {
            final ResponseBody body = response.body();
            if (!response.isSuccessful() || body == null) {
                if (body != null) body.close();
                fail(new HttpException(response.message(), response.code()));
                return;
            }
            final long length = body.contentLength();
            // Shared if a request still wants it, and its length is known and
            // fits the budget, which is reserved first: the bytes are
            // allocated outside the locks (cancels take them on the main
            // thread), and if there isn't the memory, it isn't shared.
            boolean share = false;
            synchronized (downloads) {
                synchronized (this) {
                    if (!waiting.isEmpty() && length >= 0 && held + length <= BUDGET) {
                        held += length;
                        reserved = length;
                        share = true;
                    }
                }
                // No progress without a length.
                if (length <= 0) stopReporting();
            }
            byte[] bytes = null;
            if (share) {
                try {
                    bytes = new byte[(int) length];
                } catch (OutOfMemoryError e) {
                    // Read from OkHttp instead.
                }
            }
            List<Waiter> waiters;
            synchronized (downloads) {
                synchronized (this) {
                    waiters = takeWaiting();
                    if (bytes != null && !waiters.isEmpty()) {
                        data = bytes;
                        readers += waiters.size();
                    } else {
                        bytes = null;
                        drop();
                        unmap();
                        ended = true;
                        if (waiters.isEmpty()) {
                            stopReporting();
                        } else {
                            reader = waiters.get(0).fetcher;
                        }
                    }
                }
            }
            if (bytes == null) {
                readDirectly(body, length, waiters);
                return;
            }
            reading.execute(new Runnable() {
                @Override
                public void run() {
                    readInto(body, (int) length);
                }
            });
            for (Waiter waiter : waiters) waiter.fetcher.deliver(new SharedStream(this), waiter.callback);
        }

        // Sends a progress step if it's this download's to send (it takes the
        // key's progress over if no download sends it): checked and sent with
        // downloads locked, which a cancel takes to stop it, so a new load of
        // the key never gets a cancelled download's steps. A view never takes
        // a step below one it had (FastImageViewWithUrl.takesProgress).
        private void report(Progress progress, long loaded, long total) {
            if (!progress.step(loaded, total)) return;
            synchronized (downloads) {
                if (silent) return;
                Download current = reporting.get(key);
                if (current == null) {
                    reporting.put(key, this);
                } else if (current != this) {
                    return;
                }
                FastImageViewManager.onDownloadProgress(key, Math.min(loaded, total), total);
            }
        }

        // Not shared: the first request reads the response from OkHttp, and
        // the others download the image again, each on its own (while this
        // download sends the key's progress).
        private void readDirectly(ResponseBody body, long length, List<Waiter> waiters) {
            if (waiters.isEmpty()) {
                body.close();
                return;
            }
            Waiter first = waiters.get(0);
            InputStream stream = new DirectStream(ContentLengthInputStream.obtain(
                    Okio.buffer(withProgress(body.source(), length)).inputStream(), length));
            first.fetcher.deliver(stream, first.callback);
            for (int i = 1; i < waiters.size(); i++) {
                join(waiters.get(i).fetcher, waiters.get(i).callback, true);
            }
        }

        private Source withProgress(Source source, final long length) {
            final Progress progress = new Progress();
            return new ForwardingSource(source) {
                long read = 0;

                @Override
                public long read(@NonNull Buffer sink, long byteCount) throws IOException {
                    long bytes = super.read(sink, byteCount);
                    read = bytes == -1 ? length : read + bytes;
                    report(progress, read, length);
                    return bytes;
                }
            };
        }

        // An unshared response, which one request reads from OkHttp. Closing
        // it reads the socket, so Glide closes it on its own thread.
        private final class DirectStream extends FilterInputStream {
            DirectStream(InputStream stream) {
                super(stream);
            }

            @Override
            public void close() throws IOException {
                synchronized (downloads) {
                    reader = null;
                    stopReporting();
                }
                super.close();
            }
        }

        // Reads the response into data, on a thread of `reading`.
        private void readInto(ResponseBody body, int length) {
            Progress progress = new Progress();
            byte[] bytes;
            synchronized (this) {
                bytes = data;
            }
            int read = 0;
            try (BufferedSource source = body.source()) {
                while (read < length) {
                    int count = source.read(bytes, read, Math.min(length - read, 8192));
                    if (count == -1) throw new EOFException("The response ended early");
                    read += count;
                    // Before the streams get the bytes: a request can decode
                    // from them and post its onLoad, which the step's post
                    // must come before (a small image arrives in one read).
                    report(progress, read, length);
                    synchronized (this) {
                        size = read;
                        notifyAll();
                    }
                }
            } catch (IOException e) {
                fail(e);
                return;
            } catch (RuntimeException e) {
                fail(new IOException(e));
                return;
            }
            synchronized (downloads) {
                synchronized (this) {
                    ended = true;
                    notifyAll();
                    stopReporting();
                    // Every request left while it downloaded.
                    if (readers == 0) {
                        unmap();
                        drop();
                    }
                }
            }
        }
    }

    // A request's stream on a shared download's bytes, from the start: it
    // waits for the ones still coming. Closing it holds no connection, so it
    // can be done on the main thread.
    private static final class SharedStream extends InputStream {
        private final Download download;
        private int position = 0;
        private boolean closed = false;

        SharedStream(Download download) {
            this.download = download;
        }

        // With download locked: waits for bytes at position, and returns the
        // bytes it can read, or null at the end (or throws the download's
        // error once it has read the bytes that arrived).
        @Nullable
        private byte[] await() throws IOException {
            while (!closed && position >= download.size && !download.ended) {
                try {
                    download.wait();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new InterruptedIOException();
                }
            }
            if (closed) throw new IOException("Canceled");
            byte[] bytes = download.data;
            if (position < download.size && bytes != null) return bytes;
            IOException error = download.error;
            if (error != null) throw new IOException(error.getMessage(), error);
            return null;
        }

        @Override
        public int read() throws IOException {
            synchronized (download) {
                byte[] bytes = await();
                return bytes == null ? -1 : bytes[position++] & 0xff;
            }
        }

        @Override
        public int read(@NonNull byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            synchronized (download) {
                byte[] bytes = await();
                if (bytes == null) return -1;
                int count = Math.min(length, download.size - position);
                System.arraycopy(bytes, position, buffer, offset, count);
                position += count;
                return count;
            }
        }

        @Override
        public int available() {
            synchronized (download) {
                return closed ? 0 : download.size - position;
            }
        }

        @Override
        public void close() {
            boolean first;
            synchronized (download) {
                first = !closed;
                closed = true;
                download.notifyAll();
            }
            if (first) download.readerClosed();
        }
    }
}
