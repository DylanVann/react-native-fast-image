package com.dylanvann.fastimage;

import android.app.Activity;
import android.content.Context;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Drawable;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.ImageHeaderParser;
import com.bumptech.glide.load.ImageHeaderParserUtils;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.load.model.GlideUrl;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.RequestOptions;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

class FastImageViewModule extends ReactContextBaseJavaModule {

    private static final String REACT_CLASS = "FastImageView";

    FastImageViewModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    // At most this many preloaded sources load at a time, across all preload
    // calls (the same as SDWebImagePrefetcher's default on iOS), so a long
    // list doesn't queue hundreds of requests ahead of the images the app is
    // showing (Glide's executors run requests in order within a priority).
    private static final int PRELOAD_LIMIT = 3;
    // Preloads waiting to start, in the order they were added, and the number
    // loading. Only used on the UI thread (Glide calls its listeners there).
    private static final ArrayDeque<Runnable> pendingPreloads = new ArrayDeque<>();
    private static int preloadsInFlight = 0;

    // Starts pending preloads while there's room. A listener calls it again,
    // sometimes from inside run() (Glide reports a memory-cached image
    // synchronously from preload()). That's fine: the counters are shared and
    // updated before each run(), so the inner call starts what fits, and the
    // outer loop sees the updated counters when it checks again.
    private static void startPendingPreloads() {
        while (preloadsInFlight < PRELOAD_LIMIT && !pendingPreloads.isEmpty()) {
            preloadsInFlight++;
            pendingPreloads.poll().run();
        }
    }

    // Reads the size of images preloaded to disk only, off the UI thread.
    private static final Executor sizeExecutor = Executors.newSingleThreadExecutor();

