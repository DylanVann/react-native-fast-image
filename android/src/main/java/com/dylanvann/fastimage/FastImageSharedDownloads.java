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
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;

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
// a preload downloads it, downloaded it again. Downloads are keyed by the
// url's cache key (key()), which progress is sent by too
// (FastImageViewManager.onDownloadProgress).
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
// does, and the others download it themselves.
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

    // Downloads in progress, and finished ones still being read, by key.
    // Guards the downloads' sharing (taken before a download's own lock).
    private static final Map<String, Download> downloads = new HashMap<>();
    // Bytes held for shared downloads (guarded by downloads).
    private static long held = 0;

    private static final ExecutorService reading =
            Executors.newCachedThreadPool(new ThreadFactory() {
                @Override
                public Thread newThread(@NonNull Runnable runnable) {
                    Thread thread = new Thread(runnable, "FastImageDownload");
                    thread.setDaemon(true);
                    return thread;
                }
            });

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

    // The key downloads are shared, and their progress sent, by: the url's
    // cache key (the url, or the source's cacheKey), which is also what Glide
    // caches the image under, and shares loads of a keyed url by.
    static String key(GlideUrl url) {
        return url.getCacheKey();
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

    // As Glide's OkHttp fetcher requests it.
    private static Request request(GlideUrl url) {
        Request.Builder builder = new Request.Builder().url(url.toStringUrl());
        for (Map.Entry<String, String> header : url.getHeaders().entrySet()) {
            builder.addHeader(header.getKey(), header.getValue());
        }
        return builder.build();
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
        private final String key;
        private long lastStep = -1;

        Progress(String key) {
            this.key = key;
        }

        void report(long loaded, long total) {
            // Without a Content-Length the total is unknown (-1), and a
            // fraction can't be worked out from it, so don't send those.
            if (total <= 0) return;
            long sent = Math.min(loaded, total);
            long step = sent * PROGRESS_STEPS / total;
            if (step == lastStep) return;
            lastStep = step;
            // Only notes it, under a lock, and posts it to the UI thread:
            // nothing thrown from here fails the download.
            FastImageViewManager.onDownloadProgress(key, sent, total);
        }
    }

    // A request's fetch: joins its key's download.
    private static final class Fetcher implements DataFetcher<InputStream> {
        final GlideUrl url;
        final OkHttpClient client;
        final String key;
        private volatile boolean cancelled;
        // The download it waits for, or reads.
        @Nullable
        volatile Download download;
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
            File file = finishedFile(key);
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

        // From the download, outside its locks.
        void deliver(InputStream data, DataCallback<? super InputStream> callback) {
            stream = data;
            // Cancelled meanwhile: Glide won't read or close it.
            if (cancelled) {
                closeQuietly(data);
                return;
            }
            callback.onDataReady(data);
        }

        @Override
        public void cleanup() {
            InputStream opened = stream;
            if (opened != null) closeQuietly(opened);
        }

        @Override
        public void cancel() {
            cancelled = true;
            Download waitingFor = download;
            if (waitingFor != null) waitingFor.leave(this);
            InputStream opened = stream;
            if (opened != null) closeQuietly(opened);
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
        // The response has ended: all of it read, or with an error.
        private boolean ended = false;
        @Nullable
        private IOException error;

        private Download(String key, Call call) {
            this.key = key;
            this.call = call;
        }

        // Joins the fetcher's key's download, or starts one.
        static void join(Fetcher fetcher, DataFetcher.DataCallback<? super InputStream> callback) {
            Download download;
            boolean start = false;
            InputStream ready = null;
            synchronized (downloads) {
                download = downloads.get(fetcher.key);
                if (download == null) {
                    download = new Download(fetcher.key, fetcher.client.newCall(request(fetcher.url)));
                    downloads.put(fetcher.key, download);
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

        // With downloads and this locked: new requests start another download.
        private void unmap() {
            if (downloads.get(key) == this) downloads.remove(key);
        }

        // A request was cancelled. With no one left, the download is too.
        void leave(Fetcher fetcher) {
            boolean cancel = false;
            synchronized (downloads) {
                synchronized (this) {
                    for (int i = waiting.size() - 1; i >= 0; i--) {
                        if (waiting.get(i).fetcher == fetcher) waiting.remove(i);
                    }
                    if (!ended && readers == 0 && waiting.isEmpty()) {
                        unmap();
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
                        cancel = true;
                    } else if (data != null) {
                        held -= data.length;
                        data = null;
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
        private void fail(IOException e) {
            List<Waiter> failed;
            synchronized (downloads) {
                synchronized (this) {
                    unmap();
                    if (error == null) error = e;
                    ended = true;
                    failed = new ArrayList<>(waiting);
                    waiting.clear();
                    notifyAll();
                    if (readers == 0 && data != null) {
                        held -= data.length;
                        data = null;
                    }
                }
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
            List<Waiter> waiters;
            boolean shared;
            synchronized (downloads) {
                synchronized (this) {
                    shared = !waiting.isEmpty() && length >= 0 && held + length <= BUDGET;
                    waiters = new ArrayList<>(waiting);
                    waiting.clear();
                    if (shared) {
                        held += length;
                        data = new byte[(int) length];
                        readers += waiters.size();
                    } else {
                        unmap();
                        ended = true;
                    }
                }
            }
            if (!shared) {
                readDirectly(body, length, waiters);
                return;
            }
            for (Waiter waiter : waiters) waiter.fetcher.deliver(new SharedStream(this), waiter.callback);
            reading.execute(new Runnable() {
                @Override
                public void run() {
                    readInto(body, (int) length);
                }
            });
        }

        // Not shared: the first request reads the response from OkHttp, and
        // the others download the image again (together, if they can).
        private void readDirectly(ResponseBody body, long length, List<Waiter> waiters) {
            if (waiters.isEmpty()) {
                body.close();
                return;
            }
            Waiter first = waiters.get(0);
            InputStream stream = ContentLengthInputStream.obtain(
                    Okio.buffer(withProgress(body.source(), length)).inputStream(), length);
            first.fetcher.deliver(stream, first.callback);
            for (int i = 1; i < waiters.size(); i++) {
                join(waiters.get(i).fetcher, waiters.get(i).callback);
            }
        }

        private Source withProgress(Source source, final long length) {
            final Progress progress = new Progress(key);
            return new ForwardingSource(source) {
                long read = 0;

                @Override
                public long read(@NonNull Buffer sink, long byteCount) throws IOException {
                    long bytes = super.read(sink, byteCount);
                    read = bytes == -1 ? length : read + bytes;
                    progress.report(read, length);
                    return bytes;
                }
            };
        }

        // Reads the response into data, on a thread of `reading`.
        private void readInto(ResponseBody body, int length) {
            Progress progress = new Progress(key);
            byte[] bytes;
            synchronized (this) {
                bytes = data;
            }
            int read = 0;
            try (BufferedSource source = body.source()) {
                while (read < length && bytes != null) {
                    int count = source.read(bytes, read, Math.min(length - read, 8192));
                    if (count == -1) throw new EOFException("The response ended early");
                    read += count;
                    synchronized (this) {
                        size = read;
                        notifyAll();
                    }
                    progress.report(read, length);
                }
            } catch (IOException e) {
                fail(e);
                return;
            }
            synchronized (this) {
                ended = true;
                notifyAll();
            }
        }
    }

    // A request's stream on a shared download's bytes, from the start: it
    // waits for the ones still coming.
    private static final class SharedStream extends InputStream {
        private final Download download;
        private int position = 0;
        private boolean closed = false;

        SharedStream(Download download) {
            this.download = download;
        }

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            int count = read(one, 0, 1);
            return count == -1 ? -1 : one[0] & 0xff;
        }

        @Override
        public int read(@NonNull byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
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
                byte[] bytes = download.data;
                if (position < download.size && bytes != null) {
                    int count = Math.min(length, download.size - position);
                    System.arraycopy(bytes, position, buffer, offset, count);
                    position += count;
                    return count;
                }
                IOException error = download.error;
                if (error != null) throw new IOException(error.getMessage(), error);
                return -1;
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
