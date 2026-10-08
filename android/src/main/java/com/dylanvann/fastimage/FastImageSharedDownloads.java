package com.dylanvann.fastimage;

import android.os.Process;

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
// A download reads its response on a thread of its own, and keeps the bytes:
// in memory if the response is small (a known length up to MEMORY_MAX, while
// MEMORY_BUDGET has room), otherwise in a temporary file (Glide streams a
// download to its disk cache, and decodes at the view's size, so a large image
// never needs its bytes in the heap; the file keeps it that way). The requests
// for it wait without holding a thread, and once it has ended, each gets a
// stream over all of the bytes, as SDWebImage and Fresco decode a download
// once it has arrived. Glide's threads (4) never wait for the network, so a
// request that comes while many images download still gets to the queue below
// at once, and other images aren't held up behind slow downloads. The download
// is cancelled once every request for it has gone, and its bytes are dropped
// once every request has read what it needed.
//
// At most MAX_RUNNING downloads run at once, as SDWebImage's downloader limits
// them; the others wait to send their request, most urgent first (Glide's
// priority: views before preloads). A running download's response is read as
// soon as it arrives (not on OkHttp's dispatcher, which React Native's
// networking shares): a response left unread on an HTTP/2 connection would
// hold back the others on it. A download that stalls fails like any other,
// with the timeouts of the clients (FastImageOkHttpProgressGlideModule), which
// only count once it has started.
final class FastImageSharedDownloads {
    // The longest response kept in memory, and the most bytes held in memory
    // for downloads at once: encoded images (not decoded bitmaps, which
    // Glide's memory cache holds), each only until every request has read it.
    // Others are kept in a temporary file.
    private static final long MEMORY_MAX = 1024 * 1024;
    private static final long MEMORY_BUDGET = Runtime.getRuntime().maxMemory() / 16;
    // The most downloads running at once (see above).
    private static final int MAX_RUNNING = 16;
    // How long a preload's finished file is used (see finished()).
    private static final long KEEP_MS = 60_000;
    // Progress is sent when a download has read another 0.5% (and at its
    // start and end).
    private static final long PROGRESS_STEPS = 200;

    // The download new requests for a key join: in progress, or ended and
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

