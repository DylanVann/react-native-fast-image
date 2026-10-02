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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

// Lets a view load an image that a preload is downloading from the preload's
// file, instead of downloading it again. Glide only shares a download between
// requests for the same size (and a preload loads the original size), so a
// view mounted while its image was being preloaded downloaded it a second
// time. A preload's download registers here once it has started (not while
// it's queued); a view's download of the same url then waits for the
// preload's file and reads it, and downloads as usual if the preload fails.
// A finished download stays for a while: a view's request that looked in the
// disk cache before the preload stored the file, and gets to downloading
// after, reads it too.
final class FastImageSharedDownloads {
    // Set on a preload's request (see FastImageViewModule.loadFile).
    static final Option<Boolean> PRELOAD = Option.memory("com.dylanvann.fastimage.Preload", false);

    // The longest a view waits for a preload's download, before downloading
    // the image itself.
    private static final long WAIT_MS = 30_000;
    // How long a finished download's file is used.
    private static final long KEEP_MS = 60_000;

    private static final class Download {
        final CountDownLatch done = new CountDownLatch(1);
        @Nullable
        volatile File file;
        volatile long finishedAt;

        boolean isStale(long now) {
            return done.getCount() == 0 && now - finishedAt > KEEP_MS;
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
        if (download == null || download.done.getCount() == 0) return;
        if (file == null) downloads.remove(key, download);
        download.file = file;
        download.finishedAt = now;
        download.done.countDown();
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
        // The preload's file, when the image came from it.
        @Nullable
        private InputStream stream;

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
                if (current == null || current.done.getCount() == 0) downloads.put(key, new Download());
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
            Download download = downloads.get(key);
            if (download != null && download.isStale(System.currentTimeMillis())) download = null;
            if (download != null) {
                File file = await(download);
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
            }
            fetcher.loadData(priority, callback);
        }

        // Waits (on Glide's thread) for the preload's file; null if it failed,
        // or took too long, or this load was cancelled.
        @Nullable
        private File await(Download download) {
            long end = System.currentTimeMillis() + WAIT_MS;
            try {
                while (!cancelled && System.currentTimeMillis() < end) {
                    if (download.done.await(100, TimeUnit.MILLISECONDS)) return download.file;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return null;
        }

        @Override
        public void cleanup() {
            if (stream != null) {
                try {
                    stream.close();
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
