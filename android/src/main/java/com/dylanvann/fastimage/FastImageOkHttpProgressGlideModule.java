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
import java.util.Locale;
import java.util.concurrent.TimeUnit;

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

@GlideModule
public class FastImageOkHttpProgressGlideModule extends LibraryGlideModule {

    private static final long WEB_CACHE_SIZE = 50 * 1024 * 1024;
    // How long a download can get nothing from the server (see
    // registerComponents).
    private static final long TIMEOUT_SECONDS = 15;
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
        try (Response response = client.newCall(FastImageSharedDownloads.request(url)).execute()) {
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
                // A network interceptor, so it runs before the HTTP cache of
                // `web` images stores the response (checking it reads it).
                .addNetworkInterceptor(createNonImageInterceptor(registry, glide.getArrayPool()));
        // React Native's shared client comes with an empty cookie jar (React
        // Native only fills it in for its networking and Image clients), so
        // images were loaded without the app's cookies, unlike on iOS. Use the
        // same cookie store. A cookie jar the app set up itself is kept.
        if (sharedClient.cookieJar() instanceof CookieJarContainer) {
            builder.cookieJar(new JavaNetCookieJar(new FastImageCookieHandler()));
        }
        // React Native's shared client has no timeouts, so a download that
        // stopped (e.g. on a connection that died) never ended, and every
        // request sharing it waited. As on iOS (SDWebImage's 15 s), one that
        // gets nothing for TIMEOUT_SECONDS fails: connecting, or waiting for
        // the response or the next of its bytes. Timeouts the app gave the
        // client stay. No call timeout: a large image on a slow link can take
        // longer than any.
        if (sharedClient.connectTimeoutMillis() == 0) builder.connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        if (sharedClient.readTimeoutMillis() == 0) builder.readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        OkHttpClient client = builder.build();
        // `cache: 'web'` skips Glide's caches and relies on HTTP caching, so
        // those urls get a client with an HTTP cache (#280): one of their own,
        // not the app's (if it gave React Native's shared client one), so
        // clearDiskCache can empty it without the app's other responses.
        // Other urls are cached by Glide, so they don't use it (that would
        // store them twice).
        webCache = new Cache(new File(context.getCacheDir(), "fast-image-http-cache"), WEB_CACHE_SIZE);
        webClient = client.newBuilder().cache(webCache).build();
        registry.prepend(FastImageUrl.class, InputStream.class, new UrlLoaderFactory(client, webClient));
        FastImageSvg.register(registry, glide.getBitmapPool());
        FastImageAnimated.register(context, glide, registry);
        FastImageApng.register(registry);

        // writeToCache: local files stored under a source's key.
        registry.prepend(FastImageCacheWrite.class, InputStream.class,
                new FastImageCacheWrite.LoaderFactory(context.getApplicationContext()));
        FastImageGlide.registered(glide);
    }

    // Loads FastImage's remote images (FastImageUrls), with one download of an
    // image at a time, shared by its requests (FastImageSharedDownloads):
    // `web` ones (FastImageWebGlideUrls) with the client with the HTTP cache,
    // others with the other client. FastImageUrl isn't a GlideUrl, so Glide
    // doesn't also give these to other GlideUrl loaders, which it would try
    // after a failed load (e.g. a 404, requested again).
    private static class UrlLoaderFactory implements ModelLoaderFactory<FastImageUrl, InputStream> {
        private final OkHttpClient client;
        private final OkHttpClient webClient;

        UrlLoaderFactory(OkHttpClient client, OkHttpClient webClient) {
            this.client = client;
            this.webClient = webClient;
        }

        @NonNull
        @Override
        public ModelLoader<FastImageUrl, InputStream> build(@NonNull MultiModelLoaderFactory multiFactory) {
            return new ModelLoader<FastImageUrl, InputStream>() {
                @Override
                public LoadData<InputStream> buildLoadData(@NonNull FastImageUrl model, int width, int height, @NonNull Options options) {
                    return FastImageSharedDownloads.loadData(
                            model.url, model.url instanceof FastImageWebGlideUrl ? webClient : client);
                }

                @Override
                public boolean handles(@NonNull FastImageUrl model) {
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
}
