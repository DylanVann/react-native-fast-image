package com.dylanvann.fastimage;

import android.app.Activity;
import android.graphics.drawable.Drawable;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.Priority;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
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

import java.util.ArrayDeque;

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

    // Resolves with a result per source, in order, once all have loaded or
    // failed: { ok, width, height } or { ok: false, error }. Never rejects.
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
                    RequestOptions options = FastImageViewConverter.getOptions(context, imageSource, source);
                    // Low priority unless the source sets one, as on iOS (the
                    // prefetcher's options), so the images the app shows load
                    // first.
                    final RequestOptions preloadOptions = source.hasKey("priority") && !source.isNull("priority")
                            ? options
                            : options.priority(Priority.LOW);
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
                                            results[index] = failure(errorMessage(e));
                                            preloadsInFlight--;
                                            finishOne.run();
                                            startPendingPreloads();
                                            return false;
                                        }

                                        @Override
                                        public boolean onResourceReady(Drawable resource, Object model, Target<Drawable> target, DataSource dataSource, boolean isFirstResource) {
                                            // Preloaded at its original size, so this is
                                            // the image's own size.
                                            WritableMap result = Arguments.createMap();
                                            result.putBoolean("ok", true);
                                            result.putInt("width", resource.getIntrinsicWidth());
                                            result.putInt("height", resource.getIntrinsicHeight());
                                            results[index] = result;
                                            preloadsInFlight--;
                                            finishOne.run();
                                            startPendingPreloads();
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

    private static WritableMap failure(String error) {
        WritableMap result = Arguments.createMap();
        result.putBoolean("ok", false);
        result.putString("error", error);
        return result;
    }

    // The first root cause's message, e.g. "Not Found, status code: 404".
    private static String errorMessage(@Nullable GlideException e) {
        if (e != null) {
            for (Throwable cause : e.getRootCauses()) {
                if (cause.getMessage() != null) return cause.getMessage();
            }
            if (e.getMessage() != null) return e.getMessage();
        }
        return "Failed to load the image";
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
        promise.resolve(null);
    }
}
