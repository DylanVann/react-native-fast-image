package com.dylanvann.fastimage;

import android.os.SystemClock;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.HttpException;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.ModelLoader;

import java.io.EOFException;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;
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
import okio.BufferedSource;

// One download of an image at a time, shared by every request for it, as
// SDWebImage's downloader shares one per url (and Fresco one per encoded
// image). Glide only shares a load between requests for the same size and
// options, so views showing an image at different sizes, or one mounted while
// a preload downloads it, downloaded it again. Downloads are keyed by key(),
// which progress is sent by too (FastImageViewManager.onDownloadProgress).
//
// A download keeps its response's bytes, so every request reads all of them,
// however far along the download is when it joins: in memory if it's small
// (a known length up to MEMORY_MAX, while MEMORY_BUDGET has room), otherwise
// in a temporary file (Glide streams a download to its disk cache, and decodes
// at the view's size, so a large image never needs its bytes in the heap; the
// file keeps it that way). Each request gets a stream over those bytes, which
// waits for the ones still coming, and Glide decodes its own size from it.
// The download is cancelled once every request for it has gone, and its bytes
// are dropped once it has ended and every request has read what it needed.
//
// At most MAX_RUNNING downloads run at once, as SDWebImage's downloader limits
// them; the others wait to send their request, most urgent first (Glide's
// priority: views before preloads). A running download's response is read as
// soon as it arrives, on a thread of its own (not one of Glide's, so a request
// waiting for bytes never waits for another request's job, and not OkHttp's
// dispatcher, which React Native's networking shares): a response left unread
// on an HTTP/2 connection would hold back the others on it. A download that
// stalls fails like any other, with the timeouts of the clients
// (FastImageOkHttpProgressGlideModule), which only count once it has started.
final class FastImageSharedDownloads {
    // The longest response kept in memory, and the most bytes held in memory
    // for downloads at once: encoded images (not decoded bitmaps, which
    // Glide's memory cache holds), each only until its download has ended and
    // every request has read it. Others are kept in a temporary file.
    private static final long MEMORY_MAX = 1024 * 1024;
    private static final long MEMORY_BUDGET = Runtime.getRuntime().maxMemory() / 16;
    // The most downloads running at once (see above).
    private static final int MAX_RUNNING = 16;
    // A download hands bytes to its requests this many at a time, or after
    // HAND_OFF_MS (a slow link): each hand-off writes the store, locks the
    // download and wakes its readers.
    private static final int HAND_OFF_BYTES = 64 * 1024;
    private static final long HAND_OFF_MS = 16;
    // How long a preload's finished file is used (see finished()).
    private static final long KEEP_MS = 60_000;
    // Progress is sent when a download has read another 0.5% (and at its
    // start and end).
    private static final long PROGRESS_STEPS = 200;

    // The download new requests for a key join: in progress, or finished and
    // still being read. Guards the downloads' sharing, queue and progress
    // (taken before a download's own lock, and FastImageViewManager's progress
    // lock).
    private static final Map<String, Download> downloads = new HashMap<>();
    // Guarded by downloads: downloads waiting to start, most urgent first, then
    // in the order they were asked for; how many are running; and the bytes
    // held in memory.
    private static final PriorityQueue<Download> queue = new PriorityQueue<>(11, new Comparator<Download>() {
        @Override
        public int compare(Download a, Download b) {
            int byPriority = a.priority.compareTo(b.priority);
            return byPriority != 0 ? byPriority : Long.compare(a.order, b.order);
        }
    });
    private static long orders = 0;
    private static int running = 0;
    private static long held = 0;

    // Where temporary files go (FastImageOkHttpProgressGlideModule sets it).
    @Nullable
    private static volatile File directory;

    // Reads the running downloads' responses, one thread each.
    private static final ThreadPoolExecutor reading = new ThreadPoolExecutor(
            MAX_RUNNING, MAX_RUNNING, 30, TimeUnit.SECONDS, new LinkedBlockingQueue<Runnable>(),
            new ThreadFactory() {
                @Override
                public Thread newThread(@NonNull Runnable runnable) {
                    Thread thread = new Thread(runnable, "FastImageDownload");
                    thread.setDaemon(true);
                    return thread;
                }
            });

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

