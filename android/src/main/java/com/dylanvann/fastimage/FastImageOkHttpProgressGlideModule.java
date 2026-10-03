package com.dylanvann.fastimage;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Registry;
import com.bumptech.glide.annotation.GlideModule;
import com.bumptech.glide.load.ImageHeaderParser;
import com.bumptech.glide.load.ImageHeaderParserUtils;
import com.bumptech.glide.load.engine.bitmap_recycle.ArrayPool;
import com.bumptech.glide.integration.okhttp3.OkHttpUrlLoader;
import com.bumptech.glide.load.Options;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.load.model.ModelLoader;
import com.bumptech.glide.load.model.ModelLoaderFactory;
import com.bumptech.glide.load.model.MultiModelLoaderFactory;
import com.bumptech.glide.module.LibraryGlideModule;
import com.facebook.react.modules.network.CookieJarContainer;
import com.facebook.react.modules.network.OkHttpClientProvider;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.WeakHashMap;

import okhttp3.Cache;
import okhttp3.HttpUrl;
import okhttp3.Interceptor;
import okhttp3.JavaNetCookieJar;
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
    // The HTTP cache of `cache: 'web'` images, once Glide has set up.
    @Nullable
    private static Cache webCache;
    // The client that loads them, with that cache.
    @Nullable
    private static OkHttpClient webClient;

    // Empties the HTTP cache of `cache: 'web'` images (clearDiskCache).
    static void clearWebCache() throws IOException {
        Cache cache = webCache;
        if (cache != null) cache.evictAll();
    }

    // Downloads a `web` image (with its headers) through the client with the
    // HTTP cache, which stores it if the server allows it (getCachePath).
    // Blocking. Glide must be set up.
    static void downloadToWebCache(GlideUrl url) throws IOException {
        OkHttpClient client = webClient;
        if (client == null) throw new IOException("Glide isn't set up");
        Request.Builder request = new Request.Builder().url(url.toStringUrl());
        for (Map.Entry<String, String> header : url.getHeaders().entrySet()) {
            request.addHeader(header.getKey(), header.getValue());
        }
        try (Response response = client.newCall(request.build()).execute()) {
            if (!response.isSuccessful()) {
                // As Glide's HttpException reports it.
                throw new IOException(response.message() + ", status code: " + response.code());
            }
            ResponseBody body = response.body();
            if (body == null) return;
            // Read to the end, so the cache stores it.
            BufferedSource source = body.source();
            Buffer buffer = new Buffer();
            while (source.read(buffer, 8192) != -1) buffer.clear();
        }
    }

    // The file with the body of url's response in the HTTP cache of
    // `cache: 'web'` images (getCachePath), or null. OkHttp has no API for it:
    // its cache stores each response as `<Cache.key(url)>.0` (headers) and
    // `.1` (body, as the server sent it) once it's complete.
    @Nullable
    static File webCacheFile(String url) {
        Cache cache = webCache;
        HttpUrl httpUrl = HttpUrl.parse(url);
        if (cache == null || httpUrl == null) return null;
        File file = new File(cache.directory(), Cache.key(httpUrl) + ".1");
        return file.isFile() ? file : null;
    }

    @Override
    public void registerComponents(
            @NonNull Context context,
            @NonNull Glide glide,
            @NonNull Registry registry
    ) {
        OkHttpClient sharedClient = OkHttpClientProvider.getOkHttpClient();
        OkHttpClient.Builder builder = sharedClient
                .newBuilder()
                .addInterceptor(createInterceptor(progressListener))
                // A network interceptor, so it runs before the HTTP cache of
                // `web` images stores the response (checking it reads it).
                .addNetworkInterceptor(createNonImageInterceptor(registry, glide.getArrayPool()));
        // React Native's shared client comes with an empty cookie jar (React
        // Native only fills it in for its networking and Image clients), so
        // images were loaded without the app's cookies, unlike on iOS. Use the
        // same cookie store. A cookie jar the app set up itself is kept.
        if (sharedClient.cookieJar() instanceof CookieJarContainer) {
            builder.cookieJar(new JavaNetCookieJar(new FastImageCookieHandler(context)));
        }
        OkHttpClient client = builder.build();
        registry.replace(GlideUrl.class, InputStream.class, new UrlLoaderFactory(client));
        FastImageSvg.register(registry, glide.getBitmapPool());
        FastImageAnimated.register(context, glide, registry);
        FastImageApng.register(registry);

        // `cache: 'web'` skips Glide's caches and relies on HTTP caching, so
        // those urls get a client with an HTTP cache (#280): one of their own,
        // not the app's (if it gave React Native's shared client one), so
        // clearDiskCache can empty it without the app's other responses.
        // Other urls are cached by Glide, so they don't use it (that would
        // store them twice).
        webCache = new Cache(new File(context.getCacheDir(), "fast-image-http-cache"), WEB_CACHE_SIZE);
        webClient = client.newBuilder().cache(webCache).build();
        registry.prepend(FastImageWebGlideUrl.class, InputStream.class, new WebUrlLoaderFactory(webClient));

        // writeToCache: local files stored under a source's key.
        registry.prepend(FastImageCacheWrite.class, InputStream.class,
                new FastImageCacheWrite.LoaderFactory(context.getApplicationContext()));
    }

    // Loads GlideUrls with the given client, except `web` ones
    // (FastImageWebGlideUrls): Glide gives a model to the loaders of its
    // superclasses too, and tries the next one when a load fails, so a `web`
    // image that failed (e.g. a 404) was requested again with this client,
    // without the HTTP cache, which also hid the failure.
    private static class UrlLoaderFactory implements ModelLoaderFactory<GlideUrl, InputStream> {
        private final OkHttpClient client;

        UrlLoaderFactory(OkHttpClient client) {
            this.client = client;
        }

        @NonNull
        @Override
        public ModelLoader<GlideUrl, InputStream> build(@NonNull MultiModelLoaderFactory multiFactory) {
            final OkHttpUrlLoader loader = new OkHttpUrlLoader(client);
            return new ModelLoader<GlideUrl, InputStream>() {
                @Override
                public LoadData<InputStream> buildLoadData(@NonNull GlideUrl model, int width, int height, @NonNull Options options) {
                    LoadData<InputStream> data = loader.buildLoadData(model, width, height, options);
                    // A view loading an image that's being preloaded waits
                    // for the preload's download.
                    return data == null ? null : FastImageSharedDownloads.share(data, model, options);
                }

                @Override
                public boolean handles(@NonNull GlideUrl model) {
                    return !(model instanceof FastImageWebGlideUrl);
                }
            };
        }

        @Override
        public void teardown() {
        }
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

    // Fails a successful response that's clearly not an image: its type isn't
    // an image's (text, JSON, XML other than SVG) and its first bytes aren't a
    // format Glide recognizes or an SVG's, e.g. a captive portal's or a proxy's HTML page
    // sent with status 200. Glide keeps the bytes it downloads in its disk
    // cache before decoding them (and doesn't remove them when that fails), as
    // does the HTTP cache of `web` images, so every later load of the url
    // would fail too. Neither caches a failed response. Images sent with the
    // wrong type still load.
    private static Interceptor createNonImageInterceptor(final Registry registry, final ArrayPool arrayPool) {
        return new Interceptor() {
            @NonNull
            @Override
            public Response intercept(@NonNull Chain chain) throws IOException {
                Response response = chain.proceed(chain.request());
                ResponseBody body = response.body();
                MediaType type = body == null ? null : body.contentType();
                if (!response.isSuccessful() || type == null || !isNotImageType(type)) {
                    return response;
                }
                ImageHeaderParser.ImageType imageType;
                try (InputStream stream = response.peekBody(64 * 1024).byteStream()) {
                    imageType = ImageHeaderParserUtils.getType(
                            registry.getImageHeaderParsers(), stream, arrayPool);
                }
                if (imageType != ImageHeaderParser.ImageType.UNKNOWN) {
                    return response;
                }
                byte[] head = response.peekBody(1024).bytes();
                if (FastImageSvg.looksLikeSvg(head, head.length)) {
                    return response;
                }
                response.close();
                throw new IOException("Not an image (Content-Type: " + type + ")");
            }
        };
    }

    private static boolean isNotImageType(MediaType type) {
        String subtype = type.subtype();
        if ("text".equalsIgnoreCase(type.type())) return true;
        if (!"application".equalsIgnoreCase(type.type())) return false;
        return subtype.equalsIgnoreCase("json")
                || subtype.toLowerCase(Locale.ROOT).endsWith("+json")
                || subtype.equalsIgnoreCase("xml")
                || subtype.equalsIgnoreCase("xhtml+xml")
                || subtype.equalsIgnoreCase("javascript");
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
