package com.dylanvann.fastimage;

import android.app.Activity;
import android.graphics.drawable.Drawable;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.DataSource;
import com.bumptech.glide.load.engine.GlideException;
import com.bumptech.glide.request.RequestListener;
import com.bumptech.glide.request.target.Target;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

// FastImage's native module (a TurboModule): preload and the caches.
public class FastImageModule extends NativeFastImageModuleSpec {

    static final String NAME = "FastImageModule";

    FastImageModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    // Resolves with a result per source, in order, once all have loaded or
    // failed: { ok, width, height } or { ok: false, error }. Never rejects.
    @Override
    public void preload(final ReadableArray sources, final Promise promise) {
        final ReactApplicationContext context = getReactApplicationContext();
        UiThreadUtil.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                final int count = sources.size();
                final WritableMap[] results = new WritableMap[count];
                // Loads still running, plus one until they've all started
                // (Glide can report a cached image before preload() returns).
                final int[] pending = {1};
                final Runnable finishOne = new Runnable() {
                    @Override
                    public void run() {
                        if (--pending[0] > 0) return;
                        WritableArray array = Arguments.createArray();
                        for (WritableMap result : results) array.pushMap(result);
                        promise.resolve(array);
                    }
                };
                for (int i = 0; i < count; i++) {
                    final int index = i;
                    final ReadableMap source = sources.isNull(i) ? null : sources.getMap(i);
                    // Glide throws on an empty url.
                    if (!FastImageViewConverter.hasUri(source)) {
                        results[i] = failure("Invalid source: no uri");
                        continue;
                    }
                    final FastImageSource imageSource = FastImageViewConverter.getImageSource(context, source);
                    // A uri that can't be resolved (e.g. a relative path) resolves
                    // to an empty one.
                    if (imageSource.getUri().toString().isEmpty()) {
                        results[i] = failure("Invalid source: can't resolve " + source.getString("uri"));
                        continue;
                    }
                    pending[0]++;
                    Glide
                            .with(context)
                            // Load it the way the view does, so local images
                            // (file://, content://, asset:/) work too.
                            .load(imageSource.getSourceForLoad())
                            .apply(FastImageViewConverter.getOptions(context, imageSource, source))
                            .listener(new RequestListener<Drawable>() {
                                @Override
                                public boolean onLoadFailed(@Nullable GlideException e, Object model, Target<Drawable> target, boolean isFirstResource) {
                                    results[index] = failure(errorMessage(e));
                                    finishOne.run();
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
                                    finishOne.run();
                                    return false;
                                }
                            })
                            .preload();
                }
                finishOne.run();
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

    @Override
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

    @Override
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