    static void setDirectory(File cacheDirectory) {
        directory = cacheDirectory;
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

    // Starts the downloads waiting that can run now.
    private static void startQueued() {
        List<Download> starting = new ArrayList<>();
        synchronized (downloads) {
            while (running < MAX_RUNNING && !queue.isEmpty()) {
                Download download = queue.poll();
                download.queued = false;
                download.running = true;
                running++;
                starting.add(download);
            }
        }
        for (Download download : starting) download.start();
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
        // Set when it loads (Glide also makes fetchers it doesn't use, e.g.
        // for an image in its disk cache).
        String key;
        Priority priority;
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
        }

        @Override
        public void loadData(@NonNull Priority priority, @NonNull DataCallback<? super InputStream> callback) {
            this.key = key(url);
            this.priority = priority;
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

        // On the main thread. The request leaves its download, which is
        // cancelled once no request is left, and its stream on the bytes is
        // closed, so a read waiting for bytes stops.
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

    // Where a download keeps its response's bytes. The download writes them
    // in order, on its reading thread; requests read those written, on theirs.
    private interface Store {
        void write(long at, byte[] buffer, int count) throws IOException;

        // Reads up to `count` of the bytes written, from `at`.
        int read(long at, byte[] buffer, int offset, int count) throws IOException;

        void release();
    }

    private static final class MemoryStore implements Store {
        private final byte[] bytes;

        MemoryStore(int length) {
            bytes = new byte[length];
        }

        @Override
        public void write(long at, byte[] buffer, int count) {
            System.arraycopy(buffer, 0, bytes, (int) at, count);
        }

        @Override
        public int read(long at, byte[] buffer, int offset, int count) {
            System.arraycopy(bytes, (int) at, buffer, offset, count);
            return count;
        }

        @Override
        public void release() {
        }
    }

    // A temporary file, removed from its folder once open: its space is freed
    // once it's closed, or the app ends, so nothing is left behind. Read and
    // written with a RandomAccessFile, which (unlike a FileChannel) isn't
    // closed for every thread when one reading it is interrupted.
    private static final class FileStore implements Store {
        private final RandomAccessFile file;

        FileStore() throws IOException {
            File folder = directory;
            if (folder == null) throw new IOException("No folder for downloads");
            if (!folder.isDirectory() && !folder.mkdirs() && !folder.isDirectory()) {
                throw new IOException("Can't make " + folder);
            }
            File created = File.createTempFile("download", null, folder);
            file = new RandomAccessFile(created, "rw");
            //noinspection ResultOfMethodCallIgnored
            created.delete();
        }

        @Override
        public synchronized void write(long at, byte[] buffer, int count) throws IOException {
            file.seek(at);
            file.write(buffer, 0, count);
        }

        @Override
        public synchronized int read(long at, byte[] buffer, int offset, int count) throws IOException {
            file.seek(at);
            int read = file.read(buffer, offset, count);
            if (read == -1) throw new EOFException("The download's file ended early");
            return read;
        }

        @Override
        public synchronized void release() {
            try {
                file.close();
            } catch (IOException e) {
                // Closed as far as it could.
            }
        }
    }

    private static final class Download implements Callback {
        private final String key;
        // The request it downloads: its url and headers.
        private final GlideUrl url;
        private final OkHttpClient client;
        private final Request request;
        // Guarded by downloads. In the queue (most urgent first, then in
        // order), or running.
        private Priority priority;
        private final long order;
        private boolean queued = false;
        private boolean running = false;
        // Guarded by this. The call, once started, and whether the download
        // was cancelled (before it started, it doesn't).
        @Nullable
        private Call call;
        private boolean cancelled = false;
        // Guarded by this. Requests waiting for the response, and once it has
        // arrived, the streams open on its bytes.
        private final List<Waiter> waiting = new ArrayList<>();
        private boolean responded = false;
        private int readers = 0;
        // Guarded by this. Where the bytes are (null before the response is
        // read, and once dropped), and how many have arrived.
        @Nullable
        private Store store;
        private long size = 0;
        // The response has ended: all of it read, or with an error.
        private boolean ended = false;
        @Nullable
        private IOException error;
        // Guarded by downloads. The memory the bytes hold, and whether it sends
        // no more progress: it ended, or was cancelled (it can still read
        // bytes it had received).
        private long reserved = 0;
        private boolean silent = false;

        // With downloads locked.
        private Download(String key, GlideUrl url, OkHttpClient client, Request request, Priority priority) {
            this.key = key;
            this.url = url;
            this.client = client;
            this.request = request;
            this.priority = priority;
            this.order = orders++;
        }

        // Joins the fetcher's key's download, or queues one. `alone` queues one
        // that other requests don't join.
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
            boolean queuedOne = false;
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
                // A `web` image follows its HTTP cache: it only joins a
                // download in progress, not the bytes of one that has ended.
                if (download != null && fetcher.url instanceof FastImageWebGlideUrl && download.hasEnded()) {
                    download = null;
                }
                if (download == null) {
                    download = new Download(fetcher.key, fetcher.url, fetcher.client, request, fetcher.priority);
                    if (!alone) downloads.put(fetcher.key, download);
                    download.queued = true;
                    queue.add(download);
                    queuedOne = true;
                } else if (download.queued && fetcher.priority.compareTo(download.priority) < 0) {
                    // A more urgent request moves it up.
                    queue.remove(download);
                    download.priority = fetcher.priority;
                    queue.add(download);
                }
                fetcher.download = download;
                synchronized (download) {
                    if (download.responded) {
                        download.readers++;
                        ready = new SharedStream(download);
                    } else {
                        download.waiting.add(new Waiter(fetcher, callback));
                    }
                }
            }
            if (ready != null) fetcher.deliver(ready, callback);
            if (queuedOne) startQueued();
        }

        // Sends the request (off the main thread, and outside the locks:
        // creating the call runs the app's OkHttp EventListener).
        private void start() {
            Call created = client.newCall(request);
            boolean go;
            synchronized (this) {
                go = !cancelled;
                if (go) call = created;
            }
            if (go) {
                created.enqueue(this);
            } else {
                stopped();
            }
        }

        // Cancels the call, or keeps it from starting. Outside the locks.
        private void cancel() {
            Call started;
            synchronized (this) {
                cancelled = true;
                started = call;
            }
            if (started != null) started.cancel();
        }

        // It no longer runs: the next download waiting can start.
        private void stopped() {
            synchronized (downloads) {
                if (!running) return;
                running = false;
                FastImageSharedDownloads.running--;
            }
            startQueued();
        }

        private synchronized boolean hasEnded() {
            return ended;
        }

        // With downloads locked: new requests start another download.
        private void unmap() {
            if (downloads.get(key) == this) downloads.remove(key);
        }

        // With downloads and this locked: drops the bytes, and gives their
        // memory back.
        private void drop() {
            held -= reserved;
            reserved = 0;
            if (store != null) {
                store.release();
                store = null;
            }
        }

        // With this locked: the requests waiting for the response.
        private List<Waiter> takeWaiting() {
            List<Waiter> taken = new ArrayList<>(waiting);
            waiting.clear();
            return taken;
        }

        // A request was cancelled (on the main thread). With no one left, the
        // download is too (or, waiting to start, leaves the queue).
        void leave(Fetcher fetcher) {
            boolean cancel = false;
            synchronized (downloads) {
                synchronized (this) {
                    for (int i = waiting.size() - 1; i >= 0; i--) {
                        if (waiting.get(i).fetcher == fetcher) waiting.remove(i);
                    }
                    if (!ended && readers == 0 && waiting.isEmpty()) {
                        unmap();
                        silent = true;
                        cancel = true;
                    }
                }
                if (cancel && queued) {
                    queue.remove(this);
                    queued = false;
                }
            }
            if (cancel) cancel();
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
                        silent = true;
                        cancel = true;
                    } else {
                        drop();
                    }
                }
            }
            if (cancel) cancel();
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
                    silent = true;
                    if (error == null) error = e;
                    ended = true;
                    failed = takeWaiting();
                    notifyAll();
                    if (readers == 0) drop();
                }
            }
            stopped();
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
            List<Waiter> waiters;
            synchronized (downloads) {
                synchronized (this) {
                    waiters = takeWaiting();
                    if (waiters.isEmpty()) {
                        // Every request left meanwhile.
                        unmap();
                        ended = true;
                    } else {
                        responded = true;
                        readers += waiters.size();
                    }
                }
                // No progress without a length.
                if (waiters.isEmpty() || length <= 0) silent = true;
            }
            if (waiters.isEmpty()) {
                body.close();
                stopped();
                return;
            }
            reading.execute(new Runnable() {
                @Override
                public void run() {
                    readInto(body, length);
                }
            });
            for (Waiter waiter : waiters) waiter.fetcher.deliver(new SharedStream(this), waiter.callback);
        }

        // Sends a progress step, unless the download has stopped: checked and
        // sent with downloads locked, which a cancel takes to stop it, so a new
        // load of the key never gets a cancelled download's steps. Without an
        // image with onProgress, nothing is locked.
        private void report(Progress progress, long loaded, long total) {
            if (!progress.step(loaded, total) || !FastImageViewManager.wantsProgress()) return;
            synchronized (downloads) {
                if (!silent) FastImageViewManager.onDownloadProgress(key, Math.min(loaded, total), total);
            }
        }

        // Memory for a response of known length up to MEMORY_MAX, if the
        // budget has room for it (and there's the memory), otherwise a file.
        private Store newStore(long length) throws IOException {
            if (length >= 0 && length <= MEMORY_MAX) {
                boolean fits;
                synchronized (downloads) {
                    fits = held + length <= MEMORY_BUDGET;
                    if (fits) {
                        held += length;
                        reserved = length;
                    }
                }
                if (fits) {
                    try {
                        return new MemoryStore((int) length);
                    } catch (OutOfMemoryError e) {
                        synchronized (downloads) {
                            held -= reserved;
                            reserved = 0;
                        }
                    }
                }
            }
            return new FileStore();
        }

        // Reads the response into its store, on a thread of `reading`, and
        // hands the bytes to the requests (see HAND_OFF_BYTES).
        private void readInto(ResponseBody body, long length) {
            Progress progress = new Progress();
            long read = 0;
            try (BufferedSource source = body.source()) {
                Store kept = newStore(length);
                synchronized (this) {
                    store = kept;
                }
                byte[] buffer = new byte[HAND_OFF_BYTES];
                int pending = 0;
                long handedAt = SystemClock.uptimeMillis();
                boolean done = false;
                while (!done) {
                    long left = length < 0 ? Long.MAX_VALUE : length - read;
                    int count = left == 0 ? -1 : source.read(buffer, pending, (int) Math.min(buffer.length - pending, left));
                    if (count == -1) {
                        if (left > 0 && length >= 0) throw new EOFException("The response ended early");
                        done = true;
                    } else {
                        pending += count;
                        read += count;
                    }
                    long now = SystemClock.uptimeMillis();
                    if (pending > 0 && (done || pending == buffer.length || now - handedAt >= HAND_OFF_MS)) {
                        kept.write(read - pending, buffer, pending);
                        // Before the streams get the bytes: a request can
                        // decode from them and post its onLoad, which the
                        // step's post must come before (a small image arrives
                        // in one hand-off).
                        report(progress, read, length);
                        synchronized (this) {
                            size = read;
                            notifyAll();
                        }
                        pending = 0;
                        handedAt = now;
                    }
                }
            } catch (IOException e) {
                fail(e);
                return;
            } catch (RuntimeException | OutOfMemoryError e) {
                // E.g. no memory for OkHttp's buffers: the requests reading it
                // fail, and the next ones start another download.
                fail(new IOException(e));
                return;
            }
            synchronized (downloads) {
                synchronized (this) {
                    ended = true;
                    notifyAll();
                    silent = true;
                    // Every request left while it downloaded.
                    if (readers == 0) {
                        unmap();
                        drop();
                    }
                }
            }
            stopped();
        }
    }

    // A request's stream on a download's bytes, from the start: it waits for
    // the ones still coming. Closing it holds no connection, so it can be done
    // on the main thread.
    private static final class SharedStream extends InputStream {
        private final Download download;
        private final byte[] one = new byte[1];
        // Only used by the thread reading it.
        private long position = 0;
        // Guarded by download.
        private boolean closed = false;

        SharedStream(Download download) {
            this.download = download;
        }

        @Override
        public int read() throws IOException {
            int count = read(one, 0, 1);
            return count == -1 ? -1 : one[0] & 0xff;
        }

        @Override
        public int read(@NonNull byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            Store store;
            int count;
            synchronized (download) {
                while (!closed && position >= download.size && !download.ended) {
                    try {
                        download.wait();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new InterruptedIOException();
                    }
                }
                if (closed) throw new IOException("Canceled");
                store = download.store;
                if (position >= download.size || store == null) {
                    // The download's error once it has read the bytes that
                    // arrived, or the end.
                    IOException error = download.error;
                    if (error != null) throw new IOException(error.getMessage(), error);
                    return -1;
                }
                count = (int) Math.min(length, download.size - position);
            }
            // Outside the lock, which the download takes for every chunk.
            int read = store.read(position, buffer, offset, count);
            position += read;
            return read;
        }

        @Override
        public int available() {
            synchronized (download) {
                return closed ? 0 : (int) Math.min(Integer.MAX_VALUE, download.size - position);
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
