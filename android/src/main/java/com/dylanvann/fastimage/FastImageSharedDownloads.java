package com.dylanvann.fastimage;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.Option;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.ModelLoader;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

// Lets a view load an image that a preload is downloading from the preload's
// file, instead of downloading it again. Glide only shares a download between
// requests for the same size (and a preload loads the original size), so a
// view mounted while its image was being preloaded downloaded it a second
// time. A preload's download registers here once it has started (not while
// it's queued); a view's download of the same url then waits for the
// preload's file and reads it, and downloads as usual if the preload fails.
// The wait holds no thread: the view's fetch returns, and goes on when the
// preload has finished, as an OkHttp download does. A finished download stays
// for a while: a view's request that looked in the disk cache before the
// preload stored the file, and gets to downloading after, reads it too.
final class FastImageSharedDownloads {
    // Set on a preload's request (see FastImageViewModule.loadFile).
    static final Option<Boolean> PRELOAD = Option.memory("com.dylanvann.fastimage.Preload", false);

    // The longest a view waits for a preload's download, before downloading
    // the image itself.
    private static final long WAIT_MS = 30_000;
    // How long a finished download's file is used.
    private static final long KEEP_MS = 60_000;

    // Goes on with waiting views (opening the file, or starting their own
    // download), off the main thread, where preloads finish.
    private static final ScheduledExecutorService executor =
            Executors.newSingleThreadScheduledExecutor(new ThreadFactory() {
                @Override
                public Thread newThread(@NonNull Runnable runnable) {
                    Thread thread = new Thread(runnable, "FastImageSharedDownloads");
                    thread.setDaemon(true);
                    return thread;
                }
            });

    // A view's fetch waiting for a download. It goes on once: with the file,
    // or without it (the preload failed, or took too long).
    private static final class Waiter {
        private final Fetcher fetcher;
        private final Priority priority;
        private final DataFetcher.DataCallback<? super InputStream> callback;
        private final AtomicBoolean went = new AtomicBoolean();

        Waiter(Fetcher fetcher, Priority priority, DataFetcher.DataCallback<? super InputStream> callback) {
            this.fetcher = fetcher;
            this.priority = priority;
            this.callback = callback;
        }

        void go(@Nullable File file) {
            if (went.compareAndSet(false, true)) fetcher.resume(file, priority, callback);
        }

        // Cancelled: never goes on.
        void drop() {
            went.set(true);
        }
    }

    private static final class Download {
        // Guarded by this.
        private boolean done;
        private final List<Waiter> waiters = new ArrayList<>();
        @Nullable
        volatile File file;
        volatile long finishedAt;

        synchronized boolean isDone() {
            return done;
        }

        boolean isStale(long now) {
            return isDone() && now - finishedAt > KEEP_MS;
        }

        void await(final Waiter waiter) {
            synchronized (this) {
                if (!done) {
                    waiters.add(waiter);
                    executor.schedule(new Runnable() {
                        @Override
                        public void run() {
                            remove(waiter);
                            waiter.go(null);
                        }
                    }, WAIT_MS, TimeUnit.MILLISECONDS);
                    return;
                }
            }
            goOn(waiter, file);
        }

        synchronized void remove(Waiter waiter) {
            waiters.remove(waiter);
        }

        // Returns false if it had finished already.
        boolean finish(@Nullable File file, long now) {
            List<Waiter> waiting;
            synchronized (this) {
                if (done) return false;
                done = true;
                this.file = file;
                finishedAt = now;
                waiting = new ArrayList<>(waiters);
                waiters.clear();
            }
            for (Waiter waiter : waiting) goOn(waiter, file);
            return true;
        }