    // Reads the running downloads' responses, one thread each, at the priority
    // of Glide's own threads (below the UI's), where downloads were read before.
    private static final ThreadPoolExecutor reading = new ThreadPoolExecutor(
            MAX_RUNNING, MAX_RUNNING, 30, TimeUnit.SECONDS, new LinkedBlockingQueue<Runnable>(),
            new ThreadFactory() {
                @Override
                public Thread newThread(@NonNull final Runnable runnable) {
                    Thread thread = new Thread(new Runnable() {
                        @Override
                        public void run() {
                            Process.setThreadPriority(
                                    Process.THREAD_PRIORITY_BACKGROUND + Process.THREAD_PRIORITY_MORE_FAVORABLE);
                            runnable.run();
                        }
                    }, "FastImageDownload");
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

    // Also removes files left in it (one is unlinked once open, but the app
    // can end in between).
    static void setDirectory(final File cacheDirectory) {
        directory = cacheDirectory;
        reading.execute(new Runnable() {
            @Override
            public void run() {
                File[] left = cacheDirectory.listFiles();
                if (left == null) return;
                //noinspection ResultOfMethodCallIgnored
                for (File file : left) file.delete();
            }
        });
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
        List<Request> requests = new ArrayList<>();
        synchronized (downloads) {
            while (running < MAX_RUNNING && !queue.isEmpty()) {
                Download download = queue.poll();
                download.queued = false;
                download.running = true;
                running++;
                starting.add(download);
                requests.add(download.request);
            }
        }
        for (int i = 0; i < starting.size(); i++) starting.get(i).start(requests.get(i));
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
            Download.join(this, callback);
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
        // cancelled once no request is left, and its stream on the bytes (if
        // it has one) is closed.
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

    // A request waiting for a download to end.
    private static final class Waiter {
        final Fetcher fetcher;
        final DataFetcher.DataCallback<? super InputStream> callback;

        Waiter(Fetcher fetcher, DataFetcher.DataCallback<? super InputStream> callback) {
            this.fetcher = fetcher;
            this.callback = callback;
        }
    }

    // Where a download keeps its response's bytes: written in order on its
    // reading thread, then read by the requests, on theirs.
    private interface Store {
        void write(long at, byte[] buffer, int count) throws IOException;

        // Reads up to `count` of the bytes, from `at`.
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
            try {
                file = new RandomAccessFile(created, "rw");
            } finally {
                //noinspection ResultOfMethodCallIgnored
                created.delete();
            }
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

        // Not waiting for a read in progress (it fails): only the request
        // whose stream was closed (it was cancelled) can still be reading.
        @Override
        public void release() {
            try {
                file.close();
            } catch (IOException e) {
                // Closed as far as it could.
            }
        }
    }

    private static final class Download implements Callback {
        private final String key;
        // Guarded by downloads. The request it downloads (its url and
        // headers): until it starts, the latest url a request for its key
        // asked for (see join()).
        private GlideUrl url;
        private OkHttpClient client;
        private Request request;
        // It's the retry of a download that failed (see fail()), which isn't
        // retried again.
        private boolean retry = false;
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
        // Guarded by this. Requests waiting for it to end, and once it has,
        // the streams open on its bytes.
        private final List<Waiter> waiting = new ArrayList<>();
        private int readers = 0;
        // Guarded by this. Where the bytes are (null before the response is
        // read, and once dropped), and how many there are.
        @Nullable
        private Store store;
        private long size = 0;
        // All of the response has been read, or the download failed.
        private boolean ended = false;
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

        // Joins the fetcher's key's download, or queues one of its url.
        static void join(Fetcher fetcher, DataFetcher.DataCallback<? super InputStream> callback) {
            // Its own request, which it sends if it starts the download.
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
                download = downloads.get(fetcher.key);
                // A `web` image follows its HTTP cache: it only joins a
                // download in progress, not the bytes of one that has ended.
                if (download != null && fetcher.url instanceof FastImageWebGlideUrl && download.hasEnded()) {
                    download = null;
                }
                if (download == null) {
                    download = new Download(fetcher.key, fetcher.url, fetcher.client, request, fetcher.priority);
                    downloads.put(fetcher.key, download);
                    download.queued = true;
                    queue.add(download);
                    queuedOne = true;
                } else if (download.queued) {
                    // A more urgent request moves it up (until it leaves).
                    if (fetcher.priority.compareTo(download.priority) < 0) download.reprioritize(fetcher.priority);
                    // Not started yet: another url for its key (a cacheKey's)
                    // is the latest one, e.g. a signed url with a fresh token,
                    // so it's the one requested (they're the same image).
                    if (!sameRequest(download.url, fetcher.url)) {
                        download.url = fetcher.url;
                        download.client = fetcher.client;
                        download.request = request;
                    }
                }
                fetcher.download = download;
                synchronized (download) {
                    // An ended download in the map has its bytes (a failed one
                    // leaves the map).
                    if (download.ended) {
                        download.readers++;
                        ready = download.stream();
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
        private void start(Request request) {
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

        // With downloads locked, while it's queued.
        private void reprioritize(Priority urgency) {
            queue.remove(this);
            priority = urgency;
            queue.add(this);
        }

        // With this locked, once it has ended: a stream over all of its bytes.
        private SharedStream stream() {
            return new SharedStream(this, store, size);
        }

        // With downloads locked: new requests start another download.
        private void unmap() {
            if (downloads.get(key) == this) downloads.remove(key);
        }

        // With downloads and this locked: drops the bytes, and gives their
        // memory back. Returns the store, to release outside the locks (closing
        // a file can wait for the disk; this can be the main thread).
        @Nullable
        private Store drop() {
            held -= reserved;
            reserved = 0;
            Store dropped = store;
            store = null;
            return dropped;
        }

        private static void release(@Nullable Store store) {
            if (store != null) store.release();
        }

        // With this locked: the requests waiting for it to end.
        private List<Waiter> takeWaiting() {
            List<Waiter> taken = new ArrayList<>(waiting);
            waiting.clear();
            return taken;
        }

        // A request was cancelled (on the main thread). With no one left, the
        // download is too (or, waiting to start, leaves the queue); waiting to
        // start, it's as urgent as the most urgent request left.
        void leave(Fetcher fetcher) {
            boolean cancel = false;
            Priority urgency = null;
            synchronized (downloads) {
                synchronized (this) {
                    for (int i = waiting.size() - 1; i >= 0; i--) {
                        if (waiting.get(i).fetcher == fetcher) waiting.remove(i);
                    }
                    if (!ended && waiting.isEmpty()) {
                        unmap();
                        silent = true;
                        cancel = true;
                    }
                    for (Waiter waiter : waiting) {
                        Priority asked = waiter.fetcher.priority;
                        if (urgency == null || asked.compareTo(urgency) < 0) urgency = asked;
                    }
                }
                if (cancel && queued) {
                    queue.remove(this);
                    queued = false;
                } else if (queued && urgency != null && urgency != priority) {
                    reprioritize(urgency);
                }
            }
            if (cancel) cancel();
        }

        // A stream on the bytes was closed: once every one has, the bytes go.
        void readerClosed() {
            Store dropped = null;
            synchronized (downloads) {
                synchronized (this) {
                    readers--;
                    if (readers > 0) return;
                    unmap();
                    dropped = drop();
                }
            }
            release(dropped);
        }

        @Override
        public void onFailure(@NonNull Call call, @NonNull IOException e) {
            fail(e);
        }

        // The download failed: the requests waiting for it fail with the
        // error, unless one of them asked for another url (a cacheKey's, e.g.
        // a signed url with a fresh token): this url can fail for reasons of
        // its own, like an expired token. Then they all wait for one retry,
        // of the latest of those urls (they're the same image), which isn't
        // retried again.
        private void fail(IOException e) {
            List<Waiter> failed;
            Store dropped;
            Download again = null;
            synchronized (downloads) {
                synchronized (this) {
                    unmap();
                    silent = true;
                    ended = true;
                    failed = takeWaiting();
                    dropped = drop();
                }
                Waiter latest = null;
                Priority urgency = null;
                for (Waiter waiter : failed) {
                    if (waiter.fetcher.cancelled) continue;
                    if (!sameRequest(waiter.fetcher.url, url)) latest = waiter;
                    Priority asked = waiter.fetcher.priority;
                    if (urgency == null || asked.compareTo(urgency) < 0) urgency = asked;
                }
                if (!retry && latest != null) {
                    try {
                        again = new Download(key, latest.fetcher.url, latest.fetcher.client,
                                request(latest.fetcher.url), urgency);
                    } catch (IOException invalid) {
                        // No retry: they fail with the error.
                    }
                }
                if (again != null) {
                    again.retry = true;
                    downloads.put(key, again);
                    again.queued = true;
                    queue.add(again);
                    synchronized (again) {
                        for (Waiter waiter : failed) {
                            if (waiter.fetcher.cancelled) continue;
                            waiter.fetcher.download = again;
                            again.waiting.add(waiter);
                        }
                    }
                }
            }
            release(dropped);
            stopped();
            if (again != null) {
                startQueued();
                return;
            }
            for (Waiter waiter : failed) waiter.callback.onLoadFailed(e);
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
            synchronized (downloads) {
                // No progress without a length.
                if (length <= 0) silent = true;
            }
            reading.execute(new Runnable() {
                @Override
                public void run() {
                    readInto(body, length);
                }
            });
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

        // Reads the response into its store, on a thread of `reading`, then
        // gives the requests waiting a stream each.
        private void readInto(ResponseBody body, long length) {
            Progress progress = new Progress();
            long read = 0;
            try (BufferedSource source = body.source()) {
                Store kept = newStore(length);
                synchronized (this) {
                    store = kept;
                }
                byte[] buffer = new byte[8192];
                while (length < 0 || read < length) {
                    int count = source.read(buffer, 0, (int) (length < 0 ? buffer.length : Math.min(buffer.length, length - read)));
                    if (count == -1) {
                        if (length < 0) break;
                        throw new EOFException("The response ended early");
                    }
                    kept.write(read, buffer, count);
                    read += count;
                    report(progress, read, length);
                }
            } catch (IOException e) {
                fail(e);
                return;
            } catch (RuntimeException | OutOfMemoryError e) {
                // E.g. no memory for OkHttp's buffers: the requests fail, and
                // the next ones start another download.
                fail(new IOException(e));
                return;
            }
            List<Waiter> waiters;
            List<SharedStream> streams = new ArrayList<>();
            Store dropped = null;
            synchronized (downloads) {
                synchronized (this) {
                    size = read;
                    ended = true;
                    silent = true;
                    waiters = takeWaiting();
                    readers += waiters.size();
                    for (int i = 0; i < waiters.size(); i++) streams.add(stream());
                    // Every request left as it ended.
                    if (readers == 0) {
                        unmap();
                        dropped = drop();
                    }
                }
            }
            release(dropped);
            stopped();
            for (int i = 0; i < waiters.size(); i++) {
                waiters.get(i).fetcher.deliver(streams.get(i), waiters.get(i).callback);
            }
        }
    }

    // A request's stream on a download's bytes, all of them there. Closing it
    // holds no connection, so it can be done on the main thread.
    private static final class SharedStream extends InputStream {
        private final Download download;
        @Nullable
        private final Store store;
        private final long size;
        private final byte[] one = new byte[1];
        // Only used by the thread reading it.
        private long position = 0;
        private volatile boolean closed = false;

        SharedStream(Download download, @Nullable Store store, long size) {
            this.download = download;
            this.store = store;
            this.size = size;
        }

        @Override
        public int read() throws IOException {
            int count = read(one, 0, 1);
            return count == -1 ? -1 : one[0] & 0xff;
        }

        @Override
        public int read(@NonNull byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (closed) throw new IOException("Canceled");
            if (position >= size || store == null) return -1;
            int read = store.read(position, buffer, offset, (int) Math.min(length, size - position));
            position += read;
            return read;
        }

        @Override
        public int available() {
            return closed ? 0 : (int) Math.min(Integer.MAX_VALUE, size - position);
        }

        @Override
        public void close() {
            synchronized (this) {
                if (closed) return;
                closed = true;
            }
            download.readerClosed();
        }
    }
}
