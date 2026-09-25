package com.dylanvann.fastimage;

import android.content.Context;
import androidx.annotation.NonNull;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Registry;
import com.bumptech.glide.annotation.GlideModule;
import com.bumptech.glide.integration.okhttp3.OkHttpUrlLoader;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.ModelLoader;
import com.bumptech.glide.load.model.ModelLoaderFactory;
import com.bumptech.glide.load.model.MultiModelLoaderFactory;
import com.bumptech.glide.module.LibraryGlideModule;
import com.facebook.react.modules.network.OkHttpClientProvider;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.WeakHashMap;

import okhttp3.Cache;
import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import okio.ForwardingSource;
import okio.Okio;
import okio.Source;

@GlideModule
public class FastImageOkHttpProgressGlideModule extends LibraryGlideModule {

    private static final DispatchingProgressListener progressListener = new DispatchingProgressListener();
    private static final long WEB_CACHE_SIZE = 50 * 1024 * 1024;

    @Override
    public void registerComponents(
            @NonNull Context context,
            @NonNull Glide glide,
            @NonNull Registry registry
    ) {
        OkHttpClient client = OkHttpClientProvider
                .getOkHttpClient()
                .newBuilder()
                .addInterceptor(createInterceptor(progressListener))
                .build();
        OkHttpUrlLoader.Factory factory = new OkHttpUrlLoader.Factory(client);
        registry.replace(GlideUrl.class, InputStream.class, factory);

        // `cache: 'web'` skips Glide's caches and relies on HTTP caching, but
        // React Native's shared client has no HTTP cache (unless the app gave
        // it one), so those urls get a client with one (#280). Other urls are
        // cached by Glide, so they don't use it (that would store them twice).
        OkHttpClient webClient = client.cache() != null
                ? client
                : client.newBuilder()
                        .cache(new Cache(new File(context.getCacheDir(), "fast-image-http-cache"), WEB_CACHE_SIZE))
                        .build();
        registry.prepend(FastImageWebGlideUrl.class, InputStream.class, new WebUrlLoaderFactory(webClient));
    }

    // Loads FastImageWebGlideUrls with the given client.
    private static class WebUrlLoaderFactory implements ModelLoaderFactory<FastImageWebGlideUrl, InputStream> {
        private final OkHttpClient client;

        WebUrlLoaderFactory(OkHttpClient client) {
            this.client = client;
        }

        @NonNull
        @Override
        public ModelLoader<FastImageWebGlideUrl, InputStream> build(@NonNull MultiModelLoaderFactory multiFactory) {
            final OkHttpUrlLoader loader = new OkHttpUrlLoader(client);
            return new ModelLoader<FastImageWebGlideUrl, InputStream>() {
                @Override
                public LoadData<InputStream> buildLoadData(@NonNull FastImageWebGlideUrl model, int width, int height, @NonNull Options options) {
                    return loader.buildLoadData(model, width, height, options);
                }

                @Override
                public boolean handles(@NonNull FastImageWebGlideUrl model) {
                    return true;
                }
            };
        }

        @Override
        public void teardown() {
        }
    }

    private static Interceptor createInterceptor(final ResponseProgressListener listener) {
        return new Interceptor() {
            @Override
            public Response intercept(Chain chain) throws IOException {
                Request request = chain.request();
                Response response = chain.proceed(request);
                final String key = request.url().toString();
                return response
                        .newBuilder()
                        .body(new OkHttpProgressResponseBody(key, response.body(), listener))
                        .build();
            }
        };
    }

    static void forget(String key) {
        progressListener.forget(key);
    }

    static void expect(String key, FastImageProgressListener listener) {
        progressListener.expect(key, listener);
    }

    private interface ResponseProgressListener {
        void update(String key, long bytesRead, long contentLength);
    }

    private static class DispatchingProgressListener implements ResponseProgressListener {
        private final Map<String, FastImageProgressListener> LISTENERS = new WeakHashMap<>();
        private final Map<String, Long> PROGRESSES = new HashMap<>();

        void forget(String key) {
            LISTENERS.remove(key);
            PROGRESSES.remove(key);
        }

        void expect(String key, FastImageProgressListener listener) {
            LISTENERS.put(key, listener);
        }

        @Override
        public void update(final String key, final long bytesRead, final long contentLength) {
            final FastImageProgressListener listener = LISTENERS.get(key);
            // Without a Content-Length the total is unknown (-1), and a
            // percentage can't be worked out from it, so don't send those. (It
            // also looked like the last update, which stopped all updates.)
            if (listener == null || contentLength <= 0) {
                return;
            }
            if (contentLength <= bytesRead) {
                forget(key);
            }
            if (needsDispatch(key, bytesRead, contentLength, listener.getGranularityPercentage())) {
                listener.onProgress(key, bytesRead, contentLength);
            }
        }

        private boolean needsDispatch(String key, long current, long total, float granularity) {
            if (granularity == 0 || current == 0 || total == current) {
                return true;
            }
            float percent = 100f * current / total;
            long currentProgress = (long) (percent / granularity);
            Long lastProgress = PROGRESSES.get(key);
            if (lastProgress == null || currentProgress != lastProgress) {
                PROGRESSES.put(key, currentProgress);
                return true;
            } else {
                return false;
            }
        }
    }

    private static class OkHttpProgressResponseBody extends ResponseBody {
        private final String key;
        private final ResponseBody responseBody;
        private final ResponseProgressListener progressListener;
        private BufferedSource bufferedSource;

        OkHttpProgressResponseBody(
                String key,
                ResponseBody responseBody,
                ResponseProgressListener progressListener
        ) {
            this.key = key;
            this.responseBody = responseBody;
            this.progressListener = progressListener;
        }

        @Override
        public MediaType contentType() {
            return responseBody.contentType();
        }

        @Override
        public long contentLength() {
            return responseBody.contentLength();
        }

        @Override
        public BufferedSource source() {
            if (bufferedSource == null) {
                bufferedSource = Okio.buffer(source(responseBody.source()));
            }
            return bufferedSource;
        }

        private Source source(Source source) {
            return new ForwardingSource(source) {
                long totalBytesRead = 0L;

                @Override
                public long read(Buffer sink, long byteCount) throws IOException {
                    long bytesRead = super.read(sink, byteCount);
                    long fullLength = responseBody.contentLength();
                    if (bytesRead == -1) {
                        // this source is exhausted
                        totalBytesRead = fullLength;
                    } else {
                        totalBytesRead += bytesRead;
                    }
                    progressListener.update(key, totalBytesRead, fullLength);
                    return bytesRead;
                }
            };
        }
    }
}