    // The image's size from its file's header, as a decoded image has it (with
    // its EXIF orientation), or null if it can't be read.
    @Nullable
    private static int[] imageSize(Context context, File file) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        int orientation = ImageHeaderParser.UNKNOWN_ORIENTATION;
        Glide glide = Glide.get(context);
        try (InputStream stream = new FileInputStream(file)) {
            orientation = ImageHeaderParserUtils.getOrientation(
                    glide.getRegistry().getImageHeaderParsers(), stream, glide.getArrayPool());
        } catch (IOException e) {
            // Taken as not rotated.
        }
        // 5 to 8 turn the image by 90 degrees.
        boolean transposed = orientation >= 5 && orientation <= 8;
        return transposed
                ? new int[] {bounds.outHeight, bounds.outWidth}
                : new int[] {bounds.outWidth, bounds.outHeight};
    }

    private static WritableMap success(int width, int height) {
        WritableMap result = Arguments.createMap();
        result.putBoolean("ok", true);
        result.putInt("width", width);
        result.putInt("height", height);
        return result;
    }

    // Resolves with a result per source, in order, once all have loaded or
    // failed: { ok, width, height } or { ok: false, error }. Never rejects.
    // A remote source with memoryCache false is only downloaded to the disk
    // cache, without decoding it (its size comes from the header).
    @ReactMethod
    public void preload(final ReadableArray sources, final Promise promise) {
        final ReactApplicationContext context = getReactApplicationContext();
        UiThreadUtil.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                final int count = sources.size();
                final WritableMap[] results = new WritableMap[count];
                // Sources of this call still to finish. It starts at the
                // number of sources, so the promise can't resolve before
                // they've all been added.
                final int[] remaining = {count};
                final Runnable finishOne = new Runnable() {
                    @Override
                    public void run() {
                        if (--remaining[0] > 0) return;
                        WritableArray array = Arguments.createArray();
                        for (WritableMap result : results) array.pushMap(result);
                        promise.resolve(array);
                    }
                };
                for (int i = 0; i < count; i++) {
                    final int index = i;
                    final ReadableMap source = sources.isNull(i) ? null : sources.getMap(i);
                    // Glide throws on an empty url. Invalid sources fail
                    // without taking a slot.
                    if (!FastImageViewConverter.hasUri(source)) {
                        results[i] = failure("Invalid source: no uri");
                        finishOne.run();
                        continue;
                    }
                    final FastImageSource imageSource = FastImageViewConverter.getImageSource(context, source);
                    // A uri that can't be resolved (e.g. a relative path) resolves
                    // to an empty one.
                    if (imageSource.getUri().toString().isEmpty()) {
                        results[i] = failure("Invalid source: can't resolve " + source.getString("uri"));
                        finishOne.run();
                        continue;
                    }
                    final RequestOptions preloadOptions = preloadOptions(context, imageSource, source);
                    // A source's result, which frees its slot.
                    final ResultCallback done = new ResultCallback() {
                        @Override
                        public void run(WritableMap result) {
                            results[index] = result;
                            preloadsInFlight--;
                            finishOne.run();
                            startPendingPreloads();
                        }
                    };
                    // Remote images (web ones are in the HTTP cache instead,
                    // and local ones are already on disk).
                    if (!imageSource.isMemoryCache() && !imageSource.isWebCache() && imageSource.isRemote()) {
                        pendingPreloads.add(new Runnable() {
                            @Override
                            public void run() {
                                loadFile(context, imageSource.getSourceForLoad(), preloadOptions, new FileCallback() {
                                    @Override
                                    public void run(@Nullable final File file, @Nullable String error) {
                                        if (file == null) {
                                            done.run(failure(error));
                                            return;
                                        }
                                        sizeExecutor.execute(new Runnable() {
                                            @Override
                                            public void run() {
                                                final int[] size = imageSize(context, file);
                                                UiThreadUtil.runOnUiThread(new Runnable() {
                                                    @Override
                                                    public void run() {
                                                        done.run(size != null
                                                                ? success(size[0], size[1])
                                                                : failure("Failed to read the image's size"));
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                        continue;
                    }
                    pendingPreloads.add(new Runnable() {
                        @Override
                        public void run() {
                            Glide
                                    .with(context)
                                    // Load it the way the view does, so local images
                                    // (file://, content://, asset:/) work too.
                                    .load(imageSource.getSourceForLoad())
                                    .apply(preloadOptions)
                                    .listener(new RequestListener<Drawable>() {
                                        @Override
                                        public boolean onLoadFailed(@Nullable GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
                                            done.run(failure(FastImageRequestListener.errorMessage(e)));
                                            return false;
                                        }

                                        @Override
                                        public boolean onResourceReady(Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
                                            // Preloaded at its original size, so this is
                                            // the image's own size.
                                            done.run(success(resource.getIntrinsicWidth(), resource.getIntrinsicHeight()));
                                            return false;
                                        }
                                    })
                                    .preload();
                        }
                    });
                }
                if (count == 0) {
                    promise.resolve(Arguments.createArray());
                    return;
                }
                startPendingPreloads();
            }
        });
    }

    private interface ResultCallback {
        void run(WritableMap result);
    }

    // A preload's options: low priority unless the source sets one, as on
    // iOS (the prefetcher's options), so the images the app shows load first.
    private static RequestOptions preloadOptions(Context context, FastImageSource imageSource, ReadableMap source) {
        RequestOptions options = FastImageViewConverter.getOptions(context, imageSource, source);
        return source.hasKey("priority") && !source.isNull("priority") ? options : options.priority(Priority.LOW);
    }

    private interface FileCallback {
        void run(@Nullable File file, @Nullable String error);
    }

    // Downloads the image into Glide's disk cache without decoding it (if it
    // isn't there), then calls back with its file or the error, on the UI
    // thread.
    private static void loadFile(Context context, Object model, RequestOptions options, final FileCallback callback) {
        Glide.with(context)
                .asFile()
                .load(model)
                .apply(options)
                .listener(new RequestListener<File>() {
                    @Override
                    public boolean onLoadFailed(@Nullable GlideException e, Object model, Target<File> target, boolean isFirstResource) {
                        callback.run(null, FastImageRequestListener.errorMessage(e));
                        return false;
                    }

                    @Override
                    public boolean onResourceReady(File file, Object model, Target<File> target, DataSource dataSource, boolean isFirstResource) {
                        callback.run(file, null);
                        return false;
                    }
                })
                .preload();
    }

    // The file of the image in Glide's disk cache, or null. Blocking.
    @Nullable
    private static File cachedFile(Context context, Object model, RequestOptions options) {
        try {
            return Glide.with(context)
                    .asFile()
                    .load(model)
                    .apply(options)
                    .onlyRetrieveFromCache(true)
                    .submit()
                    .get();
        } catch (Exception e) {
            return null;
        }
    }

    private static WritableMap failure(String error) {
        WritableMap result = Arguments.createMap();
        result.putBoolean("ok", false);
        result.putString("error", error);
        return result;
    }

    // Where getCachePath looks in the caches and downloads `web` images
    // (blocking calls, off the UI and modules threads).
    private static final Executor cachePathExecutor = Executors.newSingleThreadExecutor();

    private static WritableMap pathResult(File file) {
        WritableMap result = Arguments.createMap();
        result.putBoolean("ok", true);
        result.putString("path", file.getAbsolutePath());
        return result;
    }

    // The source's downloaded file in the disk cache, downloading it first if
    // it isn't there (without decoding it or keeping it in memory, and in the
    // preloads' queue): { ok, path } or { ok: false, error }. Never rejects.
    // With `cacheOnly`, or a cacheKey without a uri, it doesn't download. A
    // local file is its own path.
    @ReactMethod
    public void getCachePath(final ReadableMap source, final Promise promise) {
        final ReactApplicationContext context = getReactApplicationContext();
        if (!FastImageViewConverter.hasUri(source)) {
            // `web` images ignore cacheKey.
            final String cacheKey = FastImageViewConverter.getCacheControl(source) == FastImageCacheControl.WEB
                    ? null
                    : FastImageViewConverter.getCacheKey(source);
            if (cacheKey == null) {
                promise.resolve(failure("Invalid source: no uri or cacheKey"));
                return;
            }
            cachePathExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    File file = cachedFile(context, FastImageKeyedGlideUrl.forKey(cacheKey), new RequestOptions());
                    promise.resolve(file != null ? pathResult(file) : failure("Not in the disk cache"));
                }
            });
            return;
        }
        final FastImageSource imageSource = FastImageViewConverter.getImageSource(context, source);
        if (imageSource.getUri().toString().isEmpty()) {
            promise.resolve(failure("Invalid source: can't resolve " + source.getString("uri")));
            return;
        }
        if ("file".equalsIgnoreCase(imageSource.getUri().getScheme())) {
            File file = new File(imageSource.getUri().getPath());
            promise.resolve(file.isFile() ? pathResult(file) : failure("No file at this uri"));
            return;
        }
        if (!imageSource.isRemote()) {
            // content://, a resource or a data uri: there's no file to give.
            promise.resolve(failure("Not a remote image"));
            return;
        }
        final boolean cacheOnly = FastImageViewConverter.getCacheControl(source) == FastImageCacheControl.CACHE_ONLY;
        final RequestOptions options = preloadOptions(context, imageSource, source);
        cachePathExecutor.execute(new Runnable() {
            @Override
            public void run() {
                // On disk already: in Glide's cache (not for `web` images,
                // which it doesn't cache), or in the HTTP cache of `web`
                // images (set up by Glide, which is started first).
                Glide.get(context);
                File file = imageSource.isWebCache() ? null : cachedFile(context, imageSource.getSourceForLoad(), options);
                if (file == null) file = FastImageOkHttpProgressGlideModule.webCacheFile(imageSource.getUri().toString());
                if (file != null) {
                    promise.resolve(pathResult(file));
                    return;
                }
                if (cacheOnly) {
                    promise.resolve(failure("Not in the disk cache"));
                    return;
                }
                UiThreadUtil.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        pendingPreloads.add(imageSource.isWebCache()
                                ? downloadToWebCache(imageSource, promise)
                                : downloadToDiskCache(context, imageSource, options, promise));
                        startPendingPreloads();
                    }
                });
            }
        });
    }

    // Frees a preload slot (on the UI thread) and resolves.
    private static void finishDownload(final Promise promise, final WritableMap result) {
        UiThreadUtil.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                preloadsInFlight--;
                startPendingPreloads();
                promise.resolve(result);
            }
        });
    }

    // Downloads the image into Glide's disk cache (as a disk-only preload).
    private static Runnable downloadToDiskCache(
            final Context context,
            final FastImageSource imageSource,
            final RequestOptions options,
            final Promise promise) {
        return new Runnable() {
            @Override
            public void run() {
                loadFile(context, imageSource.getSourceForLoad(), options, new FileCallback() {
                    @Override
                    public void run(@Nullable File file, @Nullable String error) {
                        finishDownload(promise, file != null ? pathResult(file) : failure(error));
                    }
                });
            }
        };
    }

    // Downloads a `web` image into its HTTP cache, which keeps it only if the
    // server allows caching it.
    private static Runnable downloadToWebCache(final FastImageSource imageSource, final Promise promise) {
        return new Runnable() {
            @Override
            public void run() {
                cachePathExecutor.execute(new Runnable() {
                    @Override
                    public void run() {
                        WritableMap result;
                        try {
                            FastImageOkHttpProgressGlideModule.downloadToWebCache(imageSource.getGlideUrl());
                            File file = FastImageOkHttpProgressGlideModule.webCacheFile(imageSource.getUri().toString());
                            result = file != null
                                    ? pathResult(file)
                                    : failure("Not stored in the disk cache (the server doesn't allow caching it)");
                        } catch (IOException e) {
                            result = failure(e.getMessage() != null ? e.getMessage() : e.toString());
                        }
                        finishDownload(promise, result);
                    }
                });
            }
        };
    }

    // Stores a local image file (file:// or content://) as the source's image
    // in Glide's disk cache, so views and preloads of the source load it
    // without downloading it, and resolves with its cached file: { ok, path }
    // or { ok: false, error }. Never rejects. It doesn't replace an image
    // that's already cached (Glide can't: a new image should get a new
    // cacheKey), and doesn't store `web` sources (kept only in an HTTP cache,
    // which can't be added to).
    @ReactMethod
    public void writeToCache(final ReadableMap source, final String file, final Promise promise) {
        final ReactApplicationContext context = getReactApplicationContext();
        if (FastImageViewConverter.getCacheControl(source) == FastImageCacheControl.WEB) {
            promise.resolve(failure("Can't store cache: 'web' images (they're kept in an HTTP cache)"));
            return;
        }
        final FastImageSource imageSource = FastImageViewConverter.hasUri(source)
                ? FastImageViewConverter.getImageSource(context, source)
                : null;
        // A cacheKey is enough (the image doesn't need a url yet); otherwise a
        // remote url.
        final String cacheKey = FastImageViewConverter.getCacheKey(source);
        if (cacheKey == null && (imageSource == null || !imageSource.isRemote())) {
            promise.resolve(failure("Invalid source: no remote uri or cacheKey"));
            return;
        }
        // What the image is cached under, and how the source looks it up.
        final GlideUrl key = imageSource != null && imageSource.isRemote()
                ? imageSource.getGlideUrl()
                : FastImageKeyedGlideUrl.forKey(cacheKey);
        final Object lookUp = imageSource != null && imageSource.isRemote() ? imageSource.getSourceForLoad() : key;
        // A file:// or content:// uri, or a path.
        Uri parsed = Uri.parse(file);
        final Uri fileUri = parsed.getScheme() == null ? Uri.fromFile(new File(file)) : parsed;
        if (!"file".equalsIgnoreCase(fileUri.getScheme()) && !"content".equalsIgnoreCase(fileUri.getScheme())) {
            promise.resolve(failure("Not a local file"));
            return;
        }
        cachePathExecutor.execute(new Runnable() {
            @Override
            public void run() {
                if (cachedFile(context, lookUp, new RequestOptions()) != null) {
                    promise.resolve(failure("Already in the disk cache"));
                    return;
                }
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                try (InputStream stream = context.getContentResolver().openInputStream(fileUri)) {
                    if (stream == null) throw new IOException();
                    BitmapFactory.decodeStream(stream, null, bounds);
                } catch (IOException | SecurityException e) {
                    promise.resolve(failure("Can't read the file"));
                    return;
                }
                // The platform's decoders (so HEIF too, where Android has
                // them), as a view's would decode it.
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
                    promise.resolve(failure("Not an image"));
                    return;
                }
                try {
                    File cached = Glide.with(context)
                            .asFile()
                            .load(new FastImageCacheWrite(key, fileUri))
                            .diskCacheStrategy(DiskCacheStrategy.DATA)
                            .skipMemoryCache(true)
                            .submit()
                            .get();
                    promise.resolve(pathResult(cached));
                } catch (Exception e) {
                    promise.resolve(failure("Couldn't store it: " + e));
                }
            }
        });
    }

    // Saves maxDiskSize (bytes, 0 for no limit; null goes back to the app's
    // manifest or Glide's default), which FastImageGlideModule applies when
    // Glide starts: now if it hasn't started yet (this starts it), or on the
    // next launch. Resolves with the limit in effect and the
    // bytes the disk cache uses now: { maxDiskSize, diskSize }, or {} if the
    // app starts Glide with its own AppGlideModule (its size and folder are
    // the app's). maxDiskAge and maxMemorySize are iOS only (Glide has no
    // age limit, and sizes its memory cache from the screen).
    @ReactMethod
    public void configureCache(final ReadableMap limits, final Promise promise) {
        final ReactApplicationContext context = getReactApplicationContext();
        if (limits.hasKey("maxDiskSize")) {
            FastImageCacheLimits.saveMaxDiskSize(context, limits.isNull("maxDiskSize")
                    ? null
                    : (Long) (long) Math.max(limits.getDouble("maxDiskSize"), 0));
        }
        cachePathExecutor.execute(new Runnable() {
            @Override
            public void run() {
                Glide.get(context);
                WritableMap result = Arguments.createMap();
                long maxDiskSize = FastImageCacheLimits.startedMaxDiskSize;
                if (maxDiskSize >= 0) {
                    result.putDouble("maxDiskSize", maxDiskSize);
                    result.putDouble("diskSize", FastImageCacheLimits.diskSize(context));
                }
                promise.resolve(result);
            }
        });
    }

    @ReactMethod
    public void clearMemoryCache(final Promise promise) {
        final Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(null);
            return;
        }

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Glide.get(activity.getApplicationContext()).clearMemory();
                promise.resolve(null);
            }
        });
    }

    @ReactMethod
    public void clearDiskCache(Promise promise) {
        final Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.resolve(null);
            return;
        }

        Glide.get(activity.getApplicationContext()).clearDiskCache();
        // And the HTTP cache of `cache: 'web'` images, which Glide doesn't
        // cache.
        try {
            FastImageOkHttpProgressGlideModule.clearWebCache();
        } catch (IOException e) {
            // Cleared as far as it could.
        }
        promise.resolve(null);
    }
}
