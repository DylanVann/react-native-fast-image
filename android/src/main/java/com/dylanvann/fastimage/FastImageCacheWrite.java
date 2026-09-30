package com.dylanvann.fastimage;

import android.content.Context;
import android.net.Uri;

import androidx.annotation.NonNull;

import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.data.DataFetcher;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.ModelLoader;
import com.bumptech.glide.load.model.ModelLoaderFactory;
import com.bumptech.glide.load.model.MultiModelLoaderFactory;

import java.io.IOException;
import java.io.InputStream;

// What writeToCache loads: a local file's bytes (file:// or content://), with
// a source's GlideUrl as their key, so Glide stores them in its disk cache
// where loads of the source find them (the disk key is the url's cache key:
// the source's cacheKey or url).
final class FastImageCacheWrite {
    final GlideUrl key;
    final Uri file;

    FastImageCacheWrite(GlideUrl key, Uri file) {
        this.key = key;
        this.file = file;
    }

    static final class LoaderFactory implements ModelLoaderFactory<FastImageCacheWrite, InputStream> {
        private final Context context;

        LoaderFactory(Context context) {
            this.context = context;
        }

        @NonNull
        @Override
        public ModelLoader<FastImageCacheWrite, InputStream> build(@NonNull MultiModelLoaderFactory multiFactory) {
            return new ModelLoader<FastImageCacheWrite, InputStream>() {
                @Override
                public LoadData<InputStream> buildLoadData(@NonNull FastImageCacheWrite model, int width, int height, @NonNull Options options) {
                    return new LoadData<>(model.key, new Fetcher(context, model.file));
                }

                @Override
                public boolean handles(@NonNull FastImageCacheWrite model) {
                    return true;
                }
            };
        }

        @Override
        public void teardown() {
        }
    }

    private static final class Fetcher implements DataFetcher<InputStream> {
        private final Context context;
        private final Uri file;
        private InputStream stream;

        Fetcher(Context context, Uri file) {
            this.context = context;
            this.file = file;
        }

        @Override
        public void loadData(@NonNull Priority priority, @NonNull DataCallback<? super InputStream> callback) {
            try {
                stream = context.getContentResolver().openInputStream(file);
                if (stream == null) throw new IOException("Can't read " + file);
                callback.onDataReady(stream);
            } catch (IOException | SecurityException e) {
                callback.onLoadFailed(e);
            }
        }

        @Override
        public void cleanup() {
            if (stream == null) return;
            try {
                stream.close();
            } catch (IOException e) {
                // Closed as far as it could.
            }
            stream = null;
        }

        @Override
        public void cancel() {
        }

        @NonNull
        @Override
        public Class<InputStream> getDataClass() {
            return InputStream.class;
        }

        // Not DATA_DISK_CACHE or MEMORY_CACHE, which DiskCacheStrategy.DATA
        // doesn't store.
        @NonNull
        @Override
        public DataSource getDataSource() {
            return DataSource.LOCAL;
        }
    }
}