        private static void goOn(final Waiter waiter, @Nullable final File file) {
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    waiter.go(file);
                }
            });
        }
    }

    // Preloads' downloads in progress, or finished with their file, by the
    // url's cache key.
    private static final ConcurrentHashMap<String, Download> downloads = new ConcurrentHashMap<>();

    private FastImageSharedDownloads() {
    }

    // A preload's download of the image with this cache key has ended: with
    // its file in Glide's disk cache, or null if it failed or was cancelled.
    // Views waiting for it go on.
    static void finished(String key, @Nullable File file) {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Download> entry : downloads.entrySet()) {
            if (entry.getValue().isStale(now)) downloads.remove(entry.getKey(), entry.getValue());
        }
        Download download = downloads.get(key);
        if (download == null) return;
        if (download.finish(file, now) && file == null) downloads.remove(key, download);
    }

    // The url loader's load data, with a fetcher that shares preloads'
    // downloads.
    static ModelLoader.LoadData<InputStream> share(
            ModelLoader.LoadData<InputStream> data, GlideUrl model, Options options) {
        boolean preload = Boolean.TRUE.equals(options.get(PRELOAD));
        return new ModelLoader.LoadData<>(
                data.sourceKey,
                data.alternateKeys,
                new Fetcher(data.fetcher, model.getCacheKey(), preload));
    }

    private static final class Fetcher implements DataFetcher<InputStream> {
        private final DataFetcher<InputStream> fetcher;
        private final String key;
        private final boolean preload;
        private volatile boolean cancelled;
        // While it waits for a preload's download.
        @Nullable
        private volatile Download download;
        @Nullable
        private volatile Waiter waiter;
        // The preload's file, when the image came from it.
        @Nullable
        private volatile InputStream stream;

        Fetcher(DataFetcher<InputStream> fetcher, String key, boolean preload) {
            this.fetcher = fetcher;
            this.key = key;
            this.preload = preload;
        }

        @Override
        public void loadData(@NonNull Priority priority, @NonNull final DataCallback<? super InputStream> callback) {
            if (preload) {
                // A second preload of the url (with other options) keeps the
                // first's entry while it's downloading; one after it finished
                // downloads again (the file left the disk cache).
                Download current = downloads.get(key);
                if (current == null || current.isDone()) downloads.put(key, new Download());
                fetcher.loadData(priority, new DataCallback<InputStream>() {
                    @Override
                    public void onDataReady(@Nullable InputStream data) {
                        callback.onDataReady(data);
                    }

                    @Override
                    public void onLoadFailed(@NonNull Exception e) {
                        finished(key, null);
                        callback.onLoadFailed(e);
                    }
                });
                return;
            }
            Download current = downloads.get(key);
            if (current == null || current.isStale(System.currentTimeMillis())) {
                fetcher.loadData(priority, callback);
                return;
            }
            Waiter waiting = new Waiter(this, priority, callback);
            download = current;
            waiter = waiting;
            current.await(waiting);
        }

        // Goes on after waiting: reads the preload's file, or downloads the
        // image if there's none.
        void resume(@Nullable File file, Priority priority, DataCallback<? super InputStream> callback) {
            download = null;
            waiter = null;
            if (cancelled) return;
            if (file != null) {
                try {
                    stream = new FileInputStream(file);
                    callback.onDataReady(stream);
                    return;
                } catch (IOException e) {
                    // Gone from the disk cache meanwhile: download it.
                }
            }
            fetcher.loadData(priority, callback);
        }

        @Override
        public void cleanup() {
            InputStream opened = stream;
            if (opened != null) {
                try {
                    opened.close();
                } catch (IOException e) {
                    // Closed as far as it could.
                }
                stream = null;
            }
            fetcher.cleanup();
        }

        @Override
        public void cancel() {
            cancelled = true;
            Download waitingFor = download;
            Waiter waiting = waiter;
            if (waitingFor != null && waiting != null) {
                waitingFor.remove(waiting);
                waiting.drop();
            }
            // The preload's download stops: views waiting for it download
            // the image themselves.
            if (preload) finished(key, null);
            fetcher.cancel();
        }

        @NonNull
        @Override
        public Class<InputStream> getDataClass() {
            return InputStream.class;
        }

        // From the preload's file: as from Glide's disk cache, which it is in,
        // so Glide doesn't store it there again.
        @NonNull
        @Override
        public DataSource getDataSource() {
            return stream != null ? DataSource.DATA_DISK_CACHE : fetcher.getDataSource();
        }
    }
}
